import { redirect } from 'next/navigation'

export default function ReportsPage() {
  redirect('/governance?tab=audit')
}
