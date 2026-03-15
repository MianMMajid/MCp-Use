'use client'

import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'

export function TemplateCatalogModal({ open, onClose, templates = [], loading, onSelect }) {
  return (
    <Dialog open={open} onClose={onClose} size="3xl">
      <DialogTitle>Create From Template</DialogTitle>
      <DialogDescription>Pick a manager-worker preset and configure role bindings.</DialogDescription>
      <DialogBody>
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => onSelect(template)}
                className="rounded-lg border border-zinc-200 bg-white p-4 text-left transition hover:border-orange-300 hover:shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-orange-500"
              >
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{template.name}</p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{template.description}</p>
                <p className="mt-3 text-[11px] text-zinc-400 dark:text-zinc-500">Roles: {(template.roles || []).map((role) => role.displayName).join(', ')}</p>
              </button>
            ))}
          </div>
        )}
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
