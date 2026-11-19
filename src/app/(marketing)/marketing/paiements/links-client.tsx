"use client";
import * as React from "react";
import { Copy, CreditCard, ExternalLink, Pencil, Plus, Power, Search, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { MkFab } from "@/components/marketing/chrome";
import { useAction } from "@/lib/hooks/use-action";
import { deletePaymentLinkAction, savePaymentLinkAction, setPaymentLinkActiveAction } from "@/lib/actions/marketing-payments";
import { dayIn, displayUrl, formatCreated, formatPrice, type PaymentLink } from "@/lib/marketing/payments";
import { cn } from "@/lib/utils";
import { BTN_PRIMARY, BTN_SECONDARY, CopyButton, DateRange, FilterMenu, FormDialog, FormField, Heading, INPUT, Pager, Pill, RowMenu, SearchBox, urlProblem, useCopy, usePaged, type MenuItem } from "./parts";

type Status = "actif" | "inactif";
const STATUS: Array<{ value: Status; label: string }> = [{ value: "actif", label: "Actif" }, { value: "inactif", label: "Inactif" }];
const TH = "h-11 whitespace-nowrap px-4 text-left text-[12px] font-medium text-mk-sub";

/** Onglet « Liens de paiement » : tableau paginé sur ordinateur, cartes sur téléphone. */
export function PaymentLinksView({ links, canEdit, timezone }: { links: PaymentLink[]; canEdit: boolean; timezone: string }) {
  const { exec, pending } = useAction();
  const { copied, copy } = useCopy();
  const [q, setQ] = React.useState("");
  const [range, setRange] = React.useState({ from: "", to: "" });
  const [status, setStatus] = React.useState<Status[]>([]);
  const [editing, setEditing] = React.useState<PaymentLink | "new" | null>(null);
  const [removing, setRemoving] = React.useState<PaymentLink | null>(null);

  const rows = React.useMemo(() => {
    const t = q.trim().toLowerCase();
    return links.filter((l) => {
      if (t && ![l.name, l.url, l.note ?? ""].some((v) => v.toLowerCase().includes(t))) return false;
      if (status.length && !status.includes(l.active ? "actif" : "inactif")) return false;
      if (range.from || range.to) { const d = dayIn(l.created_at, timezone); if ((range.from && d < range.from) || (range.to && d > range.to)) return false; }
      return true;
    });
  }, [links, q, status, range, timezone]);
  const paged = usePaged(rows, [q, status.join(), range.from, range.to]);
  const reset = () => { setQ(""); setStatus([]); setRange({ from: "", to: "" }); };

  const menu = (l: PaymentLink): MenuItem[] => [
    { label: "Ouvrir le lien", icon: ExternalLink, onSelect: () => window.open(l.url, "_blank", "noopener,noreferrer") },
    { label: "Copier", icon: Copy, onSelect: () => copy(l.id, l.url) },
    ...(canEdit ? [
      { label: "Modifier", icon: Pencil, onSelect: () => setEditing(l) },
      { label: l.active ? "Désactiver" : "Activer", icon: Power, onSelect: () => exec(() => setPaymentLinkActiveAction(l.id, !l.active), { success: l.active ? "Lien désactivé." : "Lien activé." }) },
      { label: "Supprimer", icon: Trash2, danger: true, separated: true, onSelect: () => setRemoving(l) },
    ] : []),
  ];
  const create = canEdit ? <button type="button" onClick={() => setEditing("new")} className={BTN_PRIMARY}><Plus strokeWidth={2.2} />Créer un nouveau lien de paiement</button> : null;
  const status_ = (l: PaymentLink) => <Pill tone={l.active ? "success" : "neutral"} dot>{l.active ? "Actif" : "Inactif"}</Pill>;

  return (
    <>
      <Heading title="Liens de paiement" sub="Crée et gère tes liens de paiement" action={create} />

      {/* Ordinateur : carte, barre d'outils, tableau, pagination */}
      <section className="hidden overflow-hidden rounded-[12px] border border-mk-line bg-surface shadow-soft lg:block">
        <div className="flex items-center gap-3 border-b border-mk-line px-4 py-3">
          <DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
          <span className="ml-auto" />
          <SearchBox value={q} onChange={setQ} />
          <FilterMenu title="Statut" options={STATUS} selected={status} onChange={setStatus} />
        </div>
        {links.length === 0 ? (
          <Empty canEdit={canEdit} onCreate={() => setEditing("new")} />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center"><p className="text-[16px] font-semibold text-mk-strong">Aucun lien ne correspond à ta recherche</p><button type="button" onClick={reset} className={BTN_SECONDARY}>Effacer les filtres</button></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-[14px]">
                <thead className="border-b border-mk-line bg-bg">
                  <tr><th scope="col" className={TH}>Nom</th><th scope="col" className={TH}>URL du lien</th><th scope="col" className={TH}>Statut</th><th scope="col" className={cn(TH, "text-right")}>Prix</th><th scope="col" className={TH}>Créé à</th><th scope="col" className={cn(TH, "w-14")}><span className="sr-only">Actions</span></th></tr>
                </thead>
                <tbody>
                  {paged.slice.map((l) => (
                    <tr key={l.id} className="h-16 border-b border-mk-line transition last:border-b-0 hover:bg-mk-chip/50">
                      <td className="w-[36%] max-w-[360px] px-4 py-2.5">
                        <p className="truncate font-semibold text-mk-strong">{l.name}</p>
                        {l.note ? <p className="truncate text-[13px] text-mk-sub">{l.note}</p> : null}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex max-w-[300px] items-center gap-2.5">
                          <a href={l.url} target="_blank" rel="noopener noreferrer" title={l.url} className="min-w-0 truncate text-mk-sub transition hover:text-accent-2 hover:underline">{displayUrl(l.url)}</a>
                          <CopyButton done={copied === l.id} onClick={() => copy(l.id, l.url)} />
                        </span>
                      </td>
                      <td className="px-4 py-2.5">{status_(l)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-mk-strong tabular">{formatPrice(l.price)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-mk-text tabular">{formatCreated(l.created_at, timezone)}</td>
                      <td className="px-2 py-2.5 text-right"><RowMenu items={menu(l)} label={`Actions : ${l.name}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-mk-line"><Pager page={paged.page} pages={paged.pages} size={paged.size} onPage={paged.setPage} onSize={paged.setSize} /></div>
          </>
        )}
      </section>

      {/* Téléphone : recherche et cartes */}
      <div className="space-y-3 lg:hidden">
        {links.length > 0 ? (
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-mk-sub" strokeWidth={1.8} aria-hidden />
            <span className="sr-only">Rechercher un lien</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un lien" className="h-12 w-full rounded-[10px] border border-mk-input bg-surface pl-11 pr-3 text-[16px] text-mk-strong outline-none transition placeholder:text-mk-sub focus:border-accent focus:ring-2 focus:ring-accent/20" />
          </label>
        ) : null}
        {links.length === 0 ? (
          <PhoneEmpty>{canEdit ? "Aucun lien de paiement pour l'instant. Appuie sur + pour ajouter le premier." : "Aucun lien de paiement pour l'instant. L'administrateur les ajoute ici : tu pourras les copier en un geste."}</PhoneEmpty>
        ) : rows.length === 0 ? (
          <PhoneEmpty>Aucun lien ne correspond à ta recherche.</PhoneEmpty>
        ) : (
          <ul className="space-y-3">
            {rows.map((l) => (
              <li key={l.id} className="rounded-[12px] border border-mk-line bg-surface p-4 shadow-soft">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-semibold leading-snug text-mk-strong">{l.name}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className={cn("text-[15px] tabular", l.price === null ? "text-mk-sub" : "font-medium text-mk-text")}>{l.price === null ? "Prix non indiqué" : formatPrice(l.price)}</span>
                      {status_(l)}
                    </div>
                  </div>
                  {canEdit ? <RowMenu items={menu(l).slice(2)} label={`Actions : ${l.name}`} className="-mr-2 -mt-1 size-10" /> : null}
                </div>
                {l.note ? <p className="mt-2 line-clamp-2 text-[14px] text-mk-sub">{l.note}</p> : null}
                <p className="mt-2 truncate text-[13px] text-mk-sub">{displayUrl(l.url)}</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => copy(l.id, l.url)} className={cn("inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[8px] text-[15px] font-semibold transition active:scale-[0.99]", copied === l.id ? "bg-mk-success-soft text-mk-success" : "bg-accent text-accent-fg")}>
                    <Copy className="size-[18px]" strokeWidth={2} />{copied === l.id ? "Lien copié" : "Copier le lien"}
                  </button>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] border border-mk-input bg-surface px-4 text-[15px] font-medium text-mk-text transition active:bg-mk-chip"><ExternalLink className="size-[18px]" strokeWidth={1.8} />Ouvrir</a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {canEdit ? <MkFab onClick={() => setEditing("new")} label="Créer un lien de paiement" /> : null}

      {editing ? <LinkDialog key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
      <ConfirmDialog open={!!removing} onOpenChange={(o) => { if (!o) setRemoving(null); }} danger loading={pending} confirmLabel="Supprimer"
        title="Supprimer ce lien de paiement ?" description={removing ? `« ${removing.name} » disparaît de la liste. Le paiement lui-même reste dans ton outil de paiement.` : undefined}
        onConfirm={() => { const r = removing; if (r) exec(() => deletePaymentLinkAction(r.id), { success: "Lien supprimé.", onSuccess: () => setRemoving(null) }); }} />
    </>
  );
}

function Empty({ canEdit, onCreate }: { canEdit: boolean; onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-mk-chip text-mk-icon ring-8 ring-mk-chip/50"><CreditCard className="size-6" strokeWidth={1.7} /></span>
      <p className="mt-4 text-[16px] font-semibold text-mk-strong">Aucun lien de paiement pour l&apos;instant</p>
      <p className="mt-1 max-w-md text-[14px] text-mk-sub">{canEdit ? "Ajoute ici les liens créés dans ton outil de paiement : toute l'équipe pourra les copier et les envoyer aux prospects." : "L'administrateur les ajoute ici. Tu pourras ensuite les copier et les envoyer aux prospects."}</p>
      {canEdit ? <button type="button" onClick={onCreate} className={cn(BTN_PRIMARY, "mt-5")}><Plus strokeWidth={2.2} />Créer un nouveau lien de paiement</button> : null}
    </div>
  );
}
export function PhoneEmpty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-r-[12px] border-l-4 border-accent bg-mk-agenda px-4 py-5 text-[15px] font-medium text-mk-sub">{children}</p>;
}

/** Création ou modification d'un lien. */
function LinkDialog({ initial, onClose }: { initial: PaymentLink | null; onClose: () => void }) {
  const { exec, pending } = useAction();
  const [f, setF] = React.useState({ name: initial?.name ?? "", url: initial?.url ?? "", price: initial?.price === null || initial?.price === undefined ? "" : String(initial.price).replace(".", ","), note: initial?.note ?? "", active: initial?.active ?? true });
  const [tried, setTried] = React.useState(false);
  const nameErr = tried && !f.name.trim() ? "Donne un nom au lien." : null;
  const urlErr = f.url.trim() ? urlProblem(f.url) : tried ? "Colle le lien (il commence par « https:// »)." : null;
  const submit = () => {
    setTried(true);
    if (!f.name.trim() || !f.url.trim() || urlProblem(f.url)) return;
    exec(() => savePaymentLinkAction({ id: initial?.id ?? null, name: f.name, url: f.url, price: f.price, note: f.note, active: f.active }), { success: initial ? "Lien enregistré." : "Lien de paiement créé.", onSuccess: onClose });
  };
  return (
    <FormDialog open onOpenChange={(o) => { if (!o) onClose(); }} title={initial ? "Modifier le lien de paiement" : "Nouveau lien de paiement"} onSubmit={submit} submitLabel={initial ? "Enregistrer" : "Créer le lien"} pending={pending}>
      <FormField label="Nom" required htmlFor="pl-name" error={nameErr}>
        <input id="pl-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} autoFocus placeholder="Ex. Accompagnement 3 mois" className={cn(INPUT, nameErr && "border-mk-danger")} />
      </FormField>
      <FormField label="URL du lien" required htmlFor="pl-url" error={urlErr} hint="Colle le lien créé dans ton outil de paiement : Stripe, LeadConnector, Whop…">
        <input id="pl-url" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} maxLength={2000} placeholder="https://buy.stripe.com/…" className={cn(INPUT, urlErr && "border-mk-danger")} />
      </FormField>
      <FormField label="Prix (€)" htmlFor="pl-price" hint="Facultatif. Le montant affiché à l'équipe, TTC ou HT comme sur ton outil.">
        <span className="relative block">
          <input id="pl-price" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} maxLength={16} placeholder="Ex. 1 500" className={cn(INPUT, "pr-10 tabular")} />
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[15px] text-mk-sub">€</span>
        </span>
      </FormField>
      <FormField label="Note" htmlFor="pl-note" hint="Facultatif. Ex. acompte de 30 %, à envoyer après l'appel.">
        <textarea id="pl-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={500} rows={3} className={cn(INPUT, "h-auto min-h-[88px] resize-y py-2.5 leading-relaxed lg:h-auto")} />
      </FormField>
      <label htmlFor="pl-active" className="flex items-center gap-3 rounded-[10px] border border-mk-line px-3.5 py-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium text-mk-strong lg:text-[14px]">Actif</span>
          <span className="block text-[13px] text-mk-sub">Un lien inactif reste dans la liste, marqué « Inactif ».</span>
        </span>
        <Switch id="pl-active" checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} />
      </label>
    </FormDialog>
  );
}
