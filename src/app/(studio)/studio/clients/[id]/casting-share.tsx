"use client";
import * as React from "react";
import { Check, Copy, ExternalLink, Globe, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAction } from "@/lib/hooks/use-action";
import { shareCasting, revokeShare } from "@/lib/actions/avatars";

/** Partage public du casting d'un client : crée un lien accessible sans compte, le copie, ou le retire. */
export function CastingShare({ clientId, link: initial }: { clientId: string; link: { id: string; token: string } | null }) {
  const [open, setOpen] = React.useState(false);
  const [link, setLink] = React.useState(initial);
  const [confirmOff, setConfirmOff] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const { exec, pending } = useAction();
  const [seen, setSeen] = React.useState(initial);
  if (seen?.token !== initial?.token) { setSeen(initial); setLink(initial); } // suit la valeur serveur après rafraîchissement

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = link ? `${origin}/casting/${link.token}` : "";

  const publish = () => exec(() => shareCasting(clientId), { success: "Lien public créé.", refresh: false, onSuccess: (l) => setLink({ id: l.id, token: l.token }) });
  const unpublish = () => { if (link) void exec(() => revokeShare(link.id, clientId), { success: "Lien public retiré.", refresh: false, onSuccess: () => { setLink(null); setConfirmOff(false); } }); };
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* le champ reste sélectionnable */ } };

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)} aria-label="Partager le casting"><Globe />{link ? "Partagé" : "Partager"}</Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Partager le casting" description="Un lien public, lisible par toute personne qui l'a, sans compte. Il montre les avatars proposés à ce client (et ceux qu'il a retenus).">
          {link ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 p-1.5 pl-3">
                <Link2 className="size-4 shrink-0 text-muted" />
                <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Lien public du casting" className="min-w-0 flex-1 bg-transparent text-[13px] text-fg-2 outline-none" />
                <Button type="button" size="sm" variant={copied ? "secondary" : "primary"} onClick={copy}>{copied ? <><Check />Copié</> : <><Copy />Copier</>}</Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-2 hover:underline"><ExternalLink className="size-3.5" />Ouvrir la page publique</a>
                <Button type="button" variant="ghost" size="sm" className="text-muted hover:text-danger" disabled={pending} onClick={() => setConfirmOff(true)}>Retirer le lien</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-[13.5px] text-fg-2">Génère un lien unique et non devinable vers le casting. Tu pourras le retirer à tout moment, ce qui coupe immédiatement l&apos;accès.</p>
              <Button type="button" onClick={publish} loading={pending}><Globe />Créer le lien public</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmOff} onOpenChange={setConfirmOff} loading={pending} danger
        title="Retirer le lien public ?" description="Le lien cessera aussitôt de fonctionner pour tout le monde. Tu pourras en recréer un plus tard (ce sera une nouvelle adresse)."
        confirmLabel="Retirer le lien" onConfirm={() => unpublish()} />
    </>
  );
}
