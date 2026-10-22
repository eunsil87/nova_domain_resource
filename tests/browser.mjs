import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { seed, startup, appoint, clone } from "../src/core.js";
const html = await readFile(new URL("../dist/NOVA.html", import.meta.url));
await mkdir(new URL("../test-results", import.meta.url), { recursive: true });
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
const errors = [],
  network = [];
let checks = 0;
const ok = (label) => {
  checks++;
  console.log("PASS", label);
};
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  locale: "ko-KR",
  timezoneId: "Asia/Seoul",
});
await context.addInitScript(() => {
  // Use a real, serializable native directory handle and native file streams.
  // Only the OS folder picker is substituted with the browser's sandboxed test directory.
  window.showDirectoryPicker = () => navigator.storage.getDirectory();
  const create = FileSystemFileHandle.prototype.createWritable;
  FileSystemFileHandle.prototype.createWritable = function (...args) {
    if (localStorage.getItem("fail-write"))
      throw new DOMException("테스트 쓰기 실패", "NotAllowedError");
    return create.apply(this, args);
  };
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (!r.url().startsWith("http://127.0.0.1:")) network.push(r.url());
});
page.on("dialog", (d) => d.accept());
await page.clock.setFixedTime(new Date("2026-10-22T03:00:00Z"));
const modal = () => page.locator(".modal-layer:visible .dialog");
const apply = async (label = "적용") =>
  modal().getByRole("button", { name: label, exact: true }).click();
const click = async (action, root = page) =>
  root.locator(`[data-action="${action}"]`).first().click();
const nav = async (name) =>
  page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
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
const write = (data) =>
  page.evaluate(async (data) => {
    const h = await (
      await navigator.storage.getDirectory()
    ).getFileHandle("nova-data.json", { create: true });
    const w = await h.createWritable();
    await w.write(typeof data === "string" ? data : JSON.stringify(data));
    await w.close();
  }, data);
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole("button", { name: "앱 폴더 연결", exact: true }).click();
  await apply("만들기");
  await page.getByRole("heading", { name: "연간 인력 현황" }).waitFor();
  let stored = await read();
  assert.equal(stored.people.length, 19);
  assert.equal(stored.saveVersion, 1);
  assert.equal(stored.chiefId, "person-1");
  assert.equal(
    await page.locator(".stat .number").nth(1).innerText(),
    "76.000",
  );
  ok("native stream create, initial totals, and startup");
  await page.screenshot({ path: "test-results/annual.png", fullPage: true });
  const phase = await page.locator(".phase").boundingBox();
  assert(phase.y + phase.height < 1080);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    1920,
  );
  ok("1920×1080 layout and topmost Phase table");
  await nav("인력 관리");
  assert.equal(await page.locator("[data-person]").count(), 19);
  for (const [index, p] of stored.people.entries()) {
    if (index > 2) break;
    await page.locator(`[data-person="${p.id}"]`).click();
    assert.equal(await modal().locator("[name=name]").inputValue(), p.name);
    await modal().getByRole("button", { name: "취소", exact: true }).click();
  }
  ok("record-specific personnel detail binding");
  await page.locator('[data-person="person-0"]').click();
  await modal().locator("[name=skt]").fill("000001");
  await modal().locator("[name=doss]").fill("005041");
  for (let i = 0; i < 4; i++)
    await modal()
      .locator(`[name=devdi${i}]`)
      .fill(["192", "168", "0", "10"][i]);
  await modal().locator("[name=memo]").fill("한글 메모\n두 번째 줄");
  await apply();
  assert.equal((await read()).people[0].extra.skt, null);
  assert.equal(
    await page.locator("header .saved").innerText(),
    "저장하지 않은 변경 사항",
  );
  await click("save");
  await page.waitForFunction(
    () => document.querySelector("header .saved")?.textContent === "저장 완료",
  );
  stored = await read();
  assert.equal(stored.people[0].extra.skt, "P000001");
  assert.equal(stored.people[0].extra.devdi, "192.168.0.10");
  assert.equal(stored.people[0].extra.memo, "한글 메모\n두 번째 줄");
  ok("popup apply vs manual save, leading zero IDs, IPv4 and multiline memo");
  await page.locator('[data-person="person-0"]').click();
  assert(await modal().locator("[name=companyId]").isDisabled());
  await modal().locator("[name=name]").fill("버릴 수정");
  await modal().getByRole("button", { name: "취소", exact: true }).click();
  await apply("버리기");
  await page.locator('[data-person="person-0"]').click();
  assert.equal(await modal().locator("[name=name]").inputValue(), "장은실");
  await modal().getByRole("button", { name: "취소", exact: true }).click();
  ok("company lock and popup draft discard");
  await click("add-person");
  await modal().locator('[name=name]').fill('작성 중인 초안');
  await modal().locator('[name=memo]').fill('업체 추가 후에도 유지');
  await click('add-company',modal());
  await modal().locator('[name=name]').fill('신규 협력사');
  await apply();
  assert.equal(await modal().locator('[name=name]').inputValue(),'작성 중인 초안');
  assert.equal(await modal().locator('[name=memo]').inputValue(),'업체 추가 후에도 유지');
  assert.match(await modal().locator('[name=companyId]').innerText(),/신규 협력사/);
  await modal().getByRole('button',{name:'취소',exact:true}).click();await apply('버리기');
  await nav('기본 설정');await page.locator('[data-tab=companies]').click();
  assert.match(await page.locator('main').innerText(),/신규 협력사/);await nav('인력 관리');
  ok('nested company addition preserves parent draft and independently applied master');
  await click("add-tbd");
  await modal().locator("[name=start]").fill("20261022");
  await apply();
  assert.match(await modal().locator(".error").innerText(), /내일/);
  await modal().locator("[name=start]").fill("20261101");
  await apply();
  assert.equal(await page.locator("[data-person]").count(), 20);
  assert.equal((await read()).people.length, 19);
  ok("TBD creation validates future start and remains unsaved");
  await nav("그룹 설정");
  assert.match(await page.locator("main").innerText(), /첫 그룹을 만들어/);
  await click("add-group");
  await modal().locator('[name=member][value="person-1"]').check();
  await modal().locator('[name=member][value="person-2"]').check();
  await modal().locator("[name=leaderId]").selectOption("person-1");
  await apply();
  assert.equal(await page.locator("[data-drop-group]").count(), 1);
  ok("initial empty plan and group create with selected leader");
  await click("plans");
  await click("copy-plan", modal());
  await modal().locator("[name=name]").fill("비교안");
  await apply();
  await page.waitForTimeout(150);
  await modal().getByRole("button", { name: "취소", exact: true }).click();
  assert.match(await page.locator(".toolbar").innerText(), /조회 비교안/);
  assert.equal(await page.locator(".tabs button.active").innerText(), "비교안");
  assert(
    !(await page
      .locator(".tabs button.active")
      .innerText()
      .then((x) => x.includes("적용 중"))),
  );
  ok("copy plan, common personnel unchanged, viewed/applied plan separated");
  await click("add-parent");
  await modal().locator("[name=name]").fill("주문 처리");
  await modal().locator("[name=group]").first().check();
  await modal().locator("[name=leaderId]").selectOption("person-2");
  await apply();
  assert.equal(await page.locator(".parent").count(), 1);
  ok("upper group and member-only upper leader");
  await click("compare");
  await modal().locator("[name=plan]").nth(0).check();
  await modal().locator("[name=plan]").nth(1).check();
  await apply("비교");
  await page
    .getByRole("heading", { name: "구성안 비교", exact: true })
    .waitFor();
  assert.equal(await page.locator(".compare-plan").count(), 2);
  await modal().getByRole("button", { name: "취소", exact: true }).click();
  ok("two-plan comparison shares whole personnel list");
  await click("apply-plan");
  await apply("확인");
  await nav("인력 관리");
  assert.match(await page.locator("main").innerText(), /그룹은 비교안 기준/);
  assert.match(
    await page.locator('[data-person="person-1"]').innerText(),
    /Group#1/,
  );
  ok("apply plan updates personnel group column");
  await nav("그룹 설정");
  await page
    .locator('[data-drag-person="person-3"]')
    .dragTo(page.locator("[data-drop-group]").first());
  await page
    .locator('[data-drop-group] [data-drag-person="person-3"]')
    .waitFor();
  await page
    .locator('[data-drop-group] [data-drag-person="person-3"]')
    .dragTo(page.locator("[data-drop-unassigned]"), {
      targetPosition: { x: 35, y: 20 },
    });
  await page
    .locator('[data-drop-unassigned] [data-drag-person="person-3"]')
    .waitFor();
  ok("drag unassigned to group and back");
  await nav("인력 관리");
  await page.locator('[data-person="tbd-1"]').click();
  await click("convert", modal());
  await modal().locator("[name=name]").fill("확정 전환 테스트");
  await modal().locator("[name=companyId]").selectOption("skax");
  await modal().locator("[name=start]").fill("20261001");
  await apply();
  assert.match(
    await page.locator('[data-person="tbd-1"]').innerText(),
    /확정 전환 테스트/,
  );
  ok("TBD conversion permits actual past start and retains ID");
  await nav("기본 설정");
  await page.locator("[data-tab=roles]").click();
  await click("add-master");
  await modal().locator("[name=name]").fill("분석가");
  await apply();
  assert.match(await page.locator("main").innerText(), /분석가/);
  await page.locator("[data-tab=companies]").click();
  await page.locator("[data-action=edit-master][data-id=daewon]").click();
  assert(await modal().locator("[name=type]").isDisabled());
  await modal().getByRole("button", { name: "취소", exact: true }).click();
  ok("master additions and referenced company type lock");
  await nav("연간 현황");
  await click("target");
  await modal().locator("[name=target]").fill("");
  await apply();
  assert.equal(
    await page.locator(".stat .number").first().innerText(),
    "미설정",
  );
  assert.equal(await page.locator(".target-line").count(), 0);
  await click("calculator");
  await click("calc-target", modal());
  await modal().locator("[name=target]").fill("0");
  await apply();
  assert.match(
    await modal().locator("[data-result]").innerText(),
    /확정 기준 0명/,
  );
  await modal().getByRole("button", { name: "취소", exact: true }).click();
  if (
    await page
      .getByRole("heading", { name: "변경 내용을 버리시겠습니까?" })
      .count()
  )
    await apply("버리기");
  ok("null/zero targets, nested goal setting, calculator refresh");
  await click("schedule");
  await modal().locator("[data-action=schedule-person]").first().click();
  assert(await modal().locator("[name=name]").count());
  await modal().getByRole("button", { name: "취소", exact: true }).click();
  assert.equal(
    await modal().locator("h2").innerText(),
    "다가오는 투입·철수 일정",
  );
  await modal().getByRole("button", { name: "취소", exact: true }).click();
  ok("schedule detail returns to upper popup");
  await page.evaluate(() => localStorage.setItem("fail-write", "1"));
  const beforeFailure = await read();
  await click("save");
  await page.getByRole("heading", { name: "저장하지 못했습니다" }).waitFor();
  assert.equal(
    await page.locator("header .saved").innerText(),
    "저장하지 않은 변경 사항",
  );
  assert.deepEqual(await read(), beforeFailure);
  await modal().getByRole("button", { name: "취소", exact: true }).click();
  await page.evaluate(() => localStorage.removeItem("fail-write"));
  await click("save");
  await page.waitForFunction(
    () => document.querySelector("header .saved")?.textContent === "저장 완료",
  );
  ok("native write failure preserves file and session, retry succeeds");
  const persisted = await read();
  await page.reload();
  await page.getByRole("heading", { name: "연간 인력 현황" }).waitFor();
  assert.deepEqual(await read(), persisted);
  await nav("인력 관리");
  assert.match(
    await page.locator('[data-person="tbd-1"]').innerText(),
    /확정 전환 테스트/,
  );
  ok(
    "native handle remembered in IndexedDB, reload restores without reseeding",
  );
  await page.screenshot({ path: "test-results/personnel.png", fullPage: true });
  await page.locator('[data-person="person-0"]').click();
  await page.screenshot({ path: "test-results/person-detail.png" });
  const ip = await modal().locator("[name=devdi3]").boundingBox(),
    memo = await modal().locator("[name=memo]").boundingBox();
  assert(ip.x + ip.width <= 1920);
  assert(memo.x + memo.width <= 1920);
  await modal().getByRole("button", { name: "취소", exact: true }).click();
  ok("detail includes full IPv4 and memo at target viewport");
  await page.locator('[data-person="person-0"]').click();
  await modal().locator("[name=memo]").fill("충돌 시 세션 유지");
  await apply();
  const other = await read();
  other.saveVersion++;
  await write(other);
  await click("save");
  await page.getByRole("heading", { name: "저장하지 못했습니다" }).waitFor();
  assert.match(await modal().innerText(), /다른 탭/);
  assert.deepEqual(await read(), other);
  await modal().getByRole("button", { name: "취소", exact: true }).click();
  ok("optimistic conflict protection blocks stale manual save");
  await page.reload();
  await page.getByRole("heading", { name: "연간 인력 현황" }).waitFor();
  const due = await read();
  due.people.find((p) => p.id === "tbd-2").start = "2026-10-01";
  await write(due);
  await page.evaluate(() => localStorage.setItem("fail-write", "1"));
  await page.reload();
  await page.getByRole("heading", { name: "시작하지 못했습니다" }).waitFor();
  assert.equal(await page.locator("main").count(), 0);
  await page.evaluate(() => localStorage.removeItem("fail-write"));
  await page.getByRole("button", { name: "재시도", exact: true }).click();
  await page.getByRole("heading", { name: "연간 인력 현황" }).waitFor();
  assert.equal(
    (await read()).people.find((p) => p.id === "tbd-2").start,
    "2026-11-01",
  );
  ok("startup automatic-save failure blocks editing, retry commits once");
  await write("{손상");
  await page.reload();
  await page.getByRole("heading", { name: "시작하지 못했습니다" }).waitFor();
  assert.match(await page.locator(".connection .error").innerText(), /데이터/);
  const raw = await page.evaluate(
    async () =>
      await (
        await (
          await navigator.storage.getDirectory()
        ).getFileHandle("nova-data.json")
      )
        .getFile()
        .then((f) => f.text()),
  );
  assert.equal(raw, "{손상");
  assert.equal(await page.locator("main").count(), 0);
  ok("corrupt data preserved, no silent initialization or edit entry");
  const choiceData=(await startup(seed(),{today:'2026-10-22'})).data;
  choiceData.people.push({...clone(choiceData.people[1]),id:'rep-fe',name:'다른 기술 대표',techId:'fe'});
  appoint(choiceData,'person-3','2026-10-22');appoint(choiceData,'rep-fe','2026-10-22');
  choiceData.people.find(p=>p.id==='person-1').end='2026-10-21';
  await write(choiceData);await page.reload();
  await page.getByRole('heading',{name:'현장대리인 인계 대상 선택'}).waitFor();
  assert.equal(await page.locator('main').count(),0);
  assert.equal(await modal().locator('[name=candidate]').count(),2);
  await modal().getByRole('button',{name:'취소',exact:true}).click();
  await page.getByRole('heading',{name:'시작하지 못했습니다'}).waitFor();
  assert.deepEqual(await read(),choiceData);
  await page.getByRole('button',{name:'재시도',exact:true}).click();
  await modal().locator('[name=candidate][value="rep-fe"]').check();await apply('선택');
  await page.getByRole('heading',{name:'연간 인력 현황'}).waitFor();
  const resolved=await read();assert.equal(resolved.saveVersion,choiceData.saveVersion+1);
  assert(!resolved.representativeIds.includes('person-1'));assert(resolved.representativeIds.includes('person-3'));assert(resolved.representativeIds.includes('rep-fe'));
  ok('startup multiple-heir choice is atomic and cancellation preserves original');
  const files=await page.evaluate(async()=>{const names=[];for await(const name of (await navigator.storage.getDirectory()).keys())names.push(name);return names;});
  assert.deepEqual(files,['nova-data.json']);ok('only the separate JSON data file is created; no backup or log');
  assert.deepEqual(errors, []);
  assert.deepEqual(network, []);
  ok("no uncaught JS errors and no external network requests");
  console.log(
    `${checks} browser scenarios passed (native OPFS streams; OS picker substituted).`,
  );
} catch (e) {
  await page.screenshot({ path: "test-results/failure.png", fullPage: true });
  console.error(
    "Browser state:",
    (await page.locator("body").innerText()).slice(-6500),
    errors,
  );
  throw e;
} finally {
  await context.close();
  await browser.close();
  await new Promise((r) => server.close(r));
}
