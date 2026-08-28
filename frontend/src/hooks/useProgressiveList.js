import { useCallback, useEffect, useMemo, useState } from 'react'

export default function useProgressiveList(items = [], pageSize = 5, resetKey = '') {
  const [visibleCount, setVisibleCount] = useState(pageSize)

  useEffect(() => {
    setVisibleCount(pageSize)
  }, [pageSize, resetKey])

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount])
  const shownCount = Math.min(visibleCount, items.length)
  const remainingCount = Math.max(items.length - shownCount, 0)
  const nextBatchCount = Math.min(pageSize, remainingCount)
  const loadMore = useCallback(
    () => setVisibleCount((current) => Math.min(current + pageSize, items.length)),
    [items.length, pageSize],
  )

  return {
    visibleItems,
    shownCount,
    remainingCount,
    nextBatchCount,
    hasMore: remainingCount > 0,
    loadMore,
  }
}
