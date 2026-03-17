'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { MaypleCharacter } from '@/components/MaypleCharacter'

const SCROLL_THRESHOLD = 300
const BOB_DECAY = 0.92
const LOOK_RESET_MS = 2000

export function MaypleMascot() {
  const [entered, setEntered] = useState(false)
  const [visible, setVisible] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [lookOffset, setLookOffset] = useState(null)
  const bobRef = useRef(0)
  const lastScrollRef = useRef(0)
  const frameRef = useRef(null)
  const mascotRef = useRef(null)
  const wrapperRef = useRef(null)
  const lookTimerRef = useRef(null)
  const hasRolledRef = useRef(false)

  // Scroll handling — entry + bob
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let ticking = false

    function onScroll() {
      if (ticking) return
      ticking = true

      requestAnimationFrame(() => {
        const scrollY = window.scrollY
        const delta = scrollY - lastScrollRef.current
        lastScrollRef.current = scrollY

        if (scrollY > SCROLL_THRESHOLD) {
          if (!entered) {
            setEntered(true)
            // Trigger roll after entry fall completes (800ms)
            if (!hasRolledRef.current) {
              hasRolledRef.current = true
              setTimeout(() => setRolling(true), 900)
            }
          }
          setVisible(true)
        } else {
          setVisible(false)
        }

        bobRef.current += delta * 0.15
        bobRef.current *= BOB_DECAY
        bobRef.current = Math.max(-8, Math.min(8, bobRef.current))

        if (mascotRef.current) {
          mascotRef.current.style.transform = `translateY(${bobRef.current}px)`
        }

        ticking = false
      })
    }

    function settleBob() {
      if (Math.abs(bobRef.current) > 0.1) {
        bobRef.current *= BOB_DECAY
        if (mascotRef.current) {
          mascotRef.current.style.transform = `translateY(${bobRef.current}px)`
        }
      }
      frameRef.current = requestAnimationFrame(settleBob)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    frameRef.current = requestAnimationFrame(settleBob)

    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frameRef.current)
    }
  }, [entered])

  // Click look-at — eyes follow user clicks
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    function onDocClick(e) {
      // Don't look-at if click was on the mascot itself (that triggers bounce)
      if (wrapperRef.current && wrapperRef.current.contains(e.target)) return

      const el = wrapperRef.current
      if (!el) return

      const rect = el.getBoundingClientRect()
      const mascotCenterX = rect.left + rect.width / 2
      const mascotCenterY = rect.top + rect.height / 2

      const dx = e.clientX - mascotCenterX
      const dy = e.clientY - mascotCenterY
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < 1) return

      // Normalize and scale to ±1.5 max
      const scale = Math.min(1.5, dist / 200)
      setLookOffset({
        x: (dx / dist) * scale,
        y: (dy / dist) * scale,
      })

      // Reset eyes to center after 2s
      clearTimeout(lookTimerRef.current)
      lookTimerRef.current = setTimeout(() => {
        setLookOffset(null)
      }, LOOK_RESET_MS)
    }

    document.addEventListener('click', onDocClick, true)
    return () => {
      document.removeEventListener('click', onDocClick, true)
      clearTimeout(lookTimerRef.current)
    }
  }, [])

  return (
    <div
      ref={wrapperRef}
      className={clsx(
        'pointer-events-none fixed z-40 hidden lg:block',
        entered ? 'right-8 bottom-8' : 'right-8 top-20',
      )}
      style={{
        opacity: visible ? 1 : 0,
        transition: entered
          ? 'opacity 0.4s ease-out, top 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), bottom 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)'
          : 'opacity 0.3s ease-out',
      }}
    >
      <div
        ref={mascotRef}
        className={clsx(
          'pointer-events-auto',
          rolling && 'mayple-roll',
        )}
        onAnimationEnd={(e) => {
          if (e.animationName === 'mayple-roll') setRolling(false)
        }}
      >
        <MaypleCharacter size={44} lookOffset={lookOffset} />
      </div>
    </div>
  )
}
