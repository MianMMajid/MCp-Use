'use client'

import { Button } from '@/components/button'

export default function AppError({ error, reset }) {
  return (
    <div className="mx-auto max-w-4xl py-12">
      <div className="rounded-2xl border border-red-200 bg-red-50 p-8 dark:border-red-900 dark:bg-red-950/40">
        <h2 className="text-lg font-semibold text-red-800 dark:text-red-200">
          Something went wrong
        </h2>
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error?.message || 'An unexpected error occurred.'}
        </p>
        <div className="mt-6 flex gap-3">
          <Button onClick={() => reset()}>Try again</Button>
          <Button href="/">Go to Workspace</Button>
        </div>
      </div>
    </div>
  )
}
