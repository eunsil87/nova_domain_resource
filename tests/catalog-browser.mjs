import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { seed, startup, clone } from "../src/core.js";
const html = await readFile(new URL("../dist/NOVA.html", import.meta.url));
const server = createServer((_, res) => {
  res.writeHead(200, { "Content-Type": "text/html;charset=utf-8" });
  res.end(html);
}).listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  locale: "ko-KR",
  timezoneId: "Asia/Seoul",
});
await context.addInitScript(() => {
  window.showDirectoryPicker = () => navigator.storage.getDirectory();
  const create = FileSystemFileHandle.prototype.createWritable;
  FileSystemFileHandle.prototype.createWritable = function (...args) {
    if (localStorage.getItem("fail-write"))
      throw new DOMException("테스트 쓰기 실패", "NotAllowedError");
    return create.apply(this, args);
  };
});
const page = await context.newPage(),
  errors = [],
  network = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (!r.url().startsWith("http://127.0.0.1:")) network.push(r.url());
});
page.on("dialog", (d) => d.accept());
await page.clock.setFixedTime(new Date("2026-10-26T03:00:00Z"));
let count = 0;
const ok = (label) => {
  console.log("PASS", label);
  count++;
};
const modal = () => page.locator(".modal-layer:visible .dialog");
const apply = async (label = "적용") =>
  modal().getByRole("button", { name: label, exact: true }).click();
const cancel = () =>
  modal().getByRole("button", { name: "취소", exact: true }).click();
const action = (name, root = page) =>
  root.locator(`[data-action="${name}"]`).first().click();
const nav = (name) =>
  page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
const level = async (key) =>
  page.locator(`.catalog-tabs [data-level="${key}"]`).click();
const read = () =>
  page.evaluate(async () =>
    JSON.parse(
      await (
        await (
          await navigator.storage.getDirectory()
        ).getFileHandle("nova-data.json")
      )
        .getFile()
        .then((f) => f.text()),
    ),
  );
const save = async () => {
  await page.locator("header [data-action=save]").click();
  await page.waitForFunction(
    () => document.querySelector("header .saved")?.textContent === "저장 완료",
  );
};
const row = (code) =>
  page
    .locator(".catalog-table tbody tr")
    .filter({ has: page.locator(".catalog-code", { hasText: code }) });
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const old = (await startup(seed(), { today: "2026-10-26" })).data;
  old.schemaVersion = 1;
  await page.evaluate(async (d) => {
    const handle = await (
        await navigator.storage.getDirectory()
      ).getFileHandle("nova-data.json", { create: true }),
      w = await handle.createWritable();
    await w.write(JSON.stringify(d));
    await w.close();
  }, old);
  await page.getByRole("button", { name: "앱 폴더 연결", exact: true }).click();
  await page.getByRole("heading", { name: "연간 인력 현황" }).waitFor();
  await nav("Catalog 관리");
  await page
    .getByRole("heading", { name: "서비스오더 Catalog 시작하기" })
    .waitFor();
  assert.deepEqual(await read(), old);
  assert.equal(await page.locator("header .saved").innerText(), "저장 완료");
  ok(
    "existing schema 1 opens intact; Catalog navigation never initializes or writes",
  );
  await page.locator("[data-mode=baseline]").click();
  await cancel();
  assert.equal(await page.locator(".catalog-table").count(), 0);
  await page.locator("[data-mode=baseline]").click();
  await apply("확인");
  assert.equal(await page.locator("[data-catalog-row]").count(), 106);
  assert.equal((await read()).catalog, undefined);
  assert.equal(
    await page.locator("header .saved").innerText(),
    "저장하지 않은 변경 사항",
  );
  ok(
    "baseline initialization is explicit, cancellable, session-only and complete",
  );
  await save();
  let stored = await read();
  assert.equal(stored.schemaVersion, 2);
  assert.equal(stored.catalog.l4.length, 106);
  assert.deepEqual(stored.people, old.people);
  assert.deepEqual(stored.plans, old.plans);
  ok(
    "manual save upgrades only the compatible document and preserves people and plans",
  );
  await page
    .locator("[data-catalog-filter=domains]")
    .selectOption("cat-domains-SVC");
  assert.equal(await page.locator("[data-catalog-row]").count(), 45);
  await page.locator("#catalog-requirement").selectOption("optional");
  assert((await page.locator("[data-catalog-row]").count()) < 45);
  assert(
    (await page.locator(".catalog-table tbody").innerText()).includes("옵션"),
  );
  await action("catalog-clear-filters");
  await page.locator("#catalog-query").fill("BP-EPCTMFC006-1001-R003");
  assert.equal(await page.locator("[data-catalog-row]").count(), 1);
  await action("catalog-clear-filters");
  ok("hierarchical filtering, exact-ID search and required/optional lookup");
  await page.evaluate(() => {
    const input = document.querySelector("#catalog-query");
    window.catalogComposingInput = input;
    input.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    input.value = "서비스";
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        isComposing: true,
        data: "서비스",
      }),
    );
  });
  assert(await page.evaluate(() => window.catalogComposingInput.isConnected));
  await page.locator("#catalog-query").dispatchEvent("compositionend");
  assert.equal(await page.locator("#catalog-query").inputValue(), "서비스");
  assert((await page.locator("[data-catalog-row]").count()) < 106);
  await action("catalog-clear-filters");
  ok("Korean IME search preserves the input while composing");

  await level("domains");
  await row("EPC").click();
  assert.equal(await page.locator("[data-catalog-row]").count(), 1);
  await row("TMFC006").click();
  await row("TMFC006-SC41").click();
  await row("BZ-EPCTMFC006-1001").click();
  assert.equal(await page.locator("[data-catalog-row]").count(), 5);
  await action("catalog-clear-filters");
  ok("drill down traverses Domain → L2 → Sub Component → L3 → L4");
  // Add one linked branch at every level, keeping generated internal IDs stable.
  const keys = ["domains", "l2", "subcomponents", "l3", "l4"],
    ids = {};
  let parentId = null;
  for (const [i, key] of keys.entries()) {
    await level(key);
    await action("catalog-clear-filters");
    await action("catalog-add");
    await modal()
      .locator("[name=code]")
      .fill("CUSTOM-" + i);
    await modal()
      .locator("[name=name]")
      .fill("Custom Name " + i);
    await modal()
      .locator("[name=koreanName]")
      .fill("추가 항목 " + i);
    if (parentId)
      await modal().locator("[name=parentId]").selectOption(parentId);
    if (key === "l4") {
      await modal()
        .locator("[name=description]")
        .fill("직접 수정 가능한 기능 설명\n두 번째 줄");
      await modal().locator("[name=required]").selectOption("optional");
    }
    await apply();
    const added = row("CUSTOM-" + i);
    await added.waitFor();
    ids[key] = await added.getAttribute("data-catalog-row");
    parentId = ids[key];
  }
  assert.equal(await page.locator("[data-catalog-row]").count(), 107);
  assert.equal((await read()).catalog.domains.length, 3);
  ok(
    "all five levels can be added through the screen without automatic persistence",
  );
  await level("l2");
  await row("CUSTOM-1").locator("[data-action=catalog-edit]").click();
  await modal().locator("[name=code]").fill("TMFC006");
  await apply();
  assert.match(await modal().locator(".error").innerText(), /이미 사용/);
  await modal().locator("[name=code]").fill("CUSTOM-1");
  await cancel();
  ok("duplicate external IDs are rejected without mutating the branch");
  await level("subcomponents");
  await row("CUSTOM-2").locator("[data-action=catalog-assignees]").click();
  await modal().locator("[name=assignee][value=person-0]").check();
  await modal().locator("[name=assignee][value=person-1]").check();
  await modal().locator("[name=assignee][value=tbd-1]").check();
  await apply();
  assert.match(await row("CUSTOM-2").innerText(), /장은실/);
  assert.match(await row("CUSTOM-2").innerText(), /유원기/);
  assert.match(await row("CUSTOM-2").innerText(), /TBD#1/);
  ok("Sub Component supports multiple common personnel and TBD assignments");
  await row("CUSTOM-2").locator("[data-action=catalog-edit]").click();
  await modal().locator("[name=code]").fill("RENAMED-SC");
  await modal().locator("[name=name]").fill("Renamed Sub Component");
  await modal().locator("[name=parentId]").selectOption("cat-l2-TMFC007");
  await apply();
  await row("RENAMED-SC").waitFor();
  assert.match(await row("RENAMED-SC").innerText(), /장은실/);
  await save();
  stored = await read();
  assert.equal(
    stored.catalog.l3.find((n) => n.id === ids.l3).parentId,
    ids.subcomponents,
  );
  assert.deepEqual(
    stored.catalog.subcomponents.find((n) => n.id === ids.subcomponents)
      .assigneeIds,
    ["person-0", "person-1", "tbd-1"],
  );
  ok("code/name/parent edits preserve descendant identity and assignee links");
  await row("RENAMED-SC").locator("[data-action=catalog-edit]").click();
  await action("catalog-remove", modal());
  assert.match(await modal().locator(".error").innerText(), /하위 L3/);
  await cancel();
  ok("deleting a node with children is blocked rather than cascading");
  await level("l4");
  await row("CUSTOM-4").locator("[data-action=catalog-edit]").click();
  assert.equal(
    await modal().locator("[name=description]").inputValue(),
    "직접 수정 가능한 기능 설명\n두 번째 줄",
  );
  await modal().locator("[name=description]").fill("버릴 변경");
  await cancel();
  await apply("버리기");
  await row("CUSTOM-4").locator("[data-action=catalog-edit]").click();
  assert.equal(
    await modal().locator("[name=description]").inputValue(),
    "직접 수정 가능한 기능 설명\n두 번째 줄",
  );
  await action("catalog-remove", modal());
  await apply("삭제");
  await level("l3");
  await row("CUSTOM-3").locator("[data-action=catalog-edit]").click();
  await action("catalog-remove", modal());
  await apply("삭제");
  ok("L4 description drafts cancel correctly; leaf-first deletion works");
  await level("subcomponents");
  await row("RENAMED-SC").locator("[data-action=catalog-edit]").click();
  await action("catalog-remove", modal());
  assert.match(await modal().locator(".error").innerText(), /담당자 연결/);
  await cancel();
  ok(
    "an assigned Sub Component cannot be deleted even after its children are removed",
  );
  await nav("인력 관리");
  await page.locator("[data-person=person-0]").click();
  await modal().locator("[data-action=delete]").click();
  assert.match(await modal().innerText(), /Catalog: RENAMED-SC/);
  await apply("삭제");
  await nav("Catalog 관리");
  await level("subcomponents");
  assert(
    !(await row("RENAMED-SC")
      .innerText()
      .then((x) => x.includes("장은실"))),
  );
  assert.match(await row("RENAMED-SC").innerText(), /유원기/);
  ok(
    "person deletion announces Catalog links and cleans only that person’s assignments",
  );
  await row("RENAMED-SC").locator("[data-action=catalog-assignees]").click();
  await modal().locator("[name=assignee][value=person-1]").uncheck();
  await modal().locator("[name=assignee][value=tbd-1]").uncheck();
  await apply();
  await row("RENAMED-SC").locator("[data-action=catalog-edit]").click();
  await action("catalog-remove", modal());
  await apply("삭제");
  assert.equal(await row("RENAMED-SC").count(), 0);
  ok("clearing assignees permits explicit Sub Component deletion");
  await page.evaluate(() => localStorage.setItem("fail-write", "1"));
  const before = await read();
  await page.locator("header [data-action=save]").click();
  await page.getByRole("heading", { name: "저장하지 못했습니다" }).waitFor();
  assert.deepEqual(await read(), before);
  await cancel();
  await page.evaluate(() => localStorage.removeItem("fail-write"));
  await save();
  const persisted = await read();
  await page.reload();
  await page.getByRole("heading", { name: "연간 인력 현황" }).waitFor();
  await nav("Catalog 관리");
  assert.deepEqual(await read(), persisted);
  await level("subcomponents");
  assert.equal(await row("RENAMED-SC").count(), 0);
  assert.equal(persisted.catalog.subcomponents.length, 12);
  ok(
    "failed save preserves session/file, retry and reload do not reinsert deleted Catalog nodes",
  );
  await level("l4");
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/catalog.png" });
  await page.locator("[data-catalog-row]").first().click();
  await page.screenshot({ path: "test-results/catalog-detail.png" });
  const box = await modal().boundingBox();
  assert(Math.abs(box.x + box.width / 2 - (216 + (1920 - 216) / 2)) < 2);
  await cancel();
  assert.deepEqual(errors, []);
  assert.deepEqual(network, []);
  ok(
    "offline Catalog screens and popup geometry work at 1920×1080 with no runtime errors",
  );

  // A separate initial-file fixture verifies an intentionally empty catalog is never reseeded.
  await page.evaluate(async (d) => {
    const handle = await (
        await navigator.storage.getDirectory()
      ).getFileHandle("nova-data.json"),
      w = await handle.createWritable();
    await w.write(JSON.stringify(d));
    await w.close();
  }, old);
  await page.reload();
  await page.getByRole("heading", { name: "연간 인력 현황" }).waitFor();
  await nav("Catalog 관리");
  await page.locator("[data-mode=empty]").click();
  await apply("확인");
  assert.equal(await page.locator("[data-catalog-row]").count(), 0);
  await save();
  await page.reload();
  await page.getByRole("heading", { name: "연간 인력 현황" }).waitFor();
  await nav("Catalog 관리");
  assert.equal(await page.locator("[data-mode=baseline]").count(), 0);
  assert.equal(await page.locator("[data-catalog-row]").count(), 0);
  assert.equal((await read()).catalog.l4.length, 0);
  assert.deepEqual((await read()).people, old.people);
  ok("empty Catalog is a valid saved state and never regenerates the baseline");
  console.log(`${count} Catalog browser scenarios passed.`);
} catch (e) {
  await mkdir("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/catalog-failure.png",
    fullPage: true,
  });
  console.error((await page.locator("body").innerText()).slice(-7000), errors);
  throw e;
} finally {
  await context.close();
  await browser.close();
  await new Promise((r) => server.close(r));
}
