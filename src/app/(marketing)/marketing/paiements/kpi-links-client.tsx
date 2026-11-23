"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, Copy, ExternalLink, Link2, Pencil, Plus, Power, RefreshCw, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { MkSegmented } from "@/components/marketing/segmented";
import { useAction } from "@/lib/hooks/use-action";
import { createKpiPersonAction, deleteKpiPersonAction, renewKpiLinkAction, setKpiPersonActiveAction, updateKpiPersonAction } from "@/lib/actions/marketing-kpi-links";
import { firstName, KPI_LINK_ROLE, kpiLinkPath, type KpiLinkRole, type KpiPerson } from "@/lib/marketing/kpi-links";
import { cn, initials } from "@/lib/utils";
import { BTN_PRIMARY, BTN_SECONDARY, CopyButton, FormDialog, FormField, INPUT, Pill, RowMenu, useCopy, type MenuItem } from "./parts";

/** Une personne autorisée, avec sa dernière saisie déjà mise en mots par le serveur (« il y a 2 h », « jamais »). */
export type KpiLinkRow = KpiPerson & { lastLabel: string };
/** Adresse complète du lien, construite avec l'origine du site comme les liens de partage de Studio. */
const urlOf = (token: string) => `${window.location.origin}${kpiLinkPath(token)}`;

/**
 * Carte « Liens de saisie des KPI » (Paiements › Saisie des KPI), pour qui gère l'espace : un lien personnel et
 * permanent par commercial, sans compte. `rows` à null : la migration 0028 n'est pas appliquée.
 */
export function KpiLinksCard({ rows }: { rows: KpiLinkRow[] | null }) {
  const { exec, pending } = useAction();
  const { copied, copy } = useCopy();
  const [editing, setEditing] = React.useState<KpiPerson | "new" | null>(null);
  const [ready, setReady] = React.useState<{ person: KpiPerson; renewed: boolean } | null>(null);
  const [renewing, setRenewing] = React.useState<KpiPerson | null>(null);
  const [removing, setRemoving] = React.useState<KpiPerson | null>(null);

  const add = <button type="button" onClick={() => setEditing("new")} className={cn(BTN_PRIMARY, "w-full sm:w-auto")}><Plus strokeWidth={2.2} />Ajouter une personne</button>;
  const menu = (p: KpiPerson): MenuItem[] => [
    ...(p.active ? [
      { label: "Copier le lien", icon: Copy, onSelect: () => copy(p.id, urlOf(p.token)) },
      { label: "Ouvrir", icon: ExternalLink, onSelect: () => window.open(urlOf(p.token), "_blank", "noopener,noreferrer") },
    ] : []),
    { label: "Modifier", icon: Pencil, onSelect: () => setEditing(p) },
    { label: "Nouveau lien", icon: RefreshCw, onSelect: () => setRenewing(p) },
    { label: p.active ? "Désactiver" : "Réactiver", icon: Power, onSelect: () => exec(() => setKpiPersonActiveAction(p.id, !p.active), { success: p.active ? `Lien de ${firstName(p.name)} désactivé.` : `Lien de ${firstName(p.name)} réactivé.` }) },
    { label: "Supprimer", icon: Trash2, danger: true, separated: true, onSelect: () => setRemoving(p) },
  ];

  return (
    <section aria-labelledby="kpi-links-title" className="mb-8 overflow-hidden rounded-[12px] border border-mk-line bg-surface shadow-soft">
      <div className="flex flex-col gap-3 px-4 pb-4 pt-4 sm:flex-row sm:items-start sm:justify-between lg:px-6 lg:pt-5">
        <div className="min-w-0">
          <h2 id="kpi-links-title" className="flex items-center gap-2 text-[17px] font-semibold text-mk-strong lg:text-[16px]"><Link2 className="size-[18px] text-accent-2" strokeWidth={2} aria-hidden />Liens de saisie des KPI</h2>
          <p className="mt-0.5 max-w-2xl text-[14px] leading-snug text-mk-sub">Un lien personnel et permanent par commercial, sans compte : il y note ses chiffres chaque jour depuis son téléphone. Ses saisies arrivent dans KPI › Suivi du jour et dans le Tableau de bord.</p>
        </div>
        {rows ? add : null}
      </div>

      {rows === null ? (
        <p role="status" className="mx-4 mb-4 rounded-[10px] border border-mk-warn/30 bg-mk-warn-soft px-4 py-3 text-[14px] text-mk-warn lg:mx-6 lg:mb-5">Les liens de saisie demandent la migration 0028 de la base. Demande à l&apos;administrateur de la passer : tant qu&apos;elle manque, aucun lien ne peut être créé.</p>
      ) : rows.length === 0 ? (
        <div className="border-t border-mk-line px-4 py-8 text-center lg:px-6">
          <p className="text-[15px] font-semibold text-mk-strong">Personne pour l&apos;instant</p>
          <p className="mx-auto mt-1 max-w-md text-[14px] text-mk-sub">Ajoute un setter ou un closer : tu obtiens son lien, à lui envoyer une seule fois. Il garde le même lien tous les jours.</p>
        </div>
      ) : (
        <ul className="border-t border-mk-line">
          {rows.map((p) => (
            <li key={p.id} className={cn("flex items-center gap-3 border-b border-mk-line px-4 py-3 last:border-b-0 lg:px-6", !p.active && "bg-mk-chip/40")}>
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold", p.active ? "bg-accent-soft text-accent-2" : "bg-mk-chip text-mk-sub")} aria-hidden>{initials(p.name)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={cn("truncate text-[15px] font-semibold", p.active ? "text-mk-strong" : "text-mk-sub")}>{p.name}</span>
                  <Pill tone="teal">{KPI_LINK_ROLE[p.role]}</Pill>
                  <span className="sm:hidden">{p.active ? null : <Pill tone="neutral" dot>Désactivé</Pill>}</span>
                </div>
                <p className="mt-0.5 truncate text-[13px] text-mk-sub">Dernière saisie : <span className={p.last_entry_at ? "text-mk-text" : undefined}>{p.lastLabel}</span>{p.email ? <span className="hidden md:inline"> · {p.email}</span> : null}</p>
              </div>
              <span className="hidden sm:inline-flex">{p.active ? <Pill tone="success" dot>Actif</Pill> : <Pill tone="neutral" dot>Désactivé</Pill>}</span>
              {p.active ? <CopyButton done={copied === p.id} onClick={() => copy(p.id, urlOf(p.token))} label={`Copier le lien de ${p.name}`} /> : <span className="size-8 shrink-0" aria-hidden />}
              <RowMenu items={menu(p)} label={`Actions : ${p.name}`} className="-mr-2" />
            </li>
          ))}
        </ul>
      )}
      {rows && rows.length > 0 ? <p className="border-t border-mk-line px-4 py-3 text-[13px] text-mk-sub lg:px-6">Un lien qui circule trop ? Choisis « Nouveau lien » dans le menu de la personne : l&apos;ancien cesse aussitôt de marcher.</p> : null}

      {editing ? (
        <PersonDialog key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? null : editing} onClose={() => setEditing(null)}
          onCreated={(person) => { setEditing(null); setReady({ person, renewed: false }); }} />
      ) : null}
      {ready ? <LinkReadyDialog person={ready.person} renewed={ready.renewed} onClose={() => setReady(null)} /> : null}
      <ConfirmDialog open={!!renewing} onOpenChange={(o) => { if (!o) setRenewing(null); }} loading={pending} confirmLabel="Créer un nouveau lien"
        title={renewing ? `Nouveau lien pour ${firstName(renewing.name)} ?` : "Nouveau lien ?"}
        description="L'ancien lien cesse de marcher tout de suite. Ses saisies déjà faites restent. Pense à lui envoyer le nouveau."
        onConfirm={() => { const r = renewing; if (r) exec(() => renewKpiLinkAction(r.id), { success: "Nouveau lien créé.", onSuccess: (person) => { setRenewing(null); setReady({ person, renewed: true }); } }); }} />
      <ConfirmDialog open={!!removing} onOpenChange={(o) => { if (!o) setRemoving(null); }} danger loading={pending} confirmLabel="Supprimer"
        title={removing ? `Supprimer ${removing.name} ?` : "Supprimer ?"}
        description="Son lien cesse de marcher et ses saisies disparaissent des KPI et du Tableau de bord. Pour garder l'historique, désactive plutôt son lien."
        onConfirm={() => { const r = removing; if (r) exec(() => deleteKpiPersonAction(r.id), { success: "Personne supprimée.", onSuccess: () => setRemoving(null) }); }} />
    </section>
  );
}

/** Ajouter ou modifier une personne : nom, rôle, e-mail et téléphone (facultatifs). */
function PersonDialog({ initial, onClose, onCreated }: { initial: KpiPerson | null; onClose: () => void; onCreated: (p: KpiPerson) => void }) {
  const { exec, pending } = useAction();
  const [f, setF] = React.useState({ name: initial?.name ?? "", role: (initial?.role ?? "setter") as KpiLinkRole, email: initial?.email ?? "", phone: initial?.phone ?? "" });
  const [tried, setTried] = React.useState(false);
  const nameErr = tried && !f.name.trim() ? "Donne le nom de la personne." : null;
  const emailErr = f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()) ? "Cette adresse e-mail n'est pas valide." : null;
  const submit = () => {
    setTried(true);
    if (!f.name.trim() || emailErr) return;
    const input = { name: f.name, role: f.role, email: f.email || null, phone: f.phone || null };
    if (initial) exec(() => updateKpiPersonAction(initial.id, input), { success: "Personne enregistrée.", onSuccess: onClose });
    else exec(() => createKpiPersonAction(input), { success: `${firstName(f.name)} peut saisir ses KPI.`, onSuccess: onCreated });
  };
  return (
    <FormDialog open onOpenChange={(o) => { if (!o) onClose(); }} title={initial ? "Modifier la personne" : "Ajouter une personne"}
      description={initial ? undefined : "Elle pourra saisir ses KPI chaque jour avec son lien personnel, sans créer de compte."}
      onSubmit={submit} submitLabel={initial ? "Enregistrer" : "Ajouter et créer son lien"} pending={pending}>
      <FormField label="Nom" required htmlFor="kp-name" error={nameErr}>
        <input id="kp-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} autoFocus autoComplete="off" placeholder="Ex. Julie Martin" className={cn(INPUT, nameErr && "border-mk-danger")} />
      </FormField>
      <div>
        <p className="mb-1.5 block text-[15px] font-medium text-mk-text lg:text-[14px]">Rôle<span className="ml-1 text-mk-required">*</span></p>
        <MkSegmented label="Rôle" value={f.role} onChange={(role) => setF({ ...f, role })} options={[{ value: "setter", label: "Setter" }, { value: "closer", label: "Closer" }]} />
        <p className="mt-1.5 text-[13px] text-mk-sub">{f.role === "setter" ? "Appels passés, décrochés, messages, conversations." : "Relances passées, propositions envoyées."}</p>
      </div>
      <FormField label="E-mail" htmlFor="kp-email" error={emailErr} hint="Facultatif. Pour retrouver la personne, rien ne lui est envoyé.">
        <input id="kp-email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} maxLength={254} placeholder="julie@exemple.fr" className={cn(INPUT, emailErr && "border-mk-danger")} />
      </FormField>
      <FormField label="Téléphone" htmlFor="kp-phone" hint="Facultatif.">
        <input id="kp-phone" type="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={40} placeholder="06 12 34 56 78" className={INPUT} />
      </FormField>
    </FormDialog>
  );
}

/** Le lien, prêt à copier, juste après l'ajout ou un « Nouveau lien ». */
function LinkReadyDialog({ person, renewed, onClose }: { person: KpiPerson; renewed: boolean; onClose: () => void }) {
  const { copied, copy } = useCopy();
  const link = urlOf(person.token), who = firstName(person.name);
  return (
    <DialogPrimitive.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-[16px] bg-surface px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-5 shadow-pop focus:outline-none data-[state=open]:animate-rise lg:inset-auto lg:left-1/2 lg:top-1/2 lg:w-[520px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[12px] lg:border lg:border-mk-line lg:px-6 lg:pb-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-mk-success-soft text-mk-success" aria-hidden><Check className="size-5" strokeWidth={2.4} /></span>
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-[18px] font-semibold text-mk-strong">{renewed ? `Nouveau lien pour ${who}` : `Lien prêt pour ${who}`}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-0.5 text-[14px] text-mk-sub">Envoie ce lien à {who} : il garde le même lien tous les jours.</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close aria-label="Fermer" className="-mr-1.5 -mt-1 inline-flex size-10 items-center justify-center rounded-full text-mk-icon transition hover:bg-mk-chip"><X className="size-5" /></DialogPrimitive.Close>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-[10px] border border-mk-input bg-bg p-1.5 pl-3">
            <Link2 className="size-4 shrink-0 text-mk-sub" aria-hidden />
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label={`Lien de saisie de ${who}`} className="min-w-0 flex-1 bg-transparent text-[14px] text-mk-text outline-none" />
            <button type="button" onClick={() => copy("ready", link)} className={cn(copied === "ready" ? BTN_SECONDARY : BTN_PRIMARY, "h-9")}>{copied === "ready" ? <><Check />Copié</> : <><Copy />Copier</>}</button>
          </div>
          {renewed ? <p className="mt-3 text-[13px] text-mk-sub">L&apos;ancien lien ne marche plus.</p> : null}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <a href={link} target="_blank" rel="noopener noreferrer" className={cn(BTN_SECONDARY, "h-11 lg:h-10")}><ExternalLink />Ouvrir</a>
            <DialogPrimitive.Close className={cn(BTN_PRIMARY, "h-11 lg:h-10")}>Terminé</DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
