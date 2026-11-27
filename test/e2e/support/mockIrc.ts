import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, statSync, createReadStream } from "node:fs"
import { createServer, type Server } from "node:https"
import type { IncomingMessage, ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { WebSocketServer, type WebSocket } from "ws"

export const ircHost = "irc-ws.chat.twitch.tv"
export const emoteHost = "static-cdn.jtvnw.net"
export const twitchHosts = ["www.twitch.tv", "twitch.tv"] as const

const fixturesDir = resolve(import.meta.dirname, "../fixtures")

const fixturePage = (channel: string): string =>
  readFileSync(join(fixturesDir, "twitch.html"), "utf8")
    .replaceAll("__CHANNEL__", channel)
    .replaceAll("__VIDEO__", channel.endsWith("43") ? "video-4x3.webm" : "video-16x9.webm")

const sendFile = (request: IncomingMessage, response: ServerResponse, file: string, type: string) => {
  const size = statSync(file).size
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? "")
  if (range === null) {
    response.writeHead(200, { "content-type": type, "content-length": size, "accept-ranges": "bytes" })
    createReadStream(file).pipe(response)
    return
  }
  const start = range[1] === "" ? 0 : Number(range[1])
  const end = range[2] === "" ? size - 1 : Math.min(Number(range[2]), size - 1)
  response.writeHead(206, {
    "content-type": type,
    "content-length": end - start + 1,
    "content-range": `bytes ${start}-${end}/${size}`,
    "accept-ranges": "bytes",
  })
  createReadStream(file, { start, end }).pipe(response)
}

const png1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)

export interface SayOptions {
  readonly id?: string
  readonly login?: string
  readonly name?: string
  readonly color?: string
  readonly text: string
  readonly emotes?: string
  readonly action?: boolean
}

const escapeTag = (value: string) => value.replaceAll("\\", "\\\\").replaceAll(";", "\\:").replaceAll(" ", "\\s")

export class MockIrc {
  readonly clients = new Set<WebSocket>()
  readonly received: Array<string> = []
  readonly emoteRequests: Array<string> = []
  connections = 0
  private counter = 0
  private lastChannel = "fixture"

  private readonly server: Server
  private readonly wss: WebSocketServer
  readonly port: number

  private constructor(server: Server, wss: WebSocketServer, port: number) {
    this.server = server
    this.wss = wss
    this.port = port
  }

  static async start(): Promise<MockIrc> {
    const dir = mkdtempSync(join(tmpdir(), "twitch-pip-cert-"))
    const key = join(dir, "key.pem")
    const cert = join(dir, "cert.pem")
    execFileSync("openssl", [
      "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-days", "2",
      "-keyout", key, "-out", cert, "-subj", `/CN=${ircHost}`, "-addext", `subjectAltName=DNS:${ircHost},DNS:${emoteHost},DNS:www.twitch.tv,DNS:twitch.tv`,
    ], { stdio: "ignore" })
    const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (request, response) => {
      const host = (request.headers.host ?? "").replace(/:\d+$/, "")
      const path = new URL(request.url ?? "/", "https://localhost").pathname
      if (host === emoteHost) {
        irc?.emoteRequests.push(`https://${emoteHost}${request.url ?? ""}`)
        response.writeHead(200, { "content-type": "image/png", "access-control-allow-origin": "*" })
        response.end(png1x1)
      } else if (path.startsWith("/__fixture/")) {
        sendFile(request, response, join(fixturesDir, path.slice("/__fixture/".length)), "video/webm")
      } else if (path.startsWith("/embed/")) {
        sendFile(request, response, join(fixturesDir, "embed-chat.html"), "text/html")
      } else {
        response.writeHead(200, { "content-type": "text/html" })
        response.end(fixturePage(path.split("/")[1] ?? "fixture"))
      }
    })
    let irc: MockIrc | undefined
    const wss = new WebSocketServer({ server })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    irc = new MockIrc(server, wss, (server.address() as AddressInfo).port)
    const started = irc
    wss.on("connection", (socket) => started.accept(socket))
    return started
  }

  get chromiumArgs(): ReadonlyArray<string> {
    return [
      `--host-resolver-rules=${[ircHost, emoteHost, ...twitchHosts].map((h) => `MAP ${h} 127.0.0.1:${this.port}`).join(", ")}, MAP * ~NOTFOUND`,
      "--ignore-certificate-errors",
      "--disable-features=LocalNetworkAccessChecks,LocalNetworkAccessChecksWebSockets,PrivateNetworkAccessPermissionPrompt,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests",
    ]
  }

  private accept(socket: WebSocket) {
    this.connections += 1
    this.clients.add(socket)
    socket.on("close", () => this.clients.delete(socket))
    let nick = "justinfan1"
    socket.on("message", (data) => {
      for (const line of data.toString().split("\r\n")) {
        if (line === "") continue
        this.received.push(line)
        if (line.startsWith("NICK ")) nick = line.slice(5).trim()
        if (line.startsWith("CAP REQ")) socket.send(":tmi.twitch.tv CAP * ACK :twitch.tv/tags twitch.tv/commands")
        else if (line.startsWith("JOIN #")) {
          this.lastChannel = line.slice(6).trim()
          socket.send(
            `:tmi.twitch.tv 001 ${nick} :Welcome, GLHF!\r\n:${nick}!${nick}@${nick}.tmi.twitch.tv JOIN #${this.lastChannel}\r\n:${nick}.tmi.twitch.tv 366 ${nick} #${this.lastChannel} :End of /NAMES list`,
          )
        } else if (line.startsWith("PING")) socket.send(`:tmi.twitch.tv PONG tmi.twitch.tv ${line.slice(5)}`)
      }
    })
  }

  reset() {
    this.received.length = 0
    this.emoteRequests.length = 0
    this.connections = 0
    this.dropAll()
  }

  broadcast(raw: string) {
    for (const socket of this.clients) socket.send(raw)
  }

  say(options: SayOptions): string {
    this.counter += 1
    const id = options.id ?? `msg-${this.counter}`
    const login = options.login ?? "viewer"
    const name = options.name ?? login
    const text = options.action === true ? `\u0001ACTION ${options.text}\u0001` : options.text
    const tags = [
      "badge-info=", "badges=", `color=${options.color ?? ""}`, `display-name=${escapeTag(name)}`,
      `emotes=${options.emotes ?? ""}`, "first-msg=0", `id=${id}`, "mod=0", "room-id=1", "subscriber=0",
      `tmi-sent-ts=${Date.now()}`, "turbo=0", `user-id=${this.counter}`, "user-type=",
    ].join(";")
    this.broadcast(`@${tags} :${login}!${login}@${login}.tmi.twitch.tv PRIVMSG #${this.lastChannel} :${text}`)
    return id
  }

  clearChat(login?: string) {
    const target = login === undefined ? "" : ` :${login}`
    this.broadcast(`@room-id=1;tmi-sent-ts=${Date.now()} :tmi.twitch.tv CLEARCHAT #${this.lastChannel}${target}`)
  }

  clearMsg(login: string, targetMsgId: string) {
    this.broadcast(
      `@login=${login};room-id=;target-msg-id=${targetMsgId};tmi-sent-ts=${Date.now()} :tmi.twitch.tv CLEARMSG #${this.lastChannel} :removed`,
    )
  }

  ping() {
    this.broadcast("PING :tmi.twitch.tv")
  }

  dropAll() {
    for (const socket of this.clients) socket.terminate()
    this.clients.clear()
  }

  async stop() {
    this.dropAll()
    this.wss.close()
    await new Promise<void>((resolve) => this.server.close(() => resolve()))
  }
}
