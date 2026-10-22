import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { seed, startup, clone, copyPlan } from "../src/core.js";
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
});
const page = await context.newPage(),
  errors = [],
  network = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (!r.url().startsWith("http://127.0.0.1:")) network.push(r.url());
});
page.on("dialog", (d) => d.accept());
await page.clock.setFixedTime(new Date("2026-10-22T03:00:00Z"));
let count = 0;
const ok = (text) => {
  count++;
  console.log("PASS", text);
};
const modal = () => page.locator(".modal-layer:visible .dialog");
const nav = async (name) =>
  page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
const group = (id) => page.locator(`[data-drop-group="${id}"]`),
  parent = (id) => page.locator(`[data-drop-parent="${id}"]`);
const rootIds = () =>
  page
    .locator(".root-layout > [draggable]")
    .evaluateAll((els) =>
      els.map((el) => el.dataset.dropGroup || el.dataset.dropParent),
    );
const childIds = (id) =>
  parent(id)
    .locator("[data-drop-group]")
    .evaluateAll((els) => els.map((el) => el.dataset.dropGroup));
const save = async () => {
  await page.locator("header [data-action=save]").click();
  await page.waitForFunction(
    () => document.querySelector("header .saved")?.textContent === "저장 완료",
  );
};
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
const wait = async (condition) => {
  for (let i = 0; i < 50; i++) {
    if (await condition()) return;
    await page.waitForTimeout(20);
  }
  throw Error("Expected drag change did not occur.");
};
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const fixture = (await startup(seed(), { today: "2026-10-22" })).data;
  fixture.plans[0].groups = ["a", "b", "c", "d"].map((id, i) => ({
    id,
    name: "그룹 " + id,
    members: ["person-" + i],
    leaderId: "person-" + i,
  }));
  fixture.plans.push(copyPlan(fixture.plans[0], "2안"));
  await page.evaluate(async (data) => {
    const dir = await navigator.storage.getDirectory(),
      handle = await dir.getFileHandle("nova-data.json", { create: true }),
      w = await handle.createWritable();
    await w.write(JSON.stringify(data));
    await w.close();
  }, fixture);
  await page.getByRole("button", { name: "앱 폴더 연결", exact: true }).click();
  await page.getByRole("heading", { name: "연간 인력 현황" }).waitFor();
  await nav("그룹 설정");
  assert.deepEqual(await rootIds(), ["a", "b", "c", "d"]);
  await group("a").locator(".group-title").dragTo(group("b"));
  await page
    .getByRole("heading", { name: "상위 그룹 만들기", exact: true })
    .waitFor();
  assert.deepEqual(
    await modal()
      .locator("[name=group]:checked")
      .evaluateAll((els) => els.map((el) => el.value)),
    ["a", "b"],
  );
  assert.equal(await read().then((x) => x.plans[0].parents.length), 0);
  await modal().getByRole("button", { name: "취소", exact: true }).click();
  assert.deepEqual(await rootIds(), ["a", "b", "c", "d"]);
  assert.equal(await page.locator("header .saved").innerText(), "저장 완료");
  ok(
    "center drop opens preselected bundle draft; cancel changes neither session nor JSON",
  );
  await group("a").locator(".group-title").dragTo(group("b"));
  await modal().locator("[name=name]").fill("설계 그룹");
  await modal().getByRole("button", { name: "적용", exact: true }).click();
  await wait(async () => (await page.locator(".parent").count()) === 1);
  const first = await page.locator(".parent").getAttribute("data-drop-parent");
  assert.deepEqual(await childIds(first), ["b", "a"]);
  assert.deepEqual(await rootIds(), [first, "c", "d"]);
  assert.equal((await read()).plans[0].parents.length, 0);
  ok(
    "center drop bundles existing groups without duplicating personnel and remains manually saved",
  );
  await group("c")
    .locator(".group-title")
    .dragTo(parent(first).locator(".parent-title"), {
      targetPosition: { x: 160, y: 24 },
    });
  await wait(async () => (await childIds(first)).includes("c"));
  assert.deepEqual(await childIds(first), ["b", "a", "c"]);
  ok("drop group on upper-group header joins it without nesting upper groups");
  const cWidth = await group("c").evaluate((el) => el.clientWidth);
  await group("b")
    .locator(".group-title")
    .dragTo(group("c"), { targetPosition: { x: cWidth - 3, y: 45 } });
  await wait(
    async () =>
      JSON.stringify(await childIds(first)) === JSON.stringify(["a", "c", "b"]),
  );
  ok("child groups reorder after another card via edge drop");
  await parent(first).locator("[data-action=edit-parent]").click();
  await modal().locator("[name=name]").fill("설계 그룹 이름 변경");
  await modal().getByRole("button", { name: "적용", exact: true }).click();
  assert.deepEqual(await childIds(first), ["a", "c", "b"]);
  ok("renaming an upper group preserves its dragged child order");
  await group("a")
    .locator(".group-title")
    .dragTo(page.locator(".ungroup-drop"), {
      targetPosition: { x: 80, y: 22 },
    });
  await wait(async () => (await rootIds()).includes("a"));
  assert.deepEqual(await rootIds(), [first, "d", "a"]);
  assert.deepEqual(await childIds(first), ["c", "b"]);
  ok("dedicated unbundle zone preserves the original personnel group");
  await group("a")
    .locator(".group-title")
    .dragTo(group("d"), { targetPosition: { x: 3, y: 45 } });
  await wait(
    async () =>
      JSON.stringify(await rootIds()) === JSON.stringify([first, "a", "d"]),
  );
  assert.equal(await page.locator(".parent").count(), 1);
  ok("left-edge drop reorders standalone groups instead of bundling them");
  await group("a").locator(".group-title").dragTo(group("d"));
  await modal().locator("[name=name]").fill("개발 그룹");
  await modal().getByRole("button", { name: "적용", exact: true }).click();
  await wait(async () => (await page.locator(".parent").count()) === 2);
  const second = (
    await page
      .locator(".parent")
      .evaluateAll((els) => els.map((el) => el.dataset.dropParent))
  ).find((id) => id !== first);
  await parent(first)
    .locator(".parent-title")
    .dragTo(parent(second), {
      targetPosition: {
        x: 140,
        y: (await parent(second).evaluate((el) => el.clientHeight)) - 5,
      },
    });
  await wait(
    async () =>
      JSON.stringify(await rootIds()) === JSON.stringify([second, first]),
  );
  ok("upper groups reorder in either direction");
  const original = clone(fixture.plans[1]);
  await save();
  const stored = await read();
  assert.equal(stored.people.length, 19);
  assert.deepEqual(stored.plans[1], original);
  assert.deepEqual(stored.plans[0].rootOrder, [second, first]);
  await page.reload();
  await page.getByRole("heading", { name: "연간 인력 현황" }).waitFor();
  await nav("그룹 설정");
  assert.deepEqual(await rootIds(), [second, first]);
  assert.deepEqual(await childIds(first), ["c", "b"]);
  ok("saved root and child order survive reload; other plan remains untouched");
  await page.locator(".ungroup-drop").scrollIntoViewIfNeeded();
  await group("c")
    .locator(".group-title")
    .dragTo(page.locator(".ungroup-drop"), {
      targetPosition: { x: 80, y: 22 },
    });
  await wait(async () => (await rootIds()).includes("c"));
  await group("c").scrollIntoViewIfNeeded();
  const cHeight = await group("c").evaluate((el) => el.clientHeight);
  await parent(second)
    .locator(".parent-title")
    .dragTo(group("c"), { targetPosition: { x: 80, y: cHeight - 4 } });
  await wait(
    async () =>
      JSON.stringify(await rootIds()) === JSON.stringify([first, "c", second]),
  );
  ok("upper and standalone groups can be interleaved with drag");
  await group("c")
    .locator(".group-title")
    .dragTo(parent(first).locator(".parent-title"), {
      targetPosition: { x: 160, y: 24 },
    });
  await wait(
    async () =>
      JSON.stringify(await childIds(first)) === JSON.stringify(["b", "c"]),
  );
  await group("c").locator(".group-title").dragTo(group("a"));
  await wait(async () => (await childIds(second)).includes("c"));
  assert.deepEqual(await childIds(first), ["b"]);
  assert.deepEqual(await childIds(second), ["d", "a", "c"]);
  ok("center drop on a grouped card moves the group into its existing parent");
  await page.locator(".ungroup-drop").scrollIntoViewIfNeeded();
  await group("b")
    .locator(".group-title")
    .dragTo(page.locator(".ungroup-drop"), {
      targetPosition: { x: 80, y: 22 },
    });
  await wait(async () => (await parent(first).count()) === 0);
  assert.equal(await group("b").count(), 1);
  assert.deepEqual(await rootIds(), [second, "b"]);
  await save();
  await page.reload();
  await page.getByRole("heading", { name: "연간 인력 현황" }).waitFor();
  await nav("그룹 설정");
  assert.deepEqual(await rootIds(), [second, "b"]);
  assert.deepEqual(await childIds(second), ["d", "a", "c"]);
  ok(
    "moving last child removes its empty parent, preserves group, and survives save/reload",
  );
  // Verify visible intent feedback during a real native drag, and Escape cancellation.
  const source = await group("b").locator(".group-title").boundingBox(),
    target = await group("a").boundingBox();
  await page.mouse.move(source.x + 35, source.y + 10);
  await page.mouse.down();
  await page.mouse.move(source.x + 45, source.y + 15, { steps: 4 });
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 8 },
  );
  await page.mouse.move(
    target.x + target.width / 2 + 1,
    target.y + target.height / 2 + 1,
  );
  await wait(
    async () =>
      (await group("a").getAttribute("data-drop-intent")) === "inside",
  );
  assert.match(
    await page.locator("#drag-feedback").innerText(),
    /상위 그룹에 넣기/,
  );
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal(await page.locator("[data-drop-intent]").count(), 0);
  assert.equal(await page.locator("header .saved").innerText(), "저장 완료");
  ok(
    "valid drop target and intent are visible; cancelled drag leaves state clean",
  );
  await mkdir("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/groups-drag.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(network, []);
  console.log(`${count} group drag browser scenarios passed.`);
} catch (e) {
  await page.screenshot({
    path: "test-results/groups-drag-failure.png",
    fullPage: true,
  });
  console.error((await page.locator("body").innerText()).slice(-5000), errors);
  throw e;
} finally {
  await context.close();
  await browser.close();
  await new Promise((r) => server.close(r));
}
