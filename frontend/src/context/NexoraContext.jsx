import { createContext, useContext, useEffect, useState } from 'react'
import { initialChatMessages } from '../mock/chatData'

const STORAGE_KEY = 'nexora.phase4.state.v1'
const NexoraContext = createContext(null)

export function NexoraProvider({ children }) {
  const [inventory, setInventory] = useState([])
  const [auditEvents, setAuditEvents] = useState([])
  const [buyerMessages, setBuyerMessages] = useState(initialChatMessages)

  useEffect(() => {
    try {
      // Remove transcripts written by the old prototype. Guest chat is memory-only now.
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Local storage may be unavailable in restricted/private browser contexts.
    }
  }, [])

  const value = {
    inventory,
    setInventory,
    auditEvents,
    setAuditEvents,
    buyerMessages,
    setBuyerMessages,
  }

  return <NexoraContext.Provider value={value}>{children}</NexoraContext.Provider>
}

export function useNexora() {
  const context = useContext(NexoraContext)
  if (!context) throw new Error('useNexora must be used within NexoraProvider')
  return context
}
