"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, RotateCcw, SquarePen } from "lucide-react";
import { cn } from "@/lib/utils";
import { MK_GROUPS, type MkApp } from "@/lib/marketing/apps";
import { MK_ICONS } from "@/components/marketing/mk-icon";
import { MkCard, MkRoundGrid, MkRoundLink } from "@/components/marketing/ui";

/** Bouton rond « Actualiser » à droite de « Bienvenue » : relit les chiffres sans recharger la page. */
export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <button type="button" onClick={() => start(() => router.refresh())} aria-label="Actualiser" title="Actualiser" disabled={pending}
      className="-mr-1.5 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-accent-2 transition hover:bg-mk-chip active:bg-mk-chip disabled:opacity-80">
      <RotateCcw className={cn("size-[22px]", pending && "animate-spin [animation-direction:reverse]")} strokeWidth={2} />
    </button>
  );
}

/* ─── Applications épinglées : propres à chaque appareil (navigateur), 8 au plus ─── */

const KEY = "iconflow-mk-pinned";
const MAX = 8;
// Navigation privée ou stockage bloqué : le choix tient en mémoire, au moins jusqu'au rechargement de la page.
let fallback: string | null = null, broken = false;
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => { listeners.delete(cb); window.removeEventListener("storage", cb); };
}
function read(): string | null {
  if (broken) return fallback;
  try { return window.localStorage.getItem(KEY); } catch { broken = true; return fallback; }
}
function write(keys: string[] | null) {
  fallback = keys ? JSON.stringify(keys) : null;
  try { if (fallback) window.localStorage.setItem(KEY, fallback); else window.localStorage.removeItem(KEY); } catch { broken = true; }
  listeners.forEach((cb) => cb());
}

export function PinnedApps({ apps, defaults }: { apps: MkApp[]; defaults: string[] }) {
  // Côté serveur et au premier affichage : les applications par défaut ; ensuite, le choix enregistré sur cet appareil.
  const raw = React.useSyncExternalStore(subscribe, read, () => null);
  const byKey = React.useMemo(() => new Map(apps.map((a) => [a.key, a])), [apps]);
  const pinned = React.useMemo(() => {
    let keys = defaults;
    if (raw !== null) { try { const v: unknown = JSON.parse(raw); if (Array.isArray(v)) keys = v.filter((k): k is string => typeof k === "string"); } catch { /* valeur illisible : défaut */ } }
    return [...new Set(keys)].map((k) => byKey.get(k)).filter((a): a is MkApp => !!a).slice(0, MAX);
  }, [raw, defaults, byKey]);
  const [editing, setEditing] = React.useState(false);
  const full = pinned.length >= MAX;
  const save = (next: MkApp[]) => write(next.map((a) => a.key));
  const toggle = (app: MkApp) => (pinned.some((p) => p.key === app.key) ? save(pinned.filter((p) => p.key !== app.key)) : full ? undefined : save([...pinned, app]));

  if (!editing) {
    return (
      <MkCard title="Applications épinglées" action={
        <button type="button" onClick={() => setEditing(true)} aria-label="Modifier les applications épinglées" title="Modifier"
          className="-my-1.5 -mr-1.5 inline-flex size-10 items-center justify-center rounded-full text-accent-2 transition hover:bg-mk-chip active:bg-mk-chip">
          <SquarePen className="size-[22px]" strokeWidth={1.8} />
        </button>
      }>
        {pinned.length ? (
          <MkRoundGrid>{pinned.map((a) => <MkRoundLink key={a.key} href={a.href} icon={MK_ICONS[a.icon]} label={a.label} />)}</MkRoundGrid>
        ) : (
          <p className="py-2 text-[14px] text-mk-sub">Aucune application épinglée. Touche le crayon pour en choisir jusqu&apos;à {MAX}.</p>
        )}
      </MkCard>
    );
  }

  const others = MK_GROUPS.map((g) => ({ ...g, apps: apps.filter((a) => a.group === g.key && !pinned.some((p) => p.key === a.key)) })).filter((g) => g.apps.length);
  return (
    <MkCard title="Applications épinglées" action={
      <button type="button" onClick={() => setEditing(false)} className="-my-1 -mr-1 h-9 rounded-lg px-3 text-[15px] font-semibold text-accent-2 transition hover:bg-mk-chip">Terminé</button>
    }>
      <p className="-mt-1 mb-4 text-[14px] text-mk-sub" aria-live="polite">
        <span className="font-semibold text-mk-text tabular">{pinned.length}/{MAX}</span> · {full ? "Retire une application pour en épingler une autre." : "Touche une application pour l'épingler ou la retirer."}
      </p>
      {pinned.length ? (
        <MkRoundGrid>{pinned.map((a) => <PinToggle key={a.key} app={a} pinned onClick={() => toggle(a)} />)}</MkRoundGrid>
      ) : <p className="pb-1 text-[14px] text-mk-sub">Aucune application épinglée pour l&apos;instant.</p>}
      {others.map((g) => (
        <div key={g.key} className="mt-5 border-t border-mk-line pt-4">
          <h3 className="mb-3 text-[14px] font-semibold text-mk-strong">{g.title}</h3>
          <MkRoundGrid>{g.apps.map((a) => <PinToggle key={a.key} app={a} disabled={full} onClick={() => toggle(a)} />)}</MkRoundGrid>
        </div>
      ))}
      {raw !== null ? (
        <button type="button" onClick={() => write(null)} className="mt-4 text-[14px] font-medium text-mk-link hover:underline">Rétablir les applications par défaut</button>
      ) : null}
    </MkCard>
  );
}

/** Rond d'application en mode modification : pastille rouge « − » pour retirer, pastille « + » pour épingler. */
function PinToggle({ app, pinned, disabled, onClick }: { app: MkApp; pinned?: boolean; disabled?: boolean; onClick: () => void }) {
  const Icon = MK_ICONS[app.icon];
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={pinned ? `Retirer « ${app.label} »` : `Épingler « ${app.label} »`}
      className="group flex flex-col items-center gap-2 rounded-xl px-1 py-1 outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40">
      <span className={cn("relative flex size-14 items-center justify-center rounded-full border bg-surface transition group-enabled:group-active:scale-95",
        pinned ? "border-accent/60 text-accent-2" : "border-mk-input text-mk-icon group-enabled:group-hover:border-accent/60 group-enabled:group-hover:text-accent-2")}>
        <Icon className="size-6" strokeWidth={1.7} />
        <span aria-hidden className={cn("absolute -right-1 -top-1 flex size-[22px] items-center justify-center rounded-full ring-2 ring-surface", pinned ? "bg-mk-danger text-white" : "bg-accent text-accent-fg")}>
          {pinned ? <Minus className="size-3.5" strokeWidth={3} /> : <Plus className="size-3.5" strokeWidth={3} />}
        </span>
      </span>
      <span className="line-clamp-2 max-w-[84px] hyphens-auto break-words text-center text-[12px] font-medium leading-tight text-mk-text">{app.label}</span>
    </button>
  );
}
