import { Context, Layer } from "effect"

export interface SocketHandlers {
  readonly onOpen: () => void
  readonly onMessage: (data: string) => void
  readonly onClose: () => void
}

export interface ChatSocket {
  readonly send: (line: string) => void
  readonly close: () => void
}

export class SocketFactory extends Context.Service<SocketFactory, {
  readonly open: (url: string, handlers: SocketHandlers) => ChatSocket
}>()("twitch-pip/services/SocketFactory") {
  static readonly browser = Layer.succeed(SocketFactory, {
    open: (url, handlers) => {
      const ws = new WebSocket(url)
      ws.addEventListener("open", handlers.onOpen)
      ws.addEventListener("message", (event) => {
        if (typeof event.data === "string") handlers.onMessage(event.data)
      })
      ws.addEventListener("close", handlers.onClose)
      ws.addEventListener("error", handlers.onClose)
      return { send: (line) => ws.send(line), close: () => ws.close() }
    },
  })
}
