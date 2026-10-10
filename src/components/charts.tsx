"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMonth, monthName } from "@/lib/dates";
import { formatMoney, formatMoneyCompact } from "@/lib/format";

const axisTick = { fill: "var(--muted)", fontSize: 12 };

/** The part of Recharts' tooltip props our custom tooltips use. */
interface TipProps {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
}

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: number; color?: string; strong?: boolean }[] }) {
  return (
    <div className="min-w-44 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 font-medium text-ink-2">{title}</p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-ink-2">
              {r.color ? <span className="inline-block h-0.5 w-3 rounded" style={{ background: r.color }} /> : null}
              {r.label}
            </span>
            <span className={r.strong ? "font-semibold text-ink tabular" : "text-ink tabular"}>{formatMoney(r.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; shape?: "box" | "line" }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span
            className={i.shape === "line" ? "inline-block h-0.5 w-3.5 rounded" : "inline-block size-2.5 rounded-[3px]"}
            style={{ background: i.color }}
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export interface CashflowPoint {
  month: string;
  income: number;
  expenses: number;
}

/** Income vs. spending per month, as grouped columns on one axis. */
export function CashflowChart({ data, height = 260 }: { data: CashflowPoint[]; height?: number }) {
  return (
    <div>
      <Legend
        items={[
          { label: "Income", color: "var(--series-1)" },
          { label: "Spending", color: "var(--series-2)" },
        ]}
      />
      <div className="mt-3" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap="22%" margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis
              dataKey="month"
              tickFormatter={(m: string) => formatMonth(m, { short: true })}
              tick={axisTick}
              axisLine={{ stroke: "var(--axis)" }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis tickFormatter={formatMoneyCompact} tick={axisTick} axisLine={false} tickLine={false} width={56} />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              content={(p: TipProps) => {
                if (!p.active || !p.payload?.length) return null;
                const d = p.payload[0].payload as CashflowPoint;
                return (
                  <TooltipBox
                    title={formatMonth(d.month)}
                    rows={[
                      { label: "Income", value: d.income, color: "var(--series-1)" },
                      { label: "Spending", value: d.expenses, color: "var(--series-2)" },
                      { label: "Net", value: d.income - d.expenses, strong: true },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="income" name="Income" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={24} />
            <Bar dataKey="expenses" name="Spending" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Month-end balance as a single line with a light wash. */
export function BalanceChart({ data, height = 200 }: { data: { month: string; balance: number }[]; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis
            dataKey="month"
            tickFormatter={(m: string) => formatMonth(m, { short: true })}
            tick={axisTick}
            axisLine={{ stroke: "var(--axis)" }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis tickFormatter={formatMoneyCompact} tick={axisTick} axisLine={false} tickLine={false} width={56} />
          <Tooltip
            cursor={{ stroke: "var(--axis)" }}
            content={(p: TipProps) => {
              if (!p.active || !p.payload?.length) return null;
              const d = p.payload[0].payload as { month: string; balance: number };
              return <TooltipBox title={`End of ${formatMonth(d.month)}`} rows={[{ label: "Balance", value: d.balance, strong: true }]} />;
            }}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="var(--series-1)"
            strokeWidth={2}
            fill="var(--series-1)"
            fillOpacity={0.1}
            activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** One line per year, Jan–Dec. The latest year is emphasised, earlier years recede. */
export function YearOverlayChart({ years, data, height = 280 }: { years: number[]; data: Record<string, number>[]; height?: number }) {
  const shown = years.slice(-4);
  const colorFor = (i: number) => {
    const fromEnd = shown.length - 1 - i;
    return fromEnd === 0 ? "var(--series-1)" : fromEnd === 1 ? "var(--series-2)" : fromEnd === 2 ? "var(--deemph-2)" : "var(--deemph)";
  };
  return (
    <div>
      <Legend items={shown.map((y, i) => ({ label: String(y), color: colorFor(i), shape: "line" }))} />
      <div className="mt-3" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis
              dataKey="month"
              tickFormatter={(m: number) => monthName(m)}
              tick={axisTick}
              axisLine={{ stroke: "var(--axis)" }}
              tickLine={false}
            />
            <YAxis tickFormatter={formatMoneyCompact} tick={axisTick} axisLine={false} tickLine={false} width={56} />
            <Tooltip
              cursor={{ stroke: "var(--axis)" }}
              content={(p: TipProps) => {
                if (!p.active || !p.payload?.length) return null;
                const point = p.payload[0].payload as Record<string, number>;
                return (
                  <TooltipBox
                    title={monthName(point.month)}
                    rows={[...shown]
                      .reverse()
                      .map((y) => ({ label: String(y), value: point[String(y)] ?? 0, color: colorFor(shown.indexOf(y)) }))}
                  />
                );
              }}
            />
            {shown.map((y, i) => (
              <Line
                key={y}
                type="monotone"
                dataKey={String(y)}
                stroke={colorFor(i)}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Single-series monthly columns (e.g. one category over time). */
export function MonthlyColumns({ data, height = 220, label }: { data: { month: string; value: number }[]; height?: number; label: string }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis
            dataKey="month"
            tickFormatter={(m: string) => (m.endsWith("-01") ? m.slice(0, 4) : formatMonth(m, { short: true }))}
            tick={axisTick}
            axisLine={{ stroke: "var(--axis)" }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis tickFormatter={formatMoneyCompact} tick={axisTick} axisLine={false} tickLine={false} width={56} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={(p: TipProps) => {
              if (!p.active || !p.payload?.length) return null;
              const d = p.payload[0].payload as { month: string; value: number };
              return <TooltipBox title={formatMonth(d.month)} rows={[{ label, value: d.value, strong: true }]} />;
            }}
          />
          <Bar dataKey="value" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
