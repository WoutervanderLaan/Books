import { revalidatePath } from "next/cache";

/** Single-user local app: after any change, refresh every page. */
export function refreshAll() {
  revalidatePath("/", "layout");
}
