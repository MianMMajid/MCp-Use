import { Inter } from 'next/font/google'
import { Providers } from '@/app/providers'

import '@/styles/tailwind.css'

export const metadata = {
  title: {
    template: '%s - Mayple Desktop Studio',
    default: 'Mayple Desktop Studio',
  },
  description: 'Template-native desktop orchestration UI for Mayple agent operations.',
}

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export default async function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`text-zinc-950 antialiased lg:bg-zinc-100 dark:bg-zinc-900 dark:text-white dark:lg:bg-zinc-950 ${inter.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
