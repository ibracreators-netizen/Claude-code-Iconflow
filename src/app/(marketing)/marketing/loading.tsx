/**
 * Écran de chargement de l'espace Marketing : il s'affiche tout de suite au clic, pendant que la page se prépare
 * (sans lui, on restait sur l'ancienne page et l'app paraissait figée).
 */
export default function MarketingLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement…</span>
      <div className="skeleton h-7 w-44" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[140px] !rounded-xl" />)}
      </div>
      <div className="skeleton h-44 !rounded-xl" />
      <div className="skeleton h-72 !rounded-xl" />
    </div>
  );
}
