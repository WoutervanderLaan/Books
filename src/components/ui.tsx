import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { formatMoney } from "@/lib/format";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Card({ className, children, ...rest }: ComponentProps<"section">) {
  return (
    <section className={cn("rounded-xl border border-line bg-surface", className)} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-5 pb-5", className)}>{children}</div>;
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover border border-transparent",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-2",
  ghost: "bg-transparent text-ink-2 border border-transparent hover:bg-surface-2 hover:text-ink",
  danger: "bg-surface text-critical-text border border-line-strong hover:bg-surface-2",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: "sm" | "md" = "md") {
  return cn(
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-9 px-3.5 text-sm",
    buttonStyles[variant],
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <button className={cn(buttonClass(variant, size), className)} {...rest} />;
}

export function LinkButton({
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <Link className={cn(buttonClass(variant, size), className)} {...rest} />;
}

export const inputClass =
  "h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none";

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentProps<"select">) {
  return (
    <select className={cn(inputClass, "pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputClass, "h-auto min-h-20 py-2", className)} {...rest} />;
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

type Tone = "neutral" | "accent" | "good" | "warning" | "critical";

const badgeTones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  accent: "bg-accent-soft text-accent",
  good: "bg-surface-2 text-good-text",
  warning: "bg-surface-2 text-warning-text",
  critical: "bg-surface-2 text-critical-text",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium", badgeTones[tone], className)}>
      {children}
    </span>
  );
}

/** Signed amount: money in gets a "+" and the success ink; money out stays neutral. */
export function Amount({ cents, className, whole }: { cents: number; className?: string; whole?: boolean }) {
  return (
    <span className={cn("tabular whitespace-nowrap", cents > 0 ? "text-good-text" : "text-ink", className)}>
      {formatMoney(cents, { sign: true, whole })}
    </span>
  );
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {children ? <div className="mt-1.5 max-w-md text-sm text-ink-2">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Notice({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const bar: Record<Tone, string> = {
    neutral: "border-l-axis",
    accent: "border-l-accent",
    good: "border-l-good",
    warning: "border-l-warning",
    critical: "border-l-critical",
  };
  return (
    <div className={cn("rounded-lg border border-line border-l-4 bg-surface px-4 py-3 text-sm text-ink-2", bar[tone], className)}>
      {children}
    </div>
  );
}

/** Stat tile: label, value, optional delta vs a named period. */
export function StatTile({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: ReactNode;
  delta?: { text: string; good: boolean | null } | null;
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-5 py-4">
      <p className="text-[13px] font-medium text-ink-2">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">{value}</p>
      {delta ? (
        <p
          className={cn(
            "mt-1 text-xs font-medium",
            delta.good == null ? "text-muted" : delta.good ? "text-good-text" : "text-critical-text",
          )}
        >
          {delta.text}
        </p>
      ) : null}
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/**
 * Horizontal meter. "budget": share of a limit used, over budget turns critical.
 * "goal": progress towards a target, reaching it turns good.
 */
export function Meter({ value, max, label, kind = "budget" }: { value: number; max: number; label: string; kind?: "budget" | "goal" }) {
  const ratio = max > 0 ? value / max : value > 0 ? 2 : 0;
  const width = Math.max(0, Math.min(1, ratio)) * 100;
  const color =
    kind === "goal"
      ? ratio >= 1
        ? "var(--good)"
        : "var(--accent)"
      : ratio > 1
        ? "var(--critical)"
        : ratio > 0.9
          ? "var(--warning)"
          : "var(--accent)";
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1.5 w-full overflow-hidden rounded-full"
      style={{ background: "var(--meter-track)" }}
    >
      <div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} />
    </div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export const th = "border-b border-line px-3 py-2 text-left text-xs font-medium text-muted first:pl-5 last:pr-5";
export const td = "border-b border-line px-3 py-2.5 align-middle text-ink first:pl-5 last:pr-5";
export const tdNum = cn(td, "text-right tabular");
export const thNum = cn(th, "text-right");
