import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("neu-card p-0", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 py-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-base font-semibold", className)} {...props} />;
}

type CardContentProps =
  | (React.HTMLAttributes<HTMLDivElement> & { as?: "div" })
  | (React.FormHTMLAttributes<HTMLFormElement> & { as: "form" });

export function CardContent({ as, className, ...props }: CardContentProps) {
  if (as === "form") {
    return <form className={cn("px-6 pb-5 pt-0", className)} {...(props as React.FormHTMLAttributes<HTMLFormElement>)} />;
  }
  return <div className={cn("px-6 pb-5 pt-0", className)} {...(props as React.HTMLAttributes<HTMLDivElement>)} />;
}
