'use client'

import { useEffect, useRef } from 'react'
import clsx from 'clsx'

export function ScrollReveal({ children, className, delay = 0, ...props }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (delay) {
            setTimeout(() => el.classList.add('revealed'), delay)
          } else {
            el.classList.add('revealed')
          }
          observer.unobserve(el)
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [delay])

  return (
    <div ref={ref} className={clsx('reveal', className)} {...props}>
      {children}
    </div>
  )
}
