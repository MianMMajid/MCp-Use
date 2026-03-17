import { Button } from '@/components/Button'
import { Container } from '@/components/Container'
import { TypedFirewall } from '@/components/TypedFirewall'

function AmbientGlow() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Top-right warm glow */}
      <div
        className="absolute -top-24 -right-24 h-[700px] w-[700px] rounded-full opacity-[0.18]"
        style={{
          background:
            'radial-gradient(circle, var(--color-orange-200) 0%, transparent 70%)',
        }}
      />
      {/* Bottom-left amber glow */}
      <div
        className="absolute -bottom-32 -left-32 h-[600px] w-[600px] rounded-full opacity-[0.12]"
        style={{
          background:
            'radial-gradient(circle, var(--color-amber-200) 0%, transparent 70%)',
        }}
      />
      {/* Center subtle wash */}
      <div
        className="absolute top-1/2 left-1/2 h-[800px] w-[1200px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.05]"
        style={{
          background:
            'radial-gradient(ellipse, var(--color-orange-100) 0%, transparent 60%)',
        }}
      />
      {/* Bottom fade into next section */}
      <div
        className="absolute right-0 bottom-0 left-0 h-32"
        style={{
          background:
            'linear-gradient(to bottom, transparent, var(--color-orange-50))',
        }}
      />
    </div>
  )
}

export function Hero() {
  return (
    <div className="grain relative flex min-h-[calc(100dvh-7.5rem)] items-center overflow-hidden bg-gradient-to-b from-white to-orange-50/40">
      <AmbientGlow />
      <Container className="relative z-10 py-16 text-center sm:py-20">
        <h1
          className="animate-fade-in-up mx-auto max-w-4xl font-display text-4xl font-normal tracking-tight text-zinc-900 sm:text-5xl lg:text-7xl"
          style={{ animationDelay: '0.1s' }}
        >
          The{' '}
          <TypedFirewall />{' '}
          for AI agent tool calls.
        </h1>
        <p
          className="animate-fade-in-up mx-auto mt-6 max-w-2xl text-lg tracking-tight text-zinc-500 sm:text-xl"
          style={{ animationDelay: '0.25s' }}
        >
          One security layer across every agent and provider. No-code rules your
          ops team can manage — no engineering tickets required.
        </p>
        <div
          className="animate-fade-in-up mt-12 flex flex-wrap justify-center gap-x-5 gap-y-4"
          style={{ animationDelay: '0.4s' }}
        >
          <Button href="/register" color="orange" className="!px-7 !py-3 !text-base shadow-lg shadow-orange-600/20">
            Get started free
          </Button>
          <Button href="#journey" variant="outline" className="!px-7 !py-3 !text-base">
            See how it works
          </Button>
        </div>
      </Container>
    </div>
  )
}
