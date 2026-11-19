"use client";
import * as React from "react";

/**
 * Filet de sécurité des réglages d'affichage posés avant le premier affichage par le script du layout racine
 * (thème, espace Studio ou Marketing, barre repliée, écran de démarrage déjà vu).
 * Si React doit refaire la page dans le navigateur (erreur d'hydratation, extension qui modifie la page), il remet
 * <html> à ses seuls attributs d'origine : sans ce rappel, le thème, la couleur de l'espace et l'écran de démarrage
 * repartiraient à zéro. Sans effet visible dans le cas normal (mêmes valeurs).
 */
export function BootAttrs() {
  React.useLayoutEffect(() => {
    const d = document.documentElement;
    try {
      const t = localStorage.getItem("iconflow-theme");
      d.dataset.theme = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
      if (!d.dataset.app) d.dataset.app = location.pathname.startsWith("/marketing") ? "marketing" : "studio";
      if (localStorage.getItem("iconflow-nav") === "collapsed") d.dataset.nav = "collapsed";
      if (localStorage.getItem("iconflow-splash") || window.matchMedia?.("(display-mode: standalone)").matches) d.dataset.splash = "off";
    } catch {
      if (!d.dataset.theme) d.dataset.theme = "light";
    }
  }, []);
  return null;
}
