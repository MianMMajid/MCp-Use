'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'

function makeInitialBindings(template) {
  return (template?.roles || []).map((role) => ({
    roleId: role.roleId,
    displayName: role.displayName,
    agentId: role.agentId || '',
  }))
}

export function TemplateConfigWizard({
  open,
  template,
  submitting,
  onClose,
  onBack,
  onCreate,
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [bindings, setBindings] = useState([])

  useEffect(() => {
    if (!template) return
    setName(template.suggestedName || template.name)
    setDescription(template.suggestedDescription || template.description || '')
    setBindings(makeInitialBindings(template))
  }, [template])

  function updateBinding(roleId, key, value) {
    setBindings((prev) => prev.map((item) => (item.roleId === roleId ? { ...item, [key]: value } : item)))
  }

  async function handleCreate() {
    if (!template) return
    await onCreate({
      name,
      description,
      roleBindings: bindings,
    })
  }

  return (
    <Dialog open={open} onClose={onClose} size="2xl">
      <DialogTitle>Configure Template</DialogTitle>
      <DialogDescription>{template?.name}</DialogDescription>
      <DialogBody>
        <div className="space-y-4">
          <Field>
            <Label>Orchestration Name</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Orchestration name" />
          </Field>

          <Field>
            <Label>Description</Label>
            <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional description" />
          </Field>

          <div className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Role Bindings</p>
            {bindings.map((binding) => (
              <div key={binding.roleId} className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={binding.displayName}
                  onChange={(event) => updateBinding(binding.roleId, 'displayName', event.target.value)}
                  placeholder="Role display name"
                />
                <Input
                  value={binding.agentId}
                  onChange={(event) => updateBinding(binding.roleId, 'agentId', event.target.value)}
                  placeholder="Mapped agentId (optional)"
                />
              </div>
            ))}
          </div>
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onBack || onClose}>Back</Button>
        <Button color="orange" disabled={submitting || !name.trim()} onClick={handleCreate}>
          {submitting ? 'Creating...' : 'Create Orchestration'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
