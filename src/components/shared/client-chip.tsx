import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function ClientChip({ id, name, logo, href, size = 20, className }: { id?: string; name: string; logo?: string | null; href?: string; size?: number; className?: string }) {
  const inner = <><Avatar name={name} src={logo} size={size} square /><span className="truncate">{name}</span></>;
  const cls = cn("inline-flex max-w-full items-center gap-1.5 text-[12.5px] font-medium text-fg-2", href && "transition hover:text-fg", className);
  return href ? <Link href={href} className={cls}>{inner}</Link> : <span className={cls} data-id={id}>{inner}</span>;
}
