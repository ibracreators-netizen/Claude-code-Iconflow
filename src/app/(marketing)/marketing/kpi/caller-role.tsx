"use client";
import Link from "next/link";
import { PhoneCall } from "lucide-react";
import { useAction } from "@/lib/hooks/use-action";
import { setCallerRoleAction } from "@/lib/actions/marketing";
import type { CallerRole } from "@/lib/marketing/invite-errors";
import { cn } from "@/lib/utils";
import { BTN_PRIMARY, BTN_SECONDARY } from "../paiements/parts";

/**
 * KPI › Saisie des KPI, pour un compte agence (administrateur, responsable) sans rôle d'appel : choisir « closer » ou
 * « setter » pour saisir ses chiffres avec les bons champs et apparaître dans les KPI. Le compte garde tous ses droits.
 */
export function CallerRoleCard({ me, admin }: { me: string; admin: boolean }) {
  const { exec, pending } = useAction();
  const pick = (role: CallerRole) => exec(() => setCallerRoleAction(me, role), { success: `Rôle d'appel enregistré : ${role === "closer" ? "closer" : "setter"}.` });
  return (
    <section aria-labelledby="caller-role-title" className="mb-8 rounded-[12px] border border-mk-line bg-surface px-4 py-4 shadow-soft lg:mb-6 lg:px-6 lg:py-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 id="caller-role-title" className="flex items-center gap-2 text-[17px] font-semibold text-mk-strong lg:text-[16px]"><PhoneCall className="size-[18px] text-accent-2" strokeWidth={2} aria-hidden />Tu fais aussi des appels ?</h2>
          <p className="mt-0.5 max-w-2xl text-[14px] leading-snug text-mk-sub">Choisis ton rôle d&apos;appel pour saisir tes chiffres et apparaître dans les KPI. {admin ? "Tu restes administrateur." : "Tu gardes tous tes droits."}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0">
          <button type="button" disabled={pending} onClick={() => pick("closer")} className={cn(BTN_PRIMARY, "h-12 w-full text-[16px] sm:w-auto lg:h-10 lg:text-[14px]")}>Je suis closer</button>
          <button type="button" disabled={pending} onClick={() => pick("setter")} className={cn(BTN_SECONDARY, "h-12 w-full text-[16px] sm:w-auto lg:h-10 lg:text-[14px]")}>Je suis setter</button>
        </div>
      </div>
      <p className="mt-3 text-[13px] text-mk-sub">
        {admin
          ? <Link href="/marketing/reglages/equipe" className="font-medium text-mk-link hover:underline">Changer plus tard dans Réglages › Équipe et accès</Link>
          : "Ensuite, l'administrateur peut le changer dans Réglages › Équipe et accès."}
      </p>
    </section>
  );
}
