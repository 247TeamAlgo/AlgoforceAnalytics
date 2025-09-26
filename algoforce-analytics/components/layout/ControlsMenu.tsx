// src/components/ControlsMenu.tsx
"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState } from "react";
import { ThemeSubmenu } from "./controls-menu/ThemeSubmenu";

export function ControlsMenu({
  triggerClassName,
  triggerIcon,
}: {
  account: string;
  onChangeAccount: (a: string) => void;
  triggerClassName?: string;
  triggerIcon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const [selectOpen, setSelectOpen] = useState(false);

  const subTrigger = "flex items-center gap-2 pl-2 [&>svg:last-child]:hidden";
  const subLeft =
    "origin-top-left w-72 data-[side=right]:-translate-x-[calc(100%+8px)] data-[side=left]:translate-x-0";


  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="Open settings and controls"
                className={`${triggerClassName ?? ""} cursor-pointer transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
              >
                {triggerIcon}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center">
            Settings &amp; controls
          </TooltipContent>
        </Tooltip>

        <DropdownMenuContent
          align="start"
          side="bottom"
          sideOffset={6}
          className="w-56"
        >
          <ThemeSubmenu subTrigger={subTrigger} subLeft={subLeft} />
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={selectOpen} onOpenChange={setSelectOpen}>
        <DialogContent
          className="sm:max-w-[720px]"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Select accounts for Combined Report</DialogTitle>
            <DialogDescription>
              Monitored accounts are shown by default. You can include
              unmonitored accounts using the toggle.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
