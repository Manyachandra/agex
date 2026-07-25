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
  const target = parseFloat(value) || 0
  // First paint shows the real number — no 0 → N flash that feels like late data.
  const [display, setDisplay] = useState(target)
  const firstPaint = useRef(true)

  useEffect(() => {
    if (firstPaint.current) {
      firstPaint.current = false
      setDisplay(target)
      return
    }

    if (duration <= 0) {
      setDisplay(target)
      return
    }

    const start = display
    const startTime = performance.now()
    let raf = 0
    const tick = (now) => {
      const progress = Math.min((now - startTime) / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3)
      setDisplay(start + (target - start) * ease)
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- animate from last displayed value
  }, [value, duration, target])

  return (
    <span>
      {prefix}{typeof decimals === 'number' ? display.toFixed(decimals) : Math.floor(display)}{suffix}
    </span>
  )
}