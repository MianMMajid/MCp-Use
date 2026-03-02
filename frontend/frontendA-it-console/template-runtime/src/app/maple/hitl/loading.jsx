import { SkeletonCard } from '@/components/Skeleton'

export default function Loading() {
  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="mx-auto max-w-2xl lg:max-w-5xl">
        <div className="h-8 w-52 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </article>
  )
}
