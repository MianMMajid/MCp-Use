import Image from 'next/image'

import { Container } from '@/components/Container'
import backgroundImage from '@/images/background-faqs.jpg'

const faqs = [
  [
    {
      question: 'What is Maple?',
      answer:
        'Maple is an agent governance platform that provides policy controls, human-in-the-loop approvals, and trace auditing for AI agents. It works as a transparent proxy between your agents and the tools they use.',
    },
    {
      question: 'How does HITL approval work?',
      answer:
        'When an agent action matches a policy rule requiring approval, the agent pauses execution. A human reviewer sees the full context and can approve or deny the action. The agent then resumes or aborts based on the decision.',
    },
    {
      question: 'What agents does Maple support?',
      answer:
        'Maple works with any MCP-compatible agent. It also includes built-in support for OpenClaw agents. Since Maple operates as a proxy layer, it\'s agent-framework agnostic.',
    },
  ],
  [
    {
      question: 'Is my data secure?',
      answer:
        'Yes. Maple supports on-premise deployment, uses encrypted storage for all sensitive data, and maintains complete audit trails. All inter-service communication uses mTLS encryption.',
    },
    {
      question: 'Do I need to modify my agents?',
      answer:
        'No. Maple works as a transparent proxy, so your existing agents connect through Maple without any code changes. Policies and guard actions are configured separately.',
    },
    {
      question: 'What\'s the pricing?',
      answer:
        'Maple offers a free tier for individual developers, Pro for small teams, Team for growing organizations, and Enterprise for custom deployments. See our pricing section for details.',
    },
  ],
  [
    {
      question: 'Can I self-host Maple?',
      answer:
        'Yes. Maple provides Kubernetes deployment manifests and Docker images for self-hosted installations. We also offer managed cloud hosting if you prefer.',
    },
    {
      question: 'How do I get started?',
      answer:
        'Download the Maple Desktop app for local development, or deploy to your cloud infrastructure using our K8s manifests. The setup wizard guides you through connecting your first agent.',
    },
    {
      question: 'What\'s the difference between policies and guard actions?',
      answer:
        'Policies are declarative rules that define what agents can and cannot do. Guard actions are runtime decisions — they evaluate policies against live agent actions and enforce allow, block, or require-approval outcomes.',
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
        className="absolute top-0 left-1/2 max-w-none tranzinc-x-[-30%] -tranzinc-y-1/4"
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
