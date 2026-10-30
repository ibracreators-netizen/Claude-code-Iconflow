"use client";
import * as React from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { useAction } from "@/lib/hooks/use-action";
import { addComment, decideLivrable } from "@/lib/actions/portal";
import { fmt } from "@/lib/utils";
import type { LivrableComment } from "@/lib/data/types";
import { DecisionCard } from "../../_components/decision-card";

export function LivrableDecision({ id }: { id: string }) {
  return <DecisionCard title="Ce livrable vous convient-il ?" description="Regardez la vidéo ou le visuel. En validant, il est prêt à diffuser. Sinon, indiquez ce qui doit changer." validateLabel="Valider le livrable"
    onValidate={() => decideLivrable(id, "valide")} onCorrection={(c) => decideLivrable(id, "correction", c)} />;
}

export function CommentThread({ livrableId, comments, authors, me }: { livrableId: string; comments: LivrableComment[]; authors: Record<string, { name: string; role: string; avatar: string | null }>; me: string }) {
  const [body, setBody] = React.useState("");
  const { exec, pending } = useAction();
  return (
    <section className="card p-5">
      <h3 className="mb-4 text-[15px] font-semibold tracking-tight">Échanges sur ce livrable</h3>
      {comments.length ? (
        <ol className="space-y-3">{comments.map((c) => { const a = c.author ? authors[c.author] : null; const mine = c.author === me; return (
          <li key={c.id} className={`flex gap-3 ${mine ? "flex-row-reverse" : ""}`}>
            <Avatar name={a?.name ?? "?"} src={a?.avatar} size={28} />
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-[13.5px] leading-relaxed ${mine ? "bg-accent-soft" : "bg-surface-2"}`}><p className="mb-0.5 text-[11.5px] text-muted">{mine ? "Vous" : a ? `${a.name}${a.role === "agency" ? " · icon-flow" : ""}` : "Auteur inconnu"} · {fmt.dateTime(c.created_at)}</p><p className="whitespace-pre-wrap">{c.body}</p></div>
          </li>
        ); })}</ol>
      ) : <p className="text-[13px] text-muted">Aucun échange pour l&apos;instant. Une question, une remarque ? Écrivez-la ici.</p>}
      <form className="mt-4 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (!body.trim()) return; exec(() => addComment(livrableId, body), { success: "Commentaire envoyé.", onSuccess: () => setBody("") }); }}>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Écrire un commentaire…" className="min-h-[44px]" />
        <Button type="submit" size="icon" loading={pending} aria-label="Envoyer"><Send /></Button>
      </form>
    </section>
  );
}
