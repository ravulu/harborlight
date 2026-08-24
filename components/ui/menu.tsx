'use client'

import { Menu as MenuPrimitive } from '@base-ui/react/menu'

import { cn } from '@/lib/utils'

const Menu = MenuPrimitive.Root
const MenuTrigger = MenuPrimitive.Trigger

/**
 * A list of things to go to or do, anchored to what opened it.
 *
 * A menu rather than a popover: the items are choices, so arrow keys should
 * move between them and Escape should close without following one. Base UI
 * gives that for free and hand-rolled markup does not.
 */
function MenuContent({
  className,
  sideOffset = 8,
  align = 'end',
  ...props
}: MenuPrimitive.Popup.Props & {
  sideOffset?: number
  align?: MenuPrimitive.Positioner.Props['align']
}) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        sideOffset={sideOffset}
        align={align}
        className="z-50"
      >
        <MenuPrimitive.Popup
          className={cn(
            'min-w-[13rem] rounded-lg border border-border bg-card p-1.5 text-card-foreground shadow-lg transition-[opacity,scale] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0',
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

function MenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return (
    <MenuPrimitive.Item
      className={cn(
        'flex w-full cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm text-foreground outline-none data-highlighted:bg-muted',
        className,
      )}
      {...props}
    />
  )
}

function MenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      className={cn('my-1.5 h-px bg-border', className)}
      {...props}
    />
  )
}

export { Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator }
