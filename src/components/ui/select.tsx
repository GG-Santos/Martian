"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import { cn } from "cn"

function Select(props: SelectPrimitive.Root.Props<string>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectTrigger({ className, children, ...props }: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn("flex h-10 w-full min-w-0 items-center justify-between gap-2 border border-input bg-input/30 px-3 text-left text-sm text-foreground outline-none transition-colors hover:bg-input/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20", className)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon render={<ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />} />
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({ className, children, sideOffset = 4, ...props }: SelectPrimitive.Popup.Props & { sideOffset?: number }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner side="bottom" align="end" alignItemWithTrigger={false} sideOffset={sideOffset} className="z-50 outline-none">
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn("max-h-(--available-height) min-w-(--anchor-width) overflow-y-auto border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none", className)}
          {...props}
        >
          <SelectPrimitive.ScrollUpArrow className="flex justify-center py-1 text-muted-foreground"><ChevronUpIcon aria-hidden="true" className="size-4" /></SelectPrimitive.ScrollUpArrow>
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectPrimitive.ScrollDownArrow className="flex justify-center py-1 text-muted-foreground"><ChevronDownIcon aria-hidden="true" className="size-4" /></SelectPrimitive.ScrollDownArrow>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectValue(props: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn("relative flex min-h-9 cursor-default items-center py-2 pr-9 pl-2 text-sm outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50", className)}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2 flex size-4 items-center justify-center text-primary"><CheckIcon aria-hidden="true" className="size-4" /></SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

type SelectFieldProps = Omit<React.ComponentProps<"select">, "size"> & {
  size?: "sm" | "default"
}

function SelectField({ className, children, size = "default", value, defaultValue, onChange, name, required, disabled, id, ...props }: SelectFieldProps) {
  const options = React.Children.toArray(children).filter(React.isValidElement) as React.ReactElement<React.ComponentProps<"option">>[]
  const items = options.map((option) => ({ value: String(option.props.value ?? option.props.children), label: option.props.children }))
  return (
    <div data-slot="select-field" data-size={size} className={cn("w-full", className)}>
      <Select
        items={items}
        name={name}
        required={required}
        disabled={disabled}
        value={value == null ? undefined : String(value)}
        defaultValue={defaultValue == null ? undefined : String(defaultValue)}
        onValueChange={(nextValue) => onChange?.({ target: { value: String(nextValue ?? "") } } as React.ChangeEvent<HTMLSelectElement>)}
      >
        <SelectTrigger id={id} aria-label={props["aria-label"]} aria-describedby={props["aria-describedby"]} aria-invalid={props["aria-invalid"]} className="shadcn-select-trigger">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="shadcn-select-popup">
          {items.map((item) => <SelectItem key={item.value} value={item.value} className="shadcn-select-item">{item.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

export { Select, SelectTrigger, SelectContent, SelectValue, SelectItem, SelectField }
