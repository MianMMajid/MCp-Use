import { Providers } from '@/app/providers'
import { Layout } from '@/components/Layout'
import { allSections } from '@/app/allSections'

import '@/styles/maple-workspace.css'

export const metadata = {
  title: {
    template: '%s - Mayple IT Console',
    default: 'Mayple IT Console',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <Layout allSections={allSections}>{children}</Layout>
        </Providers>
      </body>
    </html>
  )
}
