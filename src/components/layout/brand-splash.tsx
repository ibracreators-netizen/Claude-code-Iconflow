"use client";
import * as React from "react";

/**
 * Splash de démarrage : le wordmark « iconflow » se remplit de gauche à droite au premier
 * chargement de l'app, puis l'écran disparaît. L'effet est entièrement en CSS (classes
 * `brand-splash*` dans globals.css), donc il joue même avant l'hydratation ; ce composant ne
 * fait que retirer le nœud du DOM une fois l'animation terminée.
 *
 * Placé dans le layout racine : il joue sur un vrai chargement de page (première visite,
 * rafraîchissement) mais pas sur la navigation interne, car le layout racine ne se remonte pas.
 * Les squelettes de chargement par page (loading.tsx) restent inchangés.
 */
export function BrandSplash() {
  const [gone, setGone] = React.useState(false);
  React.useEffect(() => {
    // Laisse l'animation CSS (remplissage ~1 s + maintien + fondu de sortie à 1,65 s) se terminer, puis nettoie le DOM.
    const t = setTimeout(() => setGone(true), 2250);
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
