import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-display font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 hover:shadow-xl hover:-translate-y-0.5 glow-primary",
        destructive:
          "bg-destructive text-destructive-foreground shadow-lg hover:bg-destructive/90 hover:shadow-xl hover:-translate-y-0.5",
        outline:
          "border-2 border-input bg-background/50 backdrop-blur-sm shadow-sm hover:bg-accent hover:text-accent-foreground hover:border-accent hover:shadow-md hover:-translate-y-0.5",
        secondary:
          "bg-secondary text-secondary-foreground shadow-lg hover:bg-secondary/80 hover:shadow-xl hover:-translate-y-0.5",
        ghost: "hover:bg-accent/10 hover:text-accent-foreground hover:-translate-y-0.5",
        link: "text-primary underline-offset-4 hover:underline hover:text-primary/80",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    (<Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />)
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
