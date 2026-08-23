/**
 * Formatting for the money inputs. Shared so every box that takes an amount
 * groups thousands and moves the caret the same way, wherever it appears.
 */

export const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v))

export function withThousands(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '')
  const [rawInt = '', ...rest] = cleaned.split('.')
  // Typing over a field that already holds 0 would otherwise leave the zero in
  // front: "0" then "2000" reading as 02,000.
  const intPart = rawInt.replace(/^0+(?=\d)/, '')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  if (rest.length === 0) return grouped
  return `${grouped}.${rest.join('').replace(/\D/g, '').slice(0, 2)}`
}

/** How many digits precede the caret, separators ignored. */
export const significantBefore = (value: string, caret: number) =>
  value.slice(0, caret).replace(/[^\d.]/g, '').length

/** The offset that sits after `n` digits of the formatted string. */
export function caretAfter(formatted: string, n: number): number {
  if (n <= 0) return 0
  let seen = 0
  for (let i = 0; i < formatted.length; i++) {
    if (/[\d.]/.test(formatted[i])) seen++
    if (seen === n) return i + 1
  }
  return formatted.length
}
