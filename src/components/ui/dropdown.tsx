"use client";
import * as React from "react";
import * as DM from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dropdown = DM.Root;
export const DropdownTrigger = DM.Trigger;
export const DropdownSeparator = () => <DM.Separator className="my-1 h-px bg-border" />;
export const DropdownLabel = ({ children }: { children: React.ReactNode }) => <DM.Label className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">{children}</DM.Label>;

export function DropdownContent({ className, align = "end", ...props }: React.ComponentPropsWithoutRef<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content align={align} sideOffset={6} className={cn("z-50 min-w-[180px] rounded-lg border border-border bg-surface p-1 shadow-pop animate-fade-in", className)} {...props} />
    </DM.Portal>
  );
}
export function DropdownItem({ className, danger, ...props }: React.ComponentPropsWithoutRef<typeof DM.Item> & { danger?: boolean }) {
  return <DM.Item className={cn("flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none transition data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted", danger && "text-danger [&_svg]:text-danger", className)} {...props} />;
}
export function DropdownCheckItem({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof DM.CheckboxItem>) {
  return (
    <DM.CheckboxItem className={cn("flex cursor-pointer select-none items-center gap-2 rounded-md py-1.5 pl-7 pr-2 text-[13px] outline-none data-[highlighted]:bg-surface-2 relative", className)} {...props}>
      <DM.ItemIndicator className="absolute left-2"><Check className="size-3.5" /></DM.ItemIndicator>
      {children}
    </DM.CheckboxItem>
  );
}
