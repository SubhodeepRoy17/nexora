import { Clock3 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Skeleton } from './LoadingSkeletons'

export const isStale = (value, staleAfterMs = 30000) => !value || Date.now() - new Date(value).getTime() > staleAfterMs

export default function DataFreshness({ updatedAt, loading = false, staleAfterMs = 30000, dark = false }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!updatedAt) return undefined
    const timer = window.setInterval(() => setTick((value) => value + 1), Math.min(5000, staleAfterMs))
    return () => window.clearInterval(timer)
  }, [updatedAt, staleAfterMs])
  const stale = isStale(updatedAt, staleAfterMs)
  const label = updatedAt
    ? new Date(updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Not updated'
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[8px] ${stale ? 'text-amber-500' : dark ? 'text-emerald-400' : 'text-emerald-700'}`} title={updatedAt ? new Date(updatedAt).toLocaleString('en-IN') : undefined}>
      {loading ? <span role="status" aria-label="Refreshing data" aria-busy="true" className="inline-flex items-center gap-1.5"><span className="sr-only">Refreshing data</span><Skeleton className="size-2.5 rounded-full" /><Skeleton className="h-2 w-14 rounded-full" /></span> : <><Clock3 size={9} />{stale ? `REFRESH NEEDED · ${label}` : `UPDATED ${label}`}</>}
    </span>
  )
}
