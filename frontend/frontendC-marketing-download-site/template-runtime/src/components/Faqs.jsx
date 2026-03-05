import Image from 'next/image'

import { Container } from '@/components/Container'
import backgroundImage from '@/images/background-faqs.jpg'

const faqs = [
  [
    {
      question: 'What is Mayple?',
      answer:
        'Mayple helps teams run AI agents safely. It sits between your agents and tools so you can watch actions, enforce rules, and keep clear logs.',
    },
    {
      question: 'How do approvals work?',
      answer:
        'When an action matches an approval rule, Mayple pauses it and sends it to a human reviewer. The reviewer can approve or block it with full context.',
    },
    {
      question: 'What agents does Mayple support?',
      answer:
        'Mayple works with MCP-compatible agents and can protect existing setups without requiring a full rewrite.',
    },
  ],
  [
    {
      question: 'Is my data secure?',
      answer:
        'Yes. Mayple supports secure deployments, encrypted data handling, and complete audit trails.',
    },
    {
      question: 'Do I need to modify my agents?',
      answer:
        'Usually no. Mayple is designed as a proxy layer, so most teams connect existing agents and configure rules separately.',
    },
    {
      question: 'What\'s the pricing?',
      answer:
        'Mayple has plans for individuals, teams, and enterprise deployments. See the pricing section for current options.',
    },
  ],
  [
    {
      question: 'Can I self-host Mayple?',
      answer:
        'Yes. You can self-host Mayple, or run it as a managed setup depending on your team\'s needs.',
    },
    {
      question: 'How do I get started?',
      answer:
        'Download Mayple, connect your first agent, and start with basic allow, block, and approval policies.',
    },
    {
      question: 'What are policies?',
      answer:
        'Policies are rules that decide whether actions are allowed, blocked, or require human approval.',
    },
  ],
]

export function Faqs() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className="relative overflow-hidden bg-zinc-50 py-20 sm:py-32"
    >
      <Image
        className="absolute top-0 left-1/2 max-w-none -translate-x-[30%] -translate-y-1/4"
        src={backgroundImage}
        alt=""
        width={1558}
        height={946}
        unoptimized
      />
      <Container className="relative">
        <div className="mx-auto max-w-2xl lg:mx-0">
          <h2
            id="faq-title"
            className="font-display text-3xl tracking-tight text-zinc-900 sm:text-4xl"
          >
            Frequently asked questions
          </h2>
          <p className="mt-4 text-lg tracking-tight text-zinc-700">
            If you can&apos;t find what you&apos;re looking for, email our
            support team at support@maple.dev.
          </p>
        </div>
        <ul
          role="list"
          className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-8 lg:max-w-none lg:grid-cols-3"
        >
          {faqs.map((column, columnIndex) => (
            <li key={columnIndex}>
              <ul role="list" className="flex flex-col gap-y-8">
                {column.map((faq, faqIndex) => (
                  <li key={faqIndex}>
                    <h3 className="font-display text-lg/7 text-zinc-900">
                      {faq.question}
                    </h3>
                    <p className="mt-4 text-sm text-zinc-700">{faq.answer}</p>
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
