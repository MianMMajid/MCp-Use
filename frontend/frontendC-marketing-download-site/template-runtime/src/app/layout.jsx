import { Josefin_Sans, Quicksand } from 'next/font/google'
import clsx from 'clsx'

import '@/styles/tailwind.css'

export const metadata = {
  title: {
    template: '%s - Mayple',
    default: 'Mayple - The Firewall for AI Agent Tool Calls',
  },
  description:
    'Mayple is a runtime firewall for AI agent tool calls. Intercept, block, and approve every action across any provider — no code required.',
  icons: {
    icon: [
      { url: '/maple-favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico' },
    ],
    shortcut: [{ url: '/maple-favicon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/maple-favicon.svg', type: 'image/svg+xml' }],
  },
}

const josefinSans = Josefin_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-josefin',
})

const quicksand = Quicksand({
  subsets: ['latin'],
  weight: '700',
  display: 'swap',
  variable: '--font-quicksand',
})

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={clsx(
        'h-full scroll-smooth bg-white antialiased',
        josefinSans.variable,
        quicksand.variable,
      )}
    >
      <body className="flex h-full flex-col">{children}</body>
    </html>
  )
}
