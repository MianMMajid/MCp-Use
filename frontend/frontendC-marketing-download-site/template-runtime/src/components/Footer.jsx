import { Container } from '@/components/Container'
import { Logo } from '@/components/Logo'
import { NavLink } from '@/components/NavLink'

export function Footer() {
  return (
    <footer className="bg-zinc-50">
      <Container>
        <div className="py-16">
          <Logo className="mx-auto h-10 w-auto" />
          <nav className="mt-10 text-sm" aria-label="quick links">
            <div className="-my-1 flex justify-center gap-x-6">
              <NavLink href="#features">Features</NavLink>
              <NavLink href="#journey">How it works</NavLink>
              <NavLink href="#pricing">Pricing</NavLink>
              <NavLink href="#download">Download</NavLink>
            </div>
          </nav>
        </div>
        <div className="flex justify-center border-t border-zinc-400/10 py-10">
          <p className="text-sm text-zinc-500">
            Copyright &copy; {new Date().getFullYear()} Mayple. All rights
            reserved.
          </p>
        </div>
      </Container>
    </footer>
  )
}
