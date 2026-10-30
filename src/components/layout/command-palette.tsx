"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowRight, Building2, FileText, Clapperboard, BookOpenText, Search } from "lucide-react";
import type { NavGroup } from "./nav";
import { Kbd } from "@/components/ui/misc";

export interface PaletteItem { id: string; label: string; hint?: string; href: string; group: "Clients" | "Briefs" | "Livrables" | "Documents" | "Actions" }
const groupIcon = { Clients: Building2, Briefs: FileText, Livrables: Clapperboard, Documents: BookOpenText, Actions: ArrowRight } as const;

export function CommandPalette({ open, onOpenChange, nav, items }: { open: boolean; onOpenChange: (o: boolean) => void; nav: NavGroup[]; items: PaletteItem[] }) {
  const router = useRouter();
  const go = (href: string) => { onOpenChange(false); router.push(href); };
  const groups = React.useMemo(() => {
    const m = new Map<string, PaletteItem[]>();
    items.forEach((i) => m.set(i.group, [...(m.get(i.group) ?? []), i]));
    return [...m.entries()];
  }, [items]);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px] animate-fade-in" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[12vh] z-[60] w-[calc(100%-32px)] max-w-[620px] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-pop animate-rise focus:outline-none">
          <DialogPrimitive.Title className="sr-only">Recherche</DialogPrimitive.Title>
          <Command label="Recherche globale" className="flex flex-col" filter={(value, search) => (value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(search.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")) ? 1 : 0)}>
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="size-4 text-muted" />
              <Command.Input autoFocus placeholder="Rechercher un client, un brief, un document… ou naviguer" className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-2" />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="max-h-[52vh] overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-2">
              <Command.Empty className="px-3 py-10 text-center text-[13px] text-muted">Aucun résultat.</Command.Empty>
              <Command.Group heading="Navigation">
                {nav.flatMap((g) => g.items).map((item) => (
                  <Command.Item key={item.href} value={`nav ${item.label}`} onSelect={() => go(item.href)} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] data-[selected=true]:bg-surface-2">
                    <item.icon className="size-4 text-muted" /><span>{item.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
              {groups.map(([group, list]) => {
                const Icon = groupIcon[group as keyof typeof groupIcon];
                return (
                  <Command.Group key={group} heading={group}>
                    {list.map((i) => (
                      <Command.Item key={i.id} value={`${group} ${i.label} ${i.hint ?? ""}`} onSelect={() => go(i.href)} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] data-[selected=true]:bg-surface-2">
                        <Icon className="size-4 text-muted" /><span className="truncate">{i.label}</span>{i.hint ? <span className="ml-auto truncate text-[12px] text-muted">{i.hint}</span> : null}
                      </Command.Item>
                    ))}
                  </Command.Group>
                );
              })}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
