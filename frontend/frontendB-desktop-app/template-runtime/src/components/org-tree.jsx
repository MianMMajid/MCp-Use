'use client'

import { useState } from 'react'
import { Badge } from './badge'
import { Button } from './button'
import { Dialog, DialogTitle, DialogBody, DialogActions } from './dialog'
import { Input } from './input'
import { Field, Label } from './fieldset'
import { Textarea } from './textarea'
import { ChevronRightIcon, ChevronDownIcon } from '@heroicons/react/20/solid'
import { statusColor } from '@/lib/format'

function OrgNode({ node, depth = 0, onAdd, onEdit, onDeactivate }) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = node.children && node.children.length > 0

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
      >
        <button
          onClick={() => hasChildren && setExpanded(!expanded)}
          className="shrink-0 text-zinc-400"
          disabled={!hasChildren}
        >
          {hasChildren ? (
            expanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />
          ) : (
            <span className="inline-block h-4 w-4" />
          )}
        </button>

        <span className="flex-1 text-sm text-zinc-900 dark:text-zinc-100">{node.name || node.id}</span>

        {node.status && (
          <Badge color={statusColor(node.status)} className="text-[10px]">{node.status}</Badge>
        )}

        {hasChildren && (
          <span className="text-xs text-zinc-400">{node.children.length}</span>
        )}

        <div className="flex gap-1">
          <Button plain className="!px-1.5 !py-0.5 text-[11px]" onClick={() => onAdd?.(node)}>Add</Button>
          <Button plain className="!px-1.5 !py-0.5 text-[11px]" onClick={() => onEdit?.(node)}>Edit</Button>
          {node.status !== 'inactive' && (
            <Button plain className="!px-1.5 !py-0.5 text-[11px] !text-red-500" onClick={() => onDeactivate?.(node)}>Deactivate</Button>
          )}
        </div>
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children.map((child, idx) => (
            <OrgNode
              key={child.id || idx}
              node={child}
              depth={depth + 1}
              onAdd={onAdd}
              onEdit={onEdit}
              onDeactivate={onDeactivate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function OrgTree({ nodes = [], onAdd, onEdit, onDeactivate, onSave }) {
  const [dialogMode, setDialogMode] = useState(null) // 'add' | 'edit'
  const [dialogNode, setDialogNode] = useState(null)
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [saving, setSaving] = useState(false)

  function handleAdd(parentNode) {
    setDialogMode('add')
    setDialogNode(parentNode)
    setFormName('')
    setFormDescription('')
  }

  function handleEdit(node) {
    setDialogMode('edit')
    setDialogNode(node)
    setFormName(node.name || '')
    setFormDescription(node.description || '')
  }

  async function handleSubmit() {
    setSaving(true)
    try {
      await onSave?.({
        mode: dialogMode,
        parentId: dialogMode === 'add' ? (dialogNode?.id || null) : null,
        nodeId: dialogMode === 'edit' ? (dialogNode?.id || null) : null,
        name: formName,
        description: formDescription,
      })
      setDialogMode(null)
    } finally {
      setSaving(false)
    }
  }

  const tree = Array.isArray(nodes) ? nodes : []

  return (
    <div>
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-700">
        {tree.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-zinc-500">No organization nodes</p>
        ) : (
          tree.map((node, idx) => (
            <OrgNode
              key={node.id || idx}
              node={node}
              onAdd={onAdd || handleAdd}
              onEdit={onEdit || handleEdit}
              onDeactivate={onDeactivate}
            />
          ))
        )}
      </div>

      <Dialog open={dialogMode !== null} onClose={() => setDialogMode(null)} size="sm">
        <DialogTitle>{dialogMode === 'add' ? 'Add Organization Node' : 'Edit Organization Node'}</DialogTitle>
        <DialogBody>
          <div className="space-y-4">
            <Field>
              <Label>Name</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Node name" />
            </Field>
            <Field>
              <Label>Description</Label>
              <Textarea rows={3} value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Description" />
            </Field>
            {dialogMode === 'add' && dialogNode && (
              <p className="text-xs text-zinc-500">
                Parent: <span className="font-medium">{dialogNode.name || dialogNode.id}</span>
              </p>
            )}
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setDialogMode(null)}>Cancel</Button>
          <Button disabled={saving || !formName.trim()} onClick={handleSubmit}>
            {saving ? 'Saving...' : dialogMode === 'add' ? 'Add' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
