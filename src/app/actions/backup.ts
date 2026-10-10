"use server";

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { closeDb, getDataDir, getDbPath } from "@/lib/db";
import { errorMessage, type ActionResult } from "@/lib/form";
import { refreshAll } from "./revalidate";

/** Replaces the database with an uploaded backup. The current file is kept next to it. */
export async function restoreBackupAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a backup file (.db)." };
  const dir = getDataDir();
  const incoming = path.join(dir, `restore-${Date.now()}.db`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(incoming, Buffer.from(await file.arrayBuffer()));
    const check = new Database(incoming, { readonly: true, fileMustExist: true });
    try {
      const tables = check
        .prepare("select name from sqlite_master where type = 'table'")
        .all()
        .map((r) => (r as { name: string }).name);
      if (!tables.includes("accounts") || !tables.includes("transactions")) {
        throw new Error("This is not a Books backup.");
      }
    } finally {
      check.close();
    }

    const target = getDbPath();
    closeDb();
    if (fs.existsSync(target)) {
      fs.copyFileSync(target, `${target}.before-restore-${Date.now()}`);
    }
    for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${target}${suffix}`, { force: true });
    fs.renameSync(incoming, target);
  } catch (e) {
    fs.rmSync(incoming, { force: true });
    return { ok: false, error: errorMessage(e) };
  }
  refreshAll();
  return { ok: true, message: "Backup restored." };
}
