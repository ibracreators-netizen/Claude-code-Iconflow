"use client";
import * as React from "react";
import { AlertTriangle, BookOpen, Check, MoreHorizontal, Plug, RefreshCw, Repeat, Unplug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { ClientChip } from "@/components/shared/client-chip";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAction } from "@/lib/hooks/use-action";
import { disconnectMeta, listMetaAdAccounts, setMetaAccount, syncMetaInsights } from "@/lib/actions/integrations";
import type { Integration } from "@/lib/data/types";
import type { MetaAdAccount } from "@/lib/integrations/meta-mapping";
import { fmt } from "@/lib/utils";

/** Guide de création de l'app Meta (dépôt du studio). */
export const META_DOCS_URL = "https://github.com/ibracreators-netizen/Claude-code-Iconflow/blob/main/docs/features/meta-ads.md";

export interface MetaClientRow { id: string; name: string; logo_url: string | null }

const connectHref = (clientId: string) => `/api/integrations/meta/connect?client=${encodeURIComponent(clientId)}`;

function expiry(i: Integration): { tone: "warning" | "danger"; label: string } | null {
  if (!i.token_expires_at) return null;
  const days = (new Date(i.token_expires_at).getTime() - Date.now()) / 86400000;
  if (days < 0) return { tone: "danger", label: "Connexion expirée" };
  if (days < 7) return { tone: "warning", label: `Expire dans ${Math.max(1, Math.ceil(days))} j` };
  return null;
}

/**
 * Carte « Connexions Meta Ads » du tableau de bord (administrateurs à accès complet).
 * Les liens « Connecter » sont de simples ancres : la route API redirige vers Meta, elle ne doit pas être préchargée.
 */
export function MetaConnectionsCard({ configured, clients, integrations, docsUrl = META_DOCS_URL }: { configured: boolean; clients: MetaClientRow[]; integrations: Integration[]; docsUrl?: string }) {
  const { exec, pending } = useAction();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [disconnecting, setDisconnecting] = React.useState<{ integration: Integration; client: MetaClientRow } | null>(null);
  const [switching, setSwitching] = React.useState<{ integration: Integration; client: MetaClientRow } | null>(null);
  const byClient = new Map(integrations.filter((i) => i.provider === "meta").map((i) => [i.client_id, i]));
  const connected = clients.filter((c) => byClient.has(c.id)).length;

  const sync = (clientId: string) => {
    setBusy(clientId);
    exec(() => syncMetaInsights(clientId), { success: "Métriques Meta mises à jour." }).finally(() => setBusy(null));
  };

  return (
    <Card>
      <CardHeader title="Connexions Meta Ads" description="Un compte publicitaire par client : les métriques se mettent à jour chaque nuit, ou à la demande."
        action={configured ? <Badge tone={connected ? "success" : "neutral"} dot>{connected} connecté{connected > 1 ? "s" : ""}</Badge> : <Badge tone="neutral">Non configuré</Badge>} />
      <CardBody className="space-y-3">
        {!configured ? (
          <div className="flex items-start gap-3 rounded-lg bg-surface-2 p-3.5 text-[13px] text-fg-2 hairline">
            <Plug className="mt-0.5 size-4 shrink-0 text-muted" />
            <div className="min-w-0 space-y-1.5">
              <p>Aucune app Meta n&apos;est reliée au studio. Crée une app « Entreprise » sur developers.facebook.com avec le produit <span className="font-medium text-fg">Facebook Login for Business</span>, ajoute l&apos;URL de retour du studio, puis renseigne <code className="rounded bg-surface-3 px-1 font-mono text-[12px]">META_APP_ID</code> et <code className="rounded bg-surface-3 px-1 font-mono text-[12px]">META_APP_SECRET</code> sur l&apos;hébergeur.</p>
              <a href={docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium text-accent-2 hover:underline"><BookOpen className="size-3.5" />Guide pas à pas (docs/features/meta-ads.md)</a>
            </div>
          </div>
        ) : null}

        <ul className="divide-y divide-border">
          {clients.map((c) => {
            const i = byClient.get(c.id);
            const exp = i ? expiry(i) : null;
            return (
              <li key={c.id} className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <ClientChip name={c.name} logo={c.logo_url} href={`/studio/clients/${c.id}`} size={24} className="text-[13.5px] text-fg" />
                  {i ? (
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-[34px] text-[12px] text-muted">
                      <span className="truncate text-fg-2">{i.account_name || "Compte publicitaire"}</span>
                      <span className="font-mono text-[11.5px]">#{i.account_id}</span>
                      <span aria-hidden>·</span>
                      <span>{i.last_sync_at ? `Synchronisé ${fmt.relative(i.last_sync_at)}` : "Jamais synchronisé"}</span>
                      {exp ? <Badge tone={exp.tone} className="text-[11px]">{exp.label}</Badge> : null}
                    </div>
                  ) : (
                    <p className="mt-1 pl-[34px] text-[12px] text-muted">{configured ? "Non connecté" : "Non connecté · en attente de l'app Meta"}</p>
                  )}
                  {i?.last_error ? <p className="mt-1 flex items-start gap-1.5 pl-[34px] text-[12px] text-danger"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /><span className="line-clamp-2">{i.last_error}</span></p> : null}
                </div>
                {configured ? (
                  <div className="flex shrink-0 items-center gap-1.5 pl-[34px] sm:pl-0">
                    {i ? (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => sync(c.id)} loading={pending && busy === c.id} disabled={pending && busy !== c.id}>{pending && busy === c.id ? null : <RefreshCw />}Synchroniser</Button>
                        <Dropdown>
                          <DropdownTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Plus d'actions pour ${c.name}`}><MoreHorizontal /></Button></DropdownTrigger>
                          <DropdownContent>
                            <DropdownItem onSelect={() => setSwitching({ integration: i, client: c })}><Repeat />Changer de compte publicitaire</DropdownItem>
                            <DropdownItem asChild><a href={connectHref(c.id)}><Plug />Reconnecter</a></DropdownItem>
                            <DropdownSeparator />
                            <DropdownItem danger onSelect={() => setDisconnecting({ integration: i, client: c })}><Unplug />Déconnecter</DropdownItem>
                          </DropdownContent>
                        </Dropdown>
                      </>
                    ) : (
                      <a href={connectHref(c.id)} className={buttonVariants({ variant: "secondary", size: "sm" })}><Plug />Connecter</a>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
          {!clients.length ? <li className="py-6 text-center text-[13px] text-muted">Aucun client actif à relier.</li> : null}
        </ul>
      </CardBody>

      <ConfirmDialog open={!!disconnecting} onOpenChange={(o) => { if (!o) setDisconnecting(null); }} title={disconnecting ? `Déconnecter Meta pour ${disconnecting.client.name} ?` : ""}
        description="Le jeton est effacé ; les métriques déjà enregistrées restent visibles. Tu pourras reconnecter le compte à tout moment." confirmLabel="Déconnecter" danger loading={pending}
        onConfirm={async () => { if (!disconnecting) return; const r = await exec(() => disconnectMeta(disconnecting.integration.id), { success: "Compte Meta déconnecté." }); if (r.ok) setDisconnecting(null); }} />

      {switching ? <SwitchAccountDialog integration={switching.integration} clientName={switching.client.name} onClose={() => setSwitching(null)} /> : null}
    </Card>
  );
}

/** Choix d'un autre compte publicitaire parmi ceux visibles depuis la connexion Meta (le jeton reste côté serveur). */
function SwitchAccountDialog({ integration, clientName, onClose }: { integration: Integration; clientName: string; onClose: () => void }) {
  const { exec, pending } = useAction();
  const [accounts, setAccounts] = React.useState<MetaAdAccount[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [choice, setChoice] = React.useState(integration.account_id);
  React.useEffect(() => {
    let alive = true;
    listMetaAdAccounts(integration.id).then((r) => { if (!alive) return; if (r.ok) setAccounts(r.data); else setError(r.error); });
    return () => { alive = false; };
  }, [integration.id]);
  const selected = accounts?.find((a) => a.account_id === choice);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent title="Changer de compte publicitaire" description={`Comptes visibles depuis la connexion Meta de ${clientName}. Le compte choisi est relu immédiatement.`}>
        {error ? <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</p> : null}
        {!accounts && !error ? <p className="py-6 text-center text-[13px] text-muted">Lecture des comptes publicitaires…</p> : null}
        {accounts ? (
          <ul className="max-h-[50vh] space-y-1 overflow-y-auto" role="radiogroup" aria-label="Comptes publicitaires">
            {accounts.map((a) => {
              const active = a.account_id === choice;
              return (
                <li key={a.id}>
                  <button type="button" role="radio" aria-checked={active} onClick={() => setChoice(a.account_id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hairline ${active ? "bg-accent-soft" : "hover:bg-surface-2"}`}>
                    <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${active ? "border-accent bg-accent text-accent-fg" : "border-border-strong"}`}>{active ? <Check className="size-3" /> : null}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium">{a.name || "Compte sans nom"}</span><span className="block font-mono text-[11.5px] text-muted">#{a.account_id}{a.currency ? ` · ${a.currency}` : ""}</span></span>
                    {a.account_id === integration.account_id ? <Badge tone="accent">Actuel</Badge> : null}
                  </button>
                </li>
              );
            })}
            {!accounts.length ? <li className="py-6 text-center text-[13px] text-muted">Aucun compte publicitaire visible depuis cette connexion.</li> : null}
          </ul>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="button" loading={pending} disabled={!selected || choice === integration.account_id}
            onClick={async () => { if (!selected) return; const r = await exec(() => setMetaAccount(integration.id, { account_id: selected.account_id, name: selected.name ?? null }), { success: "Compte publicitaire changé." }); if (r.ok) onClose(); }}>
            Utiliser ce compte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
