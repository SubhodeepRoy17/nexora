import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import useProgressiveList from './useProgressiveList'

describe('useProgressiveList', () => {
  it('limits each reveal to the configured batch and resets when filters change', () => {
    const items = Array.from({ length: 11 }, (_, index) => index + 1)
    const { result, rerender } = renderHook(
      ({ resetKey }) => useProgressiveList(items, 4, resetKey),
      { initialProps: { resetKey: 'all' } },
    )

    expect(result.current.visibleItems).toEqual([1, 2, 3, 4])
    expect(result.current.nextBatchCount).toBe(4)
    act(() => result.current.loadMore())
    expect(result.current.visibleItems).toHaveLength(8)

    rerender({ resetKey: 'active' })
    expect(result.current.visibleItems).toHaveLength(4)
  })
})
