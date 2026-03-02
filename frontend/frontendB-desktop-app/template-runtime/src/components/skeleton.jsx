export function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
      <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-4 h-8 w-16 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-2 h-3 w-32 rounded bg-zinc-100 dark:bg-zinc-800" />
    </div>
  )
}

export function SkeletonList({ rows = 5 }) {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-4 w-4 rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-4 flex-1 rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-4 w-20 rounded bg-zinc-100 dark:bg-zinc-800" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonRows({ rows = 5, cols = 4 }) {
  return (
    <div className="animate-pulse">
      <div className="flex gap-4 border-b border-zinc-950/10 pb-2 dark:border-white/10">
        {Array.from({ length: cols }, (_, i) => (
          <div key={i} className="h-3 flex-1 rounded bg-zinc-200 dark:bg-zinc-700" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-4 border-b border-zinc-950/5 py-3 dark:border-white/5">
          {Array.from({ length: cols }, (_, j) => (
            <div key={j} className="h-3 flex-1 rounded bg-zinc-100 dark:bg-zinc-800" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonForm({ fields = 4 }) {
  return (
    <div className="animate-pulse space-y-6">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i}>
          <div className="h-3 w-20 rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="mt-2 h-9 w-full rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        </div>
      ))}
      <div className="h-9 w-24 rounded-lg bg-zinc-200 dark:bg-zinc-700" />
    </div>
  )
}

export function SkeletonGrid({ count = 6 }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

export function SkeletonDetail() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-6 w-48 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="h-4 w-64 rounded bg-zinc-100 dark:bg-zinc-800" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex gap-4">
            <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
            <div className="h-4 flex-1 rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function SkeletonChat() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-6 w-32 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="h-32 w-full rounded-lg bg-zinc-100 dark:bg-zinc-800" />
      <div className="h-9 w-24 rounded-lg bg-zinc-200 dark:bg-zinc-700" />
    </div>
  )
}
