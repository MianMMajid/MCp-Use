'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Image from 'next/image'
import clsx from 'clsx'

import { Container } from '@/components/Container'
import backgroundImage from '@/images/background-features.jpg'

// ─── Orchestration Diagram (animated sequence) ───

function OrchestrationDiagram() {
  const [phase, setPhase] = useState(0)
  const timerRef = useRef(null)

  // Phase durations in ms
  const durations = [
    600,   // 0 → 1: pause, then drag agent 1
    1200,  // 1 → 2: agent 1 lands, drag agent 2
    1200,  // 2 → 3: agent 2 lands, drag agent 3
    1200,  // 3 → 4: agent 3 lands, start drawing edges
    1800,  // 4 → 5: edges drawn, cursor moves to Start Live
    1200,  // 5 → 6: clicked Start Live, edges go green
    3200,  // 6 → 7: task text typing
    2500,  // 7 → 0: hold, then reset
  ]

  useEffect(() => {
    timerRef.current = setTimeout(
      () => setPhase((p) => (p + 1) % 8),
      durations[phase],
    )
    return () => clearTimeout(timerRef.current)
  }, [phase])

  const isRunning = phase >= 5

  // Sidebar agents — dim once "placed" on canvas
  const sidebarAgents = [
    { name: 'Finance Researcher', placedAt: 1 },
    { name: 'Video Creator', placedAt: 2 },
    { name: 'Social Publisher', placedAt: 3 },
    { name: 'Compliance Bot', placedAt: null },
  ]

  // Cursor target positions per phase (% of full diagram container)
  // Sidebar is w-36 ≈ 20% of width. Canvas nodes offset by sidebar.
  const cursorPos = [
    { left: '8%', top: '30%' },    // 0: at sidebar (first agent)
    { left: '46%', top: '15%' },   // 1: dragging to node 1 (Finance Researcher)
    { left: '46%', top: '55%' },   // 2: dragging to node 2 (Video Creator)
    { left: '73%', top: '33%' },   // 3: dragging to node 3 (Social Publisher)
    { left: '55%', top: '35%' },   // 4: watching edges draw
    { left: '24%', top: '5%' },    // 5: clicking Start Live
    { left: '52%', top: '88%' },   // 6: at task input
    { left: '65%', top: '88%' },   // 7: further along task input
  ]

  // Edge SVG path data (lines between node centers)
  // Nodes: instruction(15,42) → node1(42,22) → node3(76,42)
  //        instruction(15,42) → node2(42,62) → node3(76,42)
  const edges = [
    { x1: 20, y1: 42, x2: 36, y2: 22, label: 'medium' },
    { x1: 20, y1: 42, x2: 36, y2: 62, label: 'high' },
    { x1: 52, y1: 22, x2: 70, y2: 42, label: 'low' },
    { x1: 52, y1: 62, x2: 70, y2: 42, label: 'approval' },
  ]

  const taskText =
    'research yahoo finance findings for today → send data to sheets → create summary video → publish on youtube → share link on company chat'

  const typedLength =
    phase >= 6
      ? Math.min(taskText.length, Math.round(taskText.length * ((phase >= 7 ? 1 : 0.85))))
      : 0

  return (
    <div className="diagram-ui relative flex h-full select-none bg-[#0c0f14] text-[#edf1f7]">
      <PhaseCursor style={cursorPos[phase]} />

      {/* ── Sidebar ── */}
      <div className="hidden w-36 shrink-0 border-r border-white/10 p-3 sm:block">
        <p className="mb-2 text-xs font-medium tracking-wide text-zinc-500 uppercase">
          Agents
        </p>
        <input
          readOnly
          placeholder="Search..."
          className="mb-3 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-400 outline-none"
        />
        {sidebarAgents.map((agent) => (
          <div
            key={agent.name}
            className={clsx(
              'mb-1.5 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-all duration-500',
              agent.placedAt !== null && phase >= agent.placedAt
                ? 'opacity-30'
                : 'hover:bg-white/5',
            )}
          >
            <span
              className={clsx(
                'h-1.5 w-1.5 rounded-full',
                agent.placedAt !== null && phase >= agent.placedAt
                  ? 'bg-zinc-600'
                  : 'bg-emerald-400',
              )}
            />
            <span className="truncate text-zinc-300">{agent.name}</span>
            {agent.placedAt !== null && phase >= agent.placedAt && (
              <span className="ml-auto text-[11px] text-zinc-600">on canvas</span>
            )}
          </div>
        ))}
      </div>

      {/* ── Canvas ── */}
      <div className="relative flex-1 overflow-hidden">
        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />

        {/* Top controls */}
        <div className="relative z-10 flex gap-1.5 border-b border-white/10 px-3 py-2">
          {[
            { label: 'Start Live', active: phase === 5 },
            { label: 'Dry Run', active: false },
            { label: 'Pause', active: false },
            { label: 'Resume', active: false },
          ].map((btn) => (
            <span
              key={btn.label}
              className={clsx(
                'rounded-full border px-2 py-0.5 text-[11px] transition-all duration-500',
                btn.active
                  ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300'
                  : isRunning && btn.label === 'Start Live'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                    : 'border-white/10 text-zinc-400',
              )}
            >
              {isRunning && btn.label === 'Start Live' ? (
                <span className="flex items-center gap-1">
                  <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-400" />
                  Running
                </span>
              ) : (
                btn.label
              )}
            </span>
          ))}
          {isRunning && (
            <span className="ml-auto text-xs text-emerald-400/70">
              delegate #1 &middot; plan
            </span>
          )}
        </div>

        {/* SVG edge layer */}
        <svg
          className="absolute inset-0 z-0"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%' }}
        >
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={isRunning ? '#10b981' : '#71717a'} />
            </marker>
            <marker
              id="arrow-green"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
            </marker>
          </defs>
          {edges.map((edge, i) => (
            <line
              key={i}
              x1={edge.x1}
              y1={edge.y1}
              x2={edge.x2}
              y2={edge.y2}
              stroke={isRunning ? '#10b981' : '#52525b'}
              strokeWidth="0.4"
              markerEnd={isRunning ? 'url(#arrow-green)' : 'url(#arrow)'}
              className={clsx(
                'transition-all duration-700',
                phase >= 4 ? 'opacity-100' : 'opacity-0',
              )}
              style={
                isRunning
                  ? {
                      strokeDasharray: '2 1.5',
                      animation: `edge-flow 1.2s linear infinite`,
                      animationDelay: `${i * 0.3}s`,
                    }
                  : phase >= 4
                    ? {
                        strokeDasharray: '100',
                        strokeDashoffset: '0',
                        transition: `stroke-dashoffset 0.8s ease ${i * 0.15}s, opacity 0.5s`,
                      }
                    : { strokeDashoffset: '100', strokeDasharray: '100' }
              }
            />
          ))}
        </svg>

        {/* ── Instruction node (always visible) ── */}
        <div
          className="absolute z-10 rounded-xl border border-zinc-600 bg-zinc-800 px-3 py-2 shadow-lg"
          style={{ left: '8%', top: '32%' }}
        >
          <p className="text-[13px] font-semibold text-white">instruction</p>
          <p className="text-xs text-zinc-500">START</p>
        </div>

        {/* ── Agent node 1: Finance Researcher ── */}
        <div
          className={clsx(
            'absolute z-10 rounded-xl border bg-zinc-800/90 px-3 py-2 shadow-lg transition-all duration-500',
            phase >= 1
              ? 'scale-100 opacity-100 border-orange-500/40 shadow-orange-500/5'
              : 'scale-90 opacity-0 border-transparent',
          )}
          style={{ left: '32%', top: '12%' }}
        >
          <p className="text-[13px] font-semibold text-white">Finance Researcher</p>
          <p className="text-xs text-zinc-500">yahoo finance, sheets export</p>
          <div className="mt-1 flex gap-1">
            <span className="rounded bg-orange-600/20 px-1 py-0.5 text-[11px] font-medium text-orange-300">OC</span>
            {isRunning && (
              <span className="rounded bg-emerald-600/20 px-1 py-0.5 text-[11px] font-medium text-emerald-300">
                running
              </span>
            )}
          </div>
        </div>

        {/* ── Agent node 2: Video Creator ── */}
        <div
          className={clsx(
            'absolute z-10 rounded-xl border bg-zinc-800/90 px-3 py-2 shadow-lg transition-all duration-500',
            phase >= 2
              ? 'scale-100 opacity-100 border-orange-500/40 shadow-orange-500/5'
              : 'scale-90 opacity-0 border-transparent',
          )}
          style={{ left: '32%', top: '52%' }}
        >
          <p className="text-[13px] font-semibold text-white">Video Creator</p>
          <p className="text-xs text-zinc-500">generate summary video</p>
          <div className="mt-1 flex gap-1">
            <span className="rounded bg-orange-600/20 px-1 py-0.5 text-[11px] font-medium text-orange-300">OC</span>
            {isRunning && phase >= 6 && (
              <span className="rounded bg-amber-600/20 px-1 py-0.5 text-[11px] font-medium text-amber-300">
                queued
              </span>
            )}
          </div>
        </div>

        {/* ── Agent node 3: Social Publisher ── */}
        <div
          className={clsx(
            'absolute z-10 rounded-xl border bg-zinc-800/90 px-3 py-2 shadow-lg transition-all duration-500',
            phase >= 3
              ? 'scale-100 opacity-100 border-orange-500/40 shadow-orange-500/5'
              : 'scale-90 opacity-0 border-transparent',
          )}
          style={{ left: '66%', top: '30%' }}
        >
          <p className="text-[13px] font-semibold text-white">Social Publisher</p>
          <p className="text-xs text-zinc-500">youtube upload, messenger share</p>
          <div className="mt-1 flex gap-1">
            <span className="rounded bg-orange-600/20 px-1 py-0.5 text-[11px] font-medium text-orange-300">OC</span>
            {isRunning && phase >= 6 && (
              <span className="rounded bg-amber-600/20 px-1 py-0.5 text-[11px] font-medium text-amber-300">
                queued
              </span>
            )}
          </div>
        </div>

        {/* ── Task bar (bottom) ── */}
        <div
          className={clsx(
            'absolute right-0 bottom-0 left-0 z-20 border-t border-white/10 bg-zinc-900/95 px-3 py-2 backdrop-blur-sm transition-all duration-500',
          )}
        >
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-500">task</span>
            <div className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-400">
              {phase >= 6 ? (
                <span>
                  {taskText.slice(0, typedLength)}
                  <span className="typing-cursor">&nbsp;</span>
                </span>
              ) : (
                <span className="text-zinc-600">
                  Give a task to execute across agents...
                </span>
              )}
            </div>
            <span
              className={clsx(
                'rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all duration-300',
                isRunning
                  ? 'bg-emerald-600 text-white'
                  : 'bg-orange-600 text-white',
              )}
            >
              {isRunning ? 'Running...' : 'Execute Task'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Shared Cursor Component ───

function PhaseCursor({ style, showRing = true }) {
  return (
    <div
      className="pointer-events-none absolute z-50 transition-all duration-700 ease-in-out"
      style={style}
    >
      {showRing && (
        <div
          className="absolute -top-2.5 -left-2.5 h-6 w-6 rounded-full border border-orange-400/60"
          style={{ animation: 'cursor-click 1.2s ease-out infinite' }}
        />
      )}
      <svg width="16" height="20" viewBox="0 0 16 20" fill="none" className="drop-shadow-lg">
        <path d="M1 1L1 15.5L5.5 11.5L9.5 19L12 18L8 10L14 10L1 1Z" fill="white" stroke="#0c0f14" strokeWidth="1.2" />
      </svg>
    </div>
  )
}

// ─── Agents Diagram (animated sequence) ───

function AgentsDiagram() {
  const [phase, setPhase] = useState(0)
  const timerRef = useRef(null)

  // Phases:
  // 0: Empty grid, cursor at "Create Agent" button
  // 1: Cursor clicks "Create Agent" — first card appears
  // 2: Cursor moves to name input on card, types name
  // 3: Cursor drags a skill from catalog to equip zone
  // 4: Second skill equipped, card shows "2 Openclaw tools"
  // 5: Agent status goes "active" (green), cursor moves to next card slot
  // 6: Second agent card appears (pre-filled)
  // 7: Third agent card appears, grid populated
  // 8: Hold, then reset

  const durations = [
    800,   // 0→1
    1200,  // 1→2
    1400,  // 2→3
    1200,  // 3→4
    1000,  // 4→5
    1000,  // 5→6
    1000,  // 6→7
    1200,  // 7→8
    2200,  // 8→0
  ]

  useEffect(() => {
    timerRef.current = setTimeout(
      () => setPhase((p) => (p + 1) % 9),
      durations[phase],
    )
    return () => clearTimeout(timerRef.current)
  }, [phase])

  const agents = [
    { name: 'Sales Outreach', desc: 'Lead emails, CRM updates', tools: 4, risk: 'low' },
    { name: 'Contract Reviewer', desc: 'NDA review, risk flags', tools: 3, risk: 'medium' },
    { name: 'Expense Auditor', desc: 'Receipt parsing, policy check', tools: 5, risk: 'low' },
  ]

  const catalogSkills = [
    { name: 'exec', tag: '#runtime', icon: '>' },
    { name: 'web_search', tag: '#web', icon: '🔍' },
    { name: 'message', tag: '#comms', icon: '💬' },
    { name: 'browser', tag: '#web', icon: '🌐' },
  ]

  // How many agents are visible
  const visibleAgents = phase >= 7 ? 3 : phase >= 6 ? 2 : phase >= 1 ? 1 : 0

  // Skills being equipped to agent 1
  const equippedCount = phase >= 4 ? 2 : phase >= 3 ? 1 : 0

  // Agent 1 status
  const agent1Active = phase >= 5

  // Cursor positions (catalog sidebar w-32 on right ≈ 18% of width)
  const cursorPos = [
    { left: '72%', top: '4%' },    // 0: at Create Agent button (header right)
    { left: '14%', top: '38%' },   // 1: first card center
    { left: '14%', top: '30%' },   // 2: at name field on card
    { left: '87%', top: '32%' },   // 3: at first skill in catalog sidebar
    { left: '30%', top: '72%' },   // 4: dropping to equipped dock
    { left: '14%', top: '28%' },   // 5: card status area, goes active
    { left: '38%', top: '38%' },   // 6: second card center
    { left: '62%', top: '38%' },   // 7: third card center
    { left: '72%', top: '4%' },    // 8: back to Create Agent
  ]

  // Typing effect for agent name
  const agentName = 'Sales Outreach'
  const typedName = phase >= 2 ? agentName.slice(0, Math.round(agentName.length * (phase >= 3 ? 1 : 0.6))) : ''

  return (
    <div className="diagram-ui relative flex h-full select-none bg-[#0c0f14] text-[#edf1f7]">
      <PhaseCursor style={cursorPos[phase]} />

      {/* ── Main content ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
          <div>
            <h4 className="text-sm font-semibold text-white">Agents</h4>
            <p className="text-[11px] text-zinc-500">Manage and equip your agent fleet.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-500">{visibleAgents} total</span>
            <span className="text-[11px] text-zinc-500">{agent1Active ? visibleAgents : Math.max(0, visibleAgents - 1)} active</span>
            <span
              className={clsx(
                'rounded-lg px-2 py-1 text-[11px] font-medium transition-all duration-300',
                phase === 0 ? 'bg-orange-500 text-white scale-105' : 'bg-orange-600 text-white',
              )}
            >
              {phase === 0 || phase === 1 ? 'Creating...' : 'Create Agent'}
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="border-b border-white/10 px-4 py-2">
          <input readOnly placeholder="Search agents..." className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400 outline-none" />
        </div>

        {/* Agent grid + skill catalog */}
        <div className="flex flex-1 overflow-hidden">
          {/* Agent cards */}
          <div className="flex-1 p-3">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {agents.map((agent, i) => (
                <div
                  key={agent.name}
                  className={clsx(
                    'rounded-xl border bg-white/[0.03] p-2.5 transition-all duration-500',
                    i < visibleAgents ? 'scale-100 opacity-100' : 'scale-95 opacity-0',
                    i === 0 && agent1Active ? 'border-emerald-500/30' : 'border-white/10',
                  )}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <p className="truncate text-xs font-medium text-white">
                      {i === 0 && phase < 3 ? typedName || '...' : agent.name}
                      {i === 0 && phase === 2 && <span className="typing-cursor">&nbsp;</span>}
                    </p>
                    <span
                      className={clsx(
                        'rounded-full px-1.5 py-0.5 text-[11px] transition-all duration-500',
                        i === 0 && agent1Active
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : i > 0 && i < visibleAgents
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-zinc-500/20 text-zinc-400',
                      )}
                    >
                      {(i === 0 && agent1Active) || i > 0 ? 'active' : 'setup'}
                    </span>
                  </div>
                  <p className="mb-1.5 text-xs leading-snug text-zinc-500">{i < visibleAgents ? agent.desc : ''}</p>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className={clsx('rounded-full px-1.5 py-0.5 text-[11px]', agent.risk === 'low' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400')}>{agent.risk}</span>
                    <span className="text-[11px] text-zinc-600">{i === 0 ? equippedCount : agent.tools} tools</span>
                  </div>
                  <div className="flex gap-1">
                    <span className="rounded border border-white/10 px-1.5 py-0.5 text-xs text-zinc-400">Configure</span>
                    <span className="rounded border border-white/10 px-1.5 py-0.5 text-xs text-zinc-400">Chat</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Equipped skills dock */}
            {phase >= 3 && (
              <div
                className={clsx(
                  'mt-2.5 rounded-xl border p-2 transition-all duration-500',
                  phase === 3 || phase === 4 ? 'border-orange-500/40 bg-orange-500/5' : 'border-white/10 bg-white/[0.02]',
                )}
              >
                <p className="mb-1 text-xs text-zinc-500">
                  Equipped Skills {equippedCount > 0 && <span className="text-orange-300">({equippedCount})</span>}
                </p>
                <div className="flex gap-1.5">
                  {equippedCount >= 1 && (
                    <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-zinc-300">exec</span>
                  )}
                  {equippedCount >= 2 && (
                    <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-zinc-300">web_search</span>
                  )}
                  {equippedCount === 0 && (
                    <span className="text-xs text-zinc-600">Drag skills here to equip...</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Skill catalog sidebar */}
          <div className="hidden w-32 shrink-0 border-l border-white/10 p-2 sm:block">
            <p className="mb-1.5 text-[11px] font-semibold text-white">Skill Catalog</p>
            {catalogSkills.map((skill, i) => (
              <div
                key={skill.name}
                className={clsx(
                  'mb-1 flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] transition-all duration-300',
                  (phase === 3 && i === 0) || (phase === 4 && i === 1) ? 'bg-orange-500/20 border border-orange-500/30' : 'border border-transparent hover:bg-white/5',
                  (i === 0 && equippedCount >= 1) || (i === 1 && equippedCount >= 2) ? 'opacity-40' : '',
                )}
              >
                <span className="text-xs">{skill.icon}</span>
                <span className="text-zinc-300">{skill.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Skills Diagram (animated sequence) ───

function SkillsDiagram() {
  const [phase, setPhase] = useState(0)
  const timerRef = useRef(null)

  // Phases:
  // 0: Skills grid visible, cursor at "All Skills" category
  // 1: Cursor clicks "Web Intelligence" category — grid filters
  // 2: Cursor moves to "browser" skill "Test" button
  // 3: Click Test — test console modal opens
  // 4: Console output types in, shows "Running..."
  // 5: Test passes — "PASS" badge appears
  // 6: Console closes, cursor moves to "+ Add New"
  // 7: Hold, then reset

  const durations = [
    1200,  // 0→1
    1200,  // 1→2
    1000,  // 2→3
    1600,  // 3→4
    1400,  // 4→5
    1200,  // 5→6
    1400,  // 6→7
    2200,  // 7→0
  ]

  useEffect(() => {
    timerRef.current = setTimeout(
      () => setPhase((p) => (p + 1) % 8),
      durations[phase],
    )
    return () => clearTimeout(timerRef.current)
  }, [phase])

  const categories = ['All Skills', 'System Runtime', 'Web Intelligence', 'Social & Comms', 'Automation']
  const activeCategory = phase >= 1 && phase <= 5 ? 2 : 0 // Web Intelligence during phases 1-5

  const allSkills = [
    { name: 'exec', desc: 'Run terminal/shell commands.', tags: ['#runtime'], cat: 1 },
    { name: 'apply_patch', desc: 'Apply surgical code diffs.', tags: ['#code'], cat: 1 },
    { name: 'browser', desc: 'Managed Playwright automation.', tags: ['#web'], cat: 2 },
    { name: 'web_search', desc: 'High-speed keyword search.', tags: ['#web'], cat: 2 },
    { name: 'web_fetch', desc: 'HTTP request pipeline.', tags: ['#web'], cat: 2 },
    { name: 'pdf_tool', desc: 'Parse complex PDF content.', tags: ['#documents'], cat: 2 },
  ]

  const filteredSkills = activeCategory === 0
    ? allSkills
    : allSkills.filter((s) => s.cat === activeCategory)

  const testRunning = phase >= 3 && phase <= 5
  const testPassed = phase >= 5

  const consoleLines = [
    '$ skill test browser --smoke',
    '→ Connecting to Playwright runtime...',
    '→ Launching headless Chromium...',
    '→ Navigation test: https://example.com ✓',
    '→ Screenshot capture ✓',
    '→ Cookie isolation ✓',
    'All checks passed.',
  ]
  const visibleLines = phase >= 5 ? consoleLines.length : phase >= 4 ? 4 : phase >= 3 ? 1 : 0

  // Sidebar w-28 ≈ 16% of width. Main area starts at ~16%.
  const cursorPos = [
    { left: '6%', top: '12%' },    // 0: at "All Skills" in sidebar
    { left: '6%', top: '20%' },    // 1: at "Web Intelligence" category
    { left: '36%', top: '44%' },   // 2: at browser card "Test" button
    { left: '36%', top: '44%' },   // 3: clicking Test
    { left: '55%', top: '78%' },   // 4: watching console output
    { left: '55%', top: '72%' },   // 5: test passed
    { left: '92%', top: '4%' },    // 6: at + Add New button
    { left: '92%', top: '4%' },    // 7: hold
  ]

  return (
    <div className="diagram-ui relative flex h-full select-none bg-[#0c0f14] text-[#edf1f7]">
      <PhaseCursor style={cursorPos[phase]} />

      {/* ── Sidebar ── */}
      <div className="hidden w-28 shrink-0 border-r border-white/10 p-2.5 sm:block">
        <p className="mb-1.5 text-[11px] font-semibold text-white">Categories</p>
        {categories.map((cat, i) => (
          <div
            key={cat}
            className={clsx(
              'mb-0.5 rounded-full px-2 py-1 text-xs transition-all duration-300',
              activeCategory === i ? 'bg-orange-600/20 text-orange-300 border border-orange-500/30' : 'text-zinc-400 border border-transparent',
            )}
          >
            {cat}
          </div>
        ))}
        <p className="mt-2.5 mb-1.5 text-[11px] font-semibold text-white">Tags</p>
        <div className="flex flex-wrap gap-0.5">
          {['#runtime', '#code', '#web', '#api', '#safety'].map((tag) => (
            <span
              key={tag}
              className={clsx(
                'rounded-full border px-1.5 py-0.5 text-[11px] transition-all duration-300',
                tag === '#web' && activeCategory === 2
                  ? 'border-orange-500/30 bg-orange-500/10 text-orange-300'
                  : 'border-white/10 text-zinc-500',
              )}
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-semibold text-white">Recent</p>
          <div className="space-y-1">
            {testPassed && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2 py-1">
                <p className="text-[11px] text-emerald-300">browser - PASS</p>
                <p className="text-xs text-zinc-600">just now</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Main ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
          <div>
            <h4 className="text-sm font-semibold text-white">Skills Toolbox</h4>
            <p className="text-xs text-zinc-500">Active skills with filtering and quick tests.</p>
          </div>
          <span
            className={clsx(
              'rounded-lg px-2 py-1 text-[11px] font-medium transition-all duration-300',
              phase >= 6 ? 'bg-orange-500 text-white scale-105' : 'bg-orange-600 text-white',
            )}
          >
            + Add New
          </span>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
          <span className="text-[11px] text-zinc-500">
            {activeCategory === 0 ? 'All Skills' : categories[activeCategory]}
          </span>
          <span className="text-[11px] text-zinc-500">
            {filteredSkills.length} shown · {filteredSkills.length} connected
          </span>
        </div>

        {/* Skills grid */}
        <div className="flex-1 overflow-hidden p-2.5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {filteredSkills.map((skill) => (
              <div
                key={skill.name}
                className={clsx(
                  'rounded-xl border bg-white/[0.03] p-2 transition-all duration-300',
                  skill.name === 'browser' && testRunning
                    ? 'border-orange-500/40 shadow-orange-500/10 shadow-lg'
                    : 'border-white/10',
                )}
              >
                <div className="mb-0.5 flex items-center justify-between">
                  <p className="truncate text-[11px] font-medium text-white">{skill.name}</p>
                  <span className="flex items-center gap-0.5 text-[11px] text-emerald-400">
                    <span className="h-1 w-1 rounded-full bg-emerald-400" />
                    <span className="hidden sm:inline">Connected</span>
                  </span>
                </div>
                <p className="mb-1 text-[11px] leading-snug text-zinc-500">{skill.desc}</p>
                <div className="flex items-center justify-between">
                  <div className="flex gap-0.5">
                    {skill.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-white/5 px-1 py-0.5 text-xs text-zinc-500">{tag}</span>
                    ))}
                  </div>
                  <span
                    className={clsx(
                      'rounded border px-1.5 py-0.5 text-[11px] transition-all duration-300',
                      skill.name === 'browser' && testRunning
                        ? 'border-orange-500/40 bg-orange-500/20 text-orange-300'
                        : 'border-white/10 text-zinc-400',
                    )}
                  >
                    {skill.name === 'browser' && testRunning ? 'Testing...' : 'Test'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Test console overlay */}
        {phase >= 3 && phase <= 6 && (
          <div
            className={clsx(
              'absolute right-2 bottom-2 left-2 z-30 rounded-xl border bg-[#0a0d11] transition-all duration-500 sm:left-32',
              phase <= 5 ? 'border-orange-500/30 opacity-100' : 'border-white/10 opacity-0',
            )}
            style={{ maxHeight: phase <= 5 ? '140px' : '0px' }}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
              <p className="text-[11px] text-white">Skill Test: browser</p>
              <span
                className={clsx(
                  'rounded-full px-1.5 py-0.5 text-[11px] font-medium',
                  testPassed
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-amber-500/20 text-amber-300',
                )}
              >
                {testPassed ? 'PASS' : 'Running...'}
              </span>
            </div>
            <div className="p-2 font-mono text-xs leading-relaxed text-zinc-400">
              {consoleLines.slice(0, visibleLines).map((line, i) => (
                <p key={i} className={clsx(line.includes('✓') ? 'text-emerald-400' : line.includes('passed') ? 'text-emerald-300 font-medium' : '')}>
                  {line}
                </p>
              ))}
              {phase === 4 && <span className="typing-cursor">&nbsp;</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Firewall Diagram (animated sequence) ───

function FirewallDiagram() {
  const [phase, setPhase] = useState(0)
  const timerRef = useRef(null)

  // Phases:
  // 0: Empty form, cursor at entity name input
  // 1: Cursor types entity name "payroll_data"
  // 2: Cursor moves to policy textarea, types natural language policy
  // 3: Cursor clicks "Activate Firewall" — scan pulse animation
  // 4: Firewall active, audit log shows activation event
  // 5: Cursor moves to simulator, types test packet
  // 6: Runs simulation — "Blocked: SSN detected" result
  // 7: Blocked event appears in audit log, counter increments
  // 8: Hold, then reset

  const durations = [
    800,   // 0→1
    1400,  // 1→2
    2200,  // 2→3
    1000,  // 3→4
    1200,  // 4→5
    1600,  // 5→6
    1200,  // 6→7
    1400,  // 7→8
    2200,  // 8→0
  ]

  useEffect(() => {
    timerRef.current = setTimeout(
      () => setPhase((p) => (p + 1) % 9),
      durations[phase],
    )
    return () => clearTimeout(timerRef.current)
  }, [phase])

  const entityName = 'payroll_data'
  const typedEntity = phase >= 1 ? entityName.slice(0, Math.round(entityName.length * (phase >= 2 ? 1 : 0.7))) : ''

  const policyText = 'Never allow Social Security numbers, credit cards, or internal API keys to be sent to external endpoints or Slack channels.'
  const typedPolicy = phase >= 2 ? policyText.slice(0, Math.round(policyText.length * (phase >= 3 ? 1 : 0.6))) : ''

  const testPacket = 'Send employee SSN 123-45-6789 to #finance-updates channel'
  const typedPacket = phase >= 5 ? testPacket.slice(0, Math.round(testPacket.length * (phase >= 6 ? 1 : 0.5))) : ''

  const firewallActive = phase >= 4
  const simBlocked = phase >= 6
  const scanPulse = phase === 3 || phase === 4

  const auditEvents = []
  if (phase >= 4) auditEvents.push({ type: 'safe', msg: 'Firewall activated for "payroll_data".', time: '2:09 PM' })
  if (phase >= 7) auditEvents.push({ type: 'blocked', msg: 'Blocked: SSN detected in Slack payload.', time: '2:11 PM' })

  // Full-width layout, no sidebar. Header ~9%, form area below.
  const cursorPos = [
    { left: '22%', top: '16%' },   // 0: at entity name input
    { left: '35%', top: '16%' },   // 1: typing entity name
    { left: '35%', top: '36%' },   // 2: at policy textarea
    { left: '85%', top: '93%' },   // 3: at Activate Firewall button
    { left: '68%', top: '62%' },   // 4: at audit log area
    { left: '18%', top: '64%' },   // 5: at simulator test input
    { left: '14%', top: '76%' },   // 6: at Run Simulation button
    { left: '68%', top: '70%' },   // 7: at blocked event in audit log
    { left: '50%', top: '50%' },   // 8: hold center
  ]

  return (
    <div className="diagram-ui relative flex h-full select-none bg-[#0c0f14] text-[#edf1f7]">
      <PhaseCursor style={cursorPos[phase]} />

      {/* Scan pulse overlay */}
      {scanPulse && (
        <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
          <div
            className="absolute top-0 h-full w-[2px] bg-gradient-to-b from-transparent via-orange-400/60 to-transparent"
            style={{ animation: 'flow-right 0.8s ease-in-out' }}
          />
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
          <div>
            <h4 className="text-sm font-semibold text-white">Firewall Definition Zone</h4>
          </div>
          <div className="flex gap-1.5">
            <span className={clsx(
              'rounded-full border px-2 py-0.5 text-xs transition-all duration-300',
              'border-orange-500/40 bg-orange-500/10 text-orange-300',
            )}>
              Global Policy
            </span>
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-zinc-400">
              Assign to Agent
            </span>
          </div>
        </div>

        {/* Form area */}
        <div className="flex-1 overflow-hidden p-3">
          {/* Entity name + folder row */}
          <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <p className="mb-0.5 text-xs text-zinc-500">Entity Name</p>
              <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-300">
                {typedEntity || <span className="text-zinc-600">e.g. payroll.csv</span>}
                {phase === 1 && <span className="typing-cursor">&nbsp;</span>}
              </div>
            </div>
            <div>
              <p className="mb-0.5 text-xs text-zinc-500">Folder</p>
              <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-300">
                HR, Finance, Legal
              </div>
            </div>
          </div>

          {/* Policy textarea */}
          <div className="mb-2">
            <p className="mb-0.5 text-xs text-zinc-500">Content / Natural Language Policy</p>
            <div
              className={clsx(
                'min-h-[48px] rounded-lg border bg-white/5 px-2 py-1.5 font-mono text-[11px] leading-relaxed transition-all duration-300',
                phase === 2 ? 'border-orange-500/40' : 'border-white/10',
              )}
            >
              <span className="text-zinc-300">{typedPolicy}</span>
              {phase === 2 && <span className="typing-cursor">&nbsp;</span>}
              {!typedPolicy && <span className="text-zinc-600">Describe what should be blocked or allowed...</span>}
            </div>
          </div>

          {/* Bottom panels: Simulator + Audit Log */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {/* Simulator */}
            <div className={clsx(
              'rounded-xl border bg-white/[0.03] p-2 transition-all duration-300',
              phase === 5 || phase === 6 ? 'border-orange-500/30' : 'border-white/10',
            )}>
              <p className="mb-1 text-[11px] font-semibold text-white">Policy Simulator</p>
              <div className={clsx(
                'mb-1.5 rounded-lg border bg-white/5 px-2 py-1 text-xs transition-all duration-300',
                phase === 5 ? 'border-orange-500/30' : 'border-white/10',
              )}>
                <span className="text-zinc-300">{typedPacket}</span>
                {phase === 5 && <span className="typing-cursor">&nbsp;</span>}
                {!typedPacket && <span className="text-zinc-600">Paste test packet...</span>}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={clsx(
                    'rounded-lg px-2 py-0.5 text-xs font-medium transition-all duration-300',
                    phase === 6 ? 'bg-orange-500 text-white' : 'bg-orange-600/80 text-white',
                  )}
                >
                  {phase === 6 ? 'Simulating...' : 'Run Simulation'}
                </span>
                {simBlocked && (
                  <span className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[11px] text-rose-300">
                    Blocked: SSN detected
                  </span>
                )}
              </div>
            </div>

            {/* Audit Log */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[11px] font-semibold text-white">Live Audit Feed</p>
                <span className="text-[11px] text-zinc-500">{auditEvents.length} events</span>
              </div>
              <div className="space-y-1">
                {auditEvents.map((evt, i) => (
                  <div
                    key={i}
                    className={clsx(
                      'rounded-lg border px-2 py-1 transition-all duration-500',
                      evt.type === 'safe'
                        ? 'border-emerald-500/20 bg-emerald-500/5'
                        : 'border-rose-500/20 bg-rose-500/5',
                    )}
                  >
                    <p className={clsx('text-xs', evt.type === 'safe' ? 'text-emerald-300' : 'text-rose-300')}>
                      {evt.msg}
                    </p>
                    <p className="text-xs text-zinc-500">{evt.time}</p>
                  </div>
                ))}
                {auditEvents.length === 0 && (
                  <p className="text-xs text-zinc-600">No events yet. Activate a firewall to begin monitoring.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-white/10 px-3 py-2">
          <span
            className={clsx(
              'rounded-lg px-3 py-1 text-[11px] font-medium transition-all duration-500',
              firewallActive
                ? 'bg-emerald-600 text-white'
                : phase === 3
                  ? 'bg-orange-500 text-white scale-105'
                  : 'bg-orange-600 text-white',
            )}
          >
            {firewallActive ? '✓ Firewall Active' : 'Activate Firewall'}
          </span>
          {firewallActive && (
            <span className="ml-2 flex items-center gap-1 text-xs text-zinc-500">
              <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-400" />
              Monitoring
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Task Builder Diagram (animated sequence) ───

function TaskBuilderDiagram() {
  const [phase, setPhase] = useState(0)
  const timerRef = useRef(null)

  // Phases:
  // 0: Empty form, cursor at title input
  // 1: Types objective title
  // 2: Cursor moves to prompt textarea, types objective
  // 3: Cursor fills schedule fields (start, timezone, interval)
  // 4: Cursor selects assign target dropdown → "Expense Auditor"
  // 5: Cursor clicks "Schedule Task"
  // 6: Form collapses, task card appears with countdown timer
  // 7: Task status changes to "Running", progress bar fills
  // 8: Hold, then reset

  const durations = [
    800,   // 0→1
    1400,  // 1→2
    2000,  // 2→3
    1400,  // 3→4
    1000,  // 4→5
    1000,  // 5→6
    1800,  // 6→7
    1600,  // 7→8
    2200,  // 8→0
  ]

  useEffect(() => {
    timerRef.current = setTimeout(
      () => setPhase((p) => (p + 1) % 9),
      durations[phase],
    )
    return () => clearTimeout(timerRef.current)
  }, [phase])

  const title = 'Weekly expense audit report'
  const typedTitle = phase >= 1 ? title.slice(0, Math.round(title.length * (phase >= 2 ? 1 : 0.6))) : ''

  const prompt = 'Pull all receipts from the last 7 days, flag anything over $500 or missing a category, and post a summary to #finance.'
  const typedPrompt = phase >= 2 ? prompt.slice(0, Math.round(prompt.length * (phase >= 3 ? 1 : 0.5))) : ''

  const scheduleVisible = phase >= 3
  const targetSelected = phase >= 4
  const taskScheduled = phase >= 6
  const taskRunning = phase >= 7

  // Full-width, no sidebar. Two-column form (Intent | Schedule).
  const cursorPos = [
    { left: '15%', top: '24%' },   // 0: at title input (left col)
    { left: '30%', top: '24%' },   // 1: typing title
    { left: '15%', top: '48%' },   // 2: at prompt textarea
    { left: '62%', top: '28%' },   // 3: at schedule fields (right col)
    { left: '62%', top: '58%' },   // 4: at assign target dropdown
    { left: '10%', top: '93%' },   // 5: at Schedule Task button
    { left: '50%', top: '40%' },   // 6: watching task card appear
    { left: '55%', top: '60%' },   // 7: watching progress bar fill
    { left: '50%', top: '40%' },   // 8: hold
  ]

  return (
    <div className="diagram-ui relative flex h-full select-none bg-[#0c0f14] text-[#edf1f7]">
      <PhaseCursor style={cursorPos[phase]} />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-white/10 px-3 py-2">
          <h4 className="text-sm font-semibold text-white">Task Builder</h4>
          <p className="text-xs text-zinc-500">Define intent, schedule, and route through agents.</p>
        </div>

        <div className="flex-1 overflow-hidden p-3">
          {!taskScheduled ? (
            /* ── Creation form ── */
            <div className="grid h-full grid-cols-1 gap-2.5 sm:grid-cols-2">
              {/* Intent column */}
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                <p className="mb-1.5 text-[11px] font-semibold text-white">Intent</p>
                <div className="mb-2">
                  <p className="mb-0.5 text-[11px] text-zinc-500">Objective Title</p>
                  <div className={clsx(
                    'rounded-lg border bg-white/5 px-2 py-1 text-[11px] transition-all duration-300',
                    phase <= 1 ? 'border-orange-500/30' : 'border-white/10',
                  )}>
                    <span className="text-zinc-300">{typedTitle}</span>
                    {phase === 1 && <span className="typing-cursor">&nbsp;</span>}
                    {!typedTitle && <span className="text-zinc-600">e.g. Weekly governance summary</span>}
                  </div>
                </div>
                <div>
                  <p className="mb-0.5 text-[11px] text-zinc-500">Prompt / Objective</p>
                  <div className={clsx(
                    'min-h-[52px] rounded-lg border bg-white/5 px-2 py-1.5 text-xs leading-relaxed transition-all duration-300',
                    phase === 2 ? 'border-orange-500/30' : 'border-white/10',
                  )}>
                    <span className="text-zinc-400">{typedPrompt}</span>
                    {phase === 2 && <span className="typing-cursor">&nbsp;</span>}
                    {!typedPrompt && <span className="text-zinc-600">Describe the full task objective...</span>}
                  </div>
                </div>
              </div>

              {/* Schedule column */}
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                <p className="mb-1.5 text-[11px] font-semibold text-white">Schedule</p>
                <div className="space-y-1.5">
                  {[
                    { icon: '🗓', label: 'Start At', value: '03/06/2026, 09:00 AM' },
                    { icon: '🕒', label: 'Timezone', value: 'America/New_York' },
                    { icon: '⏱', label: 'Interval (min)', value: '10080' },
                  ].map((field) => (
                    <div key={field.label}>
                      <p className="mb-0.5 text-[11px] text-zinc-500">{field.icon} {field.label}</p>
                      <div className={clsx(
                        'rounded-lg border bg-white/5 px-2 py-0.5 text-xs transition-all duration-500',
                        scheduleVisible ? 'border-white/10 text-zinc-300' : 'border-white/5 text-zinc-600',
                      )}>
                        {scheduleVisible ? field.value : '-'}
                      </div>
                    </div>
                  ))}
                  <div>
                    <p className="mb-0.5 text-[11px] text-zinc-500">Assign Target</p>
                    <div className={clsx(
                      'rounded-lg border bg-white/5 px-2 py-0.5 text-xs transition-all duration-300',
                      phase === 4 ? 'border-orange-500/30 text-orange-300' : 'border-white/10',
                    )}>
                      {targetSelected ? (
                        <span className="text-zinc-300">Expense Auditor</span>
                      ) : (
                        <span className="text-zinc-600">Select agent or orchestration...</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ── Scheduled task card ── */
            <div className="flex flex-col gap-3">
              <p className="text-[11px] text-zinc-500">Scheduled Tasks</p>
              <div
                className={clsx(
                  'rounded-xl border p-3 transition-all duration-700',
                  taskRunning
                    ? 'border-emerald-500/30 shadow-lg shadow-emerald-500/10'
                    : 'border-white/10 bg-white/[0.03]',
                )}
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-white">{title}</p>
                  <span
                    className={clsx(
                      'rounded-full px-2 py-0.5 text-xs font-medium transition-all duration-500',
                      taskRunning
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-amber-500/20 text-amber-300',
                    )}
                  >
                    {taskRunning ? (
                      <span className="flex items-center gap-1">
                        <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-400" />
                        Running
                      </span>
                    ) : (
                      'Queued'
                    )}
                  </span>
                </div>
                <p className="mb-3 text-xs leading-snug text-zinc-500">{prompt}</p>

                {/* Progress bar */}
                <div className="mb-2">
                  <div className="mb-0.5 flex items-center justify-between">
                    <span className="text-[11px] text-zinc-500">
                      {taskRunning ? 'Running...' : 'Next run in 4m 30s'}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      {taskRunning ? '67%' : '0%'}
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-1000"
                      style={{ width: taskRunning ? '67%' : '0%' }}
                    />
                  </div>
                </div>

                {/* Meta grid */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: 'Interval', value: '10080m' },
                    { label: 'Repeats', value: '8' },
                    { label: 'Timezone', value: 'EST' },
                    { label: 'Target', value: 'Expense Auditor' },
                  ].map((field) => (
                    <div key={field.label}>
                      <p className="text-xs text-zinc-600">{field.label}</p>
                      <p className="text-xs text-zinc-400">{field.value}</p>
                    </div>
                  ))}
                </div>

                {/* Firewall badge */}
                <div className="mt-2 flex items-center gap-2">
                  <span className="flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 text-[11px] text-emerald-300">
                    🛡 Firewall
                  </span>
                  <span className="text-[11px] text-zinc-500">payroll_data policy active</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/10 px-3 py-2">
          <span
            className={clsx(
              'rounded-lg px-3 py-1 text-[11px] font-medium transition-all duration-500',
              phase === 5
                ? 'bg-orange-500 text-white scale-105'
                : taskScheduled
                  ? 'bg-zinc-700 text-zinc-400'
                  : 'bg-orange-600 text-white',
            )}
          >
            {phase === 5 ? 'Scheduling...' : taskScheduled ? '✓ Scheduled' : 'Schedule Task'}
          </span>
          {taskScheduled && (
            <span className="text-xs text-zinc-500">1 task active</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Feature Definitions ───

const features = [
  {
    title: 'Build agentic workflows',
    description:
      'Drag agents onto a visual canvas and wire them into orchestrations. Set delegation policies, risk ceilings, and approval gates - then execute with one click.',
    diagram: OrchestrationDiagram,
  },
  {
    title: 'Create and connect agents',
    description:
      'Spin up agents from any provider in seconds. Configure them, equip them with skills, and manage your entire fleet from one dashboard.',
    diagram: AgentsDiagram,
  },
  {
    title: 'Add any skill',
    description:
      'Browse 19+ built-in skills or import your own. Each skill connects via MCP and can be equipped to any agent with one click.',
    diagram: SkillsDiagram,
  },
  {
    title: 'Per-agent firewall rules',
    description:
      'Write security policies in plain language. Simulate them before activation, then monitor every decision in a live audit log.',
    diagram: FirewallDiagram,
  },
  {
    title: 'Schedule and deploy',
    description:
      'Define an objective, set a schedule, and route execution through any agent or orchestration. Tasks run autonomously with full governance.',
    diagram: TaskBuilderDiagram,
  },
]

// ─── Mobile: tab buttons ───

function MobileFeatures() {
  const [active, setActive] = useState(0)

  return (
    <div className="lg:hidden">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-4">
        {features.map((f, i) => (
          <button
            key={f.title}
            onClick={() => setActive(i)}
            className={clsx(
              'shrink-0 rounded-full px-4 py-1.5 text-sm whitespace-nowrap transition-colors',
              active === i
                ? 'bg-white font-semibold text-orange-600'
                : 'text-zinc-400 hover:bg-white/10',
            )}
          >
            {f.title}
          </button>
        ))}
      </div>
      <p className="mt-4 text-base text-white/90">{features[active].description}</p>
      <div className="mt-6 h-[340px] overflow-hidden rounded-xl shadow-xl shadow-orange-900/20 ring-1 ring-white/10">
        {(() => { const D = features[active].diagram; return <D /> })()}
      </div>
    </div>
  )
}

// ─── Desktop: scroll-driven sticky ───

function DesktopFeatures() {
  const wrapperRef = useRef(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const handleScroll = useCallback(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const rect = wrapper.getBoundingClientRect()
    const scrolled = -rect.top
    const totalScroll = wrapper.offsetHeight - window.innerHeight
    if (totalScroll <= 0) return
    const progress = Math.max(0, Math.min(1, scrolled / totalScroll))
    const index = Math.min(features.length - 1, Math.floor(progress * features.length))
    setActiveIndex(index)
  }, [])

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  const ActiveDiagram = features[activeIndex].diagram

  return (
    <div ref={wrapperRef} className="hidden lg:block" style={{ height: `${features.length * 100}vh` }}>
      <div className="sticky top-0 h-screen overflow-hidden">
        <section aria-label="Features for safer AI operations" className="relative flex h-full flex-col overflow-hidden bg-zinc-900">
          <Container className="relative flex flex-1 flex-col py-12">
            <div className="max-w-2xl md:mx-auto md:text-center xl:max-w-none">
              <h2 className="font-display text-3xl tracking-tight text-white sm:text-4xl md:text-5xl">One layer. Every agent. Full control.</h2>
              <p className="mt-4 text-lg tracking-tight text-zinc-400">Mayple is the only platform that combines a no-code UI, MCP support, a runtime firewall, and per-user rules - all in one place.</p>
            </div>
            <div className="mt-8 grid flex-1 grid-cols-12 items-stretch gap-8">
              <div className="col-span-5 flex flex-col justify-center">
                <nav className="space-y-1">
                  {features.map((feature, i) => (
                    <div key={feature.title} className={clsx('rounded-l-xl p-5 transition-all duration-300', activeIndex === i ? 'bg-white/10 ring-1 ring-white/10 ring-inset' : 'opacity-50 hover:opacity-75')}>
                      <h3 className="font-display text-lg text-white">{feature.title}</h3>
                      <p className={clsx('mt-2 overflow-hidden text-sm transition-all duration-300', activeIndex === i ? 'max-h-40 text-white opacity-100' : 'max-h-0 text-zinc-400 opacity-0')}>{feature.description}</p>
                    </div>
                  ))}
                </nav>
              </div>
              <div className="col-span-7 flex items-center">
                <div className="h-[400px] w-full overflow-hidden rounded-xl shadow-xl shadow-orange-900/20 ring-1 ring-white/10">
                  <ActiveDiagram />
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-center gap-2">
              {features.map((_, i) => (
                <div key={i} className={clsx('h-1 rounded-full transition-all duration-300', activeIndex === i ? 'w-8 bg-white' : 'w-2 bg-white/30')} />
              ))}
            </div>
          </Container>
        </section>
      </div>
    </div>
  )
}

// ─── Main Component ───

export function PrimaryFeatures() {
  return (
    <div id="features">
      <section className="relative overflow-hidden bg-zinc-900 py-20 sm:py-32 lg:hidden" aria-label="Features for safer AI operations">
        <Container className="relative">
          <div className="max-w-2xl md:mx-auto md:text-center xl:max-w-none">
            <h2 className="font-display text-3xl tracking-tight text-white sm:text-4xl md:text-5xl">One layer. Every agent. Full control.</h2>
            <p className="mt-6 text-lg tracking-tight text-zinc-400">Mayple is the only platform that combines a no-code UI, MCP support, a runtime firewall, and per-user rules - all in one place.</p>
          </div>
          <div className="mt-12"><MobileFeatures /></div>
        </Container>
      </section>
      <DesktopFeatures />
    </div>
  )
}
