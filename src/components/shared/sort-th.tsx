"use client";
import * as React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SortState<K extends string> { key: K; dir: 1 | -1 }

/** En-tête de colonne, triable quand `k` est donné. `desc` : clés dont le premier clic trie du plus grand au plus petit. */
export function SortTh<K extends string>({ k, sort, onSort, desc = [], children, className }: {
  k?: K; sort: SortState<K>; onSort: (s: SortState<K>) => void; desc?: K[]; children: React.ReactNode; className?: string;
}) {
  const active = !!k && sort.key === k;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : undefined} className={cn("px-3 py-3 font-medium", className)}>
      {k ? (
        <button type="button" onClick={() => onSort({ key: k, dir: active ? (sort.dir === 1 ? -1 : 1) : desc.includes(k) ? -1 : 1 })} className="inline-flex items-center gap-1 uppercase tracking-[0.12em] hover:text-fg">
          {children}{active ? (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : null}
        </button>
      ) : children}
    </th>
  );
}
