import Image from 'next/image'

import { Container } from '@/components/Container'
import avatarImage1 from '@/images/avatars/avatar-1.png'
import avatarImage2 from '@/images/avatars/avatar-2.png'
import avatarImage3 from '@/images/avatars/avatar-3.png'
import avatarImage4 from '@/images/avatars/avatar-4.png'
import avatarImage5 from '@/images/avatars/avatar-5.png'

const testimonials = [
  [
    {
      content:
        'Mayple\'s agent governance saved us hours of manual review every week. The policy controls catch risky actions before they reach production, giving our team confidence to deploy agents faster.',
      author: {
        name: 'Sarah Chen',
        role: 'VP of Engineering at Nexus AI',
        image: avatarImage1,
      },
    },
    {
      content:
        'The HITL approval workflow was exactly what we needed. Our compliance team can now review agent actions in real-time without slowing down development.',
      author: {
        name: 'Marcus Rivera',
        role: 'Head of Compliance at DataForge',
        image: avatarImage4,
      },
    },
  ],
  [
    {
      content:
        'We went from zero visibility into our agent operations to full trace auditing in under a day. The audit trail has been invaluable for our SOC 2 compliance.',
      author: {
        name: 'Priya Patel',
        role: 'CTO at CloudScale Labs',
        image: avatarImage5,
      },
    },
    {
      content:
        'Mayple\'s risk scoring caught an anomalous agent behavior pattern that would have cost us thousands. The ML-powered detection is genuinely impressive.',
      author: {
        name: 'James Okonkwo',
        role: 'Security Lead at Meridian Systems',
        image: avatarImage2,
      },
    },
  ],
  [
    {
      content:
        'Setting up policy controls for our MCP-compatible agents took minutes, not days. Mayple works as a transparent proxy — no agent modifications needed.',
      author: {
        name: 'Elena Vasquez',
        role: 'Platform Engineer at Orion Tech',
        image: avatarImage3,
      },
    },
    {
      content:
        'The combination of real-time monitoring and configurable guard actions gives us the confidence to scale our agent fleet. Mayple is the governance layer we were missing.',
      author: {
        name: 'Alex Kim',
        role: 'Director of AI Operations at Summit Analytics',
        image: avatarImage4,
      },
    },
  ],
]

function QuoteIcon(props) {
  return (
    <svg aria-hidden="true" width={105} height={78} {...props}>
      <path d="M25.086 77.292c-4.821 0-9.115-1.205-12.882-3.616-3.767-2.561-6.78-6.102-9.04-10.622C1.054 58.534 0 53.411 0 47.686c0-5.273.904-10.396 2.712-15.368 1.959-4.972 4.746-9.567 8.362-13.786a59.042 59.042 0 0 1 12.43-11.3C28.325 3.917 33.599 1.507 39.324 0l11.074 13.786c-6.479 2.561-11.677 5.951-15.594 10.17-3.767 4.219-5.65 7.835-5.65 10.848 0 1.356.377 2.863 1.13 4.52.904 1.507 2.637 3.089 5.198 4.746 3.767 2.41 6.328 4.972 7.684 7.684 1.507 2.561 2.26 5.5 2.26 8.814 0 5.123-1.959 9.19-5.876 12.204-3.767 3.013-8.588 4.52-14.464 4.52Zm54.24 0c-4.821 0-9.115-1.205-12.882-3.616-3.767-2.561-6.78-6.102-9.04-10.622-2.11-4.52-3.164-9.643-3.164-15.368 0-5.273.904-10.396 2.712-15.368 1.959-4.972 4.746-9.567 8.362-13.786a59.042 59.042 0 0 1 12.43-11.3C82.565 3.917 87.839 1.507 93.564 0l11.074 13.786c-6.479 2.561-11.677 5.951-15.594 10.17-3.767 4.219-5.65 7.835-5.65 10.848 0 1.356.377 2.863 1.13 4.52.904 1.507 2.637 3.089 5.198 4.746 3.767 2.41 6.328 4.972 7.684 7.684 1.507 2.561 2.26 5.5 2.26 8.814 0 5.123-1.959 9.19-5.876 12.204-3.767 3.013-8.588 4.52-14.464 4.52Z" />
    </svg>
  )
}

export function Testimonials() {
  return (
    <section
      id="testimonials"
      aria-label="What our customers are saying"
      className="bg-zinc-50 py-20 sm:py-32"
    >
      <Container>
        <div className="mx-auto max-w-2xl md:text-center">
          <h2 className="font-display text-3xl tracking-tight text-zinc-900 sm:text-4xl">
            Trusted by engineering teams worldwide.
          </h2>
          <p className="mt-4 text-lg tracking-tight text-zinc-700">
            See how teams are using Mayple to govern their AI agents and keep
            operations secure.
          </p>
        </div>
        <ul
          role="list"
          className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-6 sm:gap-8 lg:mt-20 lg:max-w-none lg:grid-cols-3"
        >
          {testimonials.map((column, columnIndex) => (
            <li key={columnIndex}>
              <ul role="list" className="flex flex-col gap-y-6 sm:gap-y-8">
                {column.map((testimonial, testimonialIndex) => (
                  <li key={testimonialIndex}>
                    <figure className="relative rounded-2xl bg-white p-6 shadow-xl shadow-zinc-900/10">
                      <QuoteIcon className="absolute top-6 left-6 fill-zinc-100" />
                      <blockquote className="relative">
                        <p className="text-lg tracking-tight text-zinc-900">
                          {testimonial.content}
                        </p>
                      </blockquote>
                      <figcaption className="relative mt-6 flex items-center justify-between border-t border-zinc-100 pt-6">
                        <div>
                          <div className="font-display text-base text-zinc-900">
                            {testimonial.author.name}
                          </div>
                          <div className="mt-1 text-sm text-zinc-500">
                            {testimonial.author.role}
                          </div>
                        </div>
                        <div className="overflow-hidden rounded-full bg-zinc-50">
                          <Image
                            className="h-14 w-14 object-cover"
                            src={testimonial.author.image}
                            alt=""
                            width={56}
                            height={56}
                          />
                        </div>
                      </figcaption>
                    </figure>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  )
}
