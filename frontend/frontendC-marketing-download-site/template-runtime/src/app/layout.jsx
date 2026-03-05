import { Inter, Lexend } from 'next/font/google'
import clsx from 'clsx'

import '@/styles/tailwind.css'

export const metadata = {
  title: {
    template: '%s - Mayple',
    default: 'Mayple - Safe AI Agent Operations',
  },
  description:
    'Mayple helps teams monitor AI agents, enforce policy controls, and keep a complete audit trail.',
  icons: {
    icon: [
      { url: '/maple-favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico' },
    ],
    shortcut: [{ url: '/maple-favicon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/maple-favicon.svg', type: 'image/svg+xml' }],
  },
}

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

const lexend = Lexend({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-lexend',
})

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={clsx(
        'h-full scroll-smooth bg-white antialiased',
        inter.variable,
        lexend.variable,
      )}
    >
      <body className="flex h-full flex-col">{children}</body>
    </html>
  )
}
