import { createContext, useContext } from 'react'

export type MobileReorderContextValue = {
  registerItem: (id: string, el: HTMLElement | null) => void
  insertBeforeId: string | null | undefined
  activeId: string | null
  dragging: boolean
  requestStepMove: (
    folderId: string,
    direction: 'up' | 'down' | 'start' | 'end',
  ) => void
  announce: (message: string) => void
}

export const MobileReorderContext =
  createContext<MobileReorderContextValue | null>(null)

export function useMobileReorder() {
  const ctx = useContext(MobileReorderContext)
  if (!ctx) throw new Error('useMobileReorder must be used within provider')
  return ctx
}

export function useMobileReorderOptional() {
  return useContext(MobileReorderContext)
}
