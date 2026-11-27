type Attr = string | number | boolean | undefined

export type Child = Node | string | false | null | undefined

export interface Props<K extends keyof HTMLElementTagNameMap> {
  readonly class?: string
  readonly testid?: string
  readonly attrs?: Readonly<Record<string, Attr>>
  readonly props?: Partial<HTMLElementTagNameMap[K]>
  readonly on?: { readonly [E in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[E]) => void }
}

export type H = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props<K>,
  ...children: ReadonlyArray<Child>
) => HTMLElementTagNameMap[K]

export const makeH = (doc: Document): H => (tag, props, ...children) => {
  const el = doc.createElement(tag)
  if (props !== undefined) {
    if (props.class !== undefined) el.className = props.class
    if (props.testid !== undefined) el.dataset["testid"] = props.testid
    for (const [name, value] of Object.entries(props.attrs ?? {})) {
      if (value === undefined || value === false) continue
      el.setAttribute(name, value === true ? "" : String(value))
    }
    if (props.props !== undefined) Object.assign(el, props.props)
    for (const [type, handler] of Object.entries(props.on ?? {})) {
      el.addEventListener(type, handler as EventListener)
    }
  }
  for (const child of children) {
    if (child === false || child === null || child === undefined) continue
    el.append(typeof child === "string" ? doc.createTextNode(child) : child)
  }
  return el
}

export const h: H = (tag, props, ...children) => makeH(document)(tag, props, ...children)
