"use client";
import Link from "next/link";
import { Plus, Building2, FileText, Clapperboard, CheckSquare, BookOpenText, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownTrigger } from "@/components/ui/dropdown";

export function QuickCreate({ clients }: { clients: Array<{ id: string; name: string }> }) {
  void clients;
  return (
    <Dropdown>
      <DropdownTrigger asChild><Button size="sm" className="mr-1 hidden sm:inline-flex"><Plus />Créer</Button></DropdownTrigger>
      <DropdownContent className="min-w-[200px]">
        <DropdownLabel>Nouveau</DropdownLabel>
        <DropdownItem asChild><Link href="/studio/clients?new=1"><Building2 />Client</Link></DropdownItem>
        <DropdownItem asChild><Link href="/studio/briefs?new=1"><FileText />Brief</Link></DropdownItem>
        <DropdownItem asChild><Link href="/studio/livrables?new=1"><Clapperboard />Livrable</Link></DropdownItem>
        <DropdownItem asChild><Link href="/studio/taches?new=1"><CheckSquare />Tâche</Link></DropdownItem>
        <DropdownItem asChild><Link href="/studio/documents?new=1"><BookOpenText />Document</Link></DropdownItem>
        <DropdownItem asChild><Link href="/studio/factures?new=1"><Receipt />Facture</Link></DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}
