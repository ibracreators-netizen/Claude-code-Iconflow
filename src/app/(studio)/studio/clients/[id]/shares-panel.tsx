"use client";
import * as React from "react";
import { Ban, Check, Copy, ExternalLink, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAction } from "@/lib/hooks/use-action";
import { revokeShare } from "@/lib/actions/avatars";
import { SHARE_KIND, type ShareLink } from "@/lib/data/types";
import { fmt } from "@/lib/utils";

const urlFor = (l: ShareLink, origin: string) => (l.kind === "brief" ? `${origin}/b/${l.token}` : `${origin}/casting/${l.token}`);

/** Gestion des liens publics d'un client : liens actifs (copier / ouvrir / couper) et historique des partages. */
export function SharesPanel({ clientId, links }: { clientId: string; links: ShareLink[] }) {
  const { exec, pending } = useAction();
  const [toRevoke, setToRevoke] = React.useState<ShareLink | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const active = links.filter((l) => !l.revoked_at);
  const history = links.filter((l) => l.revoked_at);

  const copy = async (l: ShareLink) => { try { await navigator.clipboard.writeText(urlFor(l, origin)); setCopiedId(l.id); setTimeout(() => setCopiedId(null), 1600); } catch { /* le lien reste visible */ } };

  const Row = ({ l, revoked }: { l: ShareLink; revoked?: boolean }) => (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-3.5 py-3">
      <Badge tone={l.kind === "brief" ? "outline" : "accent"}>{SHARE_KIND[l.kind]}</Badge>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium">{l.label ?? SHARE_KIND[l.kind]}</p>
        <p className="text-[12px] text-muted">{revoked ? `Coupé ${fmt.relative(l.revoked_at as string)}` : `Partagé ${fmt.relative(l.created_at)}`}</p>
      </div>
      {revoked ? (
        <span className="text-[12px] text-muted-2">Lien inactif</span>
      ) : (
        <div className="flex items-center gap-1.5">
          <Button type="button" size="sm" variant="secondary" onClick={() => copy(l)}>{copiedId === l.id ? <><Check />Copié</> : <><Copy />Copier</>}</Button>
          <a href={urlFor(l, origin)} target="_blank" rel="noopener noreferrer" className="inline-flex size-8 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-fg" aria-label="Ouvrir le lien"><ExternalLink className="size-4" /></a>
          <Button type="button" size="sm" variant="ghost" className="text-muted hover:text-danger" onClick={() => setToRevoke(l)}><Ban />Couper</Button>
        </div>
      )}
    </li>
  );

  return (
    <Card>
      <CardHeader title="Liens partagés" description="Les pages publiques créées pour ce client (briefs publiés, casting). Coupe un lien quand tu veux ; l'historique reste ici." />
      <CardBody className="space-y-6">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Liens actifs{active.length ? ` · ${active.length}` : ""}</p>
          {active.length ? (
            <ul className="space-y-2">{active.map((l) => <Row key={l.id} l={l} />)}</ul>
          ) : (
            <EmptyState compact icon={Globe} title="Aucun lien actif" description="Publie un brief ou partage le casting (onglet Avatars) pour créer un lien public." />
          )}
        </div>
        {history.length ? (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Historique · {history.length}</p>
            <ul className="space-y-2 opacity-80">{history.map((l) => <Row key={l.id} l={l} revoked />)}</ul>
          </div>
        ) : null}
      </CardBody>

      <ConfirmDialog open={!!toRevoke} onOpenChange={(o) => { if (!o) setToRevoke(null); }} danger loading={pending}
        title="Couper ce lien ?" description={toRevoke ? `Le lien « ${toRevoke.label ?? SHARE_KIND[toRevoke.kind]} » cessera aussitôt de fonctionner. Il restera dans l'historique.` : ""}
        confirmLabel="Couper le lien" onConfirm={async () => { if (toRevoke) await exec(() => revokeShare(toRevoke.id, clientId), { success: "Lien coupé.", onSuccess: () => setToRevoke(null) }); }} />
    </Card>
  );
}
