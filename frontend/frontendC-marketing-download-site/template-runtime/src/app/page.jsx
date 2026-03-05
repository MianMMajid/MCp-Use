import { CallToAction } from '@/components/CallToAction'
import { Faqs } from '@/components/Faqs'
import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { Hero } from '@/components/Hero'
import { Pricing } from '@/components/Pricing'
import { PrimaryFeatures } from '@/components/PrimaryFeatures'
import { SecondaryFeatures } from '@/components/SecondaryFeatures'
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
              How teams use Maple
            </h2>
            <ol className="mt-8 grid gap-4 text-sm text-zinc-700 sm:grid-cols-2 lg:grid-cols-4">
              <li className="rounded-2xl border border-zinc-200 p-4">1. Download Maple and connect your agent tools</li>
              <li className="rounded-2xl border border-zinc-200 p-4">2. Set simple policies for allow, block, and approval</li>
              <li className="rounded-2xl border border-zinc-200 p-4">3. Monitor live actions and review alerts</li>
              <li className="rounded-2xl border border-zinc-200 p-4">4. Replay sessions and improve rules over time</li>
            </ol>
          </Container>
        </section>
        <CallToAction />
        <Pricing />
        <DownloadSection />
        <Faqs />
      </main>
      <Footer />
    </>
  )
}
