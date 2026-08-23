/**
 * The email to put back in the sign-in box, for anyone who asked.
 *
 * Deliberately not a session. The session cookie now dies with the browser, so
 * closing the app signs you out; this only saves retyping an address next
 * time. It holds no credential and grants nothing — someone who reads it
 * learns who uses this machine, which is what "remember me" has always meant.
 *
 * A cookie rather than localStorage so the sign-in page can read it while
 * rendering and put it straight into the field, with no flash of an empty box
 * and no state set from an effect.
 */
export const REMEMBERED_EMAIL_COOKIE = 'harborlight_email'
const MAX_AGE = 60 * 60 * 24 * 365

const secure = () =>
  typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''

export function rememberEmail(email: string) {
  try {
    document.cookie = `${REMEMBERED_EMAIL_COOKIE}=${encodeURIComponent(
      email.slice(0, 254),
    )}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure()}`
  } catch {}
}

export function forgetEmail() {
  try {
    document.cookie = `${REMEMBERED_EMAIL_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure()}`
  } catch {}
}

/** Parses an untrusted cookie value; anything unusable reads as absent. */
export function parseRememberedEmail(raw: string | undefined): string {
  if (!raw) return ''
  try {
    const value = decodeURIComponent(raw).trim()
    return value.length <= 254 && value.includes('@') ? value : ''
  } catch {
    return ''
  }
}
