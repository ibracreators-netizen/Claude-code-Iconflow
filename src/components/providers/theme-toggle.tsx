"use client";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useTheme } from "@/lib/hooks/use-local-pref";

export function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  return (
    <Tooltip label={theme === "dark" ? "Thème clair" : "Thème sombre"}>
      <Button variant="ghost" size="icon-sm" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Changer de thème">
        {theme === "dark" ? <Sun /> : <Moon />}
      </Button>
    </Tooltip>
  );
}
