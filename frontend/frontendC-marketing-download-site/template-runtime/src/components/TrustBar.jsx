import { Container } from '@/components/Container'
import { ScrollReveal } from '@/components/ScrollReveal'

const logos = [
  { name: 'Nexus AI', initials: 'Nx' },
  { name: 'DataForge', initials: 'DF' },
  { name: 'CloudScale Labs', initials: 'CS' },
  { name: 'Meridian Systems', initials: 'MS' },
  { name: 'Orion Tech', initials: 'OT' },
  { name: 'Summit Analytics', initials: 'SA' },
]

export function TrustBar() {
  return (
    <section className="py-12 sm:py-16">
      <Container>
        <ScrollReveal>
          <p className="text-center text-sm font-medium tracking-wide text-zinc-400 uppercase">
            Trusted by teams at
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-6 sm:gap-x-14">
            {logos.map((logo) => (
              <div
                key={logo.name}
                className="flex items-center gap-2 text-zinc-300 transition-colors duration-200 hover:text-zinc-500"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-xs font-bold text-zinc-400">
                  {logo.initials}
                </span>
                <span className="text-sm font-semibold tracking-tight">
                  {logo.name}
                </span>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </Container>
    </section>
  )
}
