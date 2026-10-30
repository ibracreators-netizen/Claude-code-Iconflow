"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, MessageSquare, SendHorizontal } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import type { Message } from "@/lib/data/types";
import { cn, fmt } from "@/lib/utils";
import { useAction } from "@/lib/hooks/use-action";
import { sendMessage } from "@/lib/actions/messages";

export interface ThreadPreview { id: string; name: string; logo: string | null; last: { body: string; at: string; mine: boolean; fromAgency: boolean } | null }
type People = Record<string, { name: string; role: "agency" | "client"; avatar: string | null }>;

export function Messenger({ previews, selectedId, thread, meId, people, basePath }: { previews: ThreadPreview[]; selectedId: string | null; thread: Message[]; meId: string; people: People; basePath: string }) {
  const { exec, pending } = useAction();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const selected = previews.find((p) => p.id === selectedId) ?? null;
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [thread.length, selectedId]);

  async function send() {
    if (!selectedId || !draft.trim()) return;
    const text = draft; setDraft("");
    const res = await exec(() => sendMessage(selectedId, text));
    if (!res.ok) setDraft(text);
  }

  const days: Array<{ day: string; items: Message[] }> = [];
  thread.forEach((m) => { const day = fmt.dateLong(m.created_at); const g = days[days.length - 1]; if (g && g.day === day) g.items.push(m); else days.push({ day, items: [m] }); });

  return (
    <div className="card grid min-h-[calc(100dvh-220px)] overflow-hidden lg:grid-cols-[300px_1fr]">
      <aside className={cn("border-border lg:border-r", selectedId && "hidden lg:block")}>
        <div className="border-b border-border px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Conversations</div>
        <ul className="max-h-[70dvh] overflow-y-auto">
          {previews.map((p) => (
            <li key={p.id}>
              <Link href={`${basePath}?client=${p.id}`} className={cn("flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2", p.id === selectedId && "bg-accent-soft/60")}>
                <Avatar name={p.name} src={p.logo} size={36} square />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2"><span className="truncate text-[13.5px] font-medium">{p.name}</span>{p.last ? <span className="shrink-0 text-[11px] text-muted">{fmt.relative(p.last.at)}</span> : null}</div>
                  <p className={cn("truncate text-[12.5px]", p.last && !p.last.fromAgency ? "font-medium text-fg" : "text-muted")}>{p.last ? `${p.last.mine ? "Vous : " : ""}${p.last.body}` : "Aucun message"}</p>
                </div>
                {p.last && !p.last.fromAgency ? <span className="size-2 shrink-0 rounded-full bg-accent" aria-label="Dernier message du client" /> : null}
              </Link>
            </li>
          ))}
          {!previews.length ? <li className="px-4 py-8 text-center text-[13px] text-muted">Aucun client actif.</li> : null}
        </ul>
      </aside>

      <section className={cn("flex min-h-[60dvh] flex-col", !selectedId && "hidden lg:flex")}>
        {selected ? (
          <>
            <header className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Link href={basePath} className="rounded-md p-1 text-muted lg:hidden" aria-label="Retour"><ArrowLeft className="size-4" /></Link>
              <Avatar name={selected.name} src={selected.logo} size={30} square />
              <div className="min-w-0"><p className="truncate text-[13.5px] font-semibold">{selected.name}</p><p className="text-[11.5px] text-muted">Fil partagé avec l&apos;espace client</p></div>
              <Link href={`/studio/clients/${selected.id}`} className="ml-auto text-[12.5px] font-medium text-accent-2 hover:underline">Fiche client</Link>
            </header>
            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
              {days.map((g) => (
                <div key={g.day}>
                  <div className="mb-3 flex items-center gap-3 text-[11px] font-medium uppercase tracking-wider text-muted-2"><span className="h-px flex-1 bg-border" />{g.day}<span className="h-px flex-1 bg-border" /></div>
                  <div className="space-y-3">
                    {g.items.map((m) => {
                      const mine = m.author_id === meId; const who = people[m.author_id];
                      return (
                        <div key={m.id} className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
                          <Avatar name={who?.name ?? "?"} src={who?.avatar} size={26} />
                          <div className={cn("max-w-[78%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed", mine ? "rounded-br-sm bg-accent text-accent-fg" : "rounded-bl-sm bg-surface-2 text-fg")}>
                            {!mine ? <p className="mb-0.5 text-[11px] font-semibold opacity-70">{who?.name}{who?.role === "agency" ? " · Iconflow" : ""}</p> : null}
                            <p className="whitespace-pre-wrap break-words">{m.body}</p>
                            <p className={cn("mt-1 text-right text-[10.5px] tabular", mine ? "text-accent-fg/70" : "text-muted")}>{fmt.date(m.created_at, { hour: "2-digit", minute: "2-digit" })}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {!thread.length ? <EmptyState compact icon={MessageSquare} title="Démarre la conversation" description="Le client voit ce fil dans son espace." /> : null}
              <div ref={endRef} />
            </div>
            <form className="flex items-end gap-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={1} placeholder={`Écrire à ${selected.name}… (⌘⏎ pour envoyer)`} className="min-h-[40px] max-h-40" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void send(); } }} />
              <Button type="submit" size="icon" loading={pending} disabled={!draft.trim()} aria-label="Envoyer"><SendHorizontal /></Button>
            </form>
          </>
        ) : <EmptyState icon={MessageSquare} title="Choisis une conversation" description="Sélectionne un client dans la liste." />}
      </section>
    </div>
  );
}
