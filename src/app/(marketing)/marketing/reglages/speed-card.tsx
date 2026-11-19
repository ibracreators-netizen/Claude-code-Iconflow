"use client";
import * as React from "react";
import { Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { measureSpeedAction } from "@/lib/actions/marketing-speed";
import type { SpeedReport } from "@/lib/marketing/speed";
import { cn } from "@/lib/utils";

const VERDICT: Record<NonNullable<SpeedReport["verdict"]>, { label: string; tone: string; text: string }> = {
  rapide: { label: "rapide", tone: "text-success", text: "La base répond vite : la vitesse ne vient pas de là." },
  correct: { label: "correct", tone: "text-warning", text: "Acceptable. Si l'app paraît lente, rapprocher la base et le serveur (même région) aiderait." },
  lent: { label: "lent", tone: "text-danger", text: "Chaque page attend plusieurs fois ce délai. La base est sans doute dans une région éloignée du serveur : il faut les mettre dans la même région (Europe de l'Ouest par exemple)." },
};

/** Carte « Vitesse de l'app » : mesure, à la demande, le temps d'un aller-retour serveur → base de données. */
export function SpeedCard() {
  const [report, setReport] = React.useState<SpeedReport | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const run = () => start(async () => {
    const r = await measureSpeedAction();
    if (r.ok) { setReport(r.report); setError(null); } else setError(r.error);
  });
  const v = report?.verdict ? VERDICT[report.verdict] : null;
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-muted"><Gauge className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold">Vitesse de l&apos;app</h3>
          <p className="text-[12.5px] text-muted">Mesure le temps que met le serveur pour joindre la base de données. C&apos;est ce délai, répété à chaque page, qui fait la lenteur ressentie.</p>
        </div>
        <Button variant="secondary" size="sm" loading={pending} onClick={run}>{report ? "Mesurer à nouveau" : "Mesurer"}</Button>
      </div>
      {error ? <p className="mt-3 text-[13px] text-danger">{error}</p> : null}
      {report && !report.configured ? <p className="mt-3 text-[13px] text-muted">Pas de base reliée (projet de démonstration) : rien à mesurer.</p> : null}
      {report && report.configured && v ? (
        <div className="mt-4 space-y-1.5 text-[13.5px]">
          <p>Base de données : <b className={cn("font-semibold", v.tone)}>{report.median} ms par requête · {v.label}</b> <span className="text-muted">(essais : {report.samples.join(", ")} ms)</span></p>
          <p className="text-muted">Vérification de la session : {report.sessionMs} ms.</p>
          <p className="text-muted">{v.text}</p>
        </div>
      ) : null}
    </section>
  );
}
