'use client'

import dynamic from 'next/dynamic'
import { SkeletonCard, SkeletonRows } from '@/components/skeleton'

const fallback = <div className="mt-4"><SkeletonRows /></div>

const OrgManager = dynamic(() => import('./OrgManager'), { loading: () => <div className="mt-4"><SkeletonCard /></div> })
const MembersManager = dynamic(() => import('./MembersManager'), { loading: () => fallback })

export default function OrganizationPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Organization</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Manage organizations, members, roles, and invitations.</p>
      <OrgManager />
      <MembersManager />
    </div>
  )
}
