import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const stripUsdt = (s: string) => s.replace(/USDT/gi, "");
export const fmtPct = (x: number) => `${(x * 100).toFixed(2)}%`;
export const fmtUsd = (x: number) => `${x.toFixed(2)}$`;