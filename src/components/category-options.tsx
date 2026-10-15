import type { Category } from "@/lib/db/schema";
import { kindFitsAmount } from "@/lib/rules/engine";

type Choice = Pick<Category, "id" | "name" | "groupName"> & { kind?: Category["kind"] };

function grouped(categories: Choice[], label: (group: string) => string) {
  const groups = new Map<string, Choice[]>();
  for (const c of categories) {
    const key = label(c.groupName);
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }
  return [...groups.entries()];
}

/**
 * <option>s grouped by category group, in the categories' own order. With an
 * `amount`, categories that fit money in/out come first; the others follow as
 * refunds (money back on an expense) or corrections (income paid back).
 */
export function CategoryOptions({ categories, amount }: { categories: Choice[]; amount?: number }) {
  let groups: [string, Choice[]][];
  if (amount == null) {
    groups = grouped(categories, (g) => g);
  } else {
    const fits = (c: Choice) => !c.kind || (c.kind !== "transfer" && kindFitsAmount(c.kind, amount));
    const prefix = amount >= 0 ? "Refund · " : "Paid back · ";
    groups = [
      ...grouped(categories.filter(fits), (g) => g),
      ...grouped(categories.filter((c) => c.kind === "transfer"), (g) => g),
      ...grouped(categories.filter((c) => c.kind && c.kind !== "transfer" && !kindFitsAmount(c.kind, amount)), (g) => prefix + g),
    ];
  }
  return (
    <>
      {groups.map(([group, list]) => (
        <optgroup key={group} label={group}>
          {list.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
