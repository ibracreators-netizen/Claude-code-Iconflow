import { Badge } from "@/components/ui/badge";
import type { Brief, StaticBriefContent, VideoBriefContent } from "@/lib/data/types";

const LABELS: Record<string, string> = { concept: "Concept", transcription: "Transcription", hooks: "Hooks", corps: "Corps", ctas: "Appels à l'action", acting: "Acting & plans", reference: "Référence", angle: "Angle", overlay: "Texte à l'écran", framework: "Framework", plans: "Plans", script: "Script" };

function Text({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") return <p className="text-[13px] italic text-muted-2">Non renseigné</p>;
  if (typeof value === "string") return <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-fg-2">{value}</p>;
  if (Array.isArray(value)) {
    const items = value.filter((v) => v !== "" && v !== null);
    if (!items.length) return <p className="text-[13px] italic text-muted-2">Non renseigné</p>;
    return <ol className="space-y-2">{items.map((v, i) => <li key={i} className="flex gap-3 rounded-lg bg-surface-2 px-3 py-2 text-[14px] leading-relaxed"><span className="font-mono text-[11px] text-muted pt-1">{String(i + 1).padStart(2, "0")}</span><span className="text-fg-2 whitespace-pre-wrap">{typeof v === "string" ? v : JSON.stringify(v)}</span></li>)}</ol>;
  }
  if (typeof value === "object") return <div className="space-y-3">{Object.entries(value as Record<string, unknown>).map(([k, v]) => <div key={k}><h4 className="mb-1 text-[12px] font-semibold uppercase tracking-wider text-muted">{LABELS[k] ?? k.replaceAll("_", " ")}</h4><Text value={v} /></div>)}</div>;
  return <p className="text-[14px]">{String(value)}</p>;
}

function Block({ step, title, children }: { step?: string; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h3 className="mb-3 flex items-center gap-2 text-[15px] font-semibold tracking-tight">{step ? <span className="flex size-6 items-center justify-center rounded-full bg-accent-soft font-mono text-[11px] text-accent-2">{step}</span> : null}{title}</h3>
      {children}
    </section>
  );
}

/** Présentation structurée (lecture seule) d'un brief vidéo ou statique. */
export function BriefContent({ brief }: { brief: Brief }) {
  const c = (brief.content ?? {}) as Record<string, unknown>;
  if (brief.kind === "video") {
    const v = c as unknown as VideoBriefContent;
    const t = (v.transcription ?? {}) as Record<string, unknown>;
    const used = new Set(["concept", "transcription", "acting", "angle", "framework"]);
    const rest = Object.fromEntries(Object.entries(c).filter(([k]) => !used.has(k)));
    return (
      <div className="space-y-4">
        {(v.angle || v.framework) ? <div className="flex flex-wrap gap-2">{v.angle ? <Badge tone="accent">Angle · {String(v.angle)}</Badge> : null}{v.framework ? <Badge tone="outline">Framework {String(v.framework)}</Badge> : null}</div> : null}
        <Block step="1" title="Le concept"><Text value={v.concept} /></Block>
        <Block step="2" title="Transcription">
          <div className="space-y-5">
            <div><h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted">Hooks (3 premières secondes)</h4><Text value={t.hooks ?? t.hook} /></div>
            <div><h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted">Corps</h4><Text value={t.corps ?? t.body} /></div>
            <div><h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted">Appels à l&apos;action</h4><Text value={t.ctas ?? t.cta} /></div>
            {Object.entries(t).filter(([k]) => !["hooks", "hook", "corps", "body", "ctas", "cta"].includes(k)).map(([k, val]) => <div key={k}><h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted">{LABELS[k] ?? k}</h4><Text value={val} /></div>)}
          </div>
        </Block>
        <Block step="3" title="Acting & plans"><Text value={v.acting} /></Block>
        {Object.keys(rest).length ? <Block title="Autres informations"><Text value={rest} /></Block> : null}
      </div>
    );
  }
  const s = c as unknown as StaticBriefContent;
  const rest = Object.fromEntries(Object.entries(c).filter(([k]) => !["reference", "angle", "overlay"].includes(k)));
  return (
    <div className="space-y-4">
      <Block title="Référence visuelle"><Text value={s.reference} /></Block>
      <Block title="Angle"><Text value={s.angle} /></Block>
      <Block title="Texte à l'écran"><Text value={s.overlay} /></Block>
      {Object.keys(rest).length ? <Block title="Autres informations"><Text value={rest} /></Block> : null}
    </div>
  );
}
