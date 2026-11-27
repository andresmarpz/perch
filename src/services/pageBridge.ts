import { boostAttribute } from "../domain/bridge.ts"

export const setPageBoost = (on: boolean): void => {
  const root = document.documentElement
  if (on) root.setAttribute(boostAttribute, "max")
  else root.removeAttribute(boostAttribute)
}
