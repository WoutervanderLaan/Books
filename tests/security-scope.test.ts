import { describe, expect, it } from "vitest";
import { assessSecurityScope, formatReport, parseUnifiedDiff } from "../scripts/ci/security-scope";

const diff = [
  "diff --git a/src/components/Note.tsx b/src/components/Note.tsx",
  "index 111..222 100644",
  "--- a/src/components/Note.tsx",
  "+++ b/src/components/Note.tsx",
  "@@ -1,0 +2 @@",
  "+  return <div dangerouslySetInnerHTML={{ __html: note }} />;",
  "diff --git a/src/lib/format.ts b/src/lib/format.ts",
  "--- a/src/lib/format.ts",
  "+++ b/src/lib/format.ts",
  "@@ -3 +3 @@",
  "-export const x = 1;",
  "+export const x = 2;",
  "diff --git a/src/app/api/backup/route.ts b/src/app/api/backup/route.ts",
  "deleted file mode 100644",
  "--- a/src/app/api/backup/route.ts",
  "+++ /dev/null",
  "@@ -1 +0,0 @@",
  "-export function GET() {}",
].join("\n");

describe("security scope", () => {
  it("parses added lines per file", () => {
    const files = parseUnifiedDiff(diff);
    expect(files.map((f) => f.path)).toEqual([
      "src/components/Note.tsx",
      "src/lib/format.ts",
      "src/app/api/backup/route.ts",
    ]);
    expect(files[1].addedLines).toEqual(["export const x = 2;"]);
    expect(files[2].addedLines).toEqual([]);
  });

  it("flags risky added code and sensitive paths, but not ordinary changes", () => {
    const findings = assessSecurityScope(parseUnifiedDiff(diff));
    expect(findings.map((f) => [f.path, f.reason])).toEqual([
      ["src/components/Note.tsx", "Raw HTML rendering (XSS)"],
      ["src/app/api/backup/route.ts", "HTTP route handler (backup/export endpoints)"],
    ]);
  });

  it("flags outbound network calls and interpolated SQL", () => {
    const findings = assessSecurityScope([
      { path: "src/lib/services/x.ts", addedLines: ["await fetch('https://example.com')"] },
      {
        path: "src/lib/services/y.ts",
        addedLines: ["sqlite.prepare(`SELECT * FROM t WHERE id = ${id}`)"],
      },
    ]);
    expect(findings.map((f) => f.reason)).toEqual([
      "Outbound network call (the app promises none)",
      "Interpolated SQL",
    ]);
  });

  it("only checks workflow patterns in YAML files", () => {
    const line = "permissions: write-all";
    expect(assessSecurityScope([{ path: "docs/notes.md", addedLines: [line] }])).toEqual([]);
    expect(assessSecurityScope([{ path: "ci/x.yml", addedLines: [line] }])).toHaveLength(1);
  });

  it("formats a report", () => {
    expect(formatReport([])).toMatch(/No security-sensitive changes/);
    expect(formatReport([{ path: "a.ts", reason: "R", line: "x | y" }])).toContain("`x \\| y`");
  });
});
