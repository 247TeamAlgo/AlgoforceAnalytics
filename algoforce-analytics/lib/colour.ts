import { isCharm, isJanus } from "@/lib/accounts";

/** Data-driven bar colour (replaces the old SET_A…F branching) */
export function barColor(
  account: string,
  z: number,
  opened: number,
  positionOpen: number
): "green" | "red" | "black" {
  // Charm (two-sided)
  if (isCharm(account)) {
    if (positionOpen === 3 && opened === 3) return "black";
    return z < 0 ? "red" : "green";
  }

  // Janus (one-sided)
  if (isJanus(account)) {
    if (
      (positionOpen === 2 && opened === 2) ||
      (positionOpen === 3 && opened === 3)
    )
      return "black";
    return z < 0 ? "red" : "green";
  }

  // Fallback: same as before
  return z < 0 ? "red" : "green";
}
