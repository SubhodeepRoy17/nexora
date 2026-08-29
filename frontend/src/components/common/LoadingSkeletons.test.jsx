import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChatListSkeleton, MerchantInventorySkeleton, SharedChatSkeleton } from './LoadingSkeletons'

describe('LoadingSkeletons', () => {
  it('announces the purpose of a chat loading layout without exposing decorative blocks', () => {
    const { container } = render(<ChatListSkeleton rows={3} label="Searching saved chats" />)
    expect(screen.getByRole('status', { name: 'Searching saved chats' })).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelectorAll('.nexora-skeleton')).toHaveLength(9)
    expect(container.querySelectorAll('.nexora-skeleton[aria-hidden="true"]')).toHaveLength(9)
  })

  it('uses layouts that match the content being loaded', () => {
    const { rerender } = render(<MerchantInventorySkeleton />)
    expect(screen.getByRole('status', { name: 'Loading product inventory' })).toBeInTheDocument()
    rerender(<SharedChatSkeleton />)
    expect(screen.getByRole('status', { name: 'Opening shared chat' })).toBeInTheDocument()
  })
})
