import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: "default" | "secondary" | "ghost" | "danger";
};

const variants = {
  default: "neu-btn-primary text-sm font-medium px-4 py-2.5",
  secondary: "neu-btn text-sm font-medium px-4 py-2.5 text-foreground",
  ghost: "rounded-xl text-sm font-medium px-3 py-2 text-muted-foreground hover:bg-foreground/5 transition-colors",
  danger: "neu-btn text-sm font-medium px-4 py-2.5 text-red-500"
};

export function Button({ className, variant = "default", asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-xl transition-all disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
