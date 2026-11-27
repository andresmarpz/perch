import { Cause, Context, Effect, Latch, Layer, Option, Queue, Random, Ref, Schema, Stream } from "effect"
import { toChatEvent, type ChatEvent } from "../domain/chat.ts"
import { parseLine, splitFrame } from "../domain/irc.ts"
import { SocketFactory, type ChatSocket } from "./SocketFactory.ts"

export const ircUrl = "wss://irc-ws.chat.twitch.tv:443"

const pingEvery = "60 seconds"
const pongWithin = "10 seconds"
const connectWithin = "10 seconds"
const backoffBase = 1000
const backoffCap = 30_000

export const backoffMillis = (attempt: number): number => Math.min(backoffCap, backoffBase * 2 ** attempt)

export class SocketClosed extends Schema.TaggedError<SocketClosed>()("SocketClosed", {
  reason: Schema.String,
}) {}

export class LiteChat extends Context.Service<LiteChat, {
  messages(channel: string): Stream.Stream<ChatEvent>
}>()("twitch-pip/services/LiteChat") {
  static readonly layer = Layer.effect(
    LiteChat,
    Effect.gen(function*() {
      const sockets = yield* SocketFactory
      return LiteChat.of({ messages: (channel) => messages(sockets, channel) })
    }),
  )
}

const handshake = (nick: string, channel: string): ReadonlyArray<string> => [
  "CAP REQ :twitch.tv/tags twitch.tv/commands",
  "PASS SCHMOOPIIE",
  `NICK ${nick}`,
  `JOIN #${channel}`,
]

const connection = (sockets: SocketFactory["Service"], channel: string, attempts: Ref.Ref<number>) =>
  Stream.callback<ChatEvent, SocketClosed>(
    Effect.fn(function*(queue) {
      const nick = `justinfan${yield* Random.nextIntBetween(10000, 99999)}`
      const opened = yield* Latch.make(false)
      const ponged = yield* Latch.make(false)
      const dead = (reason: string) => Queue.failCauseUnsafe(queue, Cause.fail(new SocketClosed({ reason })))
      const socketRef: { current: ChatSocket | undefined } = { current: undefined }

      const onLine = (raw: string) => {
        const line = parseLine(raw)
        if (line === undefined) return
        switch (line.command) {
          case "PING":
            socketRef.current?.send(`PONG :${line.trailing ?? "tmi.twitch.tv"}`)
            return
          case "PONG":
            Latch.openUnsafe(ponged)
            return
          case "RECONNECT":
            dead("server asked to reconnect")
            return
          default: {
            const event = toChatEvent(line)
            if (event !== undefined) Queue.offerUnsafe(queue, event)
          }
        }
      }

      const socket = yield* Effect.acquireRelease(
        Effect.sync(() =>
          sockets.open(ircUrl, {
            onOpen: () => Latch.openUnsafe(opened),
            onMessage: (data) => splitFrame(data).forEach(onLine),
            onClose: () => dead("socket closed"),
          })
        ),
        (socket) => Effect.sync(() => socket.close()),
      )
      socketRef.current = socket

      const lifecycle = Effect.gen(function*() {
        const connected = yield* opened.await.pipe(Effect.timeoutOption(connectWithin))
        if (Option.isNone(connected)) return dead("connect timed out")
        handshake(nick, channel).forEach((line) => socket.send(line))
        yield* Ref.set(attempts, 0)
        while (true) {
          yield* Effect.sleep(pingEvery)
          yield* Latch.close(ponged)
          socket.send("PING :tmi.twitch.tv")
          const answer = yield* ponged.await.pipe(Effect.timeoutOption(pongWithin))
          if (Option.isNone(answer)) return dead("no PONG")
        }
      })
      yield* Effect.forkScoped(lifecycle)
    }),
    { bufferSize: 512, strategy: "sliding" },
  )

const messages = (sockets: SocketFactory["Service"], channel: string): Stream.Stream<ChatEvent> =>
  Stream.unwrap(
    Effect.gen(function*() {
      const attempts = yield* Ref.make(0)
      const backoff = Stream.fromEffect(
        Ref.getAndUpdate(attempts, (n) => n + 1).pipe(Effect.flatMap((n) => Effect.sleep(backoffMillis(n)))),
      ).pipe(Stream.drain)
      return connection(sockets, channel, attempts).pipe(
        Stream.catch(() => Stream.empty),
        Stream.concat(backoff),
        Stream.forever,
      )
    }),
  )
