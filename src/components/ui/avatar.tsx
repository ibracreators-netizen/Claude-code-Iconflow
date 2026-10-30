import * as React from "react";
import { cn, initials } from "@/lib/utils";

const palette = ["bg-accent-soft text-accent-2", "bg-info/15 text-info", "bg-violet/15 text-violet", "bg-warning/15 text-warning", "bg-danger/15 text-danger"];
function hue(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return palette[h % palette.length]; }

export function Avatar({ name, src, size = 32, className, square }: { name: string; src?: string | null; size?: number; className?: string; square?: boolean }) {
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} style={style} className={cn("object-cover shrink-0", square ? "rounded-md" : "rounded-full", className)} />;
  }
  return (
    <span style={style} className={cn("inline-flex shrink-0 items-center justify-center font-semibold tracking-tight", square ? "rounded-md" : "rounded-full", hue(name), className)} aria-hidden>
      {initials(name) || "?"}
    </span>
  );
}

export function AvatarStack({ names, size = 24, max = 4 }: { names: string[]; size?: number; max?: number }) {
  const shown = names.slice(0, max);
  return (
    <span className="inline-flex items-center -space-x-2">
      {shown.map((n, i) => <Avatar key={n + i} name={n} size={size} className="ring-2 ring-surface" />)}
      {names.length > max ? <span className="ml-1 text-xs text-muted">+{names.length - max}</span> : null}
    </span>
  );
}
