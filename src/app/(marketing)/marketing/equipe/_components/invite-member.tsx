"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, CheckCircle2, Copy, Info, Link2, MailCheck, RotateCw, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { inviteSalesMemberAction, resendSalesInviteAction, updateSalesMemberAction } from "@/lib/actions/marketing";
import type { ActionResult } from "@/lib/actions/result";
import { INVITE_ROLES, INVITE_ROLE_HINT, INVITE_ROLE_LABEL, firstName, pagesForRole, responsableOpensStudio, type InviteOutcome, type InviteProblem, type InviteRole } from "@/lib/marketing/invite-errors";
import { cn } from "@/lib/utils";
import { BTN, BTN_GHOST, BTN_LIGHT, INPUT, Notice } from "../../reglages/kit";
import { PageChoices } from "./page-choices";

/*
 * Fenêtre « Inviter un membre », la même sur Équipe et sur Réglages › Équipe et accès. Nom, e-mail, rôle et les pages
 * auxquelles il aura accès (cochées selon le rôle, modifiables) : rien d'autre, jamais de client. Le résultat s'affiche dans
 * la fenêtre : e-mail envoyé, ou lien à transmettre avec « Copier », ou erreur expliquée avec le geste qui la règle
 * (renvoyer l'invitation, rétablir l'accès, reprendre un compte inactif).
 */

/** Une action d'invitation renvoie toujours un résultat lisible, même quand l'appel lui-même échoue. */
const outcomeOf = (r: ActionResult<InviteOutcome>): InviteOutcome =>
  r.ok ? r.data : { status: "erreur", problem: { code: "inconnu", title: "L'invitation n'a pas abouti.", help: "Réessaie dans un instant. Si l'erreur revient, transmets le détail ci-dessous.", technical: r.error } };

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="text-[14px] font-medium text-mk-text">{children}<span className="ml-0.5 text-mk-required" aria-hidden>*</span></label>;
}

/** Lien d'invitation à transmettre, avec « Copier ». Sans lien (démo), le cadre reste vide et le bouton inactif. */
function CopyLink({ link }: { link: string | null }) {
  const ref = React.useRef<HTMLInputElement>(null);
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); }
    catch { ref.current?.select(); document.execCommand("copy"); }
    setCopied(true); toast.success("Lien copié.");
    window.setTimeout(() => setCopied(false), 2500);
  };
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input ref={ref} readOnly value={link ?? ""} placeholder="Le lien d'invitation apparaît ici" aria-label="Lien d'invitation" onFocus={(e) => e.currentTarget.select()} className={cn(INPUT, "w-full min-w-0 text-[14px] text-mk-text sm:flex-1 lg:text-[13px]")} />
      <Button type="button" variant="outline" className={cn(BTN_LIGHT, "shrink-0")} disabled={!link} onClick={copy}>{copied ? <Check /> : <Copy />}{copied ? "Copié" : "Copier"}</Button>
    </div>
  );
}

/** Erreur expliquée : quoi, quoi faire, le geste utile, et le détail technique en petit. */
function ProblemNotice({ problem, busy, onFix }: { problem: InviteProblem; busy: boolean; onFix: (p: InviteProblem) => void }) {
  const fixLabel = problem.fix === "renvoyer" ? "Renvoyer l'invitation" : problem.fix === "retablir" ? "Rétablir l'accès" : problem.fix === "reprendre" ? "Reprendre ce compte et l'inviter" : null;
  return (
    <Notice tone="danger" icon={AlertTriangle} role="alert" title={problem.title}>
      <p className="text-mk-text">{problem.help}</p>
      {fixLabel || (problem.fix === "fiche" && problem.memberId) ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {fixLabel ? <Button type="button" variant="outline" className={BTN_LIGHT} loading={busy} onClick={() => onFix(problem)}>{fixLabel}</Button> : null}
          {problem.fix === "fiche" && problem.memberId ? <Link href={`/marketing/equipe/${problem.memberId}`} className={cn(buttonVariants({ variant: "outline" }), BTN_LIGHT)}>Voir sa fiche</Link> : null}
        </div>
      ) : null}
      {problem.technical ? <p className="mt-2 text-[12px] leading-snug text-mk-sub [overflow-wrap:anywhere]">Détail technique : {problem.technical}</p> : null}
    </Notice>
  );
}

/** Résultat réussi (ou démo) : e-mail parti, ou lien à transmettre. */
function Result({ outcome }: { outcome: Extract<InviteOutcome, { status: "envoye" | "lien" | "demo" }> }) {
  const first = firstName(outcome.name, outcome.email);
  if (outcome.status === "envoye") return (
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-2"><MailCheck className="size-5" aria-hidden /></span>
      <div className="min-w-0 text-[14px] leading-relaxed text-mk-text">
        <p className="text-[16px] font-semibold text-mk-strong">Invitation envoyée</p>
        <p className="mt-1">{first} reçoit un e-mail à <span className="font-medium text-mk-strong [overflow-wrap:anywhere]">{outcome.email}</span> pour créer son mot de passe.</p>
        <p className="mt-2 text-[13px] text-mk-sub">Rien reçu ? Pense aux indésirables, puis utilise « Renvoyer l&apos;invitation » dans la liste de l&apos;équipe.</p>
      </div>
    </div>
  );
  const demo = outcome.status === "demo";
  return (
    <div className="space-y-4 text-[14px] leading-relaxed text-mk-text">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-2">{demo ? <Info className="size-5" aria-hidden /> : <CheckCircle2 className="size-5" aria-hidden />}</span>
        <div className="min-w-0">
          <p className="text-[16px] font-semibold text-mk-strong">{demo ? "Mode démo : rien n'est créé" : `Le compte de ${first} est prêt`}</p>
          <p className="mt-1">{demo
            ? `Aucun compte n'est créé et aucun lien n'est généré. Avec la base reliée, tu verrais ici soit « Invitation envoyée », soit le lien à transmettre à ${first}.`
            : outcome.reason === "pas_d_envoi" ? "L'envoi d'e-mails de l'app n'est pas configuré : transmets-lui le lien toi-même." : "L'e-mail d'invitation n'est pas parti : transmets-lui le lien toi-même."}</p>
          {!demo && outcome.reason === "envoi_echoue" && outcome.detail ? <p className="mt-1 text-[12px] text-mk-sub [overflow-wrap:anywhere]">Détail : {outcome.detail}</p> : null}
        </div>
      </div>
      <div className="rounded-[10px] border border-mk-line bg-surface-2 p-3.5 sm:p-4">
        <p className="mb-2.5 flex items-center gap-2 font-medium text-mk-strong"><Link2 className="size-4 text-mk-icon" aria-hidden />Lien d&apos;invitation</p>
        <CopyLink link={demo ? null : outcome.link} />
        <p className="mt-2.5">Envoie ce lien à {first} : il lui permet de créer son mot de passe.</p>
        <p className="mt-1 text-[13px] text-mk-sub">Il ne sert qu&apos;une fois. S&apos;il ne marche plus, utilise « Renvoyer l&apos;invitation » dans la liste de l&apos;équipe.</p>
      </div>
    </div>
  );
}

/** Gestes proposés par une erreur, partagés par l'invitation et le renvoi. */
function useFix(setOutcome: (o: InviteOutcome | null) => void, retry?: () => Promise<InviteOutcome>) {
  const router = useRouter();
  const [busy, start] = React.useTransition();
  const fix = (p: InviteProblem) => start(async () => {
    if (p.fix === "renvoyer" && p.memberId) { setOutcome(outcomeOf(await resendSalesInviteAction(p.memberId))); router.refresh(); return; }
    if (p.fix === "reprendre" && retry) { setOutcome(await retry()); router.refresh(); return; }
    if (p.fix === "retablir" && p.memberId) {
      const r = await updateSalesMemberAction(p.memberId, { disabled: false });
      if (!r.ok) { toast.error(r.error); return; }
      // Accès rétabli : s'il ne s'est jamais connecté, « Renvoyer l'invitation » apparaît dans la liste.
      toast.success("Accès rétabli.");
      setOutcome(null);
      router.refresh();
    }
  });
  return { fix, busy };
}

const EMPTY = { name: "", email: "", role: "setter" as InviteRole, pages: pagesForRole("setter") };

/** Bouton « Inviter un membre » et sa fenêtre. */
export function InviteMemberButton({ demo, className, label = "Inviter un membre" }: { demo: boolean; className?: string; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [f, setF] = React.useState(EMPTY);
  const [outcome, setOutcome] = React.useState<InviteOutcome | null>(null);
  const [sending, start] = React.useTransition();
  // Responsable : tout l'espace Marketing, sans case à cocher. Sinon, exactement les pages cochées (le serveur refiltre).
  const allPages = f.role === "responsable";
  const send = (reuse = false) => inviteSalesMemberAction({ name: f.name, email: f.email, role: f.role, permissions: allPages ? null : f.pages, reuse }).then(outcomeOf);
  const submit = () => start(async () => { const o = await send(); setOutcome(o); if (o.status !== "erreur") router.refresh(); });
  const { fix, busy } = useFix(setOutcome, () => send(true));
  const reset = () => { setF(EMPTY); setOutcome(null); };
  /** Modifier un champ efface l'erreur affichée : elle concernait la saisie d'avant. */
  const edit = (patch: Partial<typeof EMPTY>) => { setF((v) => ({ ...v, ...patch })); setOutcome((o) => (o?.status === "erreur" ? null : o)); };
  const done = outcome && outcome.status !== "erreur" ? outcome : null;
  const problem = outcome?.status === "erreur" ? outcome.problem : null;
  const ready = !!f.name.trim() && !!f.email.trim() && (allPages || f.pages.length > 0);
  const studio = f.role === "responsable" && responsableOpensStudio();
  const id = React.useId();

  return (
    <>
      <Button className={cn(BTN, className)} onClick={() => { reset(); setOpen(true); }}><UserPlus />{label}</Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent title="Inviter un membre" description={done ? undefined : "Choisis son rôle et les pages qu'il pourra ouvrir. Tu pourras les changer ensuite."} className="max-w-xl">
          {done ? (
            <>
              <Result outcome={done} />
              <DialogFooter className="mt-6"><Button variant="ghost" className={BTN_GHOST} onClick={reset}>Inviter quelqu&apos;un d&apos;autre</Button><Button className={BTN} onClick={() => setOpen(false)}>Fermer</Button></DialogFooter>
            </>
          ) : (
            <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (ready && !sending) submit(); }}>
              {demo ? <Notice icon={Info} title="Mode démo">Tu peux remplir la fenêtre pour la voir : aucun compte n&apos;est créé.</Notice> : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1.5"><Label htmlFor={`${id}-nom`}>Nom</Label><Input id={`${id}-nom`} value={f.name} onChange={(e) => edit({ name: e.target.value })} autoFocus required maxLength={120} autoComplete="off" placeholder="Prénom Nom" className={INPUT} /></div>
                <div className="flex min-w-0 flex-col gap-1.5"><Label htmlFor={`${id}-email`}>E-mail</Label><Input id={`${id}-email`} type="email" value={f.email} onChange={(e) => edit({ email: e.target.value })} required maxLength={254} autoComplete="off" inputMode="email" placeholder="prenom@entreprise.fr" className={INPUT} /></div>
              </div>
              <fieldset>
                <legend className="mb-2 text-[14px] font-medium text-mk-text">Rôle<span className="ml-0.5 text-mk-required" aria-hidden>*</span></legend>
                <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
                  {INVITE_ROLES.map((r) => {
                    const on = f.role === r;
                    return (
                      <label key={r} className={cn("flex cursor-pointer gap-3 rounded-[10px] border p-3 transition-colors", on ? "border-accent bg-accent-soft/60 ring-1 ring-accent" : "border-mk-line hover:border-mk-input hover:bg-surface-2")}>
                        <input type="radio" name={`${id}-role`} value={r} checked={on} onChange={() => edit({ role: r, pages: pagesForRole(r) })} className="mt-0.5 size-[18px] shrink-0 accent-[var(--color-accent)]" />
                        <span className="min-w-0"><span className="block text-[14px] font-semibold text-mk-strong">{INVITE_ROLE_LABEL[r]}</span><span className="mt-0.5 block text-[13px] leading-snug text-mk-sub">{INVITE_ROLE_HINT[r]}</span></span>
                      </label>
                    );
                  })}
                </div>
                {allPages ? <p className="mt-2.5 text-[13px] leading-snug text-mk-sub">Pages : tout l&apos;espace Marketing.</p> : null}
                {studio ? <p className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-snug text-mk-warn"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />Pour l&apos;instant, un compte Responsable ouvre aussi l&apos;accueil de Studio. Pour le Marketing seul, choisis Setter, Closer ou Media buyer.</p> : null}
              </fieldset>
              {allPages ? null : <PageChoices value={f.pages} onChange={(pages) => edit({ pages })} defaults={pagesForRole(f.role)} note="Les cases suivent le rôle ; tu peux les changer." />}
              {problem ? <ProblemNotice problem={problem} busy={busy} onFix={fix} /> : null}
              {/* Pied collé en bas de la fenêtre (-bottom-6 : par-dessus la marge du cadre qui défile) : « Inviter » reste visible
                  pendant qu'on fait défiler les cases, et dit pourquoi il est grisé quand aucune page n'est cochée. */}
              <DialogFooter className="sticky -bottom-6 z-10 -mx-6 -mb-6 mt-0 flex-wrap border-t border-mk-line bg-surface px-6 py-3">
                {!allPages && !f.pages.length ? <p className="basis-full text-[13px] font-medium text-mk-danger sm:mr-auto sm:basis-auto">Coche au moins une page.</p> : null}
                <Button type="button" variant="ghost" className={BTN_GHOST} onClick={() => setOpen(false)}>Annuler</Button>
                <Button type="submit" className={BTN} loading={sending} disabled={!ready || busy}>Inviter</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** « Renvoyer l'invitation » : nouveau lien pour un membre qui ne s'est jamais connecté. */
export function ResendInviteButton({ member, className, disabled }: { member: { id: string; name: string }; className?: string; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [outcome, setOutcome] = React.useState<InviteOutcome | null>(null);
  const [sending, start] = React.useTransition();
  const { fix, busy } = useFix(setOutcome);
  const resend = () => start(async () => { const o = outcomeOf(await resendSalesInviteAction(member.id)); setOutcome(o); if (o.status !== "erreur") router.refresh(); });
  const done = outcome && outcome.status !== "erreur" ? outcome : null;
  return (
    <>
      <Button type="button" size="sm" variant="outline" className={cn(BTN_LIGHT, className)} disabled={disabled} onClick={() => { setOutcome(null); setOpen(true); }}><RotateCw />Renvoyer l&apos;invitation</Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setOutcome(null); }}>
        <DialogContent title={`Renvoyer l'invitation à ${member.name}`} description={done ? undefined : "Un nouveau lien est créé ; l'ancien ne sert plus."} className="max-w-xl">
          {done ? <Result outcome={done.status === "demo" ? { ...done, name: done.name || member.name } : done} /> : outcome?.status === "erreur" ? <ProblemNotice problem={outcome.problem} busy={busy} onFix={fix} /> : (
            <p className="text-[14px] leading-relaxed text-mk-text">{firstName(member.name)} ne s&apos;est pas encore connecté. Si l&apos;app sait envoyer des e-mails, il reçoit l&apos;invitation ; sinon, tu obtiens le lien à lui transmettre.</p>
          )}
          <DialogFooter className="mt-6">
            {done ? <Button className={BTN} onClick={() => setOpen(false)}>Fermer</Button> : (
              <><Button variant="ghost" className={BTN_GHOST} onClick={() => setOpen(false)}>Annuler</Button><Button className={BTN} loading={sending} onClick={resend}>{outcome ? "Réessayer" : "Renvoyer"}</Button></>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
