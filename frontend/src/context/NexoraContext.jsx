import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { initialChatMessages } from '../mock/chatData'

const STORAGE_KEY = 'nexora.phase4.state.v1'
const NexoraContext = createContext(null)

function readPersistedState() {
  if (typeof window === 'undefined') return null
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
}

export function NexoraProvider({ children }) {
  const persisted = useMemo(readPersistedState, [])
  const [inventory, setInventory] = useState([])
  const [auditEvents, setAuditEvents] = useState([])
  const [buyerMessages, setBuyerMessages] = useState(() => persisted?.buyerMessages ?? initialChatMessages)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ buyerMessages }))
    } catch {
      // Local storage may be unavailable in restricted/private browser contexts.
    }
  }, [buyerMessages])

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
