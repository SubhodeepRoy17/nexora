import { createContext, useContext, useState } from 'react'
import { onboardingMessages } from '../data/onboarding'

const NexoraContext = createContext(null)

export function NexoraProvider({ children }) {
  const [buyerMessages, setBuyerMessages] = useState(onboardingMessages)

  const value = {
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
