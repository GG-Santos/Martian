import { cn } from "cn"

function Alert({ className, variant = "default", ...props }: React.ComponentProps<"div"> & { variant?: "default" | "destructive" }) {
  return <div role="alert" data-slot="alert" data-variant={variant} className={cn("relative w-full border px-4 py-3 text-sm", variant === "destructive" ? "border-destructive/50 text-destructive" : "border-border text-foreground", className)} {...props} />
}

export { Alert }
