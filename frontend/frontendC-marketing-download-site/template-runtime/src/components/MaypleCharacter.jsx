'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import clsx from 'clsx'

export function MaypleCharacter({
  size = 32,
  animate = true,
  lookOffset = null,
  className,
  ...props
}) {
  const [blinking, setBlinking] = useState(false)
  const [winking, setWinking] = useState(false)
  const [bouncing, setBouncing] = useState(false)
  const timerRef = useRef(null)
  const gradientId = useId().replace(/:/g, '')

  // Eye offset — clamped to ±1.5px
  const ex = lookOffset ? Math.max(-1.5, Math.min(1.5, lookOffset.x)) : 0
  const ey = lookOffset ? Math.max(-1.5, Math.min(1.5, lookOffset.y)) : 0

  // Randomised blink every 3-6s
  const scheduleBlink = useCallback(() => {
    const delay = 3000 + Math.random() * 3000
    timerRef.current = setTimeout(() => {
      setBlinking(true)
      setTimeout(() => {
        setBlinking(false)
        scheduleBlink()
      }, 180)
    }, delay)
  }, [])

  useEffect(() => {
    if (!animate) return
    scheduleBlink()
    return () => clearTimeout(timerRef.current)
  }, [animate, scheduleBlink])

  // Random wink (separate from blink) every 8-15s
  useEffect(() => {
    if (!animate) return
    let winkTimer
    function scheduleWink() {
      const delay = 8000 + Math.random() * 7000
      winkTimer = setTimeout(() => {
        setWinking(true)
        setTimeout(() => {
          setWinking(false)
          scheduleWink()
        }, 300)
      }, delay)
    }
    scheduleWink()
    return () => clearTimeout(winkTimer)
  }, [animate])

  function handleClick() {
    if (!animate || bouncing) return
    setBouncing(true)
  }

  return (
    <div
      className={clsx(
        'inline-flex cursor-pointer select-none',
        animate && 'mayple-breathe',
        bouncing && 'mayple-bounce',
        className,
      )}
      onClick={handleClick}
      onAnimationEnd={(e) => {
        if (e.animationName === 'mayple-bounce') setBouncing(false)
      }}
      {...props}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={gradientId} cx="45%" cy="38%" r="55%">
            <stop offset="0%" stopColor="#ffb366" />
            <stop offset="100%" stopColor="#e8740c" />
          </radialGradient>
        </defs>

        {/* Head */}
        <circle cx="16" cy="14" r="12" fill={`url(#${gradientId})`} />

        {/* Left eye */}
        <ellipse
          cx={12 + ex}
          cy={12 + ey}
          rx="1.8"
          ry={blinking || winking ? 0.3 : 2.2}
          fill="#111"
          style={{ transition: 'cx 0.3s ease-out, cy 0.3s ease-out, ry 0.1s ease-in-out' }}
        />
        {/* Right eye */}
        <ellipse
          cx={20 + ex}
          cy={12 + ey}
          rx="1.8"
          ry={blinking ? 0.3 : 2.2}
          fill="#111"
          style={{ transition: 'cx 0.3s ease-out, cy 0.3s ease-out, ry 0.1s ease-in-out' }}
        />

        {/* Eye highlights (hide when blinking/winking) */}
        <circle
          cx={12.6 + ex}
          cy={11.2 + ey}
          r="0.7"
          fill="#fff"
          opacity={blinking || winking ? 0 : 1}
          style={{ transition: 'cx 0.3s ease-out, cy 0.3s ease-out, opacity 0.08s' }}
        />
        <circle
          cx={20.6 + ex}
          cy={11.2 + ey}
          r="0.7"
          fill="#fff"
          opacity={blinking ? 0 : 1}
          style={{ transition: 'cx 0.3s ease-out, cy 0.3s ease-out, opacity 0.08s' }}
        />

        {/* Cheeks */}
        <ellipse cx="9" cy="16" rx="2.4" ry="1.6" fill="#ff9966" opacity="0.5" />
        <ellipse cx="23" cy="16" rx="2.4" ry="1.6" fill="#ff9966" opacity="0.5" />

        {/* Mouth */}
        <path
          d="M13 17.5 Q16 20 19 17.5"
          stroke="#111"
          strokeWidth="0.8"
          fill="none"
          strokeLinecap="round"
        />

        {/* Feet — wobble when animated */}
        <ellipse
          cx="11"
          cy="27"
          rx="3.5"
          ry="2.2"
          fill="#d06800"
          className={animate ? 'mayple-foot-left' : undefined}
        />
        <ellipse
          cx="21"
          cy="27"
          rx="3.5"
          ry="2.2"
          fill="#d06800"
          className={animate ? 'mayple-foot-right' : undefined}
        />
      </svg>
    </div>
  )
}
