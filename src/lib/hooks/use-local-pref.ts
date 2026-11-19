"use client";
import { useCallback, useEffect, useSyncExternalStore } from "react";

const EVENT = "iconflow:pref";
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = () => cb();
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, onStorage);
  return () => { listeners.delete(cb); window.removeEventListener("storage", onStorage); window.removeEventListener(EVENT, onStorage); };
}

/** Préférence locale (localStorage) lue sans décalage d'hydratation. */
export function useLocalPref(key: string, fallback: string) {
  const get = () => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
  const value = useSyncExternalStore(subscribe, get, () => fallback);
  const set = useCallback((next: string) => { try { localStorage.setItem(key, next); } catch {} emit(); }, [key]);
  return [value, set] as const;
}

/** Thème courant, synchronisé avec <html data-theme>. */
export function useTheme() {
  const get = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");
  const theme = useSyncExternalStore(subscribe, get, () => "light");
  const setTheme = useCallback((next: "dark" | "light") => {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("iconflow-theme", next); } catch {}
    emit();
  }, []);
  return [theme as "dark" | "light", setTheme] as const;
}

export type ThemeMode = "light" | "dark" | "system";
const systemDark = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
/** Applique un mode (clair, sombre, ou celui du téléphone / de l'ordinateur) et le garde dans ce navigateur. */
export function applyThemeMode(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode === "dark" || (mode === "system" && systemDark()) ? "dark" : "light";
  try { localStorage.setItem("iconflow-theme", mode); } catch {}
  emit();
}
/**
 * Mode de thème choisi (Clair / Sombre / Système), comme dans LeadConnector. En mode « Système », le thème suit
 * l'appareil, y compris quand il change pendant que l'app est ouverte.
 */
export function useThemeMode() {
  const get = (): ThemeMode => { try { const v = localStorage.getItem("iconflow-theme"); return v === "dark" || v === "system" ? v : "light"; } catch { return "light"; } };
  const mode = useSyncExternalStore(subscribe, get, () => "light" as ThemeMode);
  useEffect(() => {
    if (mode !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { document.documentElement.dataset.theme = mq.matches ? "dark" : "light"; emit(); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);
  return [mode, applyThemeMode] as const;
}

/**
 * Barre latérale repliée (ordinateur). L'état vit sur <html data-nav> (posé avant le premier affichage par le layout
 * racine) : le CSS replie la barre sans attendre React, donc sans saut à l'ouverture de la page.
 */
export function useNavCollapsed() {
  const get = () => document.documentElement.dataset.nav === "collapsed";
  const collapsed = useSyncExternalStore(subscribe, get, () => false);
  const setCollapsed = useCallback((next: boolean) => {
    if (next) document.documentElement.dataset.nav = "collapsed"; else delete document.documentElement.dataset.nav;
    try { localStorage.setItem("iconflow-nav", next ? "collapsed" : "open"); } catch {}
    emit();
  }, []);
  return [collapsed, setCollapsed] as const;
}
