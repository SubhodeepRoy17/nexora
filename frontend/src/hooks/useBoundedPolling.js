import { useEffect, useRef } from 'react'

/** Sequential polling: one request at a time, finite cycles, abortable cleanup. */
export default function useBoundedPolling(callback, {
  enabled = true,
  intervalMs = 5000,
  maxCycles = 120,
  immediate = true,
} = {}) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!enabled) return undefined
    let stopped = false
    let timer = null
    let cycles = 0
    let inFlight = false
    let controller = null

    const schedule = (delay = intervalMs) => {
      if (!stopped && cycles < maxCycles) timer = window.setTimeout(run, delay)
    }
    const run = async () => {
      if (stopped || inFlight || document.visibilityState === 'hidden') {
        schedule()
        return
      }
      inFlight = true
      cycles += 1
      controller = new AbortController()
      try {
        await callbackRef.current(controller.signal, cycles)
      } finally {
        inFlight = false
        controller = null
        schedule()
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !inFlight) {
        window.clearTimeout(timer)
        schedule(0)
      }
    }

    if (immediate) run()
    else schedule()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      controller?.abort()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, intervalMs, maxCycles, immediate])
}
