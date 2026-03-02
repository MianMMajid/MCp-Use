'use client'

import dynamic from 'next/dynamic'
import { SkeletonCard, SkeletonList } from '@/components/Skeleton'

export const sections = [
  { title: 'Tenant bindings', id: 'tenant-bindings' },
  { title: 'Tenant scope', id: 'tenant-scope' },
  { title: 'Org tree', id: 'org-tree' },
  { title: 'Org lifecycle', id: 'org-lifecycle' },
]

const listFallback = <div className="mt-4"><SkeletonList /></div>
const cardFallback = <div className="mt-4"><SkeletonCard /></div>

const TenantBindings = dynamic(() => import('./TenantBindings'), { loading: () => listFallback })
const TenantScope = dynamic(() => import('./TenantScope'), { loading: () => cardFallback })
const OrgHierarchy = dynamic(() => import('./OrgHierarchy'), { loading: () => listFallback })

export default function TenantOrgPage() {
  return (
    <article className="flex h-full flex-col pt-16 pb-10">
      <div className="flex-auto">
        <div className="mx-auto max-w-2xl lg:max-w-5xl">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
            Tenant & Org Management
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Manage tenant bindings, organizational hierarchy, and lifecycle events.
          </p>
          <TenantBindings />
          <TenantScope />
          <OrgHierarchy />
        </div>
      </div>
    </article>
  )
}
