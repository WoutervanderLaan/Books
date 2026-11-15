// Decides whether a pull request touches security-sensitive code and therefore needs the extra
// security review (`.github/workflows/security-review.yml`).
//
// A PR is in scope when it changes a sensitive path, or when an added line matches a risky pattern
// anywhere in the codebase. Keep the lists below in sync with "Security-sensitive areas" in AGENTS.md.
//
// CLI (run by CI with plain `node`, which strips the types):
//   node scripts/ci/security-scope.ts <base-ref> <head-ref>
// Prints a markdown report and, on GitHub Actions, writes `required=true|false` to $GITHUB_OUTPUT.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export interface SensitivePath {
  pattern: RegExp;
  reason: string;
}

export interface RiskyPattern {
  pattern: RegExp;
  reason: string;
  /** Only check added lines in files whose path matches this. Defaults to all files. */
  files?: RegExp;
}

export const SENSITIVE_PATHS: SensitivePath[] = [
  { pattern: /^src\/app\/api\//, reason: "HTTP route handler (backup/export endpoints)" },
  { pattern: /^src\/app\/actions\//, reason: "Server action (public mutation endpoint)" },
  { pattern: /^src\/lib\/db\//, reason: "Database connection, location or seeding" },
  { pattern: /^drizzle\//, reason: "Database migration" },
  { pattern: /^src\/lib\/import\//, reason: "Parser for untrusted bank files" },
  { pattern: /^src\/lib\/server\.ts$/, reason: "Server-only data access entry point" },
  { pattern: /^src\/(middleware|proxy|instrumentation)\.ts$/, reason: "Request interception" },
  { pattern: /^next\.config\.ts$/, reason: "Next.js config (headers, body limits, externals)" },
  {
    pattern: /^scripts\/next\.mjs$/,
    reason: "Server launcher (host binding, telemetry, data dir)",
  },
  { pattern: /^package(-lock)?\.json$/, reason: "Dependencies or npm scripts" },
  { pattern: /^\.github\//, reason: "CI configuration, workflow permissions or secrets" },
  { pattern: /^scripts\/ci\//, reason: "CI tooling (including this security gate)" },
  { pattern: /^\.claude\//, reason: "AI agent permissions" },
  { pattern: /^\.gitignore$/, reason: "Ignore rules that keep personal financial data out of git" },
  { pattern: /(^|\/)\.env/, reason: "Environment file" },
];

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

export const RISKY_PATTERNS: RiskyPattern[] = [
  { pattern: /dangerouslySetInnerHTML/, reason: "Raw HTML rendering (XSS)", files: SOURCE },
  { pattern: /\beval\s*\(|new Function\s*\(/, reason: "Dynamic code execution", files: SOURCE },
  {
    pattern: /child_process|\bspawn\s*\(|\bexecSync\s*\(/,
    reason: "Process spawning",
    files: SOURCE,
  },
  { pattern: /sql\.raw\s*\(|\.exec\s*\(\s*`/, reason: "Raw SQL (injection risk)", files: SOURCE },
  {
    pattern: /\b(prepare|run|all|get)\s*\(\s*`[^`]*\$\{/,
    reason: "Interpolated SQL",
    files: SOURCE,
  },
  {
    pattern: /\bfs\.(rm|unlink|write|rename|cp)\w*\s*\(/,
    reason: "File system write/delete",
    files: SOURCE,
  },
  {
    pattern: /\bfetch\s*\(|\bhttps?\.request\s*\(|XMLHttpRequest|WebSocket\s*\(/,
    reason: "Outbound network call (the app promises none)",
    files: SOURCE,
  },
  { pattern: /process\.env\b/, reason: "Environment variable access", files: SOURCE },
  { pattern: /\b(cookies|headers)\s*\(\s*\)/, reason: "Request headers/cookies", files: SOURCE },
  { pattern: /0\.0\.0\.0|--hostname\b|\blisten\s*\(/, reason: "Server host binding" },
  {
    pattern: /pull_request_target|secrets\.\w+|permissions:/,
    reason: "Workflow trust boundary",
    files: /\.ya?ml$/,
  },
  {
    pattern: /(api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"']{8,}/i,
    reason: "Possible hard-coded secret",
  },
];

export interface ChangedFile {
  path: string;
  addedLines: string[];
}

export interface Finding {
  path: string;
  reason: string;
  line?: string;
}

/** Splits `git diff --unified=0` output into changed files with their added lines. */
export function parseUnifiedDiff(diff: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  let current: ChangedFile | undefined;
  for (const line of diff.split("\n")) {
    const header = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (header) {
      current = { path: header[2], addedLines: [] };
      files.push(current);
    } else if (current && line.startsWith("+") && !line.startsWith("+++")) {
      current.addedLines.push(line.slice(1));
    }
  }
  return files;
}

export function assessSecurityScope(files: ChangedFile[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    for (const { pattern, reason } of SENSITIVE_PATHS) {
      if (pattern.test(file.path)) findings.push({ path: file.path, reason });
    }
    for (const { pattern, reason, files: only } of RISKY_PATTERNS) {
      if (only && !only.test(file.path)) continue;
      const hit = file.addedLines.find((l) => pattern.test(l));
      if (hit !== undefined)
        findings.push({ path: file.path, reason, line: hit.trim().slice(0, 160) });
    }
  }
  return findings;
}

export function formatReport(findings: Finding[]): string {
  if (findings.length === 0) return "No security-sensitive changes detected.\n";
  const rows = findings.map(
    (f) =>
      `| \`${f.path}\` | ${f.reason} | ${f.line ? `\`${f.line.replaceAll("|", "\\|").replaceAll("`", "'")}\`` : ""} |`,
  );
  return [
    "Security-sensitive changes detected:",
    "",
    "| File | Why | Added line |",
    "| --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function main(base: string, head: string) {
  const diff = execFileSync("git", ["diff", "--unified=0", "--no-color", `${base}...${head}`], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  const findings = assessSecurityScope(parseUnifiedDiff(diff));
  const report = formatReport(findings);
  process.stdout.write(report);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `required=${findings.length > 0}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Security scope\n\n${report}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [base = "origin/main", head = "HEAD"] = process.argv.slice(2);
  main(base, head);
}
