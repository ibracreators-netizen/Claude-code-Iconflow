/**
 * Gabarits des emails envoyés par le studio : sobres, en français, aux couleurs d'Iconflow (perle, blanc, vert forêt).
 * Chaque gabarit renvoie { subject, html, text }. Équipe : tutoiement ; client : vouvoiement.
 * HTML en tableaux et styles en ligne (compatibilité des clients mail), version texte systématique.
 */

export interface EmailContent { subject: string; html: string; text: string }
export type Tone = "tu" | "vous";

const C = { bg: "#f2f3ef", surface: "#ffffff", border: "#e4e7e0", fg: "#10160f", fg2: "#2f3a2e", muted: "#6b766a", accent: "#2f6b3f", brand: "#5be683" };
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SIGNATURE = "icon-flow.fr · Partenaire créatif payé aux résultats";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/** Prénom affichable (premier mot du nom), ou null. */
export function firstName(name: string | null | undefined): string | null {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first.length > 1 ? first : null;
}

interface Layout {
  preheader: string;
  title: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  /** Phrase sous le bouton : lien copiable, validité… */
  note?: string;
  /** Pourquoi la personne reçoit cet email. */
  footer: string;
  /** Tutoiement (équipe) par défaut ; vouvoiement pour un client. */
  tone?: Tone;
}

function render(l: Layout): { html: string; text: string } {
  const paragraphs = l.paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${C.fg2};">${escapeHtml(p)}</p>`).join("");
  const fallback = l.tone === "vous" ? "Si le bouton ne s'ouvre pas, copiez ce lien dans votre navigateur :" : "Si le bouton ne s'ouvre pas, copie ce lien dans ton navigateur :";
  const cta = l.cta
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0 10px;"><tr><td style="border-radius:12px;background:${C.accent};">
        <a href="${escapeHtml(l.cta.url)}" style="display:inline-block;padding:13px 22px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;">${escapeHtml(l.cta.label)}</a>
      </td></tr></table>
      <p style="margin:0 0 14px;font-size:12.5px;line-height:1.6;color:${C.muted};">${fallback}<br><a href="${escapeHtml(l.cta.url)}" style="color:${C.accent};word-break:break-all;">${escapeHtml(l.cta.url)}</a></p>`
    : "";
  const note = l.note ? `<p style="margin:18px 0 0;padding-top:16px;border-top:1px solid ${C.border};font-size:13px;line-height:1.6;color:${C.muted};">${escapeHtml(l.note)}</p>` : "";
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(l.title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(l.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${C.bg};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;font-family:${FONT};">
    <tr><td style="padding:0 6px 18px;">
      <span style="font-size:19px;font-weight:600;letter-spacing:-0.02em;color:${C.fg};">iconflow<span style="color:${C.accent};">.</span></span>
      <span style="margin-left:10px;font-size:10.5px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${C.muted};">Studio</span>
    </td></tr>
    <tr><td style="background:${C.surface};border:1px solid ${C.border};border-radius:20px;padding:30px 30px 26px;">
      <h1 style="margin:0 0 16px;font-size:23px;line-height:1.25;letter-spacing:-0.02em;font-weight:600;color:${C.fg};">${escapeHtml(l.title)}</h1>
      ${paragraphs}
      ${cta}
      ${note}
    </td></tr>
    <tr><td style="padding:18px 6px 0;font-size:12px;line-height:1.6;color:${C.muted};">
      <p style="margin:0 0 4px;">${escapeHtml(l.footer)}</p>
      <p style="margin:0;"><span style="display:inline-block;width:6px;height:6px;border-radius:3px;background:${C.brand};vertical-align:middle;margin-right:6px;"></span>${escapeHtml(SIGNATURE)}</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
  const text = [
    `iconflow. — Studio`,
    "",
    l.title,
    "",
    ...l.paragraphs.flatMap((p) => [p, ""]),
    ...(l.cta ? [`${l.cta.label} : ${l.cta.url}`, ""] : []),
    ...(l.note ? [l.note, ""] : []),
    l.footer,
    SIGNATURE,
  ].join("\n");
  return { html, text };
}

/** Invitation d'un membre de l'équipe (tutoiement). */
export function teamInviteEmail(i: { name: string | null; inviter: string | null; link: string }): EmailContent {
  const first = firstName(i.name);
  const inviter = i.inviter?.trim() || "L'équipe icon-flow";
  const subject = "Ton accès à Iconflow Studio";
  return {
    subject,
    ...render({
      preheader: `${inviter} t'invite à rejoindre l'espace agence.`,
      title: first ? `Bienvenue dans l'équipe, ${first}.` : "Bienvenue dans l'équipe.",
      paragraphs: [
        `${inviter} t'invite à rejoindre l'espace agence d'Iconflow Studio : clients, briefs, livrables, planning et documents, tout au même endroit.`,
        "Ouvre ton compte en un clic : tu choisiras ensuite ton mot de passe.",
      ],
      cta: { label: "Ouvrir mon espace", url: i.link },
      note: "Ce lien est personnel et ne sert qu'une fois. S'il a expiré, demande à l'équipe de te renvoyer un lien de connexion.",
      footer: "Tu reçois cet email parce qu'un membre de l'agence icon-flow a créé ton accès au studio.",
    }),
  };
}

/** Ouverture d'un espace client (vouvoiement). */
export function clientInviteEmail(i: { name: string | null; clientName: string | null; inviter: string | null; link: string }): EmailContent {
  const first = firstName(i.name);
  const space = i.clientName?.trim() ? ` pour ${i.clientName.trim()}` : "";
  const subject = i.clientName?.trim() ? `Votre espace client Iconflow — ${i.clientName.trim()}` : "Votre espace client Iconflow";
  return {
    subject,
    ...render({
      preheader: `L'équipe icon-flow vous ouvre votre espace client${space}.`,
      title: first ? `Bienvenue, ${first}.` : "Bienvenue.",
      paragraphs: [
        `${i.inviter?.trim() || "L'équipe icon-flow"} vous ouvre votre espace client${space} : scripts à valider, livrables, documents et factures, au même endroit.`,
        "Cliquez sur le bouton pour accéder à votre espace : vous choisirez ensuite votre mot de passe.",
      ],
      cta: { label: "Accéder à mon espace", url: i.link },
      note: "Ce lien est personnel et ne sert qu'une fois. S'il a expiré, demandez un nouveau lien à votre contact chez icon-flow.",
      footer: "Vous recevez cet email parce que l'agence icon-flow a créé votre accès à l'espace client.",
      tone: "vous",
    }),
  };
}

/** Lien de connexion (lien magique) pour un compte existant. */
export function magicLinkEmail(i: { name: string | null; link: string; tone: Tone }): EmailContent {
  const first = firstName(i.name);
  const tu = i.tone === "tu";
  return {
    subject: tu ? "Ton lien de connexion — Iconflow Studio" : "Votre lien de connexion — Iconflow",
    ...render({
      preheader: tu ? "Ton lien pour entrer dans le studio, valable une heure." : "Votre lien pour accéder à votre espace, valable une heure.",
      title: first ? `Bonjour ${first},` : tu ? "Connexion au studio" : "Connexion à votre espace",
      paragraphs: [
        tu
          ? "Voici ton lien pour entrer dans le studio. Il est valable une heure et ne sert qu'une fois."
          : "Voici votre lien pour accéder à votre espace Iconflow. Il est valable une heure et ne sert qu'une fois.",
      ],
      cta: { label: "Me connecter", url: i.link },
      note: tu
        ? "Tu n'as rien demandé ? Ignore simplement cet email : personne ne peut se connecter sans ce lien."
        : "Vous n'avez rien demandé ? Ignorez simplement cet email : personne ne peut se connecter sans ce lien.",
      footer: tu ? "Email envoyé parce qu'une connexion par lien a été demandée pour ton adresse sur Iconflow Studio." : "Email envoyé parce qu'une connexion par lien a été demandée pour votre adresse sur Iconflow.",
      tone: i.tone,
    }),
  };
}

/** Email de test envoyé depuis Paramètres → Emails (administrateur). */
export function testEmail(i: { name: string | null; sender: string }): EmailContent {
  const first = firstName(i.name);
  return {
    subject: "Email de test — Iconflow Studio",
    ...render({
      preheader: "L'envoi d'emails du studio fonctionne.",
      title: first ? `Tout fonctionne, ${first}.` : "L'envoi d'emails fonctionne.",
      paragraphs: [
        `Si tu lis ceci, Iconflow Studio envoie bien ses emails par Resend, depuis ${i.sender}.`,
        "Les invitations à l'équipe, les accès clients et les liens de connexion partiront de la même façon.",
      ],
      footer: "Email de test envoyé depuis Paramètres → Emails.",
    }),
  };
}
