import type { ChatEvent, ChatMessage } from "./chat.ts"

export const maxChatLines = 150

export const applyChatEvent = (
  log: ReadonlyArray<ChatMessage>,
  event: ChatEvent,
  max: number = maxChatLines,
): ReadonlyArray<ChatMessage> => {
  switch (event._tag) {
    case "Message": {
      if (log.some((line) => line.id === event.message.id)) return log
      const next = [...log, event.message]
      return next.length > max ? next.slice(next.length - max) : next
    }
    case "ClearChat":
      return event.login === undefined ? [] : log.filter((line) => line.login !== event.login)
    case "ClearMsg":
      return log.filter((line) => line.id !== event.messageId)
  }
}

export const removedIds = (before: ReadonlyArray<ChatMessage>, after: ReadonlyArray<ChatMessage>): ReadonlyArray<string> => {
  const kept = new Set(after.map((line) => line.id))
  return before.filter((line) => !kept.has(line.id)).map((line) => line.id)
}

export const isNearBottom = (
  metrics: { readonly scrollTop: number; readonly clientHeight: number; readonly scrollHeight: number },
  slack = 24,
): boolean => metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= slack
