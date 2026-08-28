'use client'

import { useRef, useState } from 'react'
import { Download, Trash2, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { saveJsonFile } from '@/lib/download'
import { isLocal } from '@/lib/persistence'
import { record } from '@/lib/usage'
import {
  UnreadableFileError,
  exportFilename,
  exportPlans,
  forgetLocal,
  importPlans,
  requireStore,
  type PlanSummary,
} from '@/lib/store'

/**
 * What a reader can do with figures kept on their own machine.
 *
 * Three things, and each answers an objection rather than adding a feature.
 *
 * **Forget** is the one this could not ship without. `lib/holdings-store.ts`
 * removed browser storage in the first place because "a browser that remembers
 * somebody's house, their debts and their income shows all of it to whoever
 * opens it next — a shared machine, a family laptop, a library". Storing
 * deliberately is only defensible if undoing it takes one step and does not
 * mean hunting through browser settings.
 *
 * **Download** is the answer to a new laptop, to cleared site data, to a
 * browser reinstalled, and to "can you help me with my plan" when nobody at
 * this end can look it up. In cloud mode the database is the backup; here
 * there is none, and a plan somebody spent an evening on should not die with a
 * browser update.
 *
 * **Import** is the other end of that, and it adds rather than replaces —
 * there is no undo on a machine we do not control.
 */
export function LocalData({
  plans,
  onChanged,
}: {
  plans: PlanSummary[]
  /** Re-read after anything here changes what is stored. */
  onChanged: () => void | Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // Cloud mode has an account doing all of this, and none of these controls
  // would mean anything there.
  if (!isLocal) return null

  const download = async () => {
    setBusy(true)
    try {
      const file = await exportPlans(requireStore())
      const name = exportFilename(file.savedAt)
      const outcome = await saveJsonFile(name, JSON.stringify(file, null, 2))
      if (outcome === 'cancelled') {
        // Opening the dialog and closing it is not taking a copy, and
        // counting it as one would report a backup nobody has.
        setNote(null)
      } else {
        record('copy_downloaded')
        const count = `${file.plans.length} plan${file.plans.length === 1 ? '' : 's'}`
        setNote(
          outcome === 'saved'
            ? `${count} written to the file you chose.`
            : // No dialog was shown, so say where it went and what it is
              // called — that is all the reader has to go on.
              `${count} saved as ${name}, in this browser's downloads folder.`,
        )
      }
    } catch {
      setNote('Could not build the file. Your plans are still here.')
    } finally {
      setBusy(false)
    }
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      const report = await importPlans(requireStore(), JSON.parse(await file.text()))
      record('copy_imported')
      await onChanged()
      const added = `${report.added} plan${report.added === 1 ? '' : 's'} added`
      const skipped = report.skipped > 0 ? `, ${report.skipped} skipped` : ''
      const household =
        report.household === 'adopted' ? ', and your details were filled in' : ''
      setNote(`${added}${skipped}${household}. Nothing already here was replaced.`)
    } catch (e) {
      setNote(
        e instanceof UnreadableFileError
          ? e.message
          : 'That file could not be read. Nothing was changed.',
      )
    } finally {
      setBusy(false)
      // Cleared so choosing the same file again still fires a change event.
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const forget = async () => {
    setBusy(true)
    try {
      forgetLocal(window.localStorage)
      // After it happened, not when the button was first pressed: the
      // confirmation step exists precisely because some of those presses are
      // reconsidered, and counting them would say the opposite of the truth.
      record('storage_forgotten')
      await onChanged()
      setConfirming(false)
      setNote('Everything has been removed from this browser.')
    } finally {
      setBusy(false)
    }
  }

  const stored = plans.length

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-xs text-muted-foreground text-pretty">
          <span className="font-medium text-foreground">
            {stored === 0
              ? 'Nothing is stored in this browser yet.'
              : `${stored} plan${stored === 1 ? '' : 's'} stored in this browser.`}
          </span>{' '}
          {stored === 0
            ? 'Plans you save are kept inside this browser, not as a file, and are not sent anywhere.'
            : 'They are kept inside this browser rather than as a file — “Download a copy” is what makes one. They are not sent anywhere and will not follow you to another computer or another browser, and anyone else using this one can open them.'}
        </p>

        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || stored === 0}
            onClick={download}
          >
            <Download className="size-3.5" /> Download a copy
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="size-3.5" /> Import a file
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          {stored > 0 &&
            (confirming ? (
              <>
                <Button size="sm" variant="destructive" disabled={busy} onClick={forget}>
                  Forget everything
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  No
                </Button>
              </>
            ) : (
              /* Asked before doing it: there is no undo, and no copy anywhere
                 else unless they made one. */
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => setConfirming(true)}
              >
                <Trash2 className="size-3.5" /> Forget
              </Button>
            ))}
        </div>
      </div>

      {confirming && (
        <p className="text-xs text-destructive text-pretty">
          This removes every plan and your details from this browser, and there
          is no way back unless you have downloaded a copy first.
        </p>
      )}
      {note && !confirming && (
        <p className="text-xs text-muted-foreground text-pretty">{note}</p>
      )}
    </div>
  )
}
