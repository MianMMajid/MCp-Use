'use client'

import { MapleMascot } from './MapleMascot'

const WELCOME_PROMPTS = [
  { label: 'Status Update', prompt: 'Give me a firewall status update.' },
  { label: 'Why Blocked?', prompt: 'Why was this trace blocked?' },
  { label: 'Next Action', prompt: 'What should we do next to reduce risk?' },
  { label: 'Risk Score', prompt: 'What is the current risk score?' },
]

export function WelcomePanel({ routeTitle, executionId, isHidden, onSelectPrompt }) {
  return (
    <div className={`welcome-state ${isHidden ? 'is-hidden' : ''}`} id="welcomeState">
      <MapleMascot className="kirby-mascot welcome-kirby" gradientId="kirbyBodyGrad-welcome" />
      <h1 className="welcome-heading">What can I help with?</h1>
      <p className="welcome-sub" id="firewallChatContext">
        Monitoring {routeTitle ?? 'operations'} for {executionId || 'active executions'}.
      </p>
      <div className="welcome-pills">
        {WELCOME_PROMPTS.map(({ label, prompt }) => (
          <button
            key={label}
            type="button"
            className="welcome-pill"
            onClick={() => onSelectPrompt(prompt)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
