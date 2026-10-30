import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-2">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Cette page n&apos;existe pas</h1>
      <p className="max-w-sm text-[14px] text-muted">Le lien est peut-être périmé, ou l&apos;élément a été archivé.</p>
      <Link href="/" className={buttonVariants()}>Retour à l&apos;accueil</Link>
    </main>
  );
}
