import { useCallback, useEffect, useState } from 'react'

const desktopQuery = '(min-width: 1024px)'

function initialOpen(storageKey) {
  if (typeof window === 'undefined' || !window.matchMedia?.(desktopQuery).matches) return false
  try {
    return window.localStorage.getItem(storageKey) !== 'closed'
  } catch {
    return true
  }
}

export default function useWorkspaceSidebar(storageKey) {
  const [open, setOpen] = useState(() => initialOpen(storageKey))

  useEffect(() => {
    if (!window.matchMedia?.(desktopQuery).matches) return
    try {
      window.localStorage.setItem(storageKey, open ? 'open' : 'closed')
    } catch {
      // The navigation remains usable if browser storage is unavailable.
    }
  }, [open, storageKey])

  useEffect(() => {
    if (!open) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])

  const closeOnMobile = useCallback(() => {
    if (!window.matchMedia?.(desktopQuery).matches) setOpen(false)
  }, [])

  return { open, setOpen, closeOnMobile }
}
