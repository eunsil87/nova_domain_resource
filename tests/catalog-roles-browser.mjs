import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { seed, startup, clone } from "../src/core.js";
import { baselineCatalog } from "../src/catalog.js";
const html = await readFile(new URL("../dist/NOVA.html", import.meta.url));
const server = createServer((_, r) => {
  r.writeHead(200, { "Content-Type": "text/html;charset=utf-8" });
  r.end(html);
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
      throw new DOMException("쓰기 실패", "NotAllowedError");
    return create.apply(this, args);
  };
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
await page.clock.setFixedTime(new Date("2026-10-27T03:00:00Z"));
let count = 0;
const ok = (label) => {
  count++;
  console.log("PASS", label);
};
const modal = () => page.locator(".modal-layer:visible .dialog"),
  apply = (label = "적용") =>
    modal().getByRole("button", { name: label, exact: true }).click(),
  cancel = () =>
    modal().getByRole("button", { name: "취소", exact: true }).click(),
  nav = (name) =>
    page
      .getByRole("navigation")
      .getByRole("button", { name, exact: true })
      .click(),
  level = (key) => page.locator(`.catalog-tabs [data-level="${key}"]`).click();
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
const write = (d) =>
  page.evaluate(async (d) => {
    const h = await (
        await navigator.storage.getDirectory()
      ).getFileHandle("nova-data.json", { create: true }),
      w = await h.createWritable();
    await w.write(JSON.stringify(d));
    await w.close();
  }, d);
const save = async () => {
  await page.locator("header [data-action=save]").click();
  await page.waitForFunction(
    () => document.querySelector("header .saved")?.textContent === "저장 완료",
  );
};
const scId = "cat-subcomponents-TMFC007-SC01",
  designer = (id) => page.locator(`[data-catalog-designer="${id}"]`).first(),
  dev = (id) => page.locator(`[data-catalog-developer="${id}"]`),
  phase = (id) => page.locator(`[data-catalog-phase="${id}"]`);
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const old = (
    await startup(
      { ...seed(), catalog: baselineCatalog() },
      { today: "2026-10-27" },
    )
  ).data;
  old.schemaVersion = 2;
  old.catalog.subcomponents.find((n) => n.id === scId).assigneeIds = [
    "person-1",
    "person-2",
  ];
  old.catalog.subcomponents[0].assigneeIds = ["tbd-1"];
  const before = clone(old),
    l3 = old.catalog.l3.filter((n) => n.parentId === scId),
    l4 = old.catalog.l4.filter((n) => l3.some((p) => p.id === n.parentId));
  await write(old);
  await page.getByRole("button", { name: "앱 폴더 연결", exact: true }).click();
  await page.getByRole("heading", { name: "연간 인력 현황" }).waitFor();
  await nav("Catalog 管理".replace("管理", "관리"));
  await page
    .getByRole("heading", { name: "설계·개발 담당자 방식으로 전환" })
    .waitFor();
  assert.deepEqual(await read(), before);
  await page.locator("[data-action=catalog-upgrade]").click();
  await cancel();
  assert.deepEqual(await read(), before);
  ok(
    "legacy catalog remains intact until explicitly converted, including cancellation",
  );
  await page.locator("[data-action=catalog-upgrade]").click();
  assert.equal(
    await modal().locator(`[name="legacy-${scId}"]`).inputValue(),
    "",
  );
  await apply("전환 적용");
  assert.equal(await modal().count(), 1);
  assert.deepEqual(await read(), before);
  await modal().locator(`[name="legacy-${scId}"]`).selectOption("person-1");
  await apply("전환 적용");
  await page.locator(".catalog-table").waitFor();
  assert.equal((await read()).catalog.version, 1);
  assert.equal(await phase(l4[0].id).inputValue(), "");
  assert.equal(await designer(l4[0].id).inputValue(), "person-1");
  assert.equal(await dev(l4[0].id).inputValue(), "");
  ok(
    "multiple owners require a choice; conversion defaults design only and remains session-only",
  );
  assert.match(
    await page.locator(".catalog-table").innerText(),
    /서비스 주문 컨텍스트 생성/,
  );
  assert(
    !(await page
      .locator(".catalog-table tbody")
      .innerText()
      .then((t) => t.includes("Service Order Context 생성"))),
  );
  await level("l2");
  assert.match(
    await page.locator(".catalog-table tbody").innerText(),
    /Service Order Management/,
  );
  assert(
    !(await page
      .locator(".catalog-table tbody")
      .innerText()
      .then((t) => t.includes("서비스 주문 관리"))),
  );
  await level("l4");
  ok("level-specific English L2 and Korean lower names preserve business IDs");
  await page.locator("[data-catalog-filter=subcomponents]").selectOption(scId);
  await page.locator("[data-catalog-filter=l3]").selectOption(l3[0].id);
  assert.equal(
    await page.locator("#catalog-context-sc").inputValue(),
    "person-1",
  );
  await designer(l3[0].id).selectOption("person-2");
  assert.equal(await designer(l4[0].id).inputValue(), "person-1");
  ok("L3 context overrides only its own designer, not descendant L4");
  await designer(l4[0].id).selectOption("tbd-1");
  await dev(l4[0].id).selectOption("tbd-2");
  await phase(l4[0].id).selectOption("2");
  await designer(l4[1].id).selectOption("person-2");
  await designer(l4[1].id).selectOption("person-1");
  assert.equal(await page.locator(".modal-layer").count(), 0);
  ok(
    "single L4 Phase/designer/developer edits accept TBD and do not open row detail",
  );
  await page.locator("#catalog-context-sc").selectOption("person-3");
  await page.locator("[data-action=catalog-context-designer]").click();
  await cancel();
  assert.equal(
    await page.locator("#catalog-context-sc").inputValue(),
    "person-1",
  );
  assert.equal(await designer(l4[1].id).inputValue(), "person-1");
  await page.locator("#catalog-context-sc").selectOption("person-3");
  await page.locator("[data-action=catalog-context-designer]").click();
  await apply("확인");
  assert.equal(await designer(l3[0].id).inputValue(), "person-2");
  assert.equal(await designer(l4[0].id).inputValue(), "tbd-1");
  assert.equal(await designer(l4[1].id).inputValue(), "person-3");
  assert.equal(await dev(l4[0].id).inputValue(), "tbd-2");
  ok(
    "SC A→B confirmation is cancellable; only current A designers change, independent of edit history",
  );
  await page.locator("#catalog-phase-filter").selectOption("2");
  assert.equal(await page.locator("[data-catalog-row]").count(), 1);
  await page.locator("#catalog-phase-filter").selectOption("3");
  assert.equal(await page.locator("[data-catalog-row]").count(), 0);
  await page.locator("#catalog-phase-filter").selectOption("all");
  assert.deepEqual(await read(), before);
  ok(
    "Phase filtering is read-only and phase remains independent of design/development",
  );
  await save();
  const saved = await read();
  assert.equal(saved.schemaVersion, 3);
  assert.equal(saved.catalog.version, 2);
  assert.deepEqual(
    saved.catalog.subcomponents.find((n) => n.id === scId).legacyAssigneeIds,
    ["person-1", "person-2"],
  );
  assert.deepEqual(saved.people, before.people);
  assert.deepEqual(saved.plans, before.plans);
  assert.equal(saved.catalog.l4.find((n) => n.id === l4[0].id).phase, 2);
  await page.reload();
  await page.getByRole("heading", { name: "연간 인력 현황" }).waitFor();
  await nav("Catalog 관리");
  assert.equal(await phase(l4[0].id).inputValue(), "2");
  assert.equal(await designer(l4[1].id).inputValue(), "person-3");
  ok(
    "migration and role/Phase changes save and reload without losing legacy data or touching personnel",
  );
  await page.locator("[data-catalog-filter=subcomponents]").selectOption(scId);
  await page.locator("[data-catalog-filter=l3]").selectOption(l3[0].id);
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/catalog-roles.png" });
  assert.equal(
    await page.locator("[data-action=catalog-chart-pending]").isDisabled(),
    true,
  );
  ok(
    "approved layout exposes SC/L3 contexts and leaves unconfirmed allocation chart disabled",
  );
  await level("subcomponents");
  await page
    .locator(`[data-catalog-row="${scId}"] [data-action=catalog-edit]`)
    .click();
  await modal().locator("[name=koreanName]").fill("취소할 명칭");
  await modal().locator("[name=designerId]").selectOption("tbd-3");
  await apply();
  await cancel();
  assert.equal(
    await modal().locator("[name=koreanName]").inputValue(),
    "취소할 명칭",
  );
  assert.deepEqual(await read(), saved);
  await cancel();
  await apply("버리기");
  await level("l4");
  assert.equal(await designer(l4[1].id).inputValue(), "person-3");
  ok(
    "SC metadata plus designer edits remain one draft; cancelled propagation changes neither",
  );

  await phase(l4[0].id).selectOption("3");
  await page.evaluate(() => localStorage.setItem("fail-write", "1"));
  await page.locator("header [data-action=save]").click();
  await page.getByRole("heading", { name: "저장하지 못했습니다" }).waitFor();
  assert.deepEqual(await read(), saved);
  await cancel();
  assert.equal(await phase(l4[0].id).inputValue(), "3");
  await page.evaluate(() => localStorage.removeItem("fail-write"));
  await save();
  ok(
    "failed role/Phase save preserves both old file and dirty session until retry",
  );
  await nav("인력 관리");
  await page.locator("[data-person=tbd-1]").click();
  await modal().locator("[data-action=convert]").click();
  await modal().locator("[name=name]").fill("확정 설계자");
  await modal().locator("[name=companyId]").selectOption("skax");
  await modal().locator("[name=start]").fill("20261001");
  await apply();
  await nav("Catalog 관리");
  assert.equal(await designer(l4[0].id).inputValue(), "tbd-1");
  assert.match(
    await designer(l4[0].id).locator("option:checked").innerText(),
    /확정 설계자/,
  );
  await save();
  ok(
    "TBD confirmation preserves designer identity and updates the visible name",
  );
  const due = await read();
  due.people.find((p) => p.id === "tbd-2").start = "2026-10-01";
  due.people.find((p) => p.id === "tbd-2").end = "2026-11-14";
  await write(due);
  await page.reload();
  await page.getByRole("heading", { name: "연간 인력 현황" }).waitFor();
  await nav("Catalog 관리");
  assert.equal(await dev(l4[0].id).inputValue(), "");
  assert.equal(await designer(l4[0].id).inputValue(), "tbd-1");
  assert(!(await read()).people.some((p) => p.id === "tbd-2"));
  ok(
    "startup deletion cleans only the removed TBD role and persists the cleanup atomically",
  );
  assert.deepEqual(errors, []);
  console.log(`${count} Catalog role browser scenarios passed.`);
} catch (e) {
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/catalog-roles-failure.png" });
  console.error(
    (await page.locator("body").innerText()).slice(0, 6000),
    errors,
  );
  throw e;
} finally {
  await context.close();
  await browser.close();
  await new Promise((r) => server.close(r));
}
