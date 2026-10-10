import { asc, eq } from "drizzle-orm";
import type { DB } from "../db/connection";
import { budgetLines, type BudgetLine } from "../db/schema";
import type { BudgetFrequency, BudgetType } from "../types";

export function listBudgetLines(db: DB, accountId: number): BudgetLine[] {
  return db.select().from(budgetLines).where(eq(budgetLines.accountId, accountId)).orderBy(asc(budgetLines.id)).all();
}

export interface BudgetLineInput {
  name: string;
  categoryId: number | null;
  amount: number;
  frequency: BudgetFrequency;
  type: BudgetType;
  startMonth?: string | null;
  endMonth?: string | null;
  note?: string | null;
}

export function saveBudgetLine(db: DB, accountId: number, input: BudgetLineInput, id?: number) {
  const values = {
    accountId,
    name: input.name.trim(),
    categoryId: input.categoryId,
    amount: Math.abs(input.amount),
    frequency: input.frequency,
    type: input.type,
    startMonth: input.startMonth || null,
    endMonth: input.endMonth || null,
    note: input.note || null,
  };
  if (id) db.update(budgetLines).set(values).where(eq(budgetLines.id, id)).run();
  else db.insert(budgetLines).values(values).run();
}

export function deleteBudgetLine(db: DB, id: number) {
  db.delete(budgetLines).where(eq(budgetLines.id, id)).run();
}

export function importBudgetLines(db: DB, accountId: number, lines: BudgetLineInput[]): number {
  db.transaction((tx) => {
    for (const line of lines) {
      tx.insert(budgetLines)
        .values({
          accountId,
          name: line.name,
          categoryId: line.categoryId,
          amount: Math.abs(line.amount),
          frequency: line.frequency,
          type: line.type,
          startMonth: line.startMonth ?? null,
          endMonth: line.endMonth ?? null,
          note: line.note ?? null,
        })
        .run();
    }
  });
  return lines.length;
}
