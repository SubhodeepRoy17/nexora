import { useEffect, useRef } from 'react'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function useDialogFocusTrap(open, onClose) {
  const dialogRef = useRef(null)
  useEffect(() => {
    if (!open || !dialogRef.current) return undefined
    const previous = document.activeElement
    const dialog = dialogRef.current
    const focusables = () => [...dialog.querySelectorAll(FOCUSABLE)].filter((item) => !item.hidden)
    ;(focusables()[0] ?? dialog).focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (!items.length) return
      const first = items[0]
      const last = items.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus()
      }
    }
    dialog.addEventListener('keydown', onKeyDown)
    return () => {
      dialog.removeEventListener('keydown', onKeyDown)
      previous?.focus?.()
    }
  }, [open, onClose])
  return dialogRef
}
