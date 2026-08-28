/**
 * Handing a file to somebody, and letting them say where it goes.
 *
 * Two paths, because browsers disagree about whether a page may open a save
 * dialog. Chrome and Edge have the File System Access API, which shows the
 * ordinary "Save as" window: the reader picks the folder, sees the name before
 * it is written, and knows exactly where it went. Firefox and Safari do not,
 * and fall back to an anchor with a `download` attribute — the file lands in
 * whatever folder that browser has been told to use, usually Downloads, with
 * no dialog at all.
 *
 * The fallback is why the filename matters so much: when nobody is asked
 * where it goes, the name is the only thing that says which file this is.
 */

interface SaveFilePickerOptions {
  suggestedName?: string
  types?: { description: string; accept: Record<string, string[]> }[]
}
interface FileSystemWritable {
  write(data: Blob): Promise<void>
  close(): Promise<void>
}
interface FileSystemFileHandleLike {
  createWritable(): Promise<FileSystemWritable>
}
type PickerWindow = Window & {
  showSaveFilePicker?: (o: SaveFilePickerOptions) => Promise<FileSystemFileHandleLike>
}

export type SaveOutcome = 'saved' | 'cancelled' | 'downloaded'

/** Whether this browser can ask where to put a file. */
export const canChooseFolder = () =>
  typeof window !== 'undefined' &&
  typeof (window as PickerWindow).showSaveFilePicker === 'function'

export async function saveJsonFile(
  filename: string,
  contents: string,
): Promise<SaveOutcome> {
  const blob = new Blob([contents], { type: 'application/json' })
  const picker = (window as PickerWindow).showSaveFilePicker

  if (picker) {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [
          { description: 'Fairwater plan', accept: { 'application/json': ['.json'] } },
        ],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return 'saved'
    } catch (e) {
      // Closing the dialog is an answer, not a failure, and must not be
      // reported as one — nor quietly retried as a download the reader did
      // not ask for.
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // Anything else — a sandbox that exposes the API and refuses it, a
      // permission denied — falls through to the way that always works.
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // Revoked on a later tick: some browsers have not finished with the URL by
  // the time click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}
