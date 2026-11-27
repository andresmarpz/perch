export const isEditable = (target: EventTarget | null): boolean => {
  const element = target as Partial<Element> | null
  if (element === null || typeof element.closest !== "function") return false
  return (element as HTMLElement).isContentEditable || element.closest("input, textarea, select") !== null
}
