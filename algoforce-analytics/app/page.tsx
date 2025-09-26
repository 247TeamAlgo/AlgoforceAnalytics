// app/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    router.push("/analytics/");
  }, [router]);

  return null; // nothing visible, just redirect
}
