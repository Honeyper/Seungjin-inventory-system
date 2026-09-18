import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../frontend/", import.meta.url));
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(join(directory, entry.name)) : [join(directory, entry.name)]);
}
for (const file of files(root).filter(file => file.endsWith(".html"))) test(`local scripts and styles exist: ${file.slice(root.length)}`, () => {
  const html = readFileSync(file, "utf8");
  for (const match of html.matchAll(/<(?:script\b[^>]*src|link\b[^>]*href)="([^"#]+)"/g)) {
    const path = match[1].split(/[?#]/)[0];
    if (/^(?:https?:|data:|\/\/)/.test(path)) continue;
    assert.ok(existsSync(resolve(dirname(file), path)), `${file}: missing ${path}`);
  }
  if (html.includes("supabase-gateway.js")) {
    assert.ok(html.indexOf("http-client.js") > 0);
    assert.ok(html.indexOf("http-client.js") < html.indexOf("supabase-gateway.js"));
  }
  if (file.endsWith("/admin.html")) assert.ok(html.indexOf("attachments.js") < html.indexOf("./admin.js"));
});
for (const file of files(root).filter(file => file.endsWith(".js"))) test(`no duplicate top-level function declarations: ${file.slice(root.length)}`, () => {
  const names = Array.from(readFileSync(file, "utf8").matchAll(/^(?:async )?function (\w+)\(/gm), match => match[1]);
  assert.equal(new Set(names).size, names.length);
});
