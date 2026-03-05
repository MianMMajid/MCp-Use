'use client'

import { Field, Label, ErrorMessage, Description } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Textarea } from '@/components/textarea'
import { OBJECTIVE_RISK_CEILINGS } from '@/lib/orchestration-types'

export function ObjectiveSchemaForm({ value, errors = {}, onChange }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field>
        <Label>Goal</Label>
        <Input value={value.goal} onChange={(event) => onChange('goal', event.target.value)} placeholder="What should the loop achieve?" />
        {errors.goal ? <ErrorMessage>{errors.goal}</ErrorMessage> : null}
      </Field>

      <Field>
        <Label>Success Criteria</Label>
        <Input value={value.successCriteria} onChange={(event) => onChange('successCriteria', event.target.value)} placeholder="How do we know we are done?" />
        {errors.successCriteria ? <ErrorMessage>{errors.successCriteria}</ErrorMessage> : null}
      </Field>

      <Field>
        <Label>Runtime Limit (minutes)</Label>
        <Input type="number" min="1" value={String(value.runtimeLimitMinutes ?? '')} onChange={(event) => onChange('runtimeLimitMinutes', event.target.value)} />
        {errors.runtimeLimitMinutes ? <ErrorMessage>{errors.runtimeLimitMinutes}</ErrorMessage> : null}
      </Field>

      <Field>
        <Label>Budget Ceiling (USD)</Label>
        <Input type="number" min="0" step="0.01" value={String(value.budgetUsd ?? '')} onChange={(event) => onChange('budgetUsd', event.target.value)} />
        {errors.budgetUsd ? <ErrorMessage>{errors.budgetUsd}</ErrorMessage> : null}
      </Field>

      <Field>
        <Label>Risk Ceiling</Label>
        <Select value={value.riskCeiling} onChange={(event) => onChange('riskCeiling', event.target.value)}>
          {OBJECTIVE_RISK_CEILINGS.map((risk) => (
            <option key={risk} value={risk}>{risk}</option>
          ))}
        </Select>
        {errors.riskCeiling ? <ErrorMessage>{errors.riskCeiling}</ErrorMessage> : null}
      </Field>

      <Field>
        <Label>Escalation Policy</Label>
        <Input value={value.escalationPolicy} onChange={(event) => onChange('escalationPolicy', event.target.value)} placeholder="Who gets escalations and when?" />
        {errors.escalationPolicy ? <ErrorMessage>{errors.escalationPolicy}</ErrorMessage> : null}
      </Field>

      <Field className="md:col-span-2">
        <Label>Context Docs / URLs</Label>
        <Textarea
          rows={3}
          value={value.contextUrls}
          onChange={(event) => onChange('contextUrls', event.target.value)}
          placeholder={'One URL or note per line\nhttps://docs.internal/policy\nSLA notes...'}
        />
        <Description>Use one URL or context note per line.</Description>
        {errors.contextUrls ? <ErrorMessage>{errors.contextUrls}</ErrorMessage> : null}
      </Field>

      <Field className="md:col-span-2">
        <Label>Output Contract</Label>
        <Textarea
          rows={2}
          value={value.outputContract}
          onChange={(event) => onChange('outputContract', event.target.value)}
          placeholder="Expected output format and deliverables"
        />
        {errors.outputContract ? <ErrorMessage>{errors.outputContract}</ErrorMessage> : null}
      </Field>
    </div>
  )
}
