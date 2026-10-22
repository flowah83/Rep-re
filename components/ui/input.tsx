import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn("field", className)} {...props} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn("area", className)} {...props} />;
});
