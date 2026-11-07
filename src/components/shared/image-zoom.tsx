"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import Image from "next/image";
import { X, ZoomIn } from "lucide-react";

/**
 * Photo cliquable qui s'agrandit en plein écran (lightbox).
 * Rendu comme un calque `absolute inset-0` : à placer dans un conteneur `relative`
 * (ex. la case `aspect-[4/5]` d'une carte avatar). Les pastilles / boutons voisins,
 * déclarés après dans le DOM, restent cliquables au-dessus.
 * Fermeture : clic sur l'image, clic en dehors, bouton ✕ ou touche Échap.
 */
export function ImageZoom({ src, alt, sizes, thumbClassName }: { src: string; alt: string; sizes?: string; thumbClassName?: string }) {
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={`Agrandir la photo : ${alt}`}
          className="group/zoom absolute inset-0 cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          <Image src={src} alt={alt} fill unoptimized sizes={sizes} className={thumbClassName} />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition duration-150 group-hover/zoom:opacity-100 group-focus-visible/zoom:opacity-100">
            <span className="flex size-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm"><ZoomIn className="size-4" /></span>
          </span>
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 focus:outline-none data-[state=open]:animate-fade-in sm:p-8"
        >
          <DialogPrimitive.Title className="sr-only">{alt}</DialogPrimitive.Title>
          {/* Clic en dehors de l'image = fermer */}
          <DialogPrimitive.Close aria-label="Fermer" tabIndex={-1} className="absolute inset-0 cursor-zoom-out focus:outline-none" />
          <DialogPrimitive.Close asChild>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} className="relative max-h-[88vh] w-auto max-w-full cursor-zoom-out rounded-xl object-contain shadow-2xl" />
          </DialogPrimitive.Close>
          <DialogPrimitive.Close
            aria-label="Fermer"
            className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <X className="size-5" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
