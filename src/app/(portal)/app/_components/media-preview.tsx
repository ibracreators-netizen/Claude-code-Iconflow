import { ExternalLink, Film } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

function safe(url: string | null) {
  if (!url) return null;
  try { const u = new URL(url); return u.protocol === "https:" && !u.username && !u.password ? u.href : null; } catch { return null; }
}

export function MediaPreview({ url, title }: { url: string | null; title: string }) {
  const href = safe(url);
  if (!href) return <div className="flex aspect-video items-center justify-center rounded-xl bg-surface-2 hairline"><div className="text-center text-muted"><Film className="mx-auto mb-2 size-6" /><p className="text-[13px]">Aperçu bientôt disponible</p></div></div>;
  const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(href);
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl bg-black hairline">
        {isVideo ? <video controls playsInline preload="metadata" className="aspect-video w-full" src={href} title={title} /> : <iframe src={href} title={title} className="aspect-video w-full" allow="fullscreen" referrerPolicy="no-referrer" />}
      </div>
      <a href={href} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "secondary", size: "sm" })}><ExternalLink />Ouvrir dans un nouvel onglet</a>
    </div>
  );
}
