"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, ExternalLink, ImageIcon, ImageOff, Loader2, Maximize2, Play, X } from "lucide-react";
import { autoplaySrc, imageSrc, mediaEmbed, type MediaEmbed } from "@/lib/media-embed";
import { cn } from "@/lib/utils";

/*
 * Aperçu en grand, façon « Coup d'œil » de macOS : fond sombre flouté, fenêtre centrée avec une barre de titre
 * sombre (nom, « Ouvrir dans un nouvel onglet », « Fermer ») et le média en grand dessous.
 * Clavier : Échap ou Espace ferment, ← et → passent d'une photo à l'autre ; une vignette focalisée s'ouvre
 * avec Espace (ou Entrée), comme dans le Finder. Téléphone : plein écran, glisser pour changer de photo.
 * Aucune donnée de session : utilisable telle quelle sur les pages publiques.
 */

type PlayableMedia = Extract<MediaEmbed, { kind: "file" | "iframe" }>;

export type QuickLookItem =
  | { kind: "image"; src: string; title: string }
  | { kind: "video"; media: PlayableMedia; title: string; startAt?: number; onTime?: (t: number) => void };

/** Cadre des lecteurs intégrés : de quoi lire la vidéo (et la passer en plein écran), rien pour naviguer la page. */
const SANDBOX = "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox";
const ALLOW = "autoplay; encrypted-media; picture-in-picture; fullscreen";

/* Tailles et animation (une seule feuille, partagée et dédoublonnée par React). */
const CSS = `
.ql-window{--ql-w:100vw;--ql-h:calc(100dvh - 44px - env(safe-area-inset-top) - env(safe-area-inset-bottom))}
@media (min-width:640px){.ql-window{--ql-w:92vw;--ql-h:calc(86vh - 44px)}}
.ql-media{max-width:var(--ql-w);max-height:var(--ql-h)}
.ql-frame-h{width:min(var(--ql-w),calc(var(--ql-h) * 16 / 9),1280px);aspect-ratio:16/9}
.ql-frame-v{height:min(var(--ql-h),calc(var(--ql-w) * 16 / 9),920px);aspect-ratio:9/16}
@keyframes ql-fade-in{from{opacity:0}to{opacity:1}}
@keyframes ql-fade-out{from{opacity:1}to{opacity:0}}
@keyframes ql-pop-in{from{opacity:0;transform:scale(.965)}to{opacity:1;transform:scale(1)}}
@keyframes ql-pop-out{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(.98)}}
.ql-overlay[data-state=open]{animation:ql-fade-in .16s ease-out both}
.ql-overlay[data-state=closed]{animation:ql-fade-out .12s ease-in both}
.ql-window[data-state=open]{animation:ql-pop-in .2s cubic-bezier(.2,.8,.2,1) both}
.ql-window[data-state=closed]{animation:ql-pop-out .12s ease-in both}
@media (prefers-reduced-motion:reduce){.ql-overlay,.ql-window{animation:none!important}}
`;

const isControl = (t: EventTarget | null) => t instanceof Element && !!t.closest("button, input, textarea, select, video, audio, [contenteditable='true']");
const isField = (t: EventTarget | null) => t instanceof Element && !!t.closest("input, textarea, select, video, audio, [contenteditable='true']");

/** Fenêtre d'aperçu contrôlée : ouverte tant que `open` est vrai, sur l'élément `index` du groupe. */
export function QuickLook({ items, index, open, onIndexChange, onOpenChange, returnFocus }: {
  items: QuickLookItem[];
  index: number;
  open: boolean;
  onIndexChange: (i: number) => void;
  onOpenChange: (open: boolean) => void;
  /** Élément qui reprend le focus à la fermeture (la vignette de la photo affichée). */
  returnFocus?: (index: number) => HTMLElement | null | undefined;
}) {
  const count = items.length;
  const i = count ? Math.min(Math.max(index, 0), count - 1) : 0;
  const item = items[i];
  const windowRef = React.useRef<HTMLDivElement>(null);
  const touch = React.useRef<{ x: number; y: number } | null>(null);

  const go = React.useCallback((dir: 1 | -1) => { if (count > 1) onIndexChange((i + dir + count) % count); }, [count, i, onIndexChange]);

  // Photos voisines préchargées : le passage de l'une à l'autre est immédiat.
  React.useEffect(() => {
    if (!open || count < 2) return;
    for (const d of [1, -1]) {
      const n = items[(i + d + count) % count];
      if (n?.kind === "image") { const img = new Image(); img.src = n.src; }
    }
  }, [open, i, count, items]);

  // Un lecteur intégré (YouTube…) prend le focus en démarrant, ou au clic : le clavier ne reviendrait plus à l'aperçu
  // (Échap, Espace, flèches). On le rend à la fenêtre, sauf si l'on y est entré avec Tab pour piloter le lecteur.
  const lastTab = React.useRef(0);
  React.useEffect(() => {
    if (!open) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onBlur = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const a = document.activeElement;
        const w = windowRef.current;
        if (a instanceof HTMLIFrameElement && w?.contains(a) && Date.now() - lastTab.current > 600) w.focus({ preventScroll: true });
      }, 0);
    };
    window.addEventListener("blur", onBlur);
    return () => { clearTimeout(timer); window.removeEventListener("blur", onBlur); };
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab") lastTab.current = Date.now();
    if (e.key === "ArrowRight" && !isField(e.target)) { e.preventDefault(); go(1); }
    else if (e.key === "ArrowLeft" && !isField(e.target)) { e.preventDefault(); go(-1); }
    else if (e.key === " " && !isControl(e.target)) e.preventDefault(); // ni défilement ni clic : la fermeture se fait au relâchement
  };
  // Espace ferme au relâchement (comme le Finder), sauf sur un bouton ou un lecteur qui l'utilisent déjà.
  const onKeyUp = (e: React.KeyboardEvent) => { if (e.key === " " && !isControl(e.target)) { e.preventDefault(); onOpenChange(false); } };

  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; touch.current = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current; touch.current = null;
    const t = e.changedTouches[0];
    if (!start || !t || count < 2) return;
    const dx = t.clientX - start.x, dy = t.clientY - start.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.3) go(dx < 0 ? 1 : -1);
  };

  const title = item ? `${item.title}${count > 1 ? ` · ${i + 1} / ${count}` : ""}` : "Aperçu";
  const href = item ? (item.kind === "image" ? item.src : item.media.href) : null;

  return (
    <>
      <style href="iconflow-quick-look" precedence="medium">{CSS}</style>
      <DialogPrimitive.Root open={open && !!item} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="ql-overlay fixed inset-0 z-[70] bg-black/65 backdrop-blur-md" />
          <DialogPrimitive.Content
            ref={windowRef}
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
            onOpenAutoFocus={(e) => { e.preventDefault(); windowRef.current?.focus({ preventScroll: true }); }}
            onCloseAutoFocus={(e) => { const el = returnFocus?.(i); if (el) { e.preventDefault(); el.focus({ preventScroll: true }); } }}
            className="ql-window fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[#111112] text-white outline-none sm:m-auto sm:h-fit sm:w-fit sm:min-w-[340px] sm:rounded-[14px] sm:shadow-[0_30px_90px_rgb(0_0_0/.55)] sm:ring-1 sm:ring-white/12"
          >
            {/* Barre de titre */}
            <div className="flex h-11 shrink-0 items-center gap-2 border-b border-white/10 bg-[#2a2a2d] pl-4 pr-1.5 pt-[env(safe-area-inset-top)] max-sm:box-content sm:pl-3.5">
              <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight text-white/90">{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">
                {count > 1 ? "Flèches gauche et droite pour passer d'une photo à l'autre. " : ""}Échap ou Espace pour fermer.
              </DialogPrimitive.Description>
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" aria-label="Ouvrir dans un nouvel onglet" title="Ouvrir dans un nouvel onglet"
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-white/75 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white/80 sm:size-8">
                  <ExternalLink className="size-[18px] sm:size-4" />
                </a>
              ) : null}
              <DialogPrimitive.Close aria-label="Fermer" title="Fermer (Échap)"
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white/80 sm:size-8 sm:bg-transparent sm:text-white/75 sm:hover:bg-white/10 sm:hover:text-white">
                <X className="size-5 sm:size-4" />
              </DialogPrimitive.Close>
            </div>

            {/* Média */}
            <div
              className="relative flex min-h-0 flex-1 items-center justify-center bg-black pb-[env(safe-area-inset-bottom)] sm:min-h-[200px] sm:pb-0"
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
              onClick={(e) => { if (e.target === e.currentTarget) onOpenChange(false); }}
            >
              {item?.kind === "image" ? <BigImage key={item.src} src={item.src} alt={title} /> : null}
              {item?.kind === "video" ? <BigVideo key={item.media.src} item={item} /> : null}

              {count > 1 ? (
                <>
                  <NavButton side="left" onClick={() => go(-1)} />
                  <NavButton side="right" onClick={() => go(1)} />
                </>
              ) : null}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

function NavButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button type="button" onClick={onClick} aria-label={side === "left" ? "Photo précédente" : "Photo suivante"}
      className={cn("absolute top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white/90 ring-1 ring-white/15 backdrop-blur transition hover:bg-black/65 hover:text-white focus-visible:outline-2 focus-visible:outline-white/80",
        side === "left" ? "left-2 sm:left-3" : "right-2 sm:right-3")}>
      <Icon className="size-5" />
    </button>
  );
}

function BigImage({ src, alt }: { src: string; alt: string }) {
  const [state, setState] = React.useState<"loading" | "ready" | "error">("loading");
  if (state === "error") {
    return (
      <div className="flex min-h-[220px] min-w-[300px] flex-col items-center justify-center gap-2 px-6 py-10 text-center text-white/70">
        <ImageOff className="size-7" />
        <p className="text-[13.5px]">Impossible d&apos;afficher cette image.</p>
        <a href={src} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium text-white underline underline-offset-4">Ouvrir le lien ↗</a>
      </div>
    );
  }
  return (
    <>
      {state === "loading" ? <Loader2 className="absolute size-6 animate-spin text-white/60" aria-label="Chargement" /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- lien externe ou signé, affiché tel quel */}
      <img src={src} alt={alt} draggable={false} onLoad={() => setState("ready")} onError={() => setState("error")}
        className={cn("ql-media block h-auto w-auto select-none object-contain transition-opacity duration-150", state === "loading" ? "min-h-[200px] min-w-[300px] opacity-0" : "opacity-100")} />
    </>
  );
}

function BigVideo({ item }: { item: Extract<QuickLookItem, { kind: "video" }> }) {
  const { media } = item;
  const [failed, setFailed] = React.useState(false);
  const [ratio, setRatio] = React.useState<number | null>(null);
  if (media.kind === "iframe") {
    return (
      <iframe src={autoplaySrc(media)} title={`${item.title} (${media.service})`} allow={ALLOW} sandbox={SANDBOX}
        referrerPolicy="strict-origin-when-cross-origin" className={cn("block border-0 bg-black", media.vertical ? "ql-frame-v" : "ql-frame-h")} />
    );
  }
  if (failed) return <VideoFailed href={media.href} dark />;
  // Agrandie au plus grand qui tient dans la fenêtre, à son propre format (verticale ou horizontale).
  const size: React.CSSProperties | undefined = ratio ? { width: `min(var(--ql-w), calc(var(--ql-h) * ${ratio}))`, aspectRatio: String(ratio) } : undefined;
  return (
    <video src={media.src} controls autoPlay playsInline preload="auto" style={size}
      onLoadedMetadata={(e) => {
        const v = e.currentTarget;
        if (v.videoWidth && v.videoHeight) setRatio(Math.round((v.videoWidth / v.videoHeight) * 1000) / 1000);
        if (item.startAt && item.startAt > 0) v.currentTime = item.startAt;
      }}
      onTimeUpdate={(e) => item.onTime?.(e.currentTarget.currentTime)}
      onError={() => setFailed(true)}
      className={cn("block bg-black", ratio ? "ql-media" : "ql-frame-h")} />
  );
}

function VideoFailed({ href, dark }: { href: string; dark?: boolean }) {
  return (
    <div className={cn("flex h-full min-h-[180px] w-full flex-col items-center justify-center gap-2 px-6 py-8 text-center", dark ? "min-w-[300px] text-white/70" : "text-white/75")}>
      <p className="text-[13.5px]">Cette vidéo ne se lit pas dans le navigateur.</p>
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium text-white underline underline-offset-4">Ouvrir la vidéo ↗</a>
    </div>
  );
}

/** État d'un groupe d'aperçus : ouverture sur un élément, vignettes enregistrées pour leur rendre le focus. */
export function useQuickLook(items: QuickLookItem[]) {
  const [state, setState] = React.useState({ open: false, index: 0 });
  const triggers = React.useRef<Array<HTMLElement | null>>([]);
  const register = React.useCallback((i: number) => (el: HTMLElement | null) => { triggers.current[i] = el; }, []);
  const openAt = React.useCallback((index: number) => setState({ open: true, index }), []);
  const dialog = (
    <QuickLook items={items} index={state.index} open={state.open}
      onIndexChange={(index) => setState((s) => ({ ...s, index }))}
      onOpenChange={(open) => setState((s) => ({ ...s, open }))}
      returnFocus={(i) => triggers.current[i] ?? triggers.current.find(Boolean)} />
  );
  return { open: state.open, index: state.index, openAt, register, dialog };
}

/** Une vidéo lisible ici (fichier direct, YouTube, Drive…), sinon null. */
export function quickLookVideo(url: string | null | undefined, title: string): QuickLookItem | null {
  const m = mediaEmbed(url);
  return m && (m.kind === "file" || m.kind === "iframe") ? { kind: "video", media: m, title } : null;
}

/** Une photo, ou une vidéo lisible ici, sinon null (lien à ouvrir, ou saisie invalide). */
export function quickLookItem(url: string | null | undefined, title: string): QuickLookItem | null {
  const m = mediaEmbed(url);
  if (m && (m.kind === "file" || m.kind === "iframe")) return { kind: "video", media: m, title };
  const src = imageSrc(url);
  return src ? { kind: "image", src, title } : null;
}

/**
 * Vignette cliquable d'un groupe : ouvre l'aperçu à la bonne photo (curseur loupe, léger zoom au survol,
 * icône « agrandir » discrète). Espace ou Entrée l'ouvrent quand elle a le focus.
 */
export const MediaThumb = React.forwardRef<HTMLButtonElement, {
  item: QuickLookItem; onOpen: () => void; size?: "xs" | "sm" | "md"; className?: string; label?: string;
}>(function MediaThumb({ item, onOpen, size = "md", className, label }, ref) {
  // Échec retenu pour CETTE adresse : un lien corrigé dans le champ réaffiche sa photo.
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
  const failed = item.kind === "image" && failedSrc === item.src;
  const video = item.kind === "video";
  const sm = size !== "md";
  return (
    <button ref={ref} type="button" onClick={onOpen} aria-label={label ?? `Agrandir : ${item.title}`} title={video ? "Lire en grand" : "Agrandir (Espace)"}
      className={cn("group/ql relative block shrink-0 overflow-hidden border border-border bg-surface-2 outline-none transition focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        video ? "cursor-pointer" : "cursor-zoom-in",
        size === "xs" ? "size-8 rounded-md" : size === "sm" ? "h-12 w-10 rounded-md" : "h-32 min-w-24 max-w-[220px] rounded-lg", className)}>
      {item.kind === "image" && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- lien externe ou signé, affiché tel quel
        <img src={item.src} alt="" loading="lazy" draggable={false} onError={() => setFailedSrc(item.src)}
          className={cn("block h-full object-cover transition-transform duration-300 ease-out motion-safe:group-hover/ql:scale-[1.05]", sm ? "w-full" : "w-auto min-w-full max-w-[220px]")} />
      ) : (
        <span className={cn("flex h-full items-center justify-center text-muted", sm ? "w-full" : "w-24")}>
          {video ? <Play className={cn("fill-current", size === "xs" ? "size-3.5" : sm ? "size-4" : "size-6")} /> : <ImageOff className={size === "xs" ? "size-3.5" : sm ? "size-4" : "size-5"} />}
        </span>
      )}
      {!sm ? (
        <span className="pointer-events-none absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur-sm transition-opacity duration-150 group-hover/ql:opacity-100 group-focus-visible/ql:opacity-100 [@media(hover:none)]:opacity-90">
          <Maximize2 className="size-3.5" />
        </span>
      ) : null}
    </button>
  );
});

/**
 * Lignes d'un formulaire (une photo ou une vidéo par ligne, ou rien) : `thumb(i)` donne la vignette de la ligne i,
 * qui ouvre l'aperçu du groupe à la bonne place ; les lignes vides ou invalides n'en ont pas (null).
 */
export function useQuickLookRows(rows: Array<QuickLookItem | null>) {
  const group = rows.filter((x): x is QuickLookItem => !!x);
  const ql = useQuickLook(group);
  const thumb = (i: number, size: "xs" | "sm" | "md" = "sm") => {
    const k = rows[i] ? rows.slice(0, i).filter(Boolean).length : -1;
    const it = group[k];
    if (k < 0 || !it) return null;
    const label = `${it.kind === "video" ? "Lire en grand" : "Agrandir"} : ${it.title}${group.length > 1 ? ` (${k + 1} sur ${group.length})` : ""}`;
    return <MediaThumb ref={ql.register(k)} size={size} item={it} onOpen={() => ql.openAt(k)} label={label} />;
  };
  return { thumb, dialog: ql.dialog };
}

/** Emplacement d'une vignette (petite taille) tant que la ligne n'a pas de photo affichable. */
export function ThumbSlot({ video, size = "sm" }: { video?: boolean; size?: "xs" | "sm" }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-md border border-dashed border-border-strong text-muted-2", size === "xs" ? "size-8" : "h-12 w-10")} aria-hidden>
      {video ? <Play className={size === "xs" ? "size-3.5" : "size-4"} /> : <ImageIcon className={size === "xs" ? "size-3.5" : "size-4"} />}
    </span>
  );
}

/** Galerie de photos de référence (produit, avatar) : chaque vignette ouvre l'aperçu en grand. */
export function RefGallery({ label, urls, className }: { label: string; urls: string[]; className?: string }) {
  const items = React.useMemo(() => urls.map((u) => imageSrc(u)).filter((s): s is string => !!s).map((src): QuickLookItem => ({ kind: "image", src, title: label })), [urls, label]);
  const ql = useQuickLook(items);
  if (!items.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      {items.map((it, i) => (
        <MediaThumb key={`${i}-${it.kind === "image" ? it.src : ""}`} ref={ql.register(i)} item={it} onOpen={() => ql.openAt(i)}
          label={`Agrandir : ${label}${items.length > 1 ? ` ${i + 1} sur ${items.length}` : ""}`} />
      ))}
      {ql.dialog}
    </div>
  );
}

/**
 * Vidéo de référence : lecteur intégré dans la carte (9:16 pour TikTok, Reels et Shorts, 16:9 sinon) et bouton
 * « Agrandir » qui la rouvre dans l'aperçu. Lien non reconnu : bouton « Ouvrir la vidéo de référence ↗ ».
 */
export function RefVideo({ url, title = "Vidéo de référence", className }: { url: string; title?: string; className?: string }) {
  const media = React.useMemo(() => mediaEmbed(url), [url]);
  if (!url.trim()) return null;
  if (!media) return <p className={cn("text-[13px] text-muted", className)}>Lien non reconnu : <span className="break-all text-fg-2">{url.trim()}</span></p>;
  if (media.kind === "link") {
    return (
      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5", className)}>
        <a href={media.href} target="_blank" rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-surface-2 px-3.5 text-[13.5px] font-medium text-fg ring-1 ring-border transition hover:bg-surface-3">
          <ExternalLink className="size-4 text-accent-2" />Ouvrir la vidéo de référence ↗
        </a>
        <span className="min-w-0 truncate text-[12px] text-muted">{media.host}</span>
      </div>
    );
  }
  return <InlinePlayer key={media.src} media={media} title={title} className={className} />;
}

function InlinePlayer({ media, title, className }: { media: PlayableMedia; title: string; className?: string }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const time = React.useRef(0);
  const [startAt, setStartAt] = React.useState(0);
  const [ratio, setRatio] = React.useState<number | null>(null);
  const [failed, setFailed] = React.useState(false);
  // En grand, la lecture reprend où la carte en était ; au retour, la carte reprend où l'aperçu s'est arrêté.
  const items = React.useMemo<QuickLookItem[]>(() => [{ kind: "video", media, title, startAt, onTime: (t) => { time.current = t; } }], [media, title, startAt]);
  const ql = useQuickLook(items);
  const big = ql.open;
  const expand = () => { const t = videoRef.current?.currentTime ?? 0; time.current = t; setStartAt(t); ql.openAt(0); };

  const vertical = media.kind === "iframe" ? media.vertical : ratio !== null && ratio < 1;
  const aspect = media.kind === "iframe" ? (media.vertical ? 9 / 16 : 16 / 9) : ratio ?? 16 / 9;

  return (
    <div className={cn("space-y-2.5", className)}>
      <div className={cn("relative overflow-hidden rounded-xl bg-black ring-1 ring-border", vertical ? "w-[min(100%,260px)]" : "w-full max-w-[560px]")} style={{ aspectRatio: aspect }}>
        {big ? (
          // Pendant l'aperçu, le lecteur de la carte est retiré : une seule vidéo joue à la fois.
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70">
            <Maximize2 className="size-5" /><span className="text-[12.5px]">Lecture en grand…</span>
          </span>
        ) : media.kind === "iframe" ? (
          <iframe src={media.src} title={`${title} (${media.service})`} loading="lazy" allow={ALLOW} sandbox={SANDBOX}
            referrerPolicy="strict-origin-when-cross-origin" className="absolute inset-0 size-full border-0" />
        ) : failed ? (
          <VideoFailed href={media.href} />
        ) : (
          // « #t=0.001 » : la première image s'affiche dans la carte avant la lecture (Safari, téléphones).
          <video ref={videoRef} src={media.src.includes("#") ? media.src : `${media.src}#t=0.001`} controls playsInline preload="metadata" title={title}
            onLoadedMetadata={(e) => { const v = e.currentTarget; if (v.videoWidth && v.videoHeight) setRatio(v.videoWidth / v.videoHeight); if (time.current) v.currentTime = time.current; }}
            onError={() => setFailed(true)}
            className="absolute inset-0 size-full bg-black object-contain" />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <button ref={ql.register(0)} type="button" onClick={expand} aria-label={`Agrandir : ${title}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-surface-2 px-3 text-[13px] font-medium text-fg ring-1 ring-border transition hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-accent">
          <Maximize2 className="size-3.5" />Agrandir
        </button>
        <a href={media.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-muted transition hover:text-accent-2">
          {media.kind === "iframe" ? `Ouvrir sur ${media.service}` : media.service ? `Ouvrir dans ${media.service}` : "Ouvrir le fichier"} ↗
        </a>
      </div>
      {ql.dialog}
    </div>
  );
}
