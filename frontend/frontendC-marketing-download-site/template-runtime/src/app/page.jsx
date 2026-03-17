import { DownloadSection } from '@/components/DownloadSection'
import { Faqs } from '@/components/Faqs'
import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { Hero } from '@/components/Hero'
import { MaypleMascot } from '@/components/MaypleMascot'
import { Pricing } from '@/components/Pricing'
import { PrimaryFeatures } from '@/components/PrimaryFeatures'
import { SecondaryFeatures } from '@/components/SecondaryFeatures'
import { Container } from '@/components/Container'
import { ScrollReveal } from '@/components/ScrollReveal'

const journeySteps = [
  {
    number: '01',
    title: 'Connect your agents',
    desc: 'Point Mayple at your agents — any provider, any framework. One proxy layer, zero code changes.',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
      </svg>
    ),
  },
  {
    number: '02',
    title: 'Write rules in plain language',
    desc: 'No code, no YAML. Your ops team sets allow, block, and approval policies in natural language.',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
      </svg>
    ),
  },
  {
    number: '03',
    title: 'Intercept in real time',
    desc: 'Mayple intercepts every tool call before execution. Risky actions get blocked or queued for approval.',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
      </svg>
    ),
  },
  {
    number: '04',
    title: 'Replay, refine, comply',
    desc: 'Replay full sessions across agents. Refine rules with real data. Export audit logs for compliance.',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
      </svg>
    ),
  },
]

export default function Home() {
  return (
    <>
      <Header />
      <MaypleMascot />
      <main>
        {/* 1. Hero — instant clarity + primary CTA */}
        <Hero />

        {/* 2. Primary features — product showcase */}
        <PrimaryFeatures />

        {/* 3. Secondary features — deeper value props */}
        <SecondaryFeatures />

        {/* 4. Download — OS-aware desktop download */}
        <DownloadSection />

        {/* 5. Journey — how it works */}
        <section id="journey" className="grain relative overflow-hidden bg-zinc-50 py-16 sm:py-24">
          <Container>
            <ScrollReveal>
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-sm font-semibold tracking-widest text-orange-600 uppercase">
                  How it works
                </p>
                <h2 className="mt-4 font-display text-3xl tracking-tight text-zinc-900 sm:text-4xl">
                  From zero to protected in minutes
                </h2>
                <p className="mt-4 text-lg tracking-tight text-zinc-600">
                  Four steps to secure every agent tool call across your stack.
                </p>
              </div>
            </ScrollReveal>

            <ScrollReveal>
              <div className="relative mx-auto mt-10">
                {/* Connecting dashed line between cards (desktop) */}
                <div
                  className="pointer-events-none absolute top-[3.25rem] right-[calc(12.5%+1rem)] left-[calc(12.5%+1rem)] hidden lg:block"
                  aria-hidden="true"
                >
                  <div
                    className="h-[2px] w-full sketch-reveal"
                    style={{
                      backgroundImage:
                        'repeating-linear-gradient(to right, var(--color-orange-300) 0, var(--color-orange-300) 8px, transparent 8px, transparent 14px)',
                    }}
                  />
                </div>

                <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
                  {journeySteps.map((step, i) => (
                    <li
                      key={step.number}
                      className="group relative flex flex-col items-center rounded-2xl bg-white px-5 py-8 text-center shadow-sm ring-1 ring-zinc-900/5 transition-all duration-300 hover:shadow-md hover:ring-zinc-900/10"
                      style={{
                        opacity: 0,
                        animation: `reveal-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${0.3 + i * 0.2}s both`,
                      }}
                    >
                      {/* Step icon */}
                      <div className="relative mb-5 flex h-10 w-10 items-center justify-center text-orange-600">
                        {step.icon}
                      </div>

                      <span className="mb-1 block text-xs font-bold tracking-widest text-orange-500">
                        {step.number}
                      </span>

                      <h3 className="mb-2 text-base font-semibold text-zinc-900">
                        {step.title}
                      </h3>
                      <p className="text-sm leading-relaxed text-zinc-500">
                        {step.desc}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            </ScrollReveal>
          </Container>
        </section>

        {/* 6. Pricing */}
        <Pricing />

        {/* 7. FAQ */}
        <Faqs />
      </main>
      <Footer />
    </>
  )
}
