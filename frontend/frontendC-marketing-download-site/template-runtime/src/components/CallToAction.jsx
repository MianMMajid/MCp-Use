import Image from 'next/image'

import { Button } from '@/components/Button'
import { Container } from '@/components/Container'
import { ScrollReveal } from '@/components/ScrollReveal'
import backgroundImage from '@/images/background-call-to-action.jpg'

export function CallToAction() {
  return (
    <section
      id="get-started-today"
      className="grain grain-dark relative overflow-hidden bg-orange-600 py-24 sm:py-32"
    >
      <Image
        className="absolute top-1/2 left-1/2 max-w-none -translate-x-1/2 -translate-y-1/2"
        src={backgroundImage}
        alt=""
        width={2347}
        height={1244}
        unoptimized
      />
      <Container className="relative z-10">
        <ScrollReveal>
          <div className="mx-auto max-w-lg text-center">
            <h2 className="font-display text-3xl tracking-tight text-white sm:text-4xl">
              Stop watching. Start blocking.
            </h2>
            <p className="mt-4 text-lg tracking-tight text-white/90">
              Observability tools tell you what went wrong. Mayple prevents it.
              Install the firewall for your agent stack in minutes.
            </p>
            <div className="mt-10 flex justify-center gap-3">
              <Button href="/register" color="white">
                Get started free
              </Button>
              <Button href="#download" color="white">
                Download desktop app
              </Button>
            </div>
          </div>
        </ScrollReveal>
      </Container>
    </section>
  )
}
