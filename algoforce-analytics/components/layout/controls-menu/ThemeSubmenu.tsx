"use client";

import {
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { ChevronLeft, SunMoon } from "lucide-react";
import { useTheme } from "next-themes";
import { keepOpen } from "./menuUtils";

export function ThemeSubmenu({
  subTrigger,
  subLeft,
}: {
  subTrigger: string;
  subLeft: string;
}) {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className={subTrigger} onSelect={keepOpen}>
        <ChevronLeft className="h-4 w-4" aria-hidden />
        <SunMoon className="h-4 w-4" aria-hidden />
        <span>Theme</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent sideOffset={8} className={`w-44 ${subLeft}`}>
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
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
