import { useCallback, useEffect, useState } from 'react'
import { BarChart3, Bell, Boxes, ChevronDown, LayoutDashboard, Menu, Settings, Sparkles, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import AddProductModal from '../components/merchant/AddProductModal'
import AgentTimelineFeed from '../components/merchant/AgentTimelineFeed'
import ProductInventoryTable from '../components/merchant/ProductInventoryTable'
import ProductRelationshipManager from '../components/merchant/ProductRelationshipManager'
import { useNexora } from '../context/NexoraContext'
import { useAuth } from '../context/AuthContext'
import { createProduct, createProductRelationship, deleteProductRelationship, extractResults, getApiError, getMerchantAnalytics, getMoneyAudits, getProductRelationships, getProducts, patchProduct, patchProductRelationship, toInventoryProduct, toMoneyTimelineEvent, toProductPayload } from '../services/api'
import DashboardOverview from './merchant/DashboardOverview'
import AgentAnalytics from './merchant/AgentAnalytics'

const tabs = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'insights', label: 'Agent Insights', icon: BarChart3 },
]

const tabCopy = {
  overview: { title: 'Merchant overview', detail: 'Live agent commerce and catalog performance' },
  inventory: { title: 'Product inventory', detail: 'Structured catalog management and agent visibility' },
  insights: { title: 'Agent insights', detail: 'Recommendation audit and lost conversion intelligence' },
}

export default function MerchantDashboard() {
  const location = useLocation()
  const routerNavigate = useNavigate()
  const { inventory, setInventory, auditEvents, setAuditEvents } = useNexora()
  const { user } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [productModal, setProductModal] = useState({ open: false, product: null })
  const [catalogState, setCatalogState] = useState({ loading: true, error: '' })
  const [timelineError, setTimelineError] = useState('')
  const [relationships, setRelationships] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const activeTab = location.pathname === '/merchant/inventory' ? 'inventory' : location.pathname === '/merchant/analytics' ? 'insights' : 'overview'

  const refreshCatalog = useCallback(async (signal) => {
    try {
      const { data } = await getProducts(signal)
      setInventory(extractResults(data).map(toInventoryProduct))
      setCatalogState({ loading: false, error: '' })
    } catch (error) {
      if (signal?.aborted) return
      setCatalogState({ loading: false, error: getApiError(error, 'Unable to load the merchant catalog.') })
    }
  }, [setInventory])

  const refreshAudits = useCallback(async (signal) => {
    try {
      const { data } = await getMoneyAudits(signal)
      setAuditEvents(extractResults(data).map(toMoneyTimelineEvent).reverse())
      setTimelineError('')
    } catch (error) {
      if (signal?.aborted) return
      setTimelineError(getApiError(error, 'Unable to refresh agent activity.'))
    }
  }, [setAuditEvents])

  const refreshGrowth = useCallback(async (signal) => {
    try {
      const [relationshipResponse, analyticsResponse] = await Promise.all([
        getProductRelationships(signal),
        getMerchantAnalytics(signal),
      ])
      setRelationships(extractResults(relationshipResponse.data))
      setAnalytics(analyticsResponse.data)
    } catch (error) {
      if (!signal?.aborted) setTimelineError(getApiError(error, 'Unable to refresh growth data.'))
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    refreshCatalog(controller.signal)
    return () => controller.abort()
  }, [refreshCatalog])

  useEffect(() => {
    const controller = new AbortController()
    refreshAudits(controller.signal)
    const poll = window.setInterval(() => refreshAudits(controller.signal), 5000)
    return () => {
      window.clearInterval(poll)
      controller.abort()
    }
  }, [refreshAudits])

  useEffect(() => {
    const controller = new AbortController()
    refreshGrowth(controller.signal)
    const poll = window.setInterval(() => refreshGrowth(controller.signal), 15000)
    return () => { window.clearInterval(poll); controller.abort() }
  }, [refreshGrowth])

  const navigate = (tab) => {
    const routes = { overview: '/merchant', inventory: '/merchant/inventory', insights: '/merchant/analytics' }
    routerNavigate(routes[tab])
    setSidebarOpen(false)
  }

  const updateCatalogProduct = async (id, payload) => {
    setCatalogState((current) => ({ ...current, error: '' }))
    try {
      await patchProduct(id, payload)
      await refreshCatalog()
    } catch (error) {
      setCatalogState({ loading: false, error: getApiError(error, 'Unable to update this product.') })
    }
  }

  const toggleProduct = (id) => {
    const product = inventory.find((item) => item.id === id)
    if (product) updateCatalogProduct(id, { is_active: !product.active })
  }

  const toggleStock = (id) => {
    const product = inventory.find((item) => item.id === id)
    if (product) updateCatalogProduct(id, { stock_quantity: product.stock > 0 ? 0 : 10 })
  }

  const updatePrice = (id, price) => updateCatalogProduct(id, { price })

  const commitProduct = async (nextProduct) => {
    try {
      const payload = toProductPayload(nextProduct)
      if (productModal.product) await patchProduct(nextProduct.id, payload)
      else await createProduct(payload)
      await refreshCatalog()
      setProductModal({ open: false, product: null })
    } catch (error) {
      setCatalogState({ loading: false, error: getApiError(error, 'Unable to save this product.') })
    }
  }

  const addRelationship = async (payload) => {
    try { await createProductRelationship(payload); await refreshGrowth() } catch (error) { setTimelineError(getApiError(error, 'Unable to create this relationship.')) }
  }
  const toggleRelationship = async (item) => {
    try { await patchProductRelationship(item.id, { is_active: !item.is_active }); await refreshGrowth() } catch (error) { setTimelineError(getApiError(error, 'Unable to update this relationship.')) }
  }
  const removeRelationship = async (id) => {
    try { await deleteProductRelationship(id); await refreshGrowth() } catch (error) { setTimelineError(getApiError(error, 'Unable to delete this relationship.')) }
  }

  return (
    <div className="merchant-grid flex min-h-[calc(100dvh-4rem)] bg-[#11131a] text-slate-50">
      {sidebarOpen && <button type="button" aria-label="Close navigation" className="fixed inset-0 z-30 bg-slate-950/70 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed bottom-0 left-0 top-16 z-40 flex w-[252px] flex-col border-r border-slate-800 bg-slate-950 p-4 transition-transform duration-300 lg:sticky lg:top-16 lg:h-[calc(100dvh-4rem)] lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-12 items-center justify-between px-1"><div><p className="text-xs font-semibold text-slate-200">Merchant workspace</p><p className="mt-1 font-mono text-[8px] text-slate-600">AGENT COMMERCE OS</p></div><button type="button" aria-label="Close navigation" className="text-slate-500 lg:hidden" onClick={() => setSidebarOpen(false)}><X size={18} /></button></div>
        <button type="button" className="mt-6 flex w-full items-center gap-2.5 border border-slate-800 bg-slate-900 p-3 text-left transition hover:border-violet-500/50">
          <span className="grid size-8 place-items-center bg-violet-600 text-xs font-bold shadow-[2px_2px_0_#c4b5fd]">{user?.merchant?.name?.slice(0, 2).toUpperCase() ?? 'NM'}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{user?.merchant?.name}</span><span className="mt-0.5 block font-mono text-[8px] text-emerald-400">AUTHENTICATED MERCHANT</span></span><ChevronDown size={13} className="text-slate-600" />
        </button>

        <nav className="mt-7 space-y-1" aria-label="Merchant dashboard">
          <p className="mono-label mb-2 px-3 text-slate-600">Workspace</p>
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => navigate(id)} aria-current={activeTab === id ? 'page' : undefined} className={`focus-ring flex w-full items-center gap-3 border px-3 py-3 text-xs font-medium transition ${activeTab === id ? 'border-violet-400 bg-violet-600 text-white shadow-[3px_3px_0_rgba(196,181,253,.35)]' : 'border-transparent text-slate-500 hover:border-slate-800 hover:bg-slate-900 hover:text-slate-200'}`}><Icon size={15} /><span className="flex-1 text-left">{label}</span>{id === 'inventory' && <span className={`rounded-full px-1.5 py-0.5 font-mono text-[8px] ${activeTab === id ? 'bg-white/15' : 'bg-slate-800'}`}>{inventory.length}</span>}{id === 'insights' && <span className="size-1.5 rounded-full bg-rose-400" />}</button>
          ))}
        </nav>

        <div className="mt-auto">
          <div className="mb-3 border border-violet-500/20 bg-violet-500/[0.07] p-4"><Sparkles size={16} className="text-violet-400" /><p className="mt-3 text-xs font-semibold">Agent catalog health</p><div className="mt-2 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full w-[92%] rounded-full bg-emerald-400" /></div><span className="font-mono text-[9px] text-emerald-400">92%</span></div><p className="mt-2 text-[9px] leading-relaxed text-slate-500">One product needs stock and four need richer noise specs.</p></div>
          <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs text-slate-500 transition hover:text-slate-300"><Settings size={15} /> Settings</button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="sticky top-16 z-20 flex h-[72px] items-center justify-between border-b border-slate-800 bg-[#11131a]/90 px-4 backdrop-blur-xl md:px-7">
          <div className="flex items-center gap-3"><button type="button" aria-label="Open navigation" className="focus-ring rounded-lg p-2 text-slate-500 lg:hidden" onClick={() => setSidebarOpen(true)}><Menu size={19} /></button><div><h1 className="text-sm font-semibold tracking-tight text-white md:text-base">{tabCopy[activeTab].title}</h1><p className="mt-0.5 hidden text-[10px] text-slate-500 sm:block">{tabCopy[activeTab].detail}</p></div></div>
          <button type="button" aria-label="Notifications" className="relative grid size-9 place-items-center border border-slate-800 bg-slate-900 text-slate-500 transition hover:border-violet-500/50 hover:text-white"><Bell size={15} /><span className="absolute right-2 top-2 size-1.5 rounded-full border border-slate-900 bg-rose-400" /></button>
        </header>

        <div className="border-b border-slate-800 bg-slate-950 px-4 lg:hidden">
          <div className="flex overflow-x-auto">{tabs.map(({ id, label }) => <button key={id} type="button" onClick={() => navigate(id)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-[10px] font-semibold transition ${activeTab === id ? 'border-indigo-400 text-indigo-300' : 'border-transparent text-slate-600'}`}>{label}</button>)}</div>
        </div>

        <div className="mx-auto max-w-[1440px] p-4 md:p-7">
          {(catalogState.error || timelineError) && <div className="mb-5 rounded-xl border border-[#DC143C]/30 bg-[#DC143C]/10 px-4 py-3 text-[11px] text-rose-300" role="alert">{catalogState.error || timelineError}</div>}
          {catalogState.loading && <p className="mb-4 font-mono text-[9px] text-indigo-300">SYNCING LIVE POSTGRESQL CATALOG…</p>}
          {activeTab === 'overview' && <DashboardOverview analytics={analytics} inventory={inventory} events={auditEvents} onNavigate={navigate} merchantName={user?.merchant?.name} />}
          {activeTab === 'inventory' && <div><div className="mb-6 border-l-2 border-violet-500 pl-4"><p className="mono-label text-violet-400">Catalog management</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Products agents can understand.</h2><p className="mt-1 text-xs text-slate-500">Pricing, availability, and specifications sync with the Django catalog API.</p></div><ProductInventoryTable products={inventory} onToggleActive={toggleProduct} onToggleStock={toggleStock} onUpdatePrice={updatePrice} onAdd={() => setProductModal({ open: true, product: null })} onEdit={(product) => setProductModal({ open: true, product })} /><ProductRelationshipManager products={inventory} relationships={relationships} onCreate={addRelationship} onToggle={toggleRelationship} onDelete={removeRelationship} /></div>}
          {activeTab === 'insights' && <div><div className="mb-6 border-l-2 border-violet-500 pl-4"><p className="mono-label text-violet-400">Agentic intelligence</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Understand every win and loss.</h2><p className="mt-1 text-xs text-slate-500">Live recommendation impressions, webhook-confirmed conversions, and catalog gaps.</p></div><AgentAnalytics /><div className="mt-5"><AgentTimelineFeed events={auditEvents} expanded /></div></div>}
        </div>
      </main>

      <AddProductModal open={productModal.open} product={productModal.product} onClose={() => setProductModal({ open: false, product: null })} onSave={commitProduct} />
    </div>
  )
}
