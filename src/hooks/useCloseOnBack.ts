import { useEffect, useRef } from 'react'

// ponytail: panel-scoped back-close. If other dialogs need it, extract a modal
// stack manager — window popstate fires on every listener, so N dialogs = N closes.
export function useCloseOnBack(onClose: () => void) {
  const cb = useRef(onClose)
  cb.current = onClose // keep latest without re-running the mount effect
  const pushed = useRef(false)
  const backTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    clearTimeout(backTimer.current) // StrictMode remount: cancel the phantom-cleanup back()
    if (!pushed.current) {
      window.history.pushState({ dialogOpen: true }, '')
      pushed.current = true
    }
    const onPop = () => cb.current()
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // Defer so StrictMode's immediate remount can cancel a phantom unmount.
      // Real close via X/Escape/action → synthetic entry still on top → pop it.
      // Back-close → entry already popped, state.dialogOpen gone → skip.
      backTimer.current = setTimeout(() => {
        if (window.history.state?.dialogOpen) window.history.back()
      })
    }
  }, [])
}
