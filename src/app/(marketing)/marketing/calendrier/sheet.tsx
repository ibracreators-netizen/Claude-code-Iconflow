"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Feuille qui monte du bas de l'écran (téléphone), comme dans LeadConnector. Avec `dialog`, elle devient une fenêtre
 * centrée sur ordinateur. Accessible : titre, Échap, focus gardé dedans.
 */
export function Sheet({ open, onOpenChange, title, description, children, footer, dialog }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode; dialog?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content className={cn("fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] w-full max-w-[640px] flex-col rounded-t-2xl bg-surface pb-[max(env(safe-area-inset-bottom),10px)] shadow-pop focus:outline-none data-[state=open]:animate-rise",
          dialog && "lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:max-h-[calc(100dvh-48px)] lg:max-w-[480px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-xl lg:pb-0")}>
          <div className={cn("mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-mk-input", dialog && "lg:hidden")} aria-hidden />
          <div className={cn("flex items-start gap-3 px-5 pb-1 pt-3", dialog && "lg:border-b lg:border-mk-line lg:pb-3 lg:pt-4")}>
            <div className="min-w-0 flex-1 pt-1.5">
              <DialogPrimitive.Title className={cn("truncate text-[18px] font-semibold text-mk-strong", dialog && "lg:text-[16px]")}>{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className={cn("mt-0.5 text-[14px] text-mk-sub", dialog && "lg:text-[13px]")}>{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close aria-label="Fermer" className="-mr-2 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-mk-icon transition hover:bg-mk-chip"><X className="size-5" /></DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">{children}</div>
          {footer ? <div className={cn("flex gap-3 border-t border-mk-line px-5 pt-3", dialog && "lg:justify-end lg:pb-4")}>{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Ligne de choix dans une feuille : icône, libellé, information, coche. */
export function SheetOption({ selected, onSelect, leading, label, meta }: { selected?: boolean; onSelect: () => void; leading?: React.ReactNode; label: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={!!selected} onClick={onSelect}
      className={cn("flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left text-[16px] text-mk-strong transition hover:bg-mk-chip/60 active:bg-mk-chip", selected && "font-semibold")}>
      {leading}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta !== undefined ? <span className="shrink-0 text-[14px] text-mk-sub tabular">{meta}</span> : null}
      <Check className={cn("size-5 shrink-0 text-accent-2", !selected && "invisible")} strokeWidth={2.2} />
    </button>
  );
}
