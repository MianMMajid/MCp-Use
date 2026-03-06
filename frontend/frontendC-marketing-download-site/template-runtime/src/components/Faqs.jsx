import Image from 'next/image'

import { Container } from '@/components/Container'
import { ScrollReveal } from '@/components/ScrollReveal'
import backgroundImage from '@/images/background-faqs.jpg'

const faqs = [
  [
    {
      question: 'What is Mayple?',
      answer:
        'Mayple is a firewall for AI agent tool calls. It sits between your agents and the tools they use, intercepting every action in real time so you can allow, block, or require approval — all through a no-code interface.',
    },
    {
      question: 'How is Mayple different from Datadog or LangSmith?',
      answer:
        'Those are observability tools — they show you what happened after the fact. Mayple is a runtime firewall that blocks risky actions before they execute. We prevent damage, not just report it.',
    },
    {
      question: 'Does Mayple work with OpenAI, Anthropic, and Google agents?',
      answer:
        'Yes. Mayple is provider-agnostic and MCP-native. It works across agents from any provider or custom framework — one security layer for your entire agent stack.',
    },
  ],
  [
    {
      question: 'Why not use Bedrock AgentCore or Copilot Studio?',
      answer:
        'Bedrock has strong security but is developer-only and locked to AWS. Copilot Studio policies are per-environment, not per-user, and Microsoft-only. Mayple gives you granular per-user rules with a no-code UI, across any provider.',
    },
    {
      question: 'Do I need to modify my agents?',
      answer:
        'No. Mayple runs as a proxy layer in front of your tools. Connect your existing agents and configure rules separately — no rewriting required.',
    },
    {
      question: 'How do approvals work?',
      answer:
        'When a tool call matches an approval rule, Mayple pauses it and sends it to a human reviewer. The reviewer can approve or block with full context — the agent waits until a decision is made.',
    },
  ],
  [
    {
      question: 'Can platforms embed Mayple?',
      answer:
        'Yes. Platforms building their own agent products can embed Mayple\'s security layer via SDK rather than building a policy engine from scratch. This is the same model that led to $260M+ acquisitions in this space.',
    },
    {
      question: 'Can I self-host Mayple?',
      answer:
        'Yes. You can self-host Mayple or run it as a managed deployment depending on your compliance and infrastructure needs.',
    },
    {
      question: 'How do I get started?',
      answer:
        'Download Mayple, point it at your agents, and set your first allow, block, and approval rules. No code required — most teams are protected in under ten minutes.',
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
        <ScrollReveal>
          <div className="mx-auto max-w-2xl lg:mx-0">
            <h2
              id="faq-title"
              className="font-display text-3xl tracking-tight text-zinc-900 sm:text-4xl"
            >
              Frequently asked questions
            </h2>
            <p className="mt-4 text-lg tracking-tight text-zinc-700">
              If you can&apos;t find what you&apos;re looking for, email our
              support team at support@mayple.cloud.
            </p>
          </div>
        </ScrollReveal>
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
