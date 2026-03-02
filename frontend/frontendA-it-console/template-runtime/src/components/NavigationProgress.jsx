'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export function NavigationProgress() {
  const pathname = usePathname()
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)
  const prevPathname = useRef(pathname)
  const hideTimer = useRef(null)
  const tickInterval = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      const anchor = e.target.closest('a[href]')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (
        !href ||
        href.startsWith('http') ||
        href.startsWith('#') ||
        href === pathname
      )
        return
      clearTimeout(hideTimer.current)
      clearInterval(tickInterval.current)
      setVisible(true)
      setProgress(15)
      tickInterval.current = setInterval(() => {
        setProgress((p) => {
          if (p >= 90) {
            clearInterval(tickInterval.current)
            return 90
          }
          return p + (90 - p) * 0.1
        })
      }, 300)
    }
    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [pathname])

  useEffect(() => {
    if (pathname !== prevPathname.current) {
      prevPathname.current = pathname
      clearInterval(tickInterval.current)
      setProgress(100)
      hideTimer.current = setTimeout(() => {
        setVisible(false)
        setProgress(0)
      }, 200)
    }
    return () => clearTimeout(hideTimer.current)
  }, [pathname])

  if (!visible) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5">
      <div
        className="h-full bg-orange-500 transition-all duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}
