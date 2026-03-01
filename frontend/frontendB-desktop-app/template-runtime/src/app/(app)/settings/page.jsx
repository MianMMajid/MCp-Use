'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/button'
import { Checkbox, CheckboxField } from '@/components/checkbox'
import { Divider } from '@/components/divider'
import { Label } from '@/components/fieldset'
import { Heading, Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Text } from '@/components/text'
import { Textarea } from '@/components/textarea'
import { Address } from './address'
import { loadJson, patchJson } from '@/lib/api'

export default function Settings() {
  const formRef = useRef(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')
  const [profile, setProfile] = useState(null)
  const [orgId, setOrgId] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [profileData, orgData] = await Promise.all([
          loadJson('/api/user/profile').catch(() => null),
          loadJson('/api/org').catch(() => null),
        ])
        if (cancelled) return
        if (profileData) setProfile(profileData)
        const orgs = Array.isArray(orgData?.orgs) ? orgData.orgs : Array.isArray(orgData) ? orgData : []
        if (orgs.length > 0) setOrgId(orgs[0].id || orgs[0].orgId || null)
      } catch {
        // Profile load is best-effort
      }
    })()
    return () => { cancelled = true }
  }, [])

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')

    try {
      const formData = new FormData(formRef.current)
      const body = Object.fromEntries(formData.entries())
      // Convert checkbox to boolean
      body.email_is_public = body.email_is_public === 'on'

      if (orgId) {
        const res = await patchJson(`/api/org/${orgId}`, body)
        if (!res.ok) throw new Error(`Server responded with ${res.status}`)
        setMessageType('success')
        setMessage('Settings saved successfully.')
      } else {
        setMessageType('error')
        setMessage('No organization found. Create an organization first.')
      }
    } catch (err) {
      setMessageType('error')
      setMessage('Unable to save settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }, [orgId])

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="mx-auto max-w-4xl">
      <Heading>Account</Heading>
      <Divider className="my-10 mt-6" />

      {profile?.user && (
        <>
          <section className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            <div className="space-y-1">
              <Subheading>Account Email</Subheading>
              <Text>Your login email address.</Text>
            </div>
            <div>
              <Input aria-label="Account Email" name="account_email" defaultValue={profile.user.email || profile.user.username} disabled />
            </div>
          </section>

          <Divider className="my-10" soft />
        </>
      )}

      <section className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        <div className="space-y-1">
          <Subheading>Organization Name</Subheading>
          <Text>This will be displayed on your public profile.</Text>
        </div>
        <div>
          <Input aria-label="Organization Name" name="name" defaultValue="Maple" />
        </div>
      </section>

      <Divider className="my-10" soft />

      <section className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        <div className="space-y-1">
          <Subheading>Organization Bio</Subheading>
          <Text>This will be displayed on your public profile. Maximum 240 characters.</Text>
        </div>
        <div>
          <Textarea aria-label="Organization Bio" name="bio" />
        </div>
      </section>

      <Divider className="my-10" soft />

      <section className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        <div className="space-y-1">
          <Subheading>Organization Email</Subheading>
          <Text>This is how customers can contact you for support.</Text>
        </div>
        <div className="space-y-4">
          <Input type="email" aria-label="Organization Email" name="email" defaultValue="" placeholder="you@example.com" />
          <CheckboxField>
            <Checkbox name="email_is_public" defaultChecked />
            <Label>Show email on public profile</Label>
          </CheckboxField>
        </div>
      </section>

      <Divider className="my-10" soft />

      <section className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        <div className="space-y-1">
          <Subheading>Address</Subheading>
          <Text>This is where your organization is registered.</Text>
        </div>
        <Address />
      </section>

      <Divider className="my-10" soft />

      <section className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        <div className="space-y-1">
          <Subheading>Currency</Subheading>
          <Text>The currency that your organization will be collecting.</Text>
        </div>
        <div>
          <Select aria-label="Currency" name="currency" defaultValue="cad">
            <option value="cad">CAD - Canadian Dollar</option>
            <option value="usd">USD - United States Dollar</option>
          </Select>
        </div>
      </section>

      <Divider className="my-10" soft />

      {message && (
        <p
          className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
            messageType === 'success'
              ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300'
              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
          }`}
        >
          {message}
        </p>
      )}

      <div className="flex justify-end gap-4">
        <Button type="reset" plain>
          Reset
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
