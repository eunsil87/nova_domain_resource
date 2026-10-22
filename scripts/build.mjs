import { readFile, mkdir, writeFile } from "node:fs/promises";
const read = (p) => readFile(new URL("../" + p, import.meta.url), "utf8");
let html = await read("src/index.html");
const core = (await read("src/core.js")).replace(/^export /gm, "");
const storage = (await read("src/storage.js"))
  .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm, "")
  .replace(/^export /gm, "");
const app = (await read("src/app.js")).replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm, "");
const style = await read("src/style.css");
html = html
  .replace("/* STYLE */", () => style)
  .replace("/* SCRIPT */", () =>
    [core, storage, app].join("\n").replace(/<\/script/gi, "<\\/script"),
  );
await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
await writeFile(new URL("../dist/NOVA.html", import.meta.url), html);
console.log(
  `dist/NOVA.html: ${Buffer.byteLength(html).toLocaleString()} bytes (offline, no external assets)`,
);
