export const onboardingMessages = [{
  id: 'onboarding',
  role: 'agent',
  text: 'Tell me what you need and what matters most. I’ll search the live catalog, compare recorded facts, and bring back up to three grounded options.',
  evidence: 'ONBOARDING EXAMPLE · NO CATALOG RESULT YET',
  time: 'Welcome',
  fixture: true,
}]

export const examplePrompts = [
  { id: 'example-keyboard', label: 'Example · quiet keyboard', query: 'Quiet wireless keyboard under ₹8,000 for Mac' },
  { id: 'example-mouse', label: 'Example · ergonomic mouse', query: 'Ergonomic mouse under ₹5,000 with Bluetooth' },
  { id: 'example-coding', label: 'Example · coding keyboard', query: 'Hot-swappable keyboard for coding under ₹10,000' },
]
