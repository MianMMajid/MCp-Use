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
import { DownloadSection } from '@/components/DownloadSection'

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
            <h2 className="font-display text-3xl tracking-tight text-zinc-900 sm:text-4xl">
              A/B/C operating journey
            </h2>
            <ol className="mt-8 grid gap-4 text-sm text-zinc-700 sm:grid-cols-2 lg:grid-cols-4">
              <li className="rounded-2xl border border-zinc-200 p-4">1. Discover and download from Salient (C)</li>
              <li className="rounded-2xl border border-zinc-200 p-4">2. Build and execute orchestration in Catalyst (B)</li>
              <li className="rounded-2xl border border-zinc-200 p-4">3. Observe SLO/audit/dead-letter in Protocol (A)</li>
              <li className="rounded-2xl border border-zinc-200 p-4">4. Iterate orchestration back in Desktop (B)</li>
            </ol>
          </Container>
        </section>
        <CallToAction />
        <Testimonials />
        <Pricing />
        <DownloadSection />
        <Faqs />
      </main>
      <Footer />
    </>
  )
}
