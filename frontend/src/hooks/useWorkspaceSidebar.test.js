import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import useWorkspaceSidebar, { WORKSPACE_SIDEBAR_STORAGE_KEY } from './useWorkspaceSidebar'

describe('shared workspace sidebar preference', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  })

  it('restores the same collapsed state when another workspace mounts', () => {
    const buyer = renderHook(() => useWorkspaceSidebar())
    expect(buyer.result.current.open).toBe(true)

    act(() => buyer.result.current.setOpen(false))
    expect(window.localStorage.getItem(WORKSPACE_SIDEBAR_STORAGE_KEY)).toBe('closed')
    buyer.unmount()

    const merchant = renderHook(() => useWorkspaceSidebar())
    expect(merchant.result.current.open).toBe(false)
  })
})
