"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import type { ActionResult } from "@/lib/form";
import { Button, cn } from "./ui";

export function SubmitButton({
  children,
  variant = "primary",
  size,
  className,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending} className={className}>
      {pending ? "Working…" : children}
    </Button>
  );
}

export function FormMessage({ state, className }: { state: ActionResult | null; className?: string }) {
  if (!state) return null;
  if (state.ok && !state.message) return null;
  return (
    <p role="status" className={cn("text-sm", state.ok ? "text-good-text" : "text-critical-text", className)}>
      {state.ok ? state.message : state.error}
    </p>
  );
}

/** Button that asks for confirmation before running a server action. */
export function ConfirmButton({
  action,
  confirm,
  children,
  variant = "danger",
  size = "sm",
}: {
  action: () => Promise<unknown>;
  confirm: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
}) {
  return (
    <form
      action={async () => {
        if (window.confirm(confirm)) await action();
      }}
    >
      <SubmitButton variant={variant} size={size}>
        {children}
      </SubmitButton>
    </form>
  );
}
