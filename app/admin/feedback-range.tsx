'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { feedbackInRange, type FeedbackHit } from '@/app/actions/admin'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CalendarRange } from 'lucide-react'
import { cn } from '@/lib/utils'

/** A calendar day as the date inputs want it, in the reader's own zone. */
function isoDay(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return isoDay(d)
}

const PRESETS: { label: string; from: () => string; to: () => string }[] = [
  { label: 'Today', from: () => daysAgo(0), to: () => daysAgo(0) },
  { label: 'Last 7 days', from: () => daysAgo(6), to: () => daysAgo(0) },
  { label: 'Last 30 days', from: () => daysAgo(29), to: () => daysAgo(0) },
  { label: 'All time', from: () => '', to: () => '' },
]

export function FeedbackRange() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [rows, setRows] = useState<FeedbackHit[] | null>(null)
  const [shown, setShown] = useState<{ from: string; to: string }>({ from: '', to: '' })
  const [pending, startTransition] = useTransition()

  const load = useCallback((f: string, t: string) => {
    startTransition(async () => {
      setRows(await feedbackInRange(f, t))
      setShown({ from: f, to: t })
    })
  }, [])

  // Everything, newest first, before a range is chosen.
  useEffect(() => {
    load('', '')
  }, [load])

  // Backwards is a slip, not a query: nothing can fall between them, and an
  // empty list would look like nobody has written rather than like a mistake.
  const backwards = !!from && !!to && from > to

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    const f = p.from()
    const t = p.to()
    setFrom(f)
    setTo(t)
    load(f, t)
  }

  const activePreset = PRESETS.find(
    (p) => p.from() === shown.from && p.to() === shown.to,
  )

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex flex-col gap-1 border-b border-border p-5">
        <h2 className="font-serif text-lg font-medium text-foreground">Feedback</h2>
        <p className="text-sm text-muted-foreground">
          Newest first. Both dates are inclusive — leave either blank for no
          bound on that end.
        </p>
      </div>

      <form
        className="flex flex-col gap-3 border-b border-border p-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (!backwards) load(from, to)
        }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="feedbackFrom" className="text-xs text-muted-foreground">
              From
            </Label>
            <Input
              id="feedbackFrom"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 w-44"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="feedbackTo" className="text-xs text-muted-foreground">
              To
            </Label>
            <Input
              id="feedbackTo"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 w-44"
            />
          </div>
          <Button
            type="submit"
            size="lg"
            className="gap-2 px-4"
            disabled={pending || backwards}
          >
            <CalendarRange className="size-4" />
            {pending ? 'Loading…' : 'Show range'}
          </Button>
          {(from || to) && (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={() => {
                setFrom('')
                setTo('')
                load('', '')
              }}
            >
              Clear
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.label}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPreset(p)}
              className={cn(
                activePreset?.label === p.label &&
                  'border-primary/40 bg-accent/50 text-foreground',
              )}
            >
              {p.label}
            </Button>
          ))}
        </div>

        {backwards && (
          <p role="alert" className="text-sm text-destructive">
            The start is after the end — nothing can fall between them.
          </p>
        )}
      </form>

      <div className="flex flex-col">
        <p className="border-b border-border px-5 py-2.5 text-xs text-muted-foreground">
          {rows === null
            ? 'Loading…'
            : `${rows.length} ${rows.length === 1 ? 'note' : 'notes'}${
                shown.from || shown.to
                  ? ` from ${shown.from || 'the beginning'} to ${shown.to || 'now'}`
                  : ', all time'
              }`}
        </p>
        {rows === null ? null : rows.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            Nothing was written in that range.
          </p>
        ) : (
          rows.map((r) => (
            <article
              key={r.id}
              className="flex flex-col gap-2 border-b border-border p-5 last:border-0"
            >
              <p className="text-sm text-foreground text-pretty whitespace-pre-wrap">
                {r.message}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="tabular-nums">
                  {new Date(r.createdAt).toLocaleString()}
                </span>
                <span aria-hidden>·</span>
                {/* Distinguished, because they mean different things: one is
                    who they were signed in as, the other is where they asked
                    to be replied to. */}
                <span>
                  {r.ownerEmail ? (
                    <>
                      account{' '}
                      <span className="text-foreground/80">{r.ownerEmail}</span>
                    </>
                  ) : (
                    'signed out'
                  )}
                </span>
                {r.email && r.email !== r.ownerEmail && (
                  <>
                    <span aria-hidden>·</span>
                    <span>
                      reply to{' '}
                      <a
                        href={`mailto:${r.email}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {r.email}
                      </a>
                    </span>
                  </>
                )}
                {r.path && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="font-mono">{r.path}</span>
                  </>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </Card>
  )
}
