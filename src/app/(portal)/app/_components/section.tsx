import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Section({ title, description, href, hrefLabel = "Tout voir", children, className }: { title: string; description?: string; href?: string; hrefLabel?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("animate-rise", className)}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div><h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>{description ? <p className="text-[12.5px] text-muted">{description}</p> : null}</div>
        {href ? <Link href={href} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-accent-2 hover:underline underline-offset-4">{hrefLabel}<ArrowRight className="size-3.5" /></Link> : null}
      </div>
      {children}
    </section>
  );
}
