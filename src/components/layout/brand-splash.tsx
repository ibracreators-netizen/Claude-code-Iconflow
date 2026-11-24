"use client";
import * as React from "react";

/**
 * Splash de démarrage : le wordmark « iconflow » se remplit de gauche à droite, puis l'écran disparaît.
 * Il n'est joué qu'à la toute première visite sur cet appareil (et jamais dans l'application installée) :
 * ensuite, le script de démarrage du layout racine pose data-splash="off" avant le premier affichage et le CSS le masque.
 * Sans ce garde-fou, il retardait chaque ouverture et chaque rafraîchissement d'environ deux secondes.
 */
export function BrandSplash() {
  const [gone, setGone] = React.useState(false);
  React.useEffect(() => {
    try { localStorage.setItem("iconflow-splash", "1"); } catch { /* stockage indisponible : il rejouera, sans gêne */ }
    // Déjà vu (masqué par le CSS) : on retire tout de suite ; sinon on laisse l'animation (remplissage ~1 s + maintien
    // + fondu de sortie à 1,65 s) se terminer, puis on nettoie le DOM.
    const off = document.documentElement.dataset.splash === "off";
    const t = setTimeout(() => setGone(true), off ? 0 : 2250);
    return () => clearTimeout(t);
  }, []);
  if (gone) return null;
  return (
    <div className="brand-splash" role="status" aria-label="Chargement d'iconflow">
      <span className="brand-splash__glow" aria-hidden />
      <span className="brand-splash__mark" aria-hidden>
        <span className="brand-splash__word">
          <span className="brand-splash__ghost">iconflow</span>
          <span className="brand-splash__fill">iconflow</span>
          <span className="brand-splash__scan" />
        </span>
        <span className="brand-splash__dot">.</span>
      </span>
      <span className="brand-splash__track" aria-hidden>
        <span className="brand-splash__bar" />
      </span>
    </div>
  );
}
