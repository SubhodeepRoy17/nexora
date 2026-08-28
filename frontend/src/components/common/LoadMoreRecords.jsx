import { ChevronDown } from 'lucide-react'

export default function LoadMoreRecords({ shownCount, totalCount, remainingCount, nextBatchCount = remainingCount, onLoadMore, noun = 'records' }) {
  if (!totalCount) return null
  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-emerald-950/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-slate-500" aria-live="polite">
        Showing {shownCount} of {totalCount} {noun}
      </p>
      {remainingCount > 0 && (
        <button
          type="button"
          onClick={onLoadMore}
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-full border border-emerald-950/10 bg-[#f7faf5] px-4 py-2.5 text-xs font-semibold text-[#31594f] transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
        >
          Load {nextBatchCount} more
          <ChevronDown size={14} />
        </button>
      )}
    </div>
  )
}
