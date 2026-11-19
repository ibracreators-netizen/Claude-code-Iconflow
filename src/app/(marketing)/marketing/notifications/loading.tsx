/** Chargement des Notifications : quelques lignes (rond d'icône, titre, sous-titre), aux mêmes places que la liste. */
export default function NotificationsLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl lg:rounded-xl lg:border lg:border-mk-line lg:bg-surface lg:px-5 lg:py-2" aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement…</span>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3.5 py-3.5">
          <div className="skeleton size-11 shrink-0 !rounded-full" />
          <div className="min-w-0 flex-1 space-y-2"><div className="skeleton h-4 w-3/5" /><div className="skeleton h-3.5 w-4/5" /></div>
        </div>
      ))}
    </div>
  );
}
