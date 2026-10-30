import * as React from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return <kbd className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-2 px-1.5 font-mono text-[10.5px] font-medium text-muted", className)}>{children}</kbd>;
}

export function Skeleton({ className }: { className?: string }) { return <div className={cn("skeleton h-4 w-full", className)} />; }

export function Separator({ className, vertical }: { className?: string; vertical?: boolean }) {
  return <div role="separator" className={cn(vertical ? "w-px self-stretch bg-border" : "h-px w-full bg-border", className)} />;
}

export function EmptyState({ icon: Icon, title, description, action, className, compact }: { icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode; className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-4 py-8" : "px-6 py-16", className)}>
      {Icon ? <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-surface-2 text-muted hairline"><Icon className="size-5" /></div> : null}
      <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-[13px] text-muted text-balance">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions, className, crumbs }: { eyebrow?: string; title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string; crumbs?: Array<{ label: string; href?: string }> }) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between animate-rise", className)}>
      <div className="min-w-0">
        {crumbs?.length ? (
          <nav className="mb-2 flex items-center gap-1 text-[12.5px] text-muted" aria-label="Fil d'Ariane">
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 ? <ChevronRight className="size-3.5 opacity-60" /> : null}
                {c.href ? <Link href={c.href} className="hover:text-fg transition">{c.label}</Link> : <span className="text-fg-2">{c.label}</span>}
              </React.Fragment>
            ))}
          </nav>
        ) : null}
        {eyebrow ? <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-2"><span className="size-1.5 rounded-full bg-accent" />{eyebrow}</div> : null}
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] leading-tight md:text-[30px]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-[14px] text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Stat({ label, value, delta, hint, icon: Icon, tone = "neutral", className }: { label: string; value: React.ReactNode; delta?: { value: string; positive?: boolean }; hint?: string; icon?: LucideIcon; tone?: "neutral" | "accent" | "warning" | "danger"; className?: string }) {
  return (
    <div className={cn("card relative overflow-hidden p-4.5 p-5", className)}>
      {tone === "accent" ? <div className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-accent/15 blur-2xl" /> : null}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-muted">{label}</span>
        {Icon ? <Icon className={cn("size-4", tone === "accent" ? "text-accent-2" : tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : "text-muted-2")} /> : null}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[26px] font-semibold tracking-[-0.03em] tabular leading-none">{value}</span>
        {delta ? <span className={cn("text-[12px] font-medium tabular", delta.positive === false ? "text-danger" : delta.positive ? "text-success" : "text-muted")}>{delta.value}</span> : null}
      </div>
      {hint ? <p className="mt-1.5 text-[12px] text-muted-2">{hint}</p> : null}
    </div>
  );
}

export function Progress({ value, className, tone = "accent" }: { value: number; className?: string; tone?: "accent" | "warning" | "danger" | "info" }) {
  const color = { accent: "bg-accent", warning: "bg-warning", danger: "bg-danger", info: "bg-info" }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className={cn("w-full text-[13.5px]", className)} {...props} />
      </div>
    </div>
  );
}
export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("h-10 border-b border-border bg-surface-2/60 px-4 text-left text-[11.5px] font-semibold uppercase tracking-wider text-muted first:pl-5 last:pr-5", className)} {...props} />;
}
export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-b border-border px-4 py-3 align-middle first:pl-5 last:pr-5 [tr:last-child_&]:border-0", className)} {...props} />;
}
export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-surface-2/50", className)} {...props} />;
}
