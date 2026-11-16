"use client";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { closeTaskAction } from "@/lib/actions/marketing-crm";

export function DoneButton({ id, title }: { id: string; title: string }) {
  const { exec, pending } = useAction();
  return <Button size="icon-sm" variant="secondary" loading={pending} aria-label={`Marquer « ${title} » comme faite`} onClick={() => exec(() => closeTaskAction(id, "faite"), { success: "Tâche terminée." })}><Check /></Button>;
}

/** Administrateur : regarder l'espace d'un membre de l'équipe. */
export function MemberPicker({ members, value }: { members: Array<{ id: string; name: string; role: string }>; value: string }) {
  const router = useRouter();
  return (
    <label className="flex min-w-0 items-center gap-2 text-[12.5px] text-muted"><span className="shrink-0">Espace de</span>
      <NativeSelect value={value} onChange={(e) => router.push(`/marketing/espace?membre=${e.target.value}`)} className="h-9 w-auto min-w-0 max-w-[46vw] sm:max-w-none">{members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.role ? ` · ${m.role}` : ""}</option>)}</NativeSelect>
    </label>
  );
}
