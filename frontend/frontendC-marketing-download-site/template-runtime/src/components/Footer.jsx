import Link from 'next/link'

import { Button } from '@/components/Button'
import { Container } from '@/components/Container'
import { Logo } from '@/components/Logo'

const footerLinks = {
  Product: [
    { label: 'Features', href: '#features' },
    { label: 'How it works', href: '#journey' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'FAQ', href: '#faq' },
    { label: 'Get started free', href: '/register' },
  ],
  Download: [
    { label: 'macOS', href: '/api/downloads/mac' },
    { label: 'Windows', href: '/api/downloads/win' },
    { label: 'All releases', href: 'https://github.com/MianMMajid/MCp-Use/releases' },
  ],
  Account: [
    { label: 'Sign in', href: '/login' },
    { label: 'Register', href: '/register' },
  ],
  Company: [
    { label: 'Contact', href: 'mailto:support@mayple.cloud' },
    { label: 'Privacy Policy', href: '/privacy', placeholder: true },
    { label: 'Terms of Service', href: '/terms', placeholder: true },
  ],
}


export function Footer() {
  return (
    <footer className="bg-zinc-50">
      <Container>
        {/* Main footer */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-12 py-16 lg:grid-cols-12">
          {/* Logo + tagline + download buttons */}
          <div className="col-span-2 lg:col-span-4">
            <Logo className="h-10 w-auto" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-zinc-500">
              The firewall for AI agent tool calls. Intercept, block, and
              approve every action across any provider.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button external href="/api/downloads/mac" color="orange" className="!py-2 !px-5 !text-sm">
                Download for macOS
              </Button>
              <Button external href="/api/downloads/win" variant="outline" className="!py-2 !px-5 !text-sm">
                Download for Windows
              </Button>
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([heading, links]) => (
            <div key={heading} className="lg:col-span-2">
              <h3 className="text-sm font-semibold text-zinc-900">
                {heading}
              </h3>
              <ul role="list" className="mt-4 space-y-3">
                {links.map((link) => {
                  const isExternal = /^(mailto:|tel:|https?:|\/api\/)/.test(link.href)
                  const Component = isExternal ? 'a' : Link
                  return (
                    <li key={link.label}>
                      <Component
                        href={link.href}
                        className="text-sm text-zinc-500 transition-colors duration-200 hover:text-zinc-900"
                      >
                        {link.label}
                      </Component>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-center border-t border-zinc-200 py-8">
          <p className="text-sm text-zinc-500">
            &copy; {new Date().getFullYear()} Mayple. All rights reserved.
          </p>
        </div>
      </Container>
    </footer>
  )
}
