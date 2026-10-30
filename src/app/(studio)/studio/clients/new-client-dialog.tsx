"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { SEGMENTS, type ClientSegment } from "@/lib/data/types";
import { useAction } from "@/lib/hooks/use-action";
import { createClient } from "@/lib/actions/clients";

export function NewClientDialog({ open }: { open: boolean }) {
  const router = useRouter();
  const { exec, pending } = useAction();
  const [error, setError] = useState<string | null>(null);
  const close = () => router.replace("/studio/clients");
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null);
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    if (!name) { setError("Le nom du client est requis."); return; }
    const num = (k: string) => Number(String(f.get(k) ?? "0").replace(",", ".")) || 0;
    const res = await exec(() => createClient({
      name, sector: String(f.get("sector") ?? "").trim() || undefined, segment: (f.get("segment") as ClientSegment) || "ecommerce",
      contact_email: String(f.get("contact_email") ?? "").trim() || undefined, website: String(f.get("website") ?? "").trim() || undefined,
      city: String(f.get("city") ?? "").trim() || undefined, monthly_budget: num("monthly_budget"), retainer: num("retainer"), performance_fee_pct: num("performance_fee_pct"),
    }), { success: "Client créé · onboarding lancé", refresh: false });
    if (res.ok) router.push(`/studio/clients/${res.data.id}`);
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent title="Nouveau client" description="La fiche est créée en onboarding. Aucune invitation n'est envoyée.">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Nom de la marque" required><Input name="name" autoFocus placeholder="Lashéa" maxLength={120} required /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Segment"><NativeSelect name="segment" defaultValue="ecommerce">{Object.entries(SEGMENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Field>
            <Field label="Secteur"><Input name="sector" placeholder="Cosmétique, skincare…" /></Field>
            <Field label="Email de contact"><Input name="contact_email" type="email" placeholder="contact@marque.fr" /></Field>
            <Field label="Site web"><Input name="website" type="url" placeholder="https://" /></Field>
            <Field label="Ville"><Input name="city" placeholder="Paris" /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Budget ads / mois (€)"><Input name="monthly_budget" type="number" min={0} step={100} placeholder="15000" /></Field>
            <Field label="Retainer (€)"><Input name="retainer" type="number" min={0} step={50} placeholder="2500" /></Field>
            <Field label="Fee performance (%)"><Input name="performance_fee_pct" type="number" min={0} max={100} step={0.5} placeholder="8" /></Field>
          </div>
          {error ? <p className="text-[13px] text-danger" role="alert">{error}</p> : null}
          <DialogFooter><Button type="button" variant="ghost" onClick={close}>Annuler</Button><Button type="submit" loading={pending}>Créer le client</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
