import { ApplicationLayout } from './application-layout'

export default async function RootLayout({ children }) {
  return <ApplicationLayout events={[]}>{children}</ApplicationLayout>
}
