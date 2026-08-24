'use client'

import { Popover as PopoverPrimitive } from '@base-ui/react/popover'

import { cn } from '@/lib/utils'

const Popover = PopoverPrimitive.Root
const PopoverTrigger = PopoverPrimitive.Trigger

/**
 * A small panel anchored to what opened it.
 *
 * A popover rather than a tooltip on purpose: a tooltip appears on hover, and
 * a phone has no hover — so anything explained only in a tooltip is explained
 * only to people using a mouse. This opens on a press and stays until it is
 * dismissed, which works the same everywhere.
 */
function PopoverContent({
  className,
  sideOffset = 8,
  align = 'start',
  ...props
}: PopoverPrimitive.Popup.Props & {
  sideOffset?: number
  align?: PopoverPrimitive.Positioner.Props['align']
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        sideOffset={sideOffset}
        align={align}
        className="z-50"
      >
        <PopoverPrimitive.Popup
          className={cn(
            // Capped to the viewport with the body scrolling inside: a panel
            // explaining half a dozen fields is taller than a phone.
            'max-h-[min(26rem,calc(100dvh-6rem))] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-lg border border-border bg-card p-3.5 text-card-foreground shadow-lg transition-[opacity,scale] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0',
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverTrigger, PopoverContent }
