import Image from 'next/image'

import { Button } from '@/components/Button'
import { Container } from '@/components/Container'
import backgroundImage from '@/images/background-call-to-action.jpg'

export function CallToAction() {
  return (
    <section
      id="get-started-today"
      className="relative overflow-hidden bg-orange-600 py-32"
    >
      <Image
        className="absolute top-1/2 left-1/2 max-w-none -translate-x-1/2 -translate-y-1/2"
        src={backgroundImage}
        alt=""
        width={2347}
        height={1244}
        unoptimized
      />
      <Container className="relative">
        <div className="mx-auto max-w-lg text-center">
          <h2 className="font-display text-3xl tracking-tight text-white sm:text-4xl">
            Launch the full A/B workflow
          </h2>
          <p className="mt-4 text-lg tracking-tight text-white">
            Download Catalyst desktop to orchestrate with OpenClaw, then switch
            to Protocol console for observability, audit, and governance.
          </p>
          <div className="mt-10 flex justify-center gap-3">
            <Button href="/register" color="white">
              Start free trial
            </Button>
            <Button href="#download" color="white">
              Download desktop
            </Button>
          </div>
        </div>
      </Container>
    </section>
  )
}
