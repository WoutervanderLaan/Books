"use client";

import { Printer } from "lucide-react";
import { Button } from "./ui";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <Button size="sm" className="no-print" onClick={() => window.print()}>
      <Printer className="size-3.5" aria-hidden /> {label}
    </Button>
  );
}
