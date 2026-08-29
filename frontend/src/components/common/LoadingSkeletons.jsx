function LoadingRegion({ label, className = '', children }) {
  return (
    <div className={className} role="status" aria-live="polite" aria-label={label} aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}

export function Skeleton({ className = '' }) {
  return <span className={`nexora-skeleton block ${className}`} aria-hidden="true" />
}

export function InlineSkeleton({ className = '', label = 'Loading' }) {
  return (
    <span role="status" aria-label={label} aria-busy="true" className="inline-flex items-center">
      <span className="sr-only">{label}</span>
      <Skeleton className={className} />
    </span>
  )
}

export function ChatListSkeleton({ rows = 4, compact = false, label = 'Loading saved chats' }) {
  return (
    <LoadingRegion label={label} className={compact ? 'space-y-1.5 px-1 py-1' : 'space-y-2 p-2'}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={`flex items-center gap-3 ${compact ? 'px-2 py-2' : 'rounded-xl bg-white/55 px-3 py-3'}`}>
          {!compact && <Skeleton className="size-8 shrink-0 rounded-lg" />}
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className={`h-2.5 rounded-full ${index % 2 ? 'w-3/5' : 'w-4/5'}`} />
            {!compact && <Skeleton className={`h-2 rounded-full ${index % 2 ? 'w-4/5' : 'w-1/2'}`} />}
          </div>
        </div>
      ))}
    </LoadingRegion>
  )
}

export function OrdersListSkeleton({ rows = 3 }) {
  return (
    <LoadingRegion label="Loading your orders" className="space-y-1.5 py-1">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-2.5 rounded-xl border border-emerald-950/5 bg-white/55 px-2.5 py-2.5">
          <Skeleton className="size-7 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className={`h-2.5 rounded-full ${index === 1 ? 'w-2/3' : 'w-4/5'}`} />
            <Skeleton className="h-2 w-1/2 rounded-full" />
          </div>
        </div>
      ))}
    </LoadingRegion>
  )
}

export function SharedChatSkeleton() {
  return (
    <LoadingRegion label="Opening shared chat" className="py-2">
      <header className="border-b border-emerald-950/10 pb-7">
        <div className="flex items-center gap-3"><Skeleton className="size-7 rounded-lg" /><Skeleton className="h-3 w-36 rounded-full" /></div>
        <Skeleton className="mt-5 h-9 w-3/4 max-w-md rounded-xl" />
        <Skeleton className="mt-4 h-3 w-64 max-w-full rounded-full" />
      </header>
      <div className="mt-8 space-y-8">
        {[0, 1, 2].map((index) => (
          <div key={index} className={`flex gap-3 ${index === 1 ? 'justify-end' : ''}`}>
            {index !== 1 && <Skeleton className="size-9 shrink-0 rounded-full" />}
            <div className={`${index === 1 ? 'w-2/3 rounded-3xl bg-white/50 p-4' : 'w-full max-w-2xl'} space-y-2`}>
              <Skeleton className="h-3 w-full rounded-full" />
              <Skeleton className={`h-3 rounded-full ${index === 1 ? 'w-2/3' : 'w-5/6'}`} />
              {index === 2 && <div className="mt-4 grid gap-3 sm:grid-cols-2"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /></div>}
            </div>
          </div>
        ))}
      </div>
    </LoadingRegion>
  )
}

export function ConversationSkeleton() {
  return (
    <LoadingRegion label="Opening conversation" className="space-y-7">
      {[0, 1, 2].map((index) => (
        <div key={index} className={`flex gap-3 ${index === 1 ? 'justify-end' : ''}`}>
          {index !== 1 && <Skeleton className="size-9 shrink-0 rounded-full" />}
          <div className={`${index === 1 ? 'w-2/3 rounded-3xl bg-white/45 p-4' : 'w-full max-w-2xl py-1'} space-y-2`}>
            <Skeleton className="h-3 w-full rounded-full" />
            <Skeleton className={`h-3 rounded-full ${index === 1 ? 'w-3/4' : 'w-5/6'}`} />
            {index === 2 && <div className="mt-4 grid gap-3 sm:grid-cols-2"><Skeleton className="h-48 rounded-3xl" /><Skeleton className="h-48 rounded-3xl" /></div>}
          </div>
        </div>
      ))}
    </LoadingRegion>
  )
}

function MetricCardSkeleton() {
  return (
    <div className="rounded-2xl border border-emerald-950/10 bg-white/78 p-5 shadow-[0_12px_36px_rgba(42,81,68,.06)]">
      <div className="flex items-start justify-between"><Skeleton className="size-10 rounded-xl" /><Skeleton className="h-2 w-6 rounded-full" /></div>
      <Skeleton className="mt-5 h-3 w-2/3 rounded-full" />
      <Skeleton className="mt-3 h-8 w-1/2 rounded-lg" />
      <Skeleton className="mt-3 h-2.5 w-4/5 rounded-full" />
    </div>
  )
}

export function MerchantOverviewSkeleton() {
  return (
    <LoadingRegion label="Loading merchant overview" className="merchant-section-stack">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <MetricCardSkeleton key={index} />)}</div>
      <Skeleton className="h-24 rounded-2xl" />
      <div className="grid gap-5 lg:grid-cols-2"><Skeleton className="h-64 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>
    </LoadingRegion>
  )
}

export function MerchantInventorySkeleton() {
  return (
    <LoadingRegion label="Loading product inventory" className="overflow-hidden rounded-2xl border border-emerald-950/10 bg-white/82 shadow-[0_14px_42px_rgba(42,81,68,.08)]">
      <div className="flex flex-col gap-4 border-b border-emerald-950/10 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><Skeleton className="size-8 rounded-lg" /><Skeleton className="h-4 w-36 rounded-full" /></div>
        <div className="flex gap-2"><Skeleton className="h-10 w-44 rounded-xl" /><Skeleton className="h-10 w-28 rounded-xl" /></div>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-6 border-b border-emerald-950/10 pb-3">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-2.5 w-2/3 rounded-full" />)}</div>
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center gap-6 border-b border-emerald-950/5 py-4 last:border-0">
            <div className="flex items-center gap-3"><Skeleton className="size-10 shrink-0 rounded-xl" /><div className="w-full space-y-2"><Skeleton className="h-3 w-3/4 rounded-full" /><Skeleton className="h-2 w-1/2 rounded-full" /></div></div>
            <Skeleton className="h-3 w-2/3 rounded-full" /><Skeleton className="h-6 w-20 rounded-full" /><Skeleton className="h-6 w-11 rounded-full" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  )
}

export function MerchantInsightsSkeleton({ label = 'Loading sales insights' }) {
  return (
    <LoadingRegion label={label} className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <MetricCardSkeleton key={index} />)}</div>
      <div className="rounded-2xl border border-emerald-950/10 bg-white/78 p-5">
        <div className="flex items-center gap-3"><Skeleton className="size-8 rounded-lg" /><Skeleton className="h-4 w-44 rounded-full" /></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}</div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-36 rounded-xl" />)}</div>
      </div>
    </LoadingRegion>
  )
}

export function ActivityTimelineSkeleton({ rows = 4, label = 'Loading recent shopper activity' }) {
  return (
    <LoadingRegion label={label} className="rounded-2xl border border-emerald-950/10 bg-white/78 p-5 shadow-[0_12px_36px_rgba(42,81,68,.06)]">
      <div className="flex items-center justify-between"><div className="flex items-center gap-3"><Skeleton className="size-8 rounded-lg" /><Skeleton className="h-4 w-44 rounded-full" /></div><Skeleton className="h-7 w-16 rounded-full" /></div>
      <div className="mt-6 space-y-5">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex gap-4"><Skeleton className="size-7 shrink-0 rounded-full" /><div className="flex-1 space-y-2 border-b border-emerald-950/10 pb-4"><div className="flex justify-between"><Skeleton className="h-2.5 w-24 rounded-full" /><Skeleton className="h-2 w-14 rounded-full" /></div><Skeleton className="h-3 w-4/5 rounded-full" /><Skeleton className="h-9 w-full rounded-lg" /></div></div>
        ))}
      </div>
    </LoadingRegion>
  )
}

export function OperationsSkeleton() {
  return (
    <LoadingRegion label="Loading payments and orders" className="rounded-2xl border border-emerald-950/10 bg-white/78 p-5 shadow-[0_12px_36px_rgba(42,81,68,.06)]">
      <div className="flex items-center justify-between"><div className="flex items-center gap-3"><Skeleton className="size-8 rounded-lg" /><Skeleton className="h-4 w-40 rounded-full" /></div><Skeleton className="h-3 w-20 rounded-full" /></div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)}</div>
      <Skeleton className="mt-6 h-3 w-40 rounded-full" />
      <div className="mt-3 space-y-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-12 rounded-xl" />)}</div>
    </LoadingRegion>
  )
}

export function CheckoutProcessingSkeleton() {
  return (
    <LoadingRegion label="Preparing the next checkout step" className="space-y-5">
      <div className="flex items-center gap-3"><Skeleton className="size-10 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-44 rounded-full" /><Skeleton className="h-2.5 w-3/4 rounded-full" /></div></div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
        <div className="flex items-center gap-4"><Skeleton className="size-16 shrink-0 rounded-2xl" /><div className="flex-1 space-y-2.5"><Skeleton className="h-3 w-2/3 rounded-full" /><Skeleton className="h-2.5 w-1/2 rounded-full" /><Skeleton className="h-4 w-24 rounded-full" /></div></div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-16 rounded-xl" />)}</div>
      <Skeleton className="h-14 rounded-2xl" />
    </LoadingRegion>
  )
}

export function AuthSessionSkeleton() {
  return (
    <main className="login-grid grid min-h-dvh place-items-center bg-[#f8faf6] px-5">
      <LoadingRegion label="Checking your session" className="w-full max-w-xl rounded-[2rem] border border-white/90 bg-white/72 p-7 shadow-[0_28px_80px_rgba(42,81,68,.12)] backdrop-blur-xl sm:p-9">
        <div className="flex items-center gap-3"><Skeleton className="size-11 rounded-2xl" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-28 rounded-full" /><Skeleton className="h-7 w-2/3 rounded-lg" /></div></div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" /></div>
        <Skeleton className="mt-5 h-12 w-full rounded-2xl" />
      </LoadingRegion>
    </main>
  )
}
