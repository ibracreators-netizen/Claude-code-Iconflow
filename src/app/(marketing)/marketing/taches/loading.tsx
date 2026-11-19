/** Chargement de Tâches : la forme de la page (onglets, lignes) s'affiche tout de suite, au clic sur un onglet. */
export default function TachesLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement des tâches…</span>
      <div className="mb-6 hidden items-end justify-between lg:flex"><div className="skeleton h-8 w-36" /><div className="skeleton h-10 w-44 !rounded-lg" /></div>
      <div className="mb-4 flex gap-2 lg:gap-6">{[128, 140, 96].map((w) => <div key={w} className="skeleton h-9 !rounded-full lg:h-6" style={{ width: w }} />)}</div>
      <div className="max-lg:-mx-4 lg:overflow-hidden lg:rounded-xl lg:border lg:border-mk-line lg:bg-surface">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-mk-line px-4 py-4 lg:px-5">
            <div className="skeleton size-[22px] shrink-0 !rounded-full" />
            <div className="min-w-0 flex-1 space-y-2"><div className="skeleton h-4 w-2/3 max-w-[320px]" /><div className="skeleton h-3 w-1/2 max-w-[220px]" /></div>
            <div className="skeleton hidden h-6 w-28 !rounded-full lg:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
