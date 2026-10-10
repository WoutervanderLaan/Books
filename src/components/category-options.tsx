import type { Category } from "@/lib/db/schema";

/** <option>s grouped by category group, in the categories' own order. */
export function CategoryOptions({ categories }: { categories: Pick<Category, "id" | "name" | "groupName">[] }) {
  const groups = new Map<string, Pick<Category, "id" | "name" | "groupName">[]>();
  for (const c of categories) {
    const list = groups.get(c.groupName) ?? [];
    list.push(c);
    groups.set(c.groupName, list);
  }
  return (
    <>
      {[...groups.entries()].map(([group, list]) => (
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
