'use client'

import { CircleQuestionMark } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/**
 * One field named and explained, for the panels that cover several.
 *
 * A section popover that runs as unbroken prose makes the reader find their
 * own field in it; naming each one lets them skip to the row they are stuck
 * on, which is the only row they opened the panel for.
 */
export function Field({
  name,
  children,
}: {
  name: string
  children: React.ReactNode
}) {
  return (
    <p>
      <span className="font-medium text-foreground">{name}</span> — {children}
    </p>
  )
}

/**
 * The short explanation behind a label.
 *
 * Every heading on this page has room for two or three words, and behind most
 * of them sits a rule, an acronym, or a figure someone has to go and look up.
 * What it means, what it is not, and where to find your own number all have to
 * live somewhere, and a panel that opens on a press is the only place that
 * does not cost the heading its shape.
 *
 * Shared between the input sections and the result tiles so the two cannot
 * drift into explaining the same thing differently.
 */
export function InfoTip({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`What ${label} means`}
        className={
          className ??
          'ml-auto rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
        }
      >
        <CircleQuestionMark className="size-4" />
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col gap-2 text-xs leading-relaxed text-muted-foreground">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {children}
        </div>
      </PopoverContent>
    </Popover>
  )
}
