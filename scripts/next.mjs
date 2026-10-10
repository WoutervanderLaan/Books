// Starts Next.js with privacy-friendly defaults, cross-platform:
//   - Next.js telemetry off for this app
//   - `--demo` uses the demo database in ./demo-data instead of ./data
import { spawn } from "node:child_process";
import path from "node:path";

const args = process.argv.slice(2);
const demo = args.includes("--demo");
const nextArgs = args.filter((a) => a !== "--demo");

const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
if (demo) env.FINANCE_DATA_DIR = path.resolve("demo-data");

const child = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), ...nextArgs], {
  stdio: "inherit",
  env,
});
child.on("exit", (code) => process.exit(code ?? 0));
