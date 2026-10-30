import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium leading-5 whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "bg-surface-3 text-fg-2",
      accent: "bg-accent-soft text-accent-2 dark:text-accent",
      success: "bg-success/15 text-success",
      warning: "bg-warning/15 text-warning",
      danger: "bg-danger/15 text-danger",
      info: "bg-info/15 text-info",
      violet: "bg-violet/15 text-violet",
      outline: "border border-border-strong text-fg-2",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> { dot?: boolean }

export function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

/* Statuts métier → ton */
export type Tone = NonNullable<BadgeProps["tone"]>;
export const STATUS_TONE: Record<string, Tone> = {
  // briefs
  redaction: "neutral", attente_ibra: "warning", attente_client: "info", valide: "success", archived: "outline",
  // livrables
  en_controle: "warning", correction: "danger",
  // clients
  onboarding: "info", active: "success", paused: "neutral",
  // management
  in_progress: "accent", completed: "success",
  // tasks
  a_faire: "neutral", en_cours: "accent", revue: "violet", termine: "success",
  // invoices
  brouillon: "neutral", envoyee: "info", payee: "success", en_retard: "danger", annulee: "outline",
  // health
  excellent: "success", bon: "accent", attention: "warning", risque: "danger",
  // priority
  basse: "neutral", normale: "info", haute: "warning", urgente: "danger",
  // brain kinds
  fait: "success", allegation: "warning", conflit: "danger", manque: "violet", note: "neutral",
};
