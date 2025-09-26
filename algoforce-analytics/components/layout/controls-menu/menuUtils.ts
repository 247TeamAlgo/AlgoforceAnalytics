import type { SyntheticEvent } from "react";

export function keepOpen(e: Event | SyntheticEvent): void {
  (e as unknown as { preventDefault?: () => void }).preventDefault?.();
}
