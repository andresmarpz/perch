import { describe, expect, test } from "bun:test"
import { Effect, Fiber, Layer, Stream } from "effect"
import { TestClock } from "effect/testing"
import type { ChatEvent } from "../domain/chat.ts"
import { backoffMillis, LiteChat } from "./LiteChat.ts"
import { SocketFactory, type SocketHandlers } from "./SocketFactory.ts"

const privmsg = (id: string, text: string) =>
  `@badge-info=;badges=;color=#FF4500;display-name=jrobert03;emotes=;id=${id};tmi-sent-ts=1795746055680 :jrobert03!jrobert03@jrobert03.tmi.twitch.tv PRIVMSG #rubius :${text}`

class FakeSocket {
  readonly sent: Array<string> = []
  closed = false
  constructor(readonly handlers: SocketHandlers) {}
  open() {
    this.handlers.onOpen()
  }
  receive(frame: string) {
    this.handlers.onMessage(frame)
  }
  drop() {
    this.handlers.onClose()
  }
}

const makeFake = (options: { readonly throwFirst?: number } = {}) => {
  const sockets: Array<FakeSocket> = []
  let attempts = 0
  const layer = Layer.succeed(SocketFactory, {
    open: (_url, handlers) => {
      attempts += 1
      if (attempts <= (options.throwFirst ?? 0)) throw new Error("WebSocket constructor failed")
      const socket = new FakeSocket(handlers)
      sockets.push(socket)
      return {
        send: (line) => void socket.sent.push(line),
        close: () => {
          socket.closed = true
        },
      }
    },
  })
  return { sockets, attempts: () => attempts, layer: LiteChat.layer.pipe(Layer.provide(layer)) }
}

const settle = Effect.forEach(Array.from({ length: 30 }), () => Effect.yieldNow, { discard: true })

const start = Effect.fn("start")(function*(events: Array<ChatEvent>) {
  const chat = yield* LiteChat
  return yield* Effect.forkChild(Stream.runForEach(chat.messages("rubius"), (event) => Effect.sync(() => void events.push(event))))
})

const run = (fake: ReturnType<typeof makeFake>, body: Effect.Effect<void, never, LiteChat>) =>
  Effect.runPromise(body.pipe(Effect.provide(fake.layer), Effect.provide(TestClock.layer())))

const socketAt = (fake: ReturnType<typeof makeFake>, index: number): FakeSocket => {
  const socket = fake.sockets[index]
  if (socket === undefined) throw new Error(`no socket ${index}`)
  return socket
}

describe("LiteChat", () => {
  test("sends the join handshake only after the socket opens", async () => {
    const fake = makeFake()
    await run(fake, Effect.gen(function*() {
      const fiber = yield* start([])
      yield* settle
      expect(fake.sockets).toHaveLength(1)
      expect(socketAt(fake, 0).sent).toEqual([])
      socketAt(fake, 0).open()
      yield* settle
      const [cap, pass, nick, join] = socketAt(fake, 0).sent
      expect(cap).toBe("CAP REQ :twitch.tv/tags twitch.tv/commands")
      expect(pass).toBe("PASS SCHMOOPIIE")
      expect(nick).toMatch(/^NICK justinfan\d{5}$/)
      expect(join).toBe("JOIN #rubius")
      expect(socketAt(fake, 0).sent).toHaveLength(4)
      yield* Fiber.interrupt(fiber)
    }))
  })

  test("parses a multi-line frame into ordered events and ignores the rest", async () => {
    const fake = makeFake()
    const events: Array<ChatEvent> = []
    await run(fake, Effect.gen(function*() {
      const fiber = yield* start(events)
      yield* settle
      socketAt(fake, 0).open()
      socketAt(fake, 0).receive(
        [
          ":tmi.twitch.tv 001 justinfan1 :Welcome, GLHF!",
          privmsg("m1", "hello"),
          "@room-id=1;target-user-id=2 :tmi.twitch.tv CLEARCHAT #rubius :troll",
          "@target-msg-id=m1 :tmi.twitch.tv CLEARMSG #rubius :hello",
          "",
        ].join("\r\n"),
      )
      yield* settle
      expect(events.map((e) => e._tag)).toEqual(["Status", "Status", "Message", "ClearChat", "ClearMsg"])
      expect(events[1]).toEqual({ _tag: "Status", status: "connected" })
      const message = events[2]
      expect(message?._tag === "Message" && message.message.segments).toEqual([{ kind: "text", text: "hello" }])
      yield* Fiber.interrupt(fiber)
    }))
  })

  test("answers a server PING with a PONG", async () => {
    const fake = makeFake()
    await run(fake, Effect.gen(function*() {
      const fiber = yield* start([])
      yield* settle
      socketAt(fake, 0).open()
      yield* settle
      socketAt(fake, 0).receive("PING :tmi.twitch.tv\r\n")
      yield* settle
      expect(socketAt(fake, 0).sent.at(-1)).toBe("PONG :tmi.twitch.tv")
      yield* Fiber.interrupt(fiber)
    }))
  })

  test("reconnects with growing backoff after the socket closes", async () => {
    const fake = makeFake()
    await run(fake, Effect.gen(function*() {
      const fiber = yield* start([])
      yield* settle
      socketAt(fake, 0).open()
      yield* settle
      socketAt(fake, 0).drop()
      yield* settle
      expect(socketAt(fake, 0).closed).toBe(true)
      expect(fake.sockets).toHaveLength(1)
      yield* TestClock.adjust(999)
      yield* settle
      expect(fake.sockets).toHaveLength(1)
      yield* TestClock.adjust(1)
      yield* settle
      expect(fake.sockets).toHaveLength(2)

      socketAt(fake, 1).drop()
      yield* settle
      yield* TestClock.adjust(1999)
      yield* settle
      expect(fake.sockets).toHaveLength(2)
      yield* TestClock.adjust(1)
      yield* settle
      expect(fake.sockets).toHaveLength(3)

      socketAt(fake, 2).open()
      yield* settle
      socketAt(fake, 2).drop()
      yield* settle
      yield* TestClock.adjust(3999)
      yield* settle
      expect(fake.sockets).toHaveLength(3)
      yield* TestClock.adjust(1)
      yield* settle
      expect(fake.sockets).toHaveLength(4)
      yield* Fiber.interrupt(fiber)
    }))
  })

  test("a server that accepts and closes right away is retried after 1, 2 and 4 seconds", async () => {
    const fake = makeFake()
    await run(fake, Effect.gen(function*() {
      const fiber = yield* start([])
      yield* settle
      for (const [index, wait] of [[0, 1000], [1, 2000], [2, 4000], [3, 8000]] as const) {
        socketAt(fake, index).open()
        yield* settle
        socketAt(fake, index).drop()
        yield* settle
        yield* TestClock.adjust(wait - 1)
        yield* settle
        expect(fake.sockets).toHaveLength(index + 1)
        yield* TestClock.adjust(1)
        yield* settle
        expect(fake.sockets).toHaveLength(index + 2)
      }
      yield* Fiber.interrupt(fiber)
    }))
  })

  test("the backoff starts over only after the join succeeded", async () => {
    const fake = makeFake()
    await run(fake, Effect.gen(function*() {
      const fiber = yield* start([])
      yield* settle
      socketAt(fake, 0).open()
      socketAt(fake, 0).drop()
      yield* settle
      yield* TestClock.adjust(1000)
      yield* settle
      socketAt(fake, 1).open()
      yield* settle
      socketAt(fake, 1).receive(":tmi.twitch.tv 001 justinfan1 :Welcome, GLHF!")
      yield* settle
      socketAt(fake, 1).drop()
      yield* settle
      yield* TestClock.adjust(1000)
      yield* settle
      expect(fake.sockets).toHaveLength(3)
      yield* Fiber.interrupt(fiber)
    }))
  })

  test("the JOIN echo for our own nick counts as joined, someone else's does not", async () => {
    const fake = makeFake()
    await run(fake, Effect.gen(function*() {
      const fiber = yield* start([])
      yield* settle
      socketAt(fake, 0).open()
      socketAt(fake, 0).drop()
      yield* settle
      yield* TestClock.adjust(1000)
      yield* settle
      const nick = socketAt(fake, 1).sent.find((line) => line.startsWith("NICK "))?.slice(5) ?? ""
      socketAt(fake, 1).open()
      yield* settle
      socketAt(fake, 1).receive(`:other!other@other.tmi.twitch.tv JOIN #rubius`)
      socketAt(fake, 1).drop()
      yield* settle
      yield* TestClock.adjust(1999)
      yield* settle
      expect(fake.sockets).toHaveLength(2)
      yield* TestClock.adjust(1)
      yield* settle
      expect(fake.sockets).toHaveLength(3)
      socketAt(fake, 2).open()
      yield* settle
      const own = socketAt(fake, 2).sent.find((line) => line.startsWith("NICK "))?.slice(5) ?? ""
      expect(own).not.toBe(nick)
      socketAt(fake, 2).receive(`:${own}!${own}@${own}.tmi.twitch.tv JOIN #rubius`)
      yield* settle
      socketAt(fake, 2).drop()
      yield* settle
      yield* TestClock.adjust(1000)
      yield* settle
      expect(fake.sockets).toHaveLength(4)
      yield* Fiber.interrupt(fiber)
    }))
  })

  test("reports connected after the join and reconnecting after a drop", async () => {
    const fake = makeFake()
    const events: Array<ChatEvent> = []
    await run(fake, Effect.gen(function*() {
      const fiber = yield* start(events)
      yield* settle
      socketAt(fake, 0).open()
      socketAt(fake, 0).receive(":tmi.twitch.tv 001 justinfan1 :Welcome, GLHF!")
      yield* settle
      socketAt(fake, 0).drop()
      yield* settle
      expect(events).toEqual([
        { _tag: "Status", status: "connecting" },
        { _tag: "Status", status: "connected" },
        { _tag: "Status", status: "reconnecting" },
      ])
      yield* Fiber.interrupt(fiber)
    }))
  })

  test("a WebSocket that throws on creation is retried with the same backoff and reported as reconnecting", async () => {
    const fake = makeFake({ throwFirst: 2 })
    const events: Array<ChatEvent> = []
    await run(fake, Effect.gen(function*() {
      const fiber = yield* start(events)
      yield* settle
      expect(fake.attempts()).toBe(1)
      expect(events).toEqual([
        { _tag: "Status", status: "connecting" },
        { _tag: "Status", status: "reconnecting" },
      ])
      yield* TestClock.adjust(999)
      yield* settle
      expect(fake.attempts()).toBe(1)
      yield* TestClock.adjust(1)
      yield* settle
      expect(fake.attempts()).toBe(2)
      yield* TestClock.adjust(1999)
      yield* settle
      expect(fake.attempts()).toBe(2)
      yield* TestClock.adjust(1)
      yield* settle
      expect(fake.attempts()).toBe(3)
      expect(fake.sockets).toHaveLength(1)
      socketAt(fake, 0).open()
      socketAt(fake, 0).receive(privmsg("m1", "still works"))
      yield* settle
      expect(events.filter((event) => event._tag === "Message")).toHaveLength(1)
      yield* Fiber.interrupt(fiber)
    }))
  })

  test("closes the socket when the stream is interrupted", async () => {
    const fake = makeFake()
    await run(fake, Effect.gen(function*() {
      const fiber = yield* start([])
      yield* settle
      socketAt(fake, 0).open()
      yield* settle
      expect(socketAt(fake, 0).closed).toBe(false)
      yield* Fiber.interrupt(fiber)
      expect(socketAt(fake, 0).closed).toBe(true)
      yield* TestClock.adjust(60_000)
      yield* settle
      expect(fake.sockets).toHaveLength(1)
    }))
  })

  test("closes the socket when the consumer takes what it needs", async () => {
    const fake = makeFake()
    await run(fake, Effect.gen(function*() {
      const chat = yield* LiteChat
      const fiber = yield* Effect.forkChild(Stream.runCollect(chat.messages("rubius").pipe(Stream.filter((event) => event._tag === "Message"), Stream.take(1))))
      yield* settle
      socketAt(fake, 0).open()
      socketAt(fake, 0).receive(privmsg("m1", "one"))
      const collected = yield* Fiber.join(fiber)
      expect(collected).toHaveLength(1)
      expect(socketAt(fake, 0).closed).toBe(true)
    }))
  })

  test("pings every 60 s and keeps the socket when PONG arrives", async () => {
    const fake = makeFake()
    await run(fake, Effect.gen(function*() {
      const fiber = yield* start([])
      yield* settle
      socketAt(fake, 0).open()
      yield* settle
      yield* TestClock.adjust(60_000)
      yield* settle
      expect(socketAt(fake, 0).sent.at(-1)).toBe("PING :tmi.twitch.tv")
      socketAt(fake, 0).receive(":tmi.twitch.tv PONG tmi.twitch.tv :tmi.twitch.tv")
      yield* settle
      yield* TestClock.adjust(10_000)
      yield* settle
      expect(socketAt(fake, 0).closed).toBe(false)
      expect(fake.sockets).toHaveLength(1)
      yield* Fiber.interrupt(fiber)
    }))
  })

  test("treats a missing PONG after 10 s as a dead socket and reconnects", async () => {
    const fake = makeFake()
    await run(fake, Effect.gen(function*() {
      const fiber = yield* start([])
      yield* settle
      socketAt(fake, 0).open()
      yield* settle
      yield* TestClock.adjust(60_000)
      yield* settle
      yield* TestClock.adjust(10_000)
      yield* settle
      expect(socketAt(fake, 0).closed).toBe(true)
      yield* TestClock.adjust(1000)
      yield* settle
      expect(fake.sockets).toHaveLength(2)
      yield* Fiber.interrupt(fiber)
    }))
  })

  test("a second ping cycle without a PONG reconnects even after the first was answered", async () => {
    const fake = makeFake()
    await run(fake, Effect.gen(function*() {
      const fiber = yield* start([])
      yield* settle
      socketAt(fake, 0).open()
      yield* settle
      yield* TestClock.adjust(60_000)
      yield* settle
      socketAt(fake, 0).receive(":tmi.twitch.tv PONG tmi.twitch.tv :tmi.twitch.tv")
      yield* settle
      yield* TestClock.adjust(60_000)
      yield* settle
      expect(socketAt(fake, 0).sent.filter((line) => line.startsWith("PING")).length).toBe(2)
      yield* TestClock.adjust(10_000)
      yield* settle
      expect(socketAt(fake, 0).closed).toBe(true)
      yield* TestClock.adjust(1000)
      yield* settle
      expect(fake.sockets).toHaveLength(2)
      yield* Fiber.interrupt(fiber)
    }))
  })

  test("a socket that never opens is abandoned after 10 s", async () => {
    const fake = makeFake()
    await run(fake, Effect.gen(function*() {
      const fiber = yield* start([])
      yield* settle
      yield* TestClock.adjust(10_000)
      yield* settle
      expect(socketAt(fake, 0).closed).toBe(true)
      yield* TestClock.adjust(1000)
      yield* settle
      expect(fake.sockets).toHaveLength(2)
      yield* Fiber.interrupt(fiber)
    }))
  })

  test("a server RECONNECT command restarts the connection", async () => {
    const fake = makeFake()
    await run(fake, Effect.gen(function*() {
      const fiber = yield* start([])
      yield* settle
      socketAt(fake, 0).open()
      socketAt(fake, 0).receive(":tmi.twitch.tv RECONNECT")
      yield* settle
      expect(socketAt(fake, 0).closed).toBe(true)
      yield* TestClock.adjust(1000)
      yield* settle
      expect(fake.sockets).toHaveLength(2)
      yield* Fiber.interrupt(fiber)
    }))
  })
})

describe("backoffMillis", () => {
  test("doubles from 1 s and caps at 30 s", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 20].map(backoffMillis)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000])
  })
})
