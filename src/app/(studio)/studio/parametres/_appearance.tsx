"use client";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/hooks/use-local-pref";
import { cn } from "@/lib/utils";

export function AppearancePicker() {
  const [theme, setTheme] = useTheme();
  const opts = [{ v: "dark" as const, label: "Sombre", icon: Moon, desc: "Le studio tel que conçu." }, { v: "light" as const, label: "Clair", icon: Sun, desc: "Pour les écrans en plein jour." }];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {opts.map((o) => (
        <button key={o.v} type="button" onClick={() => setTheme(o.v)} aria-pressed={theme === o.v} className={cn("flex items-start gap-3 rounded-xl border p-4 text-left transition", theme === o.v ? "border-accent/50 bg-accent-soft" : "border-border hover:border-border-strong")}>
          <span className={cn("flex size-9 items-center justify-center rounded-lg", o.v === "dark" ? "bg-[#0f1216] text-white" : "bg-white text-[#0b0f14] hairline")}><o.icon className="size-4" /></span>
          <span><span className="block text-[14px] font-medium">{o.label}</span><span className="block text-[12.5px] text-muted">{o.desc}</span></span>
        </button>
      ))}
    </div>
  );
}
