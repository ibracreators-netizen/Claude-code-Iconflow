"use client";
import * as React from "react";
import { Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { measureSpeedAction } from "@/lib/actions/marketing-speed";
import type { SpeedReport } from "@/lib/marketing/speed";
import { cn } from "@/lib/utils";
import { BTN_LIGHT, Panel } from "./kit";

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
    <Panel
      title={<><span className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-accent-2"><Gauge className="size-4" /></span>Vitesse de l&apos;app</>}
      description="Mesure le temps que met le serveur pour joindre la base de données. C'est ce délai, répété à chaque page, qui fait la lenteur ressentie."
      action={<Button variant="outline" size="sm" className={BTN_LIGHT} loading={pending} onClick={run}>{report ? "Mesurer à nouveau" : "Mesurer"}</Button>}>
      {!error && !report ? <p className="text-[14px] text-mk-sub">Appuie sur « Mesurer » : trois secondes au plus.</p> : null}
      {error ? <p className="text-[14px] text-mk-danger">{error}</p> : null}
      {report && !report.configured ? <p className="text-[14px] text-mk-sub">Pas de base reliée (projet de démonstration) : rien à mesurer.</p> : null}
      {report && report.configured && v ? (
        <div className="space-y-1.5 text-[14px] text-mk-text">
          <p>Base de données : <b className={cn("font-semibold", v.tone)}>{report.median} ms par requête · {v.label}</b> <span className="text-mk-sub">(essais : {report.samples.join(", ")} ms)</span></p>
          <p className="text-mk-sub">Vérification de la session : {report.sessionMs} ms.</p>
          <p className="text-mk-sub">{v.text}</p>
        </div>
      ) : null}
    </Panel>
  );
}
