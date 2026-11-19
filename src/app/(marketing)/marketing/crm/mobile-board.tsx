"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeftRight, Plus } from "lucide-react";
import { useAction } from "@/lib/hooks/use-action";
import { updateProspectAction } from "@/lib/actions/marketing-crm";
import type { ProspectRow } from "@/lib/marketing/crm-server";
import type { Stage } from "@/lib/marketing/types";
import { stageHex } from "@/lib/marketing/ui";
import { MkInitials } from "@/components/marketing/ui";
import { PAGE_CARDS, type CardActions } from "./board";
import { amountOf, CardIcons, dealName, money, nameOf, OwnerBadge, plural, Sheet, SheetOption, StageDot } from "./shared";

/** Identifiant de la colonne d'une étape (la feuille « pipeline » y fait défiler). */
export const columnId = (stageId: string) => `etape-${stageId}`;

/**
 * Téléphone, comme l'app LeadConnector « Opportunités » : les étapes en colonnes qui défilent de côté (aimantées),
 * le bord de la suivante visible ; sur chaque carte, appeler, écrire, les tâches et le carré « ⇆ » pour changer d'étape.
 */
export function MobileBoard({ rows, stages, upcoming, memberName, actions, onMoved }: {
  rows: ProspectRow[]; stages: Stage[]; upcoming: Set<string>; memberName: Record<string, string>; actions: CardActions; onMoved: () => void;
}) {
  const { exec, pending } = useAction();
  const [moved, setMoved] = React.useState<Record<string, string>>({});
  const [seen, setSeen] = React.useState(rows);
  if (seen !== rows) { setSeen(rows); setMoved({}); }
  const [moving, setMoving] = React.useState<ProspectRow | null>(null);
  const [limits, setLimits] = React.useState<Record<string, number>>({});
  const stageOf = (p: ProspectRow) => moved[p.id] ?? p.stage_id ?? "";

  const move = (p: ProspectRow, to: string) => {
    setMoving(null);
    const target = stages.find((s) => s.id === to); if (!target || stageOf(p) === to) return;
    setMoved((m) => ({ ...m, [p.id]: to }));
    exec(() => updateProspectAction(p.id, { stage_id: to }), { success: `Déplacé vers « ${target.name} ».`, refresh: false, onSuccess: onMoved })
      .then((res) => { if (!res.ok) setMoved((m) => { const n = { ...m }; delete n[p.id]; return n; }); });
  };
  if (!stages.length) return <p className="rounded-[12px] bg-mk-chip px-4 py-10 text-center text-[15px] text-mk-sub">Aucune étape dans le pipeline.</p>;

  return (
    <>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Étapes du pipeline">
        {stages.map((s) => {
          const list = rows.filter((p) => stageOf(p) === s.id), limit = limits[s.id] ?? PAGE_CARDS, shown = list.slice(0, limit);
          const total = list.reduce((sum, r) => sum + (amountOf(r) ?? 0), 0);
          return (
            <section key={s.id} id={columnId(s.id)} aria-label={s.name} className="flex h-[calc(100dvh-300px)] min-h-[340px] w-[85%] shrink-0 snap-start flex-col rounded-[12px] bg-mk-chip p-3">
              <header className="flex items-start gap-3 pb-3">
                <Link href={`/marketing/crm/nouveau?etape=${s.id}`} aria-label={`Ajouter un prospect à l'étape ${s.name}`} className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[6px] text-white transition active:scale-95" style={{ background: stageHex(s) }}>
                  <Plus className="size-5" strokeWidth={2.4} />
                </Link>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[16px] font-semibold leading-snug text-mk-strong">{s.name}</h3>
                  <p className="mt-0.5 flex items-center justify-between gap-2 text-[13px] text-mk-sub tabular"><span>{plural(list.length, "Prospect")}</span><span>{money(total)}</span></p>
                </div>
              </header>
              <ul className="-mx-1 flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-1 pb-20">
                {shown.map((p) => <MobileCard key={p.id} p={p} stage={s} upcoming={upcoming.has(p.id)} memberName={memberName} actions={actions} onMove={() => setMoving(p)} busy={pending} />)}
                {list.length > shown.length ? (
                  <li><button type="button" onClick={() => setLimits((l) => ({ ...l, [s.id]: limit + PAGE_CARDS }))} className="flex h-11 w-full items-center justify-center rounded-[12px] bg-surface text-[15px] font-medium text-accent-2 shadow-soft">Afficher plus ({list.length - shown.length})</button></li>
                ) : null}
                {list.length === 0 ? <li className="rounded-[12px] border border-dashed border-mk-input px-4 py-8 text-center text-[14px] text-mk-sub">Aucun prospect à cette étape.</li> : null}
              </ul>
            </section>
          );
        })}
      </div>
      <MoveSheet p={moving} stages={stages} current={moving ? stageOf(moving) : ""} onClose={() => setMoving(null)} onPick={(to) => moving && move(moving, to)} />
    </>
  );
}

function MobileCard({ p, stage, upcoming, memberName, actions, onMove, busy }: { p: ProspectRow; stage: Stage; upcoming: boolean; memberName: Record<string, string>; actions: CardActions; onMove: () => void; busy: boolean }) {
  const name = dealName(p);
  return (
    <li className="relative rounded-[12px] bg-surface p-3.5 shadow-soft">
      <div className="flex items-start gap-3">
        {/* Toute la carte ouvre le prospect ; les boutons restent au-dessus du lien. */}
        <Link href={`/marketing/crm/${p.id}`} className="min-w-0 flex-1 truncate text-[16px] font-semibold leading-6 text-mk-strong after:absolute after:inset-0 after:rounded-[12px] after:content-['']">{name}</Link>
        <span className="shrink-0 text-[15px] font-semibold leading-6 text-mk-strong tabular">{money(amountOf(p))}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-3">
        <p className="min-w-0 flex-1 truncate text-[13px] text-mk-sub">Source : {p.source ?? "—"}</p>
        <OwnerBadge p={p} memberName={memberName} onAssign={actions.assign} size={30} />
      </div>
      <div className="mt-2 flex items-center">
        <CardIcons p={p} upcoming={upcoming} onEmail={actions.email} onTask={actions.task} mobile />
        <button type="button" onClick={onMove} disabled={busy} aria-label={`Changer l'étape de ${name} (actuellement ${stage.name})`}
          className="relative z-10 ml-auto flex size-9 items-center justify-center rounded-[8px] text-white transition active:scale-95 disabled:opacity-60" style={{ background: stageHex(stage) }}>
          <ArrowLeftRight className="size-5" strokeWidth={2.2} />
        </button>
      </div>
    </li>
  );
}

/** Feuille « Déplacer vers… » : les étapes avec leur couleur, l'actuelle cochée. */
function MoveSheet({ p, stages, current, onClose, onPick }: { p: ProspectRow | null; stages: Stage[]; current: string; onClose: () => void; onPick: (stageId: string) => void }) {
  return (
    <Sheet open={!!p} onOpenChange={(o) => { if (!o) onClose(); }} title="Déplacer vers…" description={p ? dealName(p) : undefined}>
      <div role="radiogroup" aria-label="Étapes">
        {stages.map((s) => <SheetOption key={s.id} selected={s.id === current} onSelect={() => onPick(s.id)} leading={<StageDot stage={s} className="size-3" />} label={s.name} />)}
      </div>
    </Sheet>
  );
}

/** Téléphone, vue « Liste » : une ligne par prospect (rond d'initiales, nom, étape, valeur), par paquets de 50. */
export function MobileList({ rows, stages, emptyText }: { rows: ProspectRow[]; stages: Stage[]; emptyText: string }) {
  const [limit, setLimit] = React.useState(PAGE_CARDS);
  const byId = React.useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);
  if (!rows.length) return <p className="rounded-[12px] bg-mk-chip px-4 py-10 text-center text-[15px] text-mk-sub">{emptyText}</p>;
  return (
    <div>
      <ul className="-mx-4" aria-label="Prospects">
        {rows.slice(0, limit).map((p) => {
          const stage = (p.stage_id ? byId.get(p.stage_id) : null) ?? p.stage;
          return (
            <li key={p.id}>
              <Link href={`/marketing/crm/${p.id}`} className="flex items-center gap-3.5 pl-4 pr-4 transition active:bg-mk-chip">
                <MkInitials name={nameOf(p)} size={44} />
                <span className="min-w-0 flex-1 border-b border-mk-line py-3.5">
                  <span className="flex items-baseline gap-3"><span className="min-w-0 flex-1 truncate text-[16px] font-semibold text-mk-strong">{dealName(p)}</span><span className="shrink-0 text-[14px] font-medium text-mk-text tabular">{money(amountOf(p))}</span></span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[14px] text-mk-sub"><StageDot stage={stage} className="size-2" /><span className="truncate">{stage?.name ?? "Sans étape"}{p.source ? ` · ${p.source}` : ""}</span></span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {rows.length > limit ? <button type="button" onClick={() => setLimit((l) => l + PAGE_CARDS)} className="mt-3 flex h-12 w-full items-center justify-center rounded-[10px] border border-mk-input text-[15px] font-medium text-accent-2">Afficher plus ({rows.length - limit})</button> : null}
    </div>
  );
}
