import { useEffect, useRef, useState } from 'react'

export function ScrollReveal({ children, delay = 0, style = {} }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(32px)',
      transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms`,
      ...style
    }}>
      {children}
    </div>
  )
}

export function CountUp({ value, prefix = '', suffix = '', decimals = 0, duration = 1200 }) {
  const [display, setDisplay] = useState(0)
  const ref = useRef(null)
  const startedRef = useRef(false)

  const hasValue = parseFloat(value) > 0

  useEffect(() => {
    if (!hasValue) return
    const el = ref.current
    if (!el) return
    const animate = () => {
      startedRef.current = true
      const target = parseFloat(value) || 0
      const startTime = performance.now()
      const tick = (now) => {
        const progress = Math.min((now - startTime) / duration, 1)
        const ease = 1 - Math.pow(1 - progress, 3)
        setDisplay(ease * target)
        if (progress < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        animate()
        observer.disconnect()
      }
    }, { threshold: 0.3 })

    // If already visible in DOM, animate directly
    const rect = el.getBoundingClientRect()
    const alreadyVisible = rect.top < window.innerHeight && rect.bottom > 0
    if (alreadyVisible) {
      animate()
    } else {
      observer.observe(el)
    }

    return () => observer.disconnect()
  }, [value, hasValue, duration])

  return (
    <span ref={ref}>
      {prefix}{typeof decimals === 'number' ? display.toFixed(decimals) : Math.floor(display)}{suffix}
    </span>
  )
}