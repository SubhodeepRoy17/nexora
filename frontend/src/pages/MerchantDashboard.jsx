import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, BarChart3, Boxes, LayoutDashboard, Menu, Sparkles, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import AddProductModal from '../components/merchant/AddProductModal'
import AgentTimelineFeed from '../components/merchant/AgentTimelineFeed'
import ProductInventoryTable from '../components/merchant/ProductInventoryTable'
import ProductRelationshipManager from '../components/merchant/ProductRelationshipManager'
import MerchantOperations from '../components/merchant/MerchantOperations'
import DataFreshness from '../components/common/DataFreshness'
import { useNexora } from '../context/NexoraContext'
import { useAuth } from '../context/AuthContext'
import { createProduct, createProductRelationship, deleteProductRelationship, extractResults, getApiError, getMerchantAnalytics, getMerchantWorkspace, getMoneyAudits, getOrders, getProductRelationships, getProducts, patchProduct, patchProductRelationship, toInventoryProduct, toMoneyTimelineEvent, toProductPayload } from '../services/api'
import useBoundedPolling from '../hooks/useBoundedPolling'
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
  const [timelineState, setTimelineState] = useState({ loading: true, error: '', updatedAt: null })
  const [growthState, setGrowthState] = useState({ loading: true, error: '', updatedAt: null })
  const [operationsState, setOperationsState] = useState({ loading: true, error: '', updatedAt: null })
  const [relationships, setRelationships] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [orders, setOrders] = useState([])
  const [workspace, setWorkspace] = useState(null)
  const activeTab = location.pathname === '/merchant/inventory' ? 'inventory' : location.pathname === '/merchant/analytics' ? 'insights' : 'overview'

  const refreshCatalog = useCallback(async (signal) => {
    try {
      const { data } = await getProducts(signal)
      setInventory(extractResults(data).map(toInventoryProduct))
      setCatalogState({ loading: false, error: '', updatedAt: new Date().toISOString() })
    } catch (error) {
      if (signal?.aborted) return
      setCatalogState({ loading: false, error: getApiError(error, 'Unable to load the merchant catalog.') })
    }
  }, [setInventory])

  const refreshAudits = useCallback(async (signal) => {
    try {
      const { data } = await getMoneyAudits(signal)
      setAuditEvents(extractResults(data).map(toMoneyTimelineEvent).reverse())
      setTimelineState({ loading: false, error: '', updatedAt: new Date().toISOString() })
    } catch (error) {
      if (signal?.aborted) return
      setTimelineState((current) => ({ ...current, loading: false, error: getApiError(error, 'Unable to refresh agent activity.') }))
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
      setGrowthState({ loading: false, error: '', updatedAt: new Date().toISOString() })
    } catch (error) {
      if (!signal?.aborted) setGrowthState((current) => ({ ...current, loading: false, error: getApiError(error, 'Unable to refresh growth data.') }))
    }
  }, [])

  const refreshOperations = useCallback(async (signal) => {
    try {
      const [workspaceResponse, orderResponse] = await Promise.all([
        getMerchantWorkspace(signal), getOrders(signal),
      ])
      setWorkspace(workspaceResponse.data)
      setOrders(extractResults(orderResponse.data))
      setOperationsState({ loading: false, error: '', updatedAt: new Date().toISOString() })
    } catch (error) {
      if (!signal?.aborted) setOperationsState((current) => ({ ...current, loading: false, error: getApiError(error, 'Unable to refresh payment operations.') }))
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    refreshCatalog(controller.signal)
    return () => controller.abort()
  }, [refreshCatalog])

  useBoundedPolling(refreshAudits, { intervalMs: 5000, maxCycles: 120 })
  useBoundedPolling(refreshGrowth, { intervalMs: 15000, maxCycles: 120 })
  useBoundedPolling(refreshOperations, { intervalMs: 10000, maxCycles: 120 })

  const navigate = (tab) => {
    const routes = { overview: '/merchant', inventory: '/merchant/inventory', insights: '/merchant/analytics' }
    routerNavigate(routes[tab])
    setSidebarOpen(false)
  }

  const updateCatalogProduct = async (id, payload) => {
    setCatalogState((current) => ({ ...current, error: '' }))
    try {
      await patchProduct(id, payload)
      await Promise.all([refreshCatalog(), refreshOperations()])
    } catch (error) {
      setCatalogState((current) => ({ ...current, loading: false, error: getApiError(error, 'Unable to update this product.') }))
    }
  }

  const toggleProduct = (id) => {
    const product = inventory.find((item) => item.id === id)
    if (product) updateCatalogProduct(id, { is_active: !product.active })
  }

  const updatePrice = (id, price) => updateCatalogProduct(id, { price })

  const commitProduct = async (nextProduct) => {
    try {
      const payload = toProductPayload(nextProduct)
      if (productModal.product) await patchProduct(nextProduct.id, payload)
      else await createProduct(payload)
      await Promise.all([refreshCatalog(), refreshOperations()])
      setProductModal({ open: false, product: null })
    } catch (error) {
      setCatalogState({ loading: false, error: getApiError(error, 'Unable to save this product.') })
    }
  }

  const addRelationship = async (payload) => {
    try { await createProductRelationship(payload); await refreshGrowth(); return true } catch (error) { setGrowthState((current) => ({ ...current, error: getApiError(error, 'Unable to create this relationship.') })); return false }
  }
  const toggleRelationship = async (item) => {
    try { await patchProductRelationship(item.id, { is_active: !item.is_active }); await refreshGrowth() } catch (error) { setGrowthState((current) => ({ ...current, error: getApiError(error, 'Unable to update this relationship.') })) }
  }
  const removeRelationship = async (id) => {
    try { await deleteProductRelationship(id); await refreshGrowth() } catch (error) { setGrowthState((current) => ({ ...current, error: getApiError(error, 'Unable to delete this relationship.') })) }
  }

  const catalogHealth = workspace?.catalog_health
  const catalogIssueTotal = Object.values(catalogHealth?.issue_counts ?? {}).reduce((sum, value) => sum + value, 0)
  const openExceptions = workspace?.operations?.open_reconciliation_exceptions ?? 0

  return (
    <div className="merchant-light merchant-grid flex min-h-[calc(100dvh-4rem)] bg-[#f6f5f1] text-slate-950">
      {sidebarOpen && <button type="button" aria-label="Close navigation" className="fixed inset-0 z-30 bg-slate-950/70 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed bottom-0 left-0 top-16 z-40 flex w-[252px] flex-col border-r border-slate-800 bg-slate-950 p-4 transition-transform duration-300 lg:sticky lg:top-16 lg:h-[calc(100dvh-4rem)] lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-12 items-center justify-between px-1"><div><p className="text-xs font-semibold text-slate-200">Merchant workspace</p><p className="mt-1 font-mono text-[8px] text-slate-600">AGENT COMMERCE OS</p></div><button type="button" aria-label="Close navigation" className="text-slate-500 lg:hidden" onClick={() => setSidebarOpen(false)}><X size={18} /></button></div>
        <div className="mt-6 flex w-full items-center gap-2.5 border border-slate-800 bg-slate-900 p-3" aria-label={`Selected merchant: ${workspace?.merchant?.name ?? user?.merchant?.name}`}>
          <span className="grid size-8 place-items-center bg-violet-600 text-xs font-bold shadow-[2px_2px_0_#c4b5fd]">{user?.merchant?.name?.slice(0, 2).toUpperCase() ?? 'NM'}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{workspace?.merchant?.name ?? user?.merchant?.name}</span><span className="mt-0.5 block font-mono text-[8px] text-emerald-400">OWNER-SCOPED WORKSPACE</span></span>
        </div>

        <nav className="mt-7 space-y-1" aria-label="Merchant dashboard">
          <p className="mono-label mb-2 px-3 text-slate-600">Workspace</p>
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => navigate(id)} aria-current={activeTab === id ? 'page' : undefined} className={`focus-ring flex w-full items-center gap-3 border px-3 py-3 text-xs font-medium transition ${activeTab === id ? 'border-violet-400 bg-violet-600 text-white shadow-[3px_3px_0_rgba(196,181,253,.35)]' : 'border-transparent text-slate-500 hover:border-slate-800 hover:bg-slate-900 hover:text-slate-200'}`}><Icon size={15} /><span className="flex-1 text-left">{label}</span>{id === 'inventory' && <span className={`rounded-full px-1.5 py-0.5 font-mono text-[8px] ${activeTab === id ? 'bg-white/15' : 'bg-slate-800'}`}>{inventory.length}</span>}</button>
          ))}
        </nav>

        <div className="mt-auto">
          <div className="mb-3 border border-violet-500/20 bg-violet-500/[0.07] p-4"><Sparkles size={16} className="text-violet-400" /><p className="mt-3 text-xs font-semibold">Agent catalog health</p>{catalogHealth ? <><div className="mt-2 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${catalogHealth.score_percent ?? 0}%` }} /></div><span className="font-mono text-[9px] text-emerald-400">{catalogHealth.score_percent == null ? 'N/A' : `${catalogHealth.score_percent}%`}</span></div><p className="mt-2 text-[9px] leading-relaxed text-slate-500">{catalogHealth.total_products ? `${catalogIssueTotal} missing check${catalogIssueTotal === 1 ? '' : 's'} across ${catalogHealth.total_products} products.` : 'No products yet; health is not scored.'}</p><p className="mt-2 font-mono text-[7px] leading-4 text-slate-600">{catalogHealth.definition}</p></> : <button type="button" onClick={() => refreshOperations()} className="mt-3 text-[9px] text-amber-300">{operationsState.error ? 'Health unavailable · retry' : 'Calculating from catalog…'}</button>}</div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="sticky top-16 z-20 flex h-[72px] items-center justify-between border-b border-slate-800 bg-[#11131a]/90 px-4 backdrop-blur-xl md:px-7">
          <div className="flex items-center gap-3"><button type="button" aria-label="Open navigation" className="focus-ring rounded-lg p-2 text-slate-500 lg:hidden" onClick={() => setSidebarOpen(true)}><Menu size={19} /></button><div><h1 className="text-sm font-semibold tracking-tight text-white md:text-base">{tabCopy[activeTab].title}</h1><p className="mt-0.5 hidden text-[10px] text-slate-500 sm:block">{tabCopy[activeTab].detail}</p></div></div>
          <div className={`flex items-center gap-2 border px-3 py-2 font-mono text-[8px] ${openExceptions ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-slate-800 bg-slate-900 text-emerald-400'}`}><AlertTriangle size={12} /> {openExceptions} OPEN RECONCILIATION</div>
        </header>

        <div className="border-b border-slate-800 bg-slate-950 px-4 lg:hidden">
          <div className="flex overflow-x-auto">{tabs.map(({ id, label }) => <button key={id} type="button" onClick={() => navigate(id)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-[10px] font-semibold transition ${activeTab === id ? 'border-indigo-400 text-indigo-300' : 'border-transparent text-slate-600'}`}>{label}</button>)}</div>
        </div>

        <div className="mx-auto max-w-[1440px] p-4 md:p-7">
          {(catalogState.error || timelineState.error) && <div className="mb-5 border border-[#DC143C]/30 bg-[#DC143C]/10 px-4 py-3 text-[11px] text-rose-300" role="alert">{catalogState.error || timelineState.error}</div>}
          {catalogState.loading && <p className="mb-4 font-mono text-[9px] text-indigo-300">SYNCING LIVE POSTGRESQL CATALOG…</p>}
          {activeTab === 'overview' && <DashboardOverview analytics={analytics} inventory={inventory} events={auditEvents} onNavigate={navigate} merchantName={workspace?.merchant?.name ?? user?.merchant?.name} analyticsState={growthState} timelineState={timelineState} orders={orders} workspace={workspace} operationsState={operationsState} onRetryOperations={() => refreshOperations()} />}
          {activeTab === 'inventory' && <div><div className="mb-6 flex flex-col justify-between gap-3 border-l-2 border-violet-500 pl-4 sm:flex-row sm:items-end"><div><p className="mono-label text-violet-400">Catalog management</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Products agents can understand.</h2><p className="mt-1 text-xs text-slate-500">Pricing, availability, specifications, and performance come from owner-scoped APIs.</p></div><DataFreshness updatedAt={catalogState.updatedAt} loading={catalogState.loading} staleAfterMs={60000} dark /></div><ProductInventoryTable products={inventory} onToggleActive={toggleProduct} onUpdatePrice={updatePrice} onAdd={() => setProductModal({ open: true, product: null })} onEdit={(product) => setProductModal({ open: true, product })} /><ProductRelationshipManager products={inventory} relationships={relationships} onCreate={addRelationship} onToggle={toggleRelationship} onDelete={removeRelationship} /></div>}
          {activeTab === 'insights' && <div><div className="mb-6 border-l-2 border-violet-500 pl-4"><p className="mono-label text-violet-400">Agentic intelligence</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Understand every win and loss.</h2><p className="mt-1 text-xs text-slate-500">Owner-scoped recommendation impressions, webhook-confirmed conversions, and catalog gaps.</p></div><AgentAnalytics analytics={analytics} state={growthState} onRetry={() => refreshGrowth()} /><div className="mt-5"><div className="mb-2 flex justify-end"><DataFreshness updatedAt={timelineState.updatedAt} loading={timelineState.loading} staleAfterMs={20000} dark /></div><AgentTimelineFeed events={auditEvents} expanded /></div></div>}
        </div>
      </main>

      <AddProductModal open={productModal.open} product={productModal.product} onClose={() => setProductModal({ open: false, product: null })} onSave={commitProduct} />
    </div>
  )
}
