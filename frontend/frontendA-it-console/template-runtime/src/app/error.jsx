'use client'

export default function Error({ error, reset }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Something went wrong</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={() => reset()}
          className="mt-4 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
