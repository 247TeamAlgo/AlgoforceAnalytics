"use client";

import {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SunMoon } from "lucide-react";
import { useTheme } from "next-themes";

// Keep the Radix dropdown open on item select
function keepOpen(e: Event): void {
  e.preventDefault();
}

export function ThemeMenu() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Theme"
          className="h-9 inline-flex items-center gap-2 rounded-md border px-3 text-xs transition-colors hover:bg-accent"
        >
          <SunMoon className="h-4 w-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuPortal>
        <DropdownMenuContent
          sideOffset={8}
          className="w-44"
          // Optional: avoid focus jumping the trigger when menu would auto-close
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DropdownMenuRadioGroup
            value={String(theme)}
            onValueChange={(v) => setTheme(v)}
          >
            <DropdownMenuRadioItem
              value="light"
              className="cursor-pointer"
              onSelect={keepOpen}
            >
              Light
            </DropdownMenuRadioItem>

            <DropdownMenuRadioItem
              value="dark"
              className="cursor-pointer"
              onSelect={keepOpen}
            >
              Dark
            </DropdownMenuRadioItem>

            <DropdownMenuRadioItem
              value="system"
              className="cursor-pointer"
              onSelect={keepOpen}
            >
              System
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
}
