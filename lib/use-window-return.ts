'use client'

import { useEffect, useRef } from 'react'

/**
 * Tells a focus handler whether the focus is the browser handing the window
 * back, rather than someone choosing a field.
 *
 * The money boxes empty themselves when focused, so that typing replaces the
 * figure instead of merging into it. That is right when a person clicks a
 * field, and wrong when they switch to another window and come back: the
 * browser restores focus to whatever held it, the handler fires again, and the
 * figure they were part-way through vanishes.
 *
 * Returns a function that answers "was this focus caused by the window coming
 * back?" — true once, for the first focus after a return, and false after
 * that. Call it in `onFocus` and skip the clearing when it says yes.
 */
export function useWindowReturn(): () => boolean {
  const away = useRef(false)

  useEffect(() => {
    const left = () => {
      away.current = true
    }
    // Window blur covers switching app, tab and devtools alike; the visibility
    // change does not fire for every one of those on every platform.
    window.addEventListener('blur', left)
    return () => window.removeEventListener('blur', left)
  }, [])

  return () => {
    if (!away.current) return false
    away.current = false
    return true
  }
}
