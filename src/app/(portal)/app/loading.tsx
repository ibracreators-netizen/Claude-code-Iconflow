import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="animate-fade-in" aria-busy="true" aria-label="Chargement">
      <div className="mb-6 space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-8 w-72" /><Skeleton className="h-4 w-96 max-w-full" /></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3"><Skeleton className="h-72 rounded-xl lg:col-span-2" /><Skeleton className="h-72 rounded-xl" /></div>
    </div>
  );
}
