import { useEffect, useRef } from 'react'

const TEXT_INPUT_TYPES = new Set([
  'email',
  'number',
  'password',
  'search',
  'tel',
  'text',
  'url',
])

function cursorMode(target) {
  if (!(target instanceof Element)) return 'default'

  const disabled = target.closest(':disabled, [aria-disabled="true"]')
  if (disabled) return 'disabled'

  const input = target.closest('input')
  if (
    target.closest('textarea, [contenteditable="true"]')
    || (input && TEXT_INPUT_TYPES.has(input.type || 'text'))
  ) return 'text'

  const nativeCursor = window.getComputedStyle(target).cursor
  if (
    /^(col-resize|e-resize|ew-resize|w-resize)$/.test(nativeCursor)
    || target.closest('[data-cursor="resize-x"], .cursor-col-resize, .cursor-e-resize, .cursor-ew-resize, .cursor-w-resize')
  ) return 'resize-x'
  if (
    /^(n-resize|ns-resize|row-resize|s-resize)$/.test(nativeCursor)
    || target.closest('[data-cursor="resize-y"], .cursor-n-resize, .cursor-ns-resize, .cursor-row-resize, .cursor-s-resize')
  ) return 'resize-y'
  if (nativeCursor === 'grab' || nativeCursor === 'grabbing' || target.closest('[draggable="true"], [data-cursor="grab"], .cursor-grab, .cursor-grabbing')) return 'grab'

  if (
    nativeCursor === 'pointer'
    || target.closest('a[href], button, select, summary, label, [role="button"], [role="checkbox"], [role="link"], [role="menuitem"], [role="option"], [role="radio"], [role="switch"], [role="tab"], input[type="button"], input[type="checkbox"], input[type="radio"], input[type="range"], input[type="reset"], input[type="submit"]')
  ) return 'action'

  return nativeCursor === 'text' ? 'text' : 'default'
}

export default function NexoraCursor() {
  const rootRef = useRef(null)
  const haloRef = useRef(null)
  const dotRef = useRef(null)

  useEffect(() => {
    const root = rootRef.current
    const halo = haloRef.current
    const dot = dotRef.current
    const finePointer = window.matchMedia('(pointer: fine)')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!root || !halo || !dot || !finePointer.matches || reducedMotion.matches) return undefined

    const html = document.documentElement
    let targetX = -100
    let targetY = -100
    let haloX = targetX
    let haloY = targetY
    let frame = 0
    let mode = 'default'

    const place = (element, x, y) => {
      element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
    }

    const animateHalo = () => {
      haloX += (targetX - haloX) * 0.24
      haloY += (targetY - haloY) * 0.24
      place(halo, haloX, haloY)
      if (Math.abs(targetX - haloX) < 0.1 && Math.abs(targetY - haloY) < 0.1) {
        haloX = targetX
        haloY = targetY
        place(halo, haloX, haloY)
        frame = 0
        return
      }
      frame = window.requestAnimationFrame(animateHalo)
    }

    const setMode = (target) => {
      const nextMode = cursorMode(target)
      if (nextMode === mode) return
      mode = nextMode
      root.dataset.mode = mode
    }

    const move = (event) => {
      if (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return
      targetX = event.clientX
      targetY = event.clientY
      place(dot, targetX, targetY)
      setMode(event.target)
      root.dataset.visible = 'true'
      if (!frame) frame = window.requestAnimationFrame(animateHalo)
    }

    const press = () => { root.dataset.pressed = 'true' }
    const release = () => { root.dataset.pressed = 'false' }
    const refreshMode = () => {
      if (root.dataset.visible === 'true') setMode(document.elementFromPoint(targetX, targetY))
    }
    const hide = (event) => {
      if (!event || event.relatedTarget == null) root.dataset.visible = 'false'
    }

    root.dataset.mode = mode
    root.dataset.pressed = 'false'
    html.classList.add('nexora-cursor-enabled')
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerdown', press, { passive: true })
    window.addEventListener('pointerup', release, { passive: true })
    window.addEventListener('pointercancel', release, { passive: true })
    window.addEventListener('scroll', refreshMode, { passive: true })
    document.addEventListener('pointerout', hide, { passive: true })
    window.addEventListener('blur', hide)

    return () => {
      html.classList.remove('nexora-cursor-enabled')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', press)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      window.removeEventListener('scroll', refreshMode)
      document.removeEventListener('pointerout', hide)
      window.removeEventListener('blur', hide)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div ref={rootRef} className="nexora-cursor" data-visible="false" aria-hidden="true">
      <span ref={haloRef} className="nexora-cursor-halo"><span className="nexora-cursor-glyph" /></span>
      <span ref={dotRef} className="nexora-cursor-dot" />
    </div>
  )
}
