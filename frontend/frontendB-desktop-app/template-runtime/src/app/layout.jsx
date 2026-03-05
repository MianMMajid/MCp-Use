import { Providers } from '@/app/providers'

import '@/styles/tailwind.css'

export const metadata = {
  title: {
    template: '%s - Mayple Desktop Studio',
    default: 'Mayple Desktop Studio',
  },
  description: 'Template-native desktop orchestration UI for Mayple agent operations.',
  icons: {
    icon: [
      { url: '/maple-favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', type: 'image/x-icon' },
    ],
    shortcut: '/maple-favicon.svg',
    apple: '/maple-favicon.svg',
  },
}

export default async function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className="text-zinc-950 antialiased dark:text-white"
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
