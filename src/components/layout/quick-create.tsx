"use client";
import Link from "next/link";
import { Plus, Building2, FileText, Clapperboard, CheckSquare, BookOpenText, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownTrigger } from "@/components/ui/dropdown";

export function QuickCreate({ allowed }: { allowed?: string[] }) {
  const can = (m: string) => !allowed || allowed.includes(m);
  const entries = [
    { m: "clients", href: "/studio/clients?new=1", icon: Building2, label: "Client" },
    { m: "briefs", href: "/studio/briefs?new=1", icon: FileText, label: "Brief" },
    { m: "livrables", href: "/studio/livrables?new=1", icon: Clapperboard, label: "Livrable" },
    { m: "taches", href: "/studio/taches?new=1", icon: CheckSquare, label: "Tâche" },
    { m: "documents", href: "/studio/documents?new=1", icon: BookOpenText, label: "Document" },
    { m: "factures", href: "/studio/factures?new=1", icon: Receipt, label: "Facture" },
  ].filter((e) => can(e.m));
  if (!entries.length) return null;
  return (
    <Dropdown>
      <DropdownTrigger asChild><Button size="sm" className="mr-1 hidden sm:inline-flex"><Plus />Créer</Button></DropdownTrigger>
      <DropdownContent className="min-w-[200px]">
        <DropdownLabel>Nouveau</DropdownLabel>
        {entries.map((e) => <DropdownItem key={e.m} asChild><Link href={e.href}><e.icon />{e.label}</Link></DropdownItem>)}
      </DropdownContent>
    </Dropdown>
  );
}
