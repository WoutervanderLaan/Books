import { eq } from "drizzle-orm";
import type { DB } from "./connection";
import { categories, meta, rules } from "./schema";
import { BUSINESS_CATEGORIES, PERSONAL_CATEGORIES, STARTER_RULES } from "./seed-data";

const SEED_VERSION = "1";

/** Inserts default categories and starter rules once, on a fresh database. */
export function seedDefaults(db: DB) {
  const done = db.select().from(meta).where(eq(meta.key, "seed_version")).get();
  if (done) return;

  db.transaction((tx) => {
    const all = [...PERSONAL_CATEGORIES, ...BUSINESS_CATEGORIES];
    const ids = new Map<string, number>();
    all.forEach((c, i) => {
      const row = tx
        .insert(categories)
        .values({
          name: c.name,
          groupName: c.group,
          kind: c.kind,
          scope: c.scope,
          role: c.role ?? null,
          vatCode: c.vat ?? null,
          taxGroup: c.taxGroup ?? null,
          deductiblePct: c.deductiblePct ?? 100,
          sortOrder: i,
        })
        .returning({ id: categories.id })
        .get();
      ids.set(`${c.scope}:${c.name}`, row.id);
    });

    for (const r of STARTER_RULES) {
      const categoryId = ids.get(`${r.kind}:${r.category}`);
      if (!categoryId) throw new Error(`Seed rule refers to unknown category ${r.kind}:${r.category}`);
      const patterns = r.counterparty ?? [null];
      for (const pattern of patterns) {
        tx.insert(rules)
          .values({
            accountKind: r.kind,
            counterpartyContains: pattern,
            descriptionContains: r.description ?? null,
            direction: r.direction ?? null,
            categoryId,
            vatCode: r.vat ?? null,
            priority: r.priority ?? 0,
            source: "starter",
          })
          .run();
      }
    }

    tx.insert(meta).values({ key: "seed_version", value: SEED_VERSION }).run();
  });
}
