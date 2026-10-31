import Link from "next/link";
import { Brain, Lightbulb, Sparkles, Users } from "lucide-react";
import { requireClient } from "@/lib/auth/session";
import { fmt } from "@/lib/utils";
import { PageHeader } from "@/components/ui/misc";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { BrainVisual } from "@/components/shared/brain-visual";
import { BrainEditor } from "./brain-editor";

export const metadata = { title: "Brain" };

export default async function BrainPage() {
  const store = await requireClient();
  const [client, dossier, avatars] = await Promise.all([store.client(store.clientId), store.brandDossier(store.clientId), store.avatars(store.clientId)]);
  const chosen = avatars.filter((a) => a.chosen);
  const data = dossier?.data ?? {};
  const personas = Array.isArray(data.personas) ? data.personas.length : 0;
  const concurrents = Array.isArray(data.concurrents) ? data.concurrents.length : 0;
  const stats = [
    { label: "Promesse", value: data.promesse ? "Posée" : "À écrire" },
    { label: "Personas", value: String(personas) },
    { label: "Concurrents", value: String(concurrents) },
    { label: "Avatars retenus", value: String(chosen.length) },
  ];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="La mémoire de votre marque" title={`Le Brain de ${client?.name ?? "votre marque"}`} description="Tout ce qui fait votre marque, au même endroit. C'est à partir de ces informations que l'équipe construit les angles, les hooks et les scripts." />
      <section className="card relative overflow-hidden animate-rise">
        <div className="grid md:grid-cols-[1fr_minmax(240px,40%)]">
          <div className="p-5 md:self-center">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted">Votre marque, en mémoire</p>
            <p className="mt-1.5 text-[15px] font-medium tracking-tight">{dossier?.updated_at ? `Mis à jour ${fmt.relative(dossier.updated_at)}.` : "Votre Brain démarre : quelques minutes suffisent pour le poser."}</p>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              {stats.map((s) => <div key={s.label} className="min-w-0"><dt className="truncate text-[12px] font-medium text-muted">{s.label}</dt><dd className="mt-1 text-[22px] font-semibold leading-none tracking-[-0.03em] tabular">{s.value}</dd></div>)}
            </dl>
          </div>
          <div className="relative h-[170px] border-t border-border bg-surface-2/40 md:h-auto md:min-h-[172px] md:border-l md:border-t-0">
            <BrainVisual className="absolute inset-0 size-full" points={2200} />
            <p className="pointer-events-none absolute bottom-2.5 right-3 text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-2">{client?.name ?? "Brain"}</p>
          </div>
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-3">
        {[{ icon: Brain, t: "Une base fiable", d: "Promesse, personas, ton : la référence pour toute création." }, { icon: Lightbulb, t: "Des angles plus justes", d: "Plus le Brain est précis, plus les scripts touchent juste." }, { icon: Sparkles, t: "Vivant", d: "Complétez-le à tout moment : l'équipe est notifiée." }].map((c) => (
          <div key={c.t} className="card flex gap-3 p-4"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-2"><c.icon className="size-4" /></span><div><p className="text-[13.5px] font-medium">{c.t}</p><p className="text-[12.5px] text-muted">{c.d}</p></div></div>
        ))}
      </div>
      <BrainEditor clientId={store.clientId} initial={data} updatedAt={dossier?.updated_at ?? null} />
      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight"><Users className="size-4 text-muted" />Avatars retenus</h2>
          <Link href="/app/avatars" className={buttonVariants({ variant: "ghost", size: "sm" })}>Gérer</Link>
        </div>
        {chosen.length ? <ul className="flex flex-wrap gap-3">{chosen.map((a) => <li key={a.id} className="flex items-center gap-2 rounded-full bg-surface-2 py-1 pl-1 pr-3 text-[13px]"><Avatar name={a.name} src={a.preview_url} size={26} />{a.name}</li>)}</ul> : <p className="text-[13px] text-muted">Aucun avatar retenu pour l&apos;instant. {avatars.length ? "Choisissez les visages qui incarneront vos créations." : "L'équipe vous proposera bientôt des profils."}</p>}
        {dossier?.updated_at ? <p className="mt-4 text-[11.5px] text-muted-2">Brain mis à jour {fmt.relative(dossier.updated_at)}</p> : null}
      </section>
    </div>
  );
}
