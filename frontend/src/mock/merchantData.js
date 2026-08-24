export const conversionMetrics = [
  { id: 'revenue', label: 'Total revenue', value: '₹18.42L', change: '+24.2%', direction: 'up', detail: '₹3.6L attributed to AI agents', trend: [34, 42, 38, 53, 58, 70, 82] },
  { id: 'appearances', label: 'AI search appearances', value: '24,892', change: '+18.4%', direction: 'up', detail: '3,814 high-intent this week', trend: [30, 47, 41, 56, 52, 66, 78] },
  { id: 'conversions', label: 'Agent conversions', value: '1,847', change: '+12.7%', direction: 'up', detail: '7.42% conversion rate', trend: [28, 34, 46, 43, 54, 61, 73] },
  { id: 'ratio', label: 'Win / loss ratio', value: '3.8×', change: '+0.6×', direction: 'up', detail: '81 wins · 21 losses this week', trend: [35, 39, 48, 44, 62, 59, 77] },
]

export const merchantInventory = [
  {
    id: 'prd-k2-pro', sku: 'KB-K2P-84', name: 'Keychron K2 Pro', category: 'Mechanical Keyboard', price: 7899, compareAt: 8999, stock: 18, active: true, agentViews: 1284, conversions: 96,
    tags: ['wireless', 'hot-swap', 'tactile', 'coding'],
    specs: { layout: '75% · 84 keys', switches: 'K Pro Brown Tactile', hot_swappable: true, keycaps: 'Double-shot PBT', wireless: 'Bluetooth 5.1', battery_life: 'Up to 100 hours', firmware: 'QMK / VIA' },
  },
  {
    id: 'prd-v1-max', sku: 'KB-V1M-75', name: 'Keychron V1 Max', category: 'Mechanical Keyboard', price: 7499, compareAt: 8499, stock: 11, active: true, agentViews: 1048, conversions: 82,
    tags: ['tri-mode', 'hot-swap', 'gasket', 'coding'],
    specs: { layout: '75% · knob', switches: 'Gateron Jupiter Brown', hot_swappable: true, keycaps: 'OSA Double-shot PBT', wireless: '2.4 GHz + Bluetooth 5.1', battery_life: 'Up to 120 hours', firmware: 'QMK / VIA' },
  },
  {
    id: 'prd-q1-he', sku: 'KB-Q1HE-75', name: 'Keychron Q1 HE', category: 'Hall Effect Keyboard', price: 18499, compareAt: 19999, stock: 5, active: true, agentViews: 742, conversions: 41,
    tags: ['hall-effect', 'rapid-trigger', 'premium'],
    specs: { layout: '75% · knob', switches: 'Gateron Double-Rail Magnetic', hot_swappable: false, keycaps: 'Double-shot PBT', wireless: '2.4 GHz + Bluetooth 5.2', battery_life: 'Up to 100 hours', actuation: '0.2–3.8 mm adjustable' },
  },
  {
    id: 'prd-k3-max', sku: 'KB-K3M-LP', name: 'Keychron K3 Max', category: 'Low Profile Keyboard', price: 9299, compareAt: 9999, stock: 0, active: false, agentViews: 596, conversions: 29,
    tags: ['low-profile', 'wireless', 'portable'],
    specs: { layout: '75% low-profile', switches: 'Gateron Low-profile Brown', hot_swappable: true, keycaps: 'LSA Double-shot PBT', wireless: '2.4 GHz + Bluetooth 5.1', battery_life: 'Up to 78 hours', weight: '525 g' },
  },
  {
    id: 'prd-m3-mini', sku: 'MS-M3M-4K', name: 'Keychron M3 Mini', category: 'Wireless Mouse', price: 4499, compareAt: 4999, stock: 34, active: true, agentViews: 418, conversions: 37,
    tags: ['4k-polling', 'wireless', 'ergonomic'],
    specs: { sensor: 'PixArt 3395', dpi: '26,000 DPI', switches: 'Huano Micro', wireless: '2.4 GHz + Bluetooth 5.1', battery_life: 'Up to 135 hours', weight: '55 g' },
  },
]

export const agentAuditLogs = [
  { id: 'evt-9402', agent: 'Agent #402', type: 'recommended', product: 'Keychron K2 Pro', buyer: 'Buyer ···8A21', reason: 'Silent tactile switches under ₹8,000', time: 'Just now', score: 96 },
  { id: 'evt-9401', agent: 'Agent #187', type: 'converted', product: 'Keychron V1 Max', buyer: 'Buyer ···3F90', reason: 'Best hot-swap coding fit with tri-mode wireless', time: '2 min ago', score: 94, amount: 7499 },
  { id: 'evt-9400', agent: 'Agent #711', type: 'lost', product: 'Keychron Q1 HE', buyer: 'Buyer ···1B44', reason: 'Competitor price was 8% lower', time: '7 min ago', score: 88 },
  { id: 'evt-9399', agent: 'Agent #053', type: 'searched', product: 'Keychron K3 Max', buyer: 'Buyer ···7C12', reason: 'Low-profile wireless board for travel', time: '12 min ago', score: 91 },
  { id: 'evt-9398', agent: 'Agent #628', type: 'converted', product: 'Keychron M3 Mini', buyer: 'Buyer ···6D07', reason: 'Lightweight productivity mouse under ₹5,000', time: '18 min ago', score: 93, amount: 4499 },
  { id: 'evt-9397', agent: 'Agent #314', type: 'lost', product: 'Keychron K3 Max', buyer: 'Buyer ···2E85', reason: 'Product was out of stock at decision time', time: '24 min ago', score: 90 },
]

export const incomingAgentEvents = [
  { id: 'live-01', agent: 'Agent #824', type: 'recommended', product: 'Keychron V1 Max', buyer: 'Buyer ···9A14', reason: 'QMK support and 5-pin hot-swap sockets', score: 95 },
  { id: 'live-02', agent: 'Agent #291', type: 'searched', product: 'Keychron K2 Pro', buyer: 'Buyer ···4C33', reason: 'Mac-compatible tactile keyboard for coding', score: 92 },
]

export const lostConversionInsights = [
  { id: 'pricing', title: 'Competitor pricing', count: 12, impact: '₹94,788', message: 'Lost 12 deals this week because competitors priced 8% lower.', severity: 'critical', share: 48 },
  { id: 'stock', title: 'Stock availability', count: 7, impact: '₹65,093', message: 'Seven high-intent buyers saw an unavailable variant.', severity: 'warning', share: 28 },
  { id: 'metadata', title: 'Incomplete specifications', count: 4, impact: '₹31,596', message: 'Agents skipped four listings without switch-noise metadata.', severity: 'warning', share: 16 },
]

export const conversionFunnel = [
  { label: 'Search appearances', value: 24892, display: '24.9K', width: 100 },
  { label: 'Agent shortlisted', value: 6324, display: '6.3K', width: 72 },
  { label: 'Recommended', value: 3814, display: '3.8K', width: 53 },
  { label: 'Converted', value: 1847, display: '1.8K', width: 34 },
]
