export const presetQueries = [
  {
    id: 'coding-keyboards',
    label: 'Coding keyboards under ₹8K',
    query: 'Find mechanical keyboards under ₹8,000 for coding',
  },
  {
    id: 'quiet-wireless',
    label: 'Quiet + wireless',
    query: 'Show me quiet wireless mechanical keyboards for an office',
  },
  {
    id: 'compact-hotswap',
    label: 'Compact hot-swap',
    query: 'Compare compact hot-swappable keyboards with tactile switches',
  },
]

const thinkingSteps = [
  { id: 'parse', label: 'Parsing intent', detail: 'Extracting budget, use case, and required features', delay: 700 },
  { id: 'search', label: 'Searching merchants', detail: 'Checking live catalog data from verified sellers', delay: 900 },
  { id: 'compare', label: 'Comparing reviews', detail: 'Ranking switch feel, wireless stability, and value', delay: 1000 },
]

const products = {
  keychronV1: {
    id: 'kb-kv1-max',
    name: 'Keychron V1 Max',
    imageLabel: 'V1 MAX',
    matchScore: 97,
    price: 7499,
    originalPrice: 8499,
    merchant: { name: 'Meckeys', verified: true, rating: 4.8 },
    stock: '11 left',
    delivery: 'Free delivery by Wed',
    reason: 'Best overall coding fit with reliable tri-mode wireless and full remapping.',
    specs: {
      layout: '75%',
      wireless: '2.4 GHz + BT 5.1',
      hotSwappable: 'Yes · 5-pin',
      switches: 'Gateron Jupiter Brown',
      battery: '4,000 mAh',
      keycaps: 'Double-shot PBT',
    },
  },
  aulaF75: {
    id: 'kb-aula-f75',
    name: 'Aula F75 Pro',
    imageLabel: 'F75 PRO',
    matchScore: 94,
    price: 6299,
    originalPrice: 7999,
    merchant: { name: 'GenesisPC', verified: true, rating: 4.7 },
    stock: 'In stock',
    delivery: 'Delivery by Thu',
    reason: 'Strong value with a softer gasket feel and long battery life.',
    specs: {
      layout: '75%',
      wireless: '2.4 GHz + BT 5.0',
      hotSwappable: 'Yes · 5-pin',
      switches: 'Leobog Reaper Linear',
      battery: '4,000 mAh',
      keycaps: 'Cherry-profile PBT',
    },
  },
  rkM75: {
    id: 'kb-rk-m75',
    name: 'Royal Kludge M75',
    imageLabel: 'M75',
    matchScore: 90,
    price: 5899,
    originalPrice: 6999,
    merchant: { name: 'Hardware Corpus', verified: true, rating: 4.6 },
    stock: '7 left',
    delivery: 'Free delivery by Fri',
    reason: 'Most affordable tri-mode option with a useful status display.',
    specs: {
      layout: '75% + OLED',
      wireless: '2.4 GHz + BT 5.1',
      hotSwappable: 'Yes · 5-pin',
      switches: 'RK Brown Tactile',
      battery: '3,750 mAh',
      keycaps: 'Double-shot PBT',
    },
  },
  nuphyAir75: {
    id: 'kb-nu-air75',
    name: 'NuPhy Air75 V2',
    imageLabel: 'AIR75',
    matchScore: 95,
    price: 11999,
    originalPrice: 13499,
    merchant: { name: 'CtrlShift Store', verified: true, rating: 4.9 },
    stock: '4 left',
    delivery: 'Delivery by Sat',
    reason: 'Premium low-profile choice for quiet shared workspaces and travel.',
    specs: {
      layout: '75% low-profile',
      wireless: '2.4 GHz + BT 5.1',
      hotSwappable: 'Yes · low-profile',
      switches: 'Gateron Brown 2.0',
      battery: '4,000 mAh',
      keycaps: 'nSA PBT',
    },
  },
}

export const chatScenarios = [
  {
    id: 'coding-under-8k',
    match: ['under ₹8,000', 'under 8000', 'coding'],
    steps: thinkingSteps,
    response: 'I compared 64 boards from 9 verified merchants. These three stay under budget, support hot-swapping, and offer reliable wireless modes. The V1 Max is my strongest coding pick because its tactile switches and remapping support reduce friction during long sessions.',
    evidence: '64 products · 9 merchants · 2,418 verified reviews',
    products: [products.keychronV1, products.aulaF75, products.rkM75],
  },
  {
    id: 'quiet-wireless-office',
    match: ['quiet', 'office', 'wireless'],
    steps: [
      thinkingSteps[0],
      { ...thinkingSteps[1], detail: 'Filtering for wireless stability and office availability' },
      { ...thinkingSteps[2], detail: 'Weighting acoustics, typing fatigue, and reviewer feedback' },
    ],
    response: 'For a shared office, I weighted acoustic comfort and wireless consistency above RGB or gaming features. The Air75 V2 is the quietest and easiest to carry; the Aula F75 is the best value if you prefer a standard-height board.',
    evidence: '41 products · 7 merchants · acoustics prioritized',
    products: [products.nuphyAir75, products.aulaF75, products.keychronV1],
  },
  {
    id: 'compact-hot-swap',
    match: ['compact', 'hot-swappable', 'tactile'],
    steps: [
      thinkingSteps[0],
      { ...thinkingSteps[1], detail: 'Validating 5-pin sockets and current switch variants' },
      { ...thinkingSteps[2], detail: 'Comparing tactile feel, layout efficiency, and firmware' },
    ],
    response: 'All three finalists have hot-swappable sockets and compact 75% layouts. I ranked the V1 Max first for QMK/VIA flexibility, while the M75 offers the lowest entry price for experimenting with tactile switches.',
    evidence: '38 products · 100% hot-swappable · tactile variants in stock',
    products: [products.keychronV1, products.rkM75, products.aulaF75],
  },
]

export const initialChatMessages = [
  {
    id: 'welcome',
    role: 'agent',
    text: 'Tell me what you need and what matters most. I’ll search verified merchants, compare the technical details, and bring back a short, evidence-ranked list.',
    time: 'Now',
  },
]

export function findChatScenario(query) {
  const normalized = query.toLowerCase()
  return chatScenarios.find((scenario) => scenario.match.some((term) => normalized.includes(term.toLowerCase()))) ?? chatScenarios[0]
}
