'use client'

import { useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { sendFeedback } from '@/app/actions/feedback'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MessageSquare, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const MAX = 4000

/**
 * A way to say something about the app from wherever you are in it.
 *
 * The page is captured rather than asked for: someone reporting that a figure
 * looks wrong should not also have to describe where they saw it.
 */
export function FeedbackDialog({ className }: { className?: string }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, startTransition] = useTransition()

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const res = await sendFeedback(message, email, pathname)
      if (!res.ok) {
        setError(res.error ?? 'That did not send. Try again in a moment.')
        return
      }
      setSent(true)
      setMessage('')
      setEmail('')
      // Long enough to read the confirmation, short enough not to strand them.
      setTimeout(() => {
        setSent(false)
        setOpen(false)
      }, 1600)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setError(null)
          setSent(false)
        }
      }}
    >
      <DialogTrigger
        className={cn(
          'cursor-pointer text-sm text-muted-foreground transition-colors hover:text-foreground',
          className,
        )}
      >
        Feedback
      </DialogTrigger>
      <DialogContent aria-label="Send feedback">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg font-medium">
            Tell us what you think
          </DialogTitle>
          <DialogDescription>
            A figure that looks wrong, something you could not find, anything
            missing. We read all of it.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="feedbackMessage" className="text-xs text-muted-foreground">
              Your message
            </Label>
            <textarea
              id="feedbackMessage"
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX))}
              rows={6}
              placeholder="What happened, and what you expected instead."
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <p className="text-xs text-muted-foreground/70">
              {message.length} of {MAX.toLocaleString()} characters
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="feedbackEmail" className="text-xs text-muted-foreground">
              Email <span className="text-muted-foreground/60">— only if you want a reply</span>
            </Label>
            <Input
              id="feedbackEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="h-9"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button
            variant="ghost"
            size="lg"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            size="lg"
            className="gap-2 px-4"
            onClick={submit}
            disabled={pending || sent || !message.trim()}
          >
            {sent ? (
              <>
                <Check className="size-4" /> Thank you
              </>
            ) : (
              <>
                <MessageSquare className="size-4" />
                {pending ? 'Sending…' : 'Send feedback'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
