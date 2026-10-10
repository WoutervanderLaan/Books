import { getSqlite } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Downloads a consistent snapshot of the whole database file. */
export function GET() {
  const snapshot = getSqlite().serialize();
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return new Response(new Uint8Array(snapshot), {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Disposition": `attachment; filename="books-backup-${stamp}.db"`,
      "Cache-Control": "no-store",
    },
  });
}
