export const products = [
  {
    id: 'nx-lp-01',
    name: 'AetherBook Pro 14',
    brand: 'Aether',
    category: 'Laptop',
    price: 124999,
    originalPrice: 139999,
    match: 96,
    stock: 24,
    status: 'In stock',
    accent: 'from-indigo-500/25 to-violet-500/5',
    specs: ['M3 Pro', '18GB RAM', '512GB SSD', '14.2” 120Hz'],
    reason: 'Best balance of battery life, display quality, and sustained performance.',
  },
  {
    id: 'nx-lp-02',
    name: 'Nova X1 Carbon',
    brand: 'Novatek',
    category: 'Laptop',
    price: 117490,
    originalPrice: 129990,
    match: 92,
    stock: 8,
    status: 'Low stock',
    accent: 'from-emerald-500/20 to-cyan-500/5',
    specs: ['Core Ultra 7', '32GB RAM', '1TB SSD', '1.08 kg'],
    reason: 'The lightest option, with extra memory for heavy multitasking.',
  },
  {
    id: 'nx-lp-03',
    name: 'Frame Studio 14',
    brand: 'Frameworks',
    category: 'Laptop',
    price: 109999,
    originalPrice: 119999,
    match: 89,
    stock: 0,
    status: 'Out of stock',
    accent: 'from-fuchsia-500/20 to-rose-500/5',
    specs: ['Ryzen 9', '32GB RAM', '1TB SSD', 'OLED 2.8K'],
    reason: 'Strongest display and raw performance at this price point.',
  },
]

export const inventory = [
  ...products,
  { id: 'nx-hp-18', name: 'Halo ANC Studio', category: 'Audio', price: 18999, stock: 42, status: 'In stock' },
  { id: 'nx-kb-06', name: 'Axis 75 Mechanical', category: 'Accessories', price: 11499, stock: 16, status: 'In stock' },
  { id: 'nx-ds-22', name: 'Orbit Thunderbolt Dock', category: 'Accessories', price: 24990, stock: 5, status: 'Low stock' },
]

export const initialMessages = [
  {
    id: 1,
    role: 'user',
    text: 'I need a lightweight laptop under ₹1.3L for coding and design. Great battery life, at least 16GB RAM, and no gaming aesthetic.',
    time: '10:42',
  },
  {
    id: 2,
    role: 'agent',
    text: 'I searched 286 options across 18 verified merchants and ranked them for portable development work. These three have the strongest fit—my top pick prioritizes battery and display consistency.',
    time: '10:43',
    products: true,
  },
]

export const metrics = [
  { label: 'Agent searches', value: '24,892', change: '+18.4%', trend: [35, 44, 39, 56, 52, 67, 76] },
  { label: 'Conversions', value: '1,847', change: '+12.7%', trend: [28, 31, 46, 43, 55, 58, 72] },
  { label: 'Agent revenue', value: '₹18.4L', change: '+24.2%', trend: [22, 38, 34, 48, 61, 57, 82] },
]

export const transactions = [
  { id: 'NX-8294', action: 'Order approved', detail: 'AetherBook Pro 14 · ₹1,24,999', time: '2 min ago', status: 'success' },
  { id: 'AG-1048', action: 'Product recommended', detail: 'Halo ANC Studio · 94% match', time: '8 min ago', status: 'active' },
  { id: 'NX-8293', action: 'Payment verified', detail: 'Axis 75 Mechanical · ₹11,499', time: '21 min ago', status: 'success' },
  { id: 'AG-1047', action: 'Search lost', detail: 'Orbit Dock · price exceeded intent', time: '34 min ago', status: 'warning' },
]

export const orderStates = [
  { label: 'Order hold created', state: 'complete' },
  { label: 'Awaiting your approval', state: 'active' },
  { label: 'Secure payment', state: 'pending' },
  { label: 'Merchant confirmation', state: 'pending' },
]
