"use client";
import * as React from "react";
import { Link2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { saveDashboardUrl } from "@/lib/actions/integrations";

/** Saisie de l'URL du tableau de bord externe d'un client (Looker Studio, Meta…), enregistrée sur la fiche client. */
export function DashboardUrlDialog({ clientId, url, variant = "edit" }: { clientId: string; url: string | null; variant?: "edit" | "add" }) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(url ?? "");
  const { exec, pending } = useAction();
  // La valeur repart de l'URL enregistrée à chaque ouverture (pas d'effet : réinitialisation dans le geste d'ouverture).
  const openDialog = () => { setValue(url ?? ""); setOpen(true); };

  const save = async (next: string | null) => {
    const r = await exec(() => saveDashboardUrl(clientId, next), { success: next ? "Tableau de bord enregistré." : "Tableau de bord retiré." });
    if (r.ok) setOpen(false);
  };

  return (
    <>
      {variant === "add"
        ? <Button size="sm" onClick={openDialog}><Link2 />Relier un tableau de bord</Button>
        : <Button size="sm" variant="ghost" onClick={openDialog}><Pencil />Modifier l&apos;URL</Button>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Tableau de bord du client" description="L'adresse d'un rapport Looker Studio, Meta ou autre. Il s'affiche en plein cadre sur cette page.">
          <form onSubmit={(e) => { e.preventDefault(); void save(value.trim() || null); }} className="space-y-4">
            <Field label="URL du tableau de bord (Looker Studio, Meta…)" hint="Looker Studio : Fichier → Intégrer le rapport → copie l'adresse. Un lien de rapport classique est converti automatiquement.">
              <Input type="url" inputMode="url" placeholder="https://lookerstudio.google.com/embed/reporting/…" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
            </Field>
            <DialogFooter className="flex-wrap">
              {url ? <Button type="button" variant="danger" onClick={() => save(null)} disabled={pending} className="mr-auto">Retirer</Button> : null}
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
              <Button type="submit" loading={pending} disabled={!value.trim()}>Enregistrer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
