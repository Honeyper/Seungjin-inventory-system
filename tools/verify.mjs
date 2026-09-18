import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL("../", import.meta.url));
function files(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
function run(command, args, quiet = false) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: quiet ? "pipe" : "inherit" });
  if (result.error || result.status !== 0) {
    if (quiet) process.stderr.write(result.stderr || result.error?.message || "검증 실패\n");
    process.exit(result.status || 1);
  }
}
const scripts = ["frontend", "gas", "supabase/functions", "tools"].flatMap(files).filter(path => /\.(?:[cm]?js|ts)$/.test(path));
for (const script of scripts) run(process.execPath, ["--check", script], true);
console.log(`문법 검사 통과: ${scripts.length}개 파일`);
run(process.execPath, ["--test", ...files("tests").filter(path => path.endsWith(".test.mjs"))]);
run("git", ["diff", "--check"]);
