import { chromium, webkit } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { seed } from "../src/core.js";
const html = await readFile(new URL("../dist/NOVA.html", import.meta.url));
const server = createServer((_, res) => {
  res.writeHead(200, { "Content-Type": "text/html;charset=utf-8" });
  res.end(html);
}).listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const engine = process.env.BROWSER === "webkit" ? webkit : chromium;
let browser;
try {
  browser = await engine.launch(
    engine === chromium
      ? { executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] }
      : {},
  );
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1920, height: 1080 },
  });
  await context.addInitScript(() => {
    window.showDirectoryPicker = undefined;
  });
  const page = await context.newPage();
  const errors = [],
    external = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:")) external.push(r.url());
  });
  page.on("dialog", (d) => d.accept());
  const url = `http://127.0.0.1:${server.address().port}`;
  const modal = () => page.locator(".modal-layer:visible .dialog");
  const file = (text) => ({
    name: "nova-data.json",
    mimeType: "application/json",
    buffer: Buffer.from(text),
  });
  const open = async (text) => {
    const picker = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: "JSON 파일 열기", exact: true })
      .click();
    await (await picker).setFiles(file(text));
  };
  await page.goto(url);
  await page
    .getByRole("button", { name: "새 워크스페이스", exact: true })
    .click();
  await modal().getByRole("button", { name: "만들기", exact: true }).click();
  await page.getByRole("heading", { name: "연간 인력 현황" }).waitFor();
  assert.match(await page.locator("header .saved").innerText(), /저장하지/);
  console.log("PASS new workspace remains unsaved without automatic downloads");
  await page.locator("[data-action=save]").click();
  await modal()
    .getByRole("button", { name: "저장 파일 확인", exact: true })
    .click();
  assert.match(await modal().locator(".error").innerText(), /선택/);
  const downloadEvent = page.waitForEvent("download");
  await modal().getByRole("link", { name: "nova-data.json 다운로드" }).click();
  const download = await downloadEvent;
  const text = await readFile(await download.path(), "utf8");
  const saved = JSON.parse(text);
  assert.equal(saved.people.length, 19);
  assert.equal(saved.saveVersion, 1);
  await modal().locator("input[type=file]").setInputFiles(file("{}"));
  await modal()
    .getByRole("button", { name: "저장 파일 확인", exact: true })
    .click();
  await modal().locator(".error").filter({ hasText: "다른 파일" }).waitFor();
  console.log(
    "PASS real JSON download, missing and mismatched confirmation rejected",
  );
  await modal().getByRole("button", { name: "취소", exact: true }).click();
  assert.match(await page.locator("header .saved").innerText(), /저장하지/);
  await page.locator("[data-action=save]").click();
  await modal().locator("input[type=file]").setInputFiles(file(text));
  await modal()
    .getByRole("button", { name: "저장 파일 확인", exact: true })
    .click();
  await page.getByRole("status").filter({ hasText: "저장 완료" }).waitFor();
  console.log(
    "PASS cancel keeps dirty; exact downloaded content confirms save",
  );
  await page.reload();
  await open("{broken");
  await page.locator(".connection .error").waitFor();
  assert.equal(await page.locator("header").count(), 0);
  await open(text);
  await page.getByRole("heading", { name: "연간 인력 현황" }).waitFor();
  assert.equal(await page.locator("header .saved").innerText(), "저장 완료");
  console.log("PASS corrupted JSON protected and downloaded JSON reloads");
  await page.reload();
  const old = seed();
  old.people.find((p) => p.kind === "tbd").start = "2020-01-01";
  await open(JSON.stringify(old));
  await page.getByRole("heading", { name: "연간 인력 현황" }).waitFor();
  assert.match(await page.locator("header .saved").innerText(), /저장하지/);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "PASS startup cleanup stays dirty; zero page errors/external requests",
  );
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
