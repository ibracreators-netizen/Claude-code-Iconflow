"use client";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
export function PrintButton({ label = "Imprimer" }: { label?: string }) {
  return <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer />{label}</Button>;
}
