import { SkeletonDetail } from '@/components/skeleton'

export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="h-8 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-6 border-t border-zinc-950/10 dark:border-white/10" />
      <div className="mt-6"><SkeletonDetail /></div>
    </div>
  )
}
