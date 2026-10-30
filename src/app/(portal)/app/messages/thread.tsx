"use client";
import * as React from "react";
import { Send, MessageSquare } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useAction } from "@/lib/hooks/use-action";
import { sendMessage } from "@/lib/actions/portal";
import { fmt } from "@/lib/utils";
import type { Message } from "@/lib/data/types";

type Author = { name: string; role: string; avatar: string | null; title: string | null };

export function Thread({ clientId, messages, authors, me }: { clientId: string; messages: Message[]; authors: Record<string, Author>; me: string }) {
  const [body, setBody] = React.useState("");
  const { exec, pending } = useAction();
  const endRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);
  const send = () => { if (!body.trim()) return; exec(() => sendMessage(clientId, body), { onSuccess: () => setBody("") }); };
  let lastDay = "";
  return (
    <div className="card flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length ? messages.map((m) => {
          const a = authors[m.author_id]; const mine = m.author_id === me; const day = fmt.dateLong(m.created_at); const showDay = day !== lastDay; lastDay = day;
          return (
            <React.Fragment key={m.id}>
              {showDay ? <div className="flex items-center gap-3 py-2 text-[11px] text-muted-2"><span className="h-px flex-1 bg-border" />{day}<span className="h-px flex-1 bg-border" /></div> : null}
              <div className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                {!mine ? <Avatar name={a?.name ?? "icon-flow"} src={a?.avatar} size={28} /> : null}
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed ${mine ? "rounded-br-md bg-accent text-accent-fg" : "rounded-bl-md bg-surface-2"}`}>
                  {!mine ? <p className="mb-0.5 text-[11.5px] font-medium text-muted">{a?.name ?? "icon-flow"}{a?.title ? ` · ${a.title}` : ""}</p> : null}
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className={`mt-1 text-right text-[10.5px] ${mine ? "text-accent-fg/70" : "text-muted-2"}`}>{fmt.date(m.created_at, { hour: "2-digit", minute: "2-digit" })}</p>
                </div>
              </div>
            </React.Fragment>
          );
        }) : <div className="flex h-full flex-col items-center justify-center text-center text-muted"><MessageSquare className="mb-2 size-6" /><p className="text-[13.5px] font-medium text-fg">Démarrez la conversation</p><p className="text-[12.5px]">Une question, une idée, un retour ? L&apos;équipe vous répond ici.</p></div>}
        <div ref={endRef} />
      </div>
      <form className="flex items-end gap-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }} rows={1} placeholder="Écrire un message… (⌘↵ pour envoyer)" className="min-h-[44px] max-h-40" />
        <Button type="submit" size="icon" loading={pending} aria-label="Envoyer"><Send /></Button>
      </form>
    </div>
  );
}
