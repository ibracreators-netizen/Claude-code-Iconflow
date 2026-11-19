/** Chargement de Rechercher : le champ et la carte des applications, aux mêmes places que la page. */
export default function RechercherLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl" aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement…</span>
      <div className="skeleton h-12 !rounded-[10px]" />
      <div className="skeleton mt-3 h-[150px] !rounded-xl lg:mt-5" />
    </div>
  );
}
