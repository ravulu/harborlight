'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

/**
 * Ends the session when the browser is closed, whatever the browser thinks.
 *
 * The session cookie already carries no expiry, which is the correct way to
 * ask for this. Chromium ignores it: with "continue where you left off" set —
 * and after any self-restart, such as an update — it restores session cookies
 * on the next launch, so the cookie outlives the browser it was meant to die
 * with.
 *
 * It does not restore sessionStorage. That makes sessionStorage a marker for
 * "this browser run": present means the tab belongs to a run that has already
 * been vouched for, absent means either a brand new tab or a browser that has
 * started afresh carrying a resurrected cookie.
 *
 * Telling those two apart is what the channel is for. A tab with no marker
 * asks whether anything else is open; a live tab answers. An answer means the
 * browser was already running, so this is simply a new tab. Silence means
 * nothing was running, and the cookie should not have survived.
 *
 * A timestamp in localStorage cannot do this job: localStorage survives a
 * browser restart too, so a close and immediate reopen would look identical to
 * a second tab.
 */
const MARKER = 'fairwater_run'
const CHANNEL = 'fairwater_tabs'
/** Long enough for an open tab to answer, short enough not to be felt. */
const ANSWER_MS = 400

function open(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL)
  } catch {
    return null
  }
}

/**
 * Vouches for the browser run that is signing in.
 *
 * Called by the form the moment credentials are accepted. Without it the first
 * page load after signing in finds no marker and no other tab, and the guard
 * correctly concludes the cookie was resurrected — signing the user straight
 * back out of the session they just created.
 */
export function markSignedIn() {
  try {
    window.sessionStorage.setItem(MARKER, '1')
  } catch {}
}

export function SessionGuard({ isAuthed }: { isAuthed: boolean }) {
  const router = useRouter()

  useEffect(() => {
    if (!isAuthed) return

    let vouched = false
    try {
      vouched = window.sessionStorage.getItem(MARKER) === '1'
    } catch {
      // Storage unavailable: better to stay signed in than to sign someone out
      // because their browser would not answer a question.
      return
    }

    const channel = open()
    // Answer other tabs for as long as this one is open, but only once this
    // tab is itself part of a vouched-for run.
    const listen = (e: MessageEvent) => {
      if (e.data === 'anyone-there?' && vouched) channel?.postMessage('yes')
    }
    channel?.addEventListener('message', listen)

    let timer: ReturnType<typeof setTimeout> | undefined
    if (!vouched) {
      if (!channel) {
        // No way to ask. Assume a new tab rather than sign someone out on a
        // browser that cannot answer.
        markSignedIn()
        vouched = true
      } else {
        const heard = (e: MessageEvent) => {
          if (e.data !== 'yes') return
          markSignedIn()
          vouched = true
          clearTimeout(timer)
        }
        channel.addEventListener('message', heard)
        channel.postMessage('anyone-there?')
        timer = setTimeout(() => {
          channel.removeEventListener('message', heard)
          if (vouched) return
          void authClient.signOut().then(() => router.refresh())
        }, ANSWER_MS)
      }
    }

    return () => {
      clearTimeout(timer)
      channel?.removeEventListener('message', listen)
      channel?.close()
    }
  }, [isAuthed, router])

  return null
}
