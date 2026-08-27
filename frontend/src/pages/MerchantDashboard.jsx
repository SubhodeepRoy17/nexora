import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, BarChart3, Boxes, LayoutDashboard, Sparkles } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Brand from '../components/Brand'
import LogoMark from '../components/LogoMark'
import { WorkspaceAccountMenu, WorkspaceSidebarToggle } from '../components/common/WorkspaceSidebarControls'
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
import useWorkspaceSidebar from '../hooks/useWorkspaceSidebar'
import DashboardOverview from './merchant/DashboardOverview'
import AgentAnalytics from './merchant/AgentAnalytics'

const tabs = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'insights', label: 'Sales insights', icon: BarChart3 },
]

const tabCopy = {
  overview: {
    title: 'Merchant overview',
    detail: 'Current sales and product performance',
  },
  inventory: {
    title: 'Product inventory',
    detail: 'Manage products, prices, stock, and visibility',
  },
  insights: {
    title: 'Sales insights',
    detail: 'See what shoppers chose and which sales were missed',
  },
}

export default function MerchantDashboard() {
  const location = useLocation()
  const routerNavigate = useNavigate()
  const { inventory, setInventory, auditEvents, setAuditEvents } = useNexora()
  const { user } = useAuth()
  const { open: sidebarOpen, setOpen: setSidebarOpen, closeOnMobile: closeSidebarOnMobile } = useWorkspaceSidebar()
  const [productModal, setProductModal] = useState({
    open: false,
    product: null,
  })
  const [catalogState, setCatalogState] = useState({
    loading: true,
    error: '',
  })
  const [timelineState, setTimelineState] = useState({
    loading: true,
    error: '',
    updatedAt: null,
  })
  const [growthState, setGrowthState] = useState({
    loading: true,
    error: '',
    updatedAt: null,
  })
  const [operationsState, setOperationsState] = useState({
    loading: true,
    error: '',
    updatedAt: null,
  })
  const [relationships, setRelationships] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [orders, setOrders] = useState([])
  const [workspace, setWorkspace] = useState(null)
  const activeTab = location.pathname === '/merchant/inventory' ? 'inventory' : location.pathname === '/merchant/analytics' ? 'insights' : 'overview'

  const refreshCatalog = useCallback(
    async (signal) => {
      try {
        const { data } = await getProducts(signal)
        setInventory(extractResults(data).map(toInventoryProduct))
        setCatalogState({
          loading: false,
          error: '',
          updatedAt: new Date().toISOString(),
        })
      } catch (error) {
        if (signal?.aborted) return
        setCatalogState({
          loading: false,
          error: getApiError(error, 'Unable to load the merchant catalog.'),
        })
      }
    },
    [setInventory],
  )

  const refreshAudits = useCallback(
    async (signal) => {
      try {
        const { data } = await getMoneyAudits(signal)
        setAuditEvents(extractResults(data).map(toMoneyTimelineEvent).reverse())
        setTimelineState({
          loading: false,
          error: '',
          updatedAt: new Date().toISOString(),
        })
      } catch (error) {
        if (signal?.aborted) return
        setTimelineState((current) => ({
          ...current,
          loading: false,
          error: getApiError(error, 'Unable to refresh agent activity.'),
        }))
      }
    },
    [setAuditEvents],
  )

  const refreshGrowth = useCallback(async (signal) => {
    try {
      const [relationshipResponse, analyticsResponse] = await Promise.all([getProductRelationships(signal), getMerchantAnalytics(signal)])
      setRelationships(extractResults(relationshipResponse.data))
      setAnalytics(analyticsResponse.data)
      setGrowthState({
        loading: false,
        error: '',
        updatedAt: new Date().toISOString(),
      })
    } catch (error) {
      if (!signal?.aborted)
        setGrowthState((current) => ({
          ...current,
          loading: false,
          error: getApiError(error, 'Unable to refresh growth data.'),
        }))
    }
  }, [])

  const refreshOperations = useCallback(async (signal) => {
    try {
      const [workspaceResponse, orderResponse] = await Promise.all([getMerchantWorkspace(signal), getOrders(signal)])
      setWorkspace(workspaceResponse.data)
      setOrders(extractResults(orderResponse.data))
      setOperationsState({
        loading: false,
        error: '',
        updatedAt: new Date().toISOString(),
      })
    } catch (error) {
      if (!signal?.aborted)
        setOperationsState((current) => ({
          ...current,
          loading: false,
          error: getApiError(error, 'Unable to refresh payment operations.'),
        }))
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
    const routes = {
      overview: '/merchant',
      inventory: '/merchant/inventory',
      insights: '/merchant/analytics',
    }
    routerNavigate(routes[tab])
    closeSidebarOnMobile()
  }

  const updateCatalogProduct = async (id, payload) => {
    setCatalogState((current) => ({ ...current, error: '' }))
    try {
      await patchProduct(id, payload)
      await Promise.all([refreshCatalog(), refreshOperations()])
    } catch (error) {
      setCatalogState((current) => ({
        ...current,
        loading: false,
        error: getApiError(error, 'Unable to update this product.'),
      }))
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
      setCatalogState({
        loading: false,
        error: getApiError(error, 'Unable to save this product.'),
      })
    }
  }

  const addRelationship = async (payload) => {
    try {
      await createProductRelationship(payload)
      await refreshGrowth()
      return true
    } catch (error) {
      setGrowthState((current) => ({
        ...current,
        error: getApiError(error, 'Unable to create this relationship.'),
      }))
      return false
    }
  }
  const toggleRelationship = async (item) => {
    try {
      await patchProductRelationship(item.id, { is_active: !item.is_active })
      await refreshGrowth()
    } catch (error) {
      setGrowthState((current) => ({
        ...current,
        error: getApiError(error, 'Unable to update this relationship.'),
      }))
    }
  }
  const removeRelationship = async (id) => {
    try {
      await deleteProductRelationship(id)
      await refreshGrowth()
    } catch (error) {
      setGrowthState((current) => ({
        ...current,
        error: getApiError(error, 'Unable to delete this relationship.'),
      }))
    }
  }

  const catalogHealth = workspace?.catalog_health
  const catalogIssueTotal = Object.values(catalogHealth?.issue_counts ?? {}).reduce((sum, value) => sum + value, 0)
  const openExceptions = workspace?.operations?.open_reconciliation_exceptions ?? 0

  return (
    <div className="merchant-light merchant-grid flex h-dvh min-h-[576px] overflow-hidden bg-[#f6f5f1] text-slate-950">
      {sidebarOpen && <button type="button" aria-label="Close navigation" className="fixed bottom-0 left-[288px] right-0 top-0 z-[65] bg-[#17372f]/25 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside id="merchant-workspace-sidebar" aria-label="Merchant navigation" className={`buyer-sidebar fixed bottom-0 left-0 top-0 z-[70] flex shrink-0 flex-col overflow-visible border-r border-emerald-950/10 transition-[transform,width,padding] duration-300 ease-out lg:static lg:inset-auto ${sidebarOpen ? 'w-[288px] translate-x-0 p-3' : 'w-[288px] -translate-x-full p-2 lg:w-[72px] lg:translate-x-0'}`}>
        {sidebarOpen ? (
          <>
            <div className="flex items-center justify-between gap-3 px-1">
              <Link to="/" aria-label="Nexora home" className="focus-ring min-w-0 shrink-0 rounded-md"><Brand /></Link>
              <WorkspaceSidebarToggle open onToggle={() => setSidebarOpen(false)} controls="merchant-workspace-sidebar" />
            </div>

            <div className="modal-scroll mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="mt-3 flex w-full items-center gap-2.5 rounded-xl border border-emerald-950/10 bg-white/70 p-3 shadow-[0_8px_24px_rgba(49,89,79,.06)]" aria-label={`Selected merchant: ${workspace?.merchant?.name ?? user?.merchant?.name}`}>
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-violet-600 text-xs font-bold text-white shadow-[2px_2px_0_#c4b5fd]">{user?.merchant?.name?.slice(0, 2).toUpperCase() ?? 'NM'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-800">{workspace?.merchant?.name ?? user?.merchant?.name}</span>
                  <span className="mt-0.5 block font-mono text-[8px] text-emerald-700">PRIVATE SELLER WORKSPACE</span>
                </span>
              </div>

              <nav className="mt-6 space-y-1" aria-label="Merchant dashboard">
                <p className="mono-label mb-2 px-3 text-slate-500">Workspace</p>
                {tabs.map(({ id, label, icon: Icon }) => (
                  <button key={id} type="button" onClick={() => navigate(id)} aria-current={activeTab === id ? 'page' : undefined} className={`focus-ring flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-xs font-medium transition ${activeTab === id ? 'border-violet-300 bg-violet-600 text-white shadow-[0_7px_20px_rgba(124,58,237,.18)]' : 'border-transparent text-[#31594f]/75 hover:bg-white/70 hover:text-[#17372f]'}`}>
                    <Icon size={15} />
                    <span className="flex-1 text-left">{label}</span>
                    {id === 'inventory' && <span className={`rounded-full px-1.5 py-0.5 font-mono text-[8px] ${activeTab === id ? 'bg-white/15' : 'bg-slate-200 text-slate-600'}`}>{inventory.length}</span>}
                  </button>
                ))}
              </nav>

              <div className="mt-6 rounded-xl border border-violet-200 bg-violet-50/65 p-4">
                <Sparkles size={16} className="text-violet-600" />
                <p className="mt-3 text-xs font-semibold text-slate-800">Product listing quality</p>
                {catalogHealth ? (
                  <>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${catalogHealth.score_percent ?? 0}%` }} />
                      </div>
                      <span className="font-mono text-[9px] text-emerald-700">{catalogHealth.score_percent == null ? 'N/A' : `${catalogHealth.score_percent}%`}</span>
                    </div>
                    <p className="mt-2 text-[9px] leading-relaxed text-slate-600">{catalogHealth.total_products ? `${catalogIssueTotal} missing check${catalogIssueTotal === 1 ? '' : 's'} across ${catalogHealth.total_products} products.` : 'No products yet; health is not scored.'}</p>
                    <p className="mt-2 font-mono text-[7px] leading-4 text-slate-500">Complete product details help shoppers find the right fit.</p>
                  </>
                ) : (
                  <button type="button" onClick={() => refreshOperations()} className="mt-3 text-[9px] text-amber-700">
                    {operationsState.error ? 'Health unavailable · retry' : 'Calculating from catalog…'}
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 border-t border-emerald-950/10 pt-3">
              <WorkspaceAccountMenu user={user} detail="Seller account" />
            </div>
          </>
        ) : (
          <div className="hidden h-full w-full flex-col items-center lg:flex">
            <Link to="/" aria-label="Nexora home" className="focus-ring mt-1 rounded-xl"><LogoMark className="size-8 shrink-0" alt="" /></Link>
            <div className="mt-3">
              <WorkspaceSidebarToggle open={false} onToggle={() => setSidebarOpen(true)} controls="merchant-workspace-sidebar" label="Expand sidebar" />
            </div>
            <nav className="mt-3 flex flex-col items-center gap-1" aria-label="Merchant dashboard">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" onClick={() => navigate(id)} aria-label={label} title={label} aria-current={activeTab === id ? 'page' : undefined} className={`focus-ring grid size-10 place-items-center rounded-xl transition ${activeTab === id ? 'bg-violet-600 text-white shadow-[0_7px_20px_rgba(124,58,237,.18)]' : 'text-[#31594f] hover:bg-white/75 hover:text-[#17372f]'}`}>
                  <Icon size={18} />
                </button>
              ))}
            </nav>
            <div className="mt-auto pb-1">
              <WorkspaceAccountMenu user={user} compact detail="Seller account" />
            </div>
          </div>
        )}
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto pt-16">
        <header className="sticky top-16 z-20 flex h-[72px] items-center justify-between border-b border-slate-800 bg-[#11131a]/90 px-4 backdrop-blur-xl md:px-7">
          <div className="flex items-center gap-3">
            {!sidebarOpen && <div className="lg:hidden"><WorkspaceSidebarToggle open={false} onToggle={() => setSidebarOpen(true)} controls="merchant-workspace-sidebar" /></div>}
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-white md:text-base">{tabCopy[activeTab].title}</h1>
              <p className="mt-0.5 hidden text-[10px] text-slate-500 sm:block">{tabCopy[activeTab].detail}</p>
            </div>
          </div>
          <div className={`flex items-center gap-2 border px-3 py-2 font-mono text-[8px] ${openExceptions ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-slate-800 bg-slate-900 text-emerald-400'}`}>
            <AlertTriangle size={12} /> {openExceptions} PAYMENTS NEED REVIEW
          </div>
        </header>

        <div className="border-b border-slate-800 bg-slate-950 px-4 lg:hidden">
          <div className="flex overflow-x-auto">
            {tabs.map(({ id, label }) => (
              <button key={id} type="button" onClick={() => navigate(id)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-[10px] font-semibold transition ${activeTab === id ? 'border-indigo-400 text-indigo-300' : 'border-transparent text-slate-600'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-auto max-w-[1440px] p-4 md:p-7">
          {(catalogState.error || timelineState.error) && (
            <div className="mb-5 border border-[#DC143C]/30 bg-[#DC143C]/10 px-4 py-3 text-[11px] text-rose-300" role="alert">
              {catalogState.error || timelineState.error}
            </div>
          )}
          {catalogState.loading && <p className="mb-4 font-mono text-[9px] text-indigo-300">UPDATING PRODUCTS…</p>}
          {activeTab === 'overview' && <DashboardOverview analytics={analytics} inventory={inventory} events={auditEvents} onNavigate={navigate} merchantName={workspace?.merchant?.name ?? user?.merchant?.name} analyticsState={growthState} timelineState={timelineState} orders={orders} workspace={workspace} operationsState={operationsState} onRetryOperations={() => refreshOperations()} />}
          {activeTab === 'inventory' && (
            <div>
              <div className="mb-6 flex flex-col justify-between gap-3 border-l-2 border-violet-500 pl-4 sm:flex-row sm:items-end">
                <div>
                  <p className="mono-label text-violet-400">Manage products</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Products shoppers can find.</h2>
                  <p className="mt-1 text-xs text-slate-500">Keep prices, availability, features, and sales information up to date.</p>
                </div>
                <DataFreshness updatedAt={catalogState.updatedAt} loading={catalogState.loading} staleAfterMs={60000} dark />
              </div>
              <ProductInventoryTable products={inventory} onToggleActive={toggleProduct} onUpdatePrice={updatePrice} onAdd={() => setProductModal({ open: true, product: null })} onEdit={(product) => setProductModal({ open: true, product })} />
              <ProductRelationshipManager products={inventory} relationships={relationships} onCreate={addRelationship} onToggle={toggleRelationship} onDelete={removeRelationship} />
            </div>
          )}
          {activeTab === 'insights' && (
            <div>
              <div className="mb-6 border-l-2 border-violet-500 pl-4">
                <p className="mono-label text-violet-400">Sales insights</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Understand every win and loss.</h2>
                <p className="mt-1 text-xs text-slate-500">See which products shoppers viewed, which purchases completed, and where your store missed demand.</p>
              </div>
              <AgentAnalytics analytics={analytics} state={growthState} onRetry={() => refreshGrowth()} />
              <div className="mt-5">
                <div className="mb-2 flex justify-end">
                  <DataFreshness updatedAt={timelineState.updatedAt} loading={timelineState.loading} staleAfterMs={20000} dark />
                </div>
                <AgentTimelineFeed events={auditEvents} expanded />
              </div>
            </div>
          )}
        </div>
      </main>

      <AddProductModal open={productModal.open} product={productModal.product} onClose={() => setProductModal({ open: false, product: null })} onSave={commitProduct} />
    </div>
  )
}
