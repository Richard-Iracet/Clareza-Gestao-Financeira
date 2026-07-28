import { useEffect, useRef } from 'react'

export default function useDialogAccessibility(onClose, { closeOnEscape = true } = {}) {
  const ref = useRef(null); const previousFocus = useRef(null)
  useEffect(() => {
    previousFocus.current = document.activeElement
    const focusable = () => [...(ref.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])') || [])]
    focusable()[0]?.focus()
    const keydown = (event) => { if (event.key === 'Escape' && closeOnEscape) { event.preventDefault(); onClose?.(); return } if (event.key !== 'Tab') return; const items = focusable(); if (!items.length) return; const first = items[0]; const last = items[items.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() } }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); previousFocus.current?.focus?.() }
  }, [onClose, closeOnEscape])
  return ref
}
