import { SkeletonCard, SkeletonRows } from '@/components/skeleton'

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="h-8 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-6 border-t border-zinc-950/10 dark:border-white/10" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="mt-8"><SkeletonRows rows={5} cols={4} /></div>
    </div>
  )
}
