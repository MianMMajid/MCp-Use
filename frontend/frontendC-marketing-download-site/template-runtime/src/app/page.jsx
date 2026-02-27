import { CallToAction } from '@/components/CallToAction'
import { Faqs } from '@/components/Faqs'
import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { Hero } from '@/components/Hero'
import { Pricing } from '@/components/Pricing'
import { PrimaryFeatures } from '@/components/PrimaryFeatures'
import { SecondaryFeatures } from '@/components/SecondaryFeatures'
import { Testimonials } from '@/components/Testimonials'
import { Container } from '@/components/Container'
import { Button } from '@/components/Button'

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <PrimaryFeatures />
        <SecondaryFeatures />
        <section id="journey" className="py-20 sm:py-24">
          <Container>
            <h2 className="font-display text-3xl tracking-tight text-slate-900 sm:text-4xl">
              End-to-end journey
            </h2>
            <ol className="mt-8 grid gap-4 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
              <li className="rounded-2xl border border-slate-200 p-4">1. Sign in and connect account</li>
              <li className="rounded-2xl border border-slate-200 p-4">2. Configure agent policies + tools</li>
              <li className="rounded-2xl border border-slate-200 p-4">3. Run workflows with HITL approvals</li>
              <li className="rounded-2xl border border-slate-200 p-4">4. Audit traces and optimize runs</li>
            </ol>
          </Container>
        </section>
        <CallToAction />
        <Testimonials />
        <Pricing />
        <section id="download" className="py-20 sm:py-24">
          <Container className="rounded-3xl bg-slate-50 p-8 ring-1 ring-slate-900/5 sm:p-12">
            <h3 className="font-display text-2xl tracking-tight text-slate-900">Desktop app</h3>
            <p className="mt-3 max-w-2xl text-sm text-slate-700">
              Download Mayple Desktop to orchestrate agents, review approvals, and monitor runtime status from one place.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button href="/download/maple-desktop.dmg">Download macOS (.dmg)</Button>
              <Button href="/download/maple-desktop.exe" variant="outline">
                Download Windows (.exe)
              </Button>
            </div>
          </Container>
        </section>
        <Faqs />
      </main>
      <Footer />
    </>
  )
}
