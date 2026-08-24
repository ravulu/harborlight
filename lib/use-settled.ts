'use client'

import { useEffect, useState } from 'react'

/**
 * The value once it has stopped changing for `ms`.
 *
 * Keeps expensive work off the typing path. Both the planner and the savings
 * estimator run thousands of simulated markets on every change, which is felt
 * as stickiness if it happens between one keystroke and the next — settling
 * first costs one recompute per pause instead of one per character.
 *
 * The whole set of figures is held back rather than the simulation alone, so
 * what is on screen stays consistent with itself instead of some tiles moving
 * while others lag.
 *
 * The timeout also means the state change is never synchronous inside the
 * effect, which would loop.
 */
export function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return settled
}
