"use client";
import * as React from "react";
import * as TP from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export const TooltipProvider = TP.Provider;
export function Tooltip({ children, label, side = "top", className }: { children: React.ReactNode; label: React.ReactNode; side?: "top" | "bottom" | "left" | "right"; className?: string }) {
  return (
    <TP.Root delayDuration={250}>
      <TP.Trigger asChild>{children}</TP.Trigger>
      <TP.Portal>
        <TP.Content side={side} sideOffset={6} className={cn("z-50 rounded-md bg-fg px-2.5 py-1.5 text-xs font-medium text-bg shadow-pop animate-fade-in", className)}>
          {label}
        </TP.Content>
      </TP.Portal>
    </TP.Root>
  );
}
