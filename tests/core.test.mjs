import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  clone,
  annualMM,
  totals,
  needed,
  startup,
  validateData,
  validatePerson,
  todayKST,
  status,
  appoint,
  reconcile,
  copyPlan,
  cleanGroups,
  sortedPeople,
  FOREVER,
  normalizeDate,
} from "../src/core.js";
const today = "2026-10-22";
const ready = async () => (await startup(seed(), { today })).data;
const p = (fields = {}) => ({
  ...seed().people[0],
  ...fields,
  extra: {
    skt: null,
    doss: null,
    devdi: null,
    mydesk: null,
    local: null,
    seat: null,
    memo: null,
    ...fields.extra,
  },
});
const planWith = (d, members, leader = members[0]) =>
  d.plans[0].groups.push({
    id: "g",
    name: "Group#1",
    members,
    leaderId: leader,
  });
test("initial data and annual totals match the agreed reference", () => {
  const d = seed();
  assert.equal(d.people.length, 19);
  assert.equal(d.people.filter((p) => p.kind === "confirmed").length, 14);
  assert.deepEqual(totals(d, 2026), {
    confirmed: 76000,
    tbd: 10000,
    types: { 정직원: 8000, BP: 68000, AGS: 0 },
  });
  assert.equal(d.targets[2026], 65000);
  assert.equal(d.plans[0].groups.length, 0);
  assert.equal(validateData(d), d);
});
test("monthly fractions, leap year, inclusive dates and year clipping", () => {
  for (const [start, end, year, value] of [
    ["2026-04-01", "2026-04-30", 2026, 1000],
    ["2026-04-16", "2026-04-30", 2026, 500],
    ["2026-03-16", "2026-03-31", 2026, 516],
    ["2026-10-01", FOREVER, 2026, 3000],
    ["2024-02-15", "2024-02-29", 2024, 517],
    ["2025-12-16", "2026-01-15", 2026, 484],
    ["2027-01-01", FOREVER, 2026, 0],
  ])
    assert.equal(annualMM({ start, end }, year), value);
});
test("round once per person after summing raw month fractions", () => {
  assert.equal(
    annualMM({ start: "2026-01-02", end: "2026-03-01" }, 2026),
    2000,
  );
  const d = seed();
  d.people = [
    p({ id: "a", start: "2026-03-16", end: "2026-03-31" }),
    p({ id: "b", start: "2026-03-16", end: "2026-03-31" }),
  ];
  assert.equal(totals(d, 2026).confirmed, 1032);
});
test("null target, zero target, zero shortage and exact ceiling are distinct", () => {
  const d = seed();
  assert.throws(() => needed(d, 2027, "2028-01-01", FOREVER), /목표/);
  d.targets[2027] = 0;
  assert.deepEqual(needed(d, 2027, "2028-01-01", FOREVER), {
    contribution: 0,
    confirmed: 0,
    planned: 0,
  });
  d.people = [];
  d.targets[2026] = 1001;
  assert.equal(needed(d, 2026, "2026-11-01", "2026-11-30").planned, 2);
  assert.equal(needed(d, 2026, "2027-01-01", FOREVER).planned, null);
});
test("KST date switches at UTC 15:00", () => {
  assert.equal(todayKST(new Date("2026-10-21T15:00:00Z")), today);
  assert.equal(todayKST(new Date("2026-10-21T14:59:59Z")), "2026-10-21");
});
test("TBD rollover boundaries, only due TBDs are shortened/deleted", async () => {
  for (const [t, expected] of [
    ["2026-10-01", "2026-10-15"],
    ["2026-10-14", "2026-10-15"],
    ["2026-10-15", "2026-11-01"],
    ["2026-12-31", "2027-01-01"],
  ]) {
    const d = seed();
    d.people = d.people.filter((p) => p.kind === "tbd");
    d.representativeIds = [];
    d.chiefId = null;
    d.people[0].start = t;
    const out = await startup(d, { today: t });
    assert.equal(
      out.data.people.find((p) => p.id === "tbd-1")?.start,
      expected,
    );
  }
  const d = seed();
  d.people.find((p) => p.id === "tbd-1").start = "2026-10-01";
  d.people.find((p) => p.id === "tbd-1").end = "2026-11-14";
  d.people.find((p) => p.id === "tbd-2").start = "2026-10-01";
  d.people.find((p) => p.id === "tbd-2").end = "2026-11-15";
  d.people.find((p) => p.id === "tbd-3").end = "2026-11-14";
  const out = await startup(d, { today });
  assert(!out.data.people.some((p) => p.id === "tbd-1"));
  assert(out.data.people.some((p) => p.id === "tbd-2"));
  assert(out.data.people.some((p) => p.id === "tbd-3"));
  assert.equal(d.people.length, 19);
});
test("startup is repeatable and removes ended group and common positions", async () => {
  const d = await ready();
  d.people.find((p) => p.id === "person-1").end = "2026-10-21";
  planWith(d, ["person-1", "tbd-1"], "person-1");
  d.plans[0].parents.push({
    id: "parent",
    name: "상위",
    groupIds: ["g"],
    leaderId: "person-1",
  });
  const out = await startup(d, { today });
  assert.equal(out.data.chiefId, null);
  assert.deepEqual(out.data.plans[0].groups[0].members, ["tbd-1"]);
  assert.equal(out.data.plans[0].groups[0].leaderId, null);
  assert.equal(out.data.plans[0].parents[0].leaderId, null);
  assert(out.data.people.some((p) => p.id === "person-1"));
  assert.equal((await startup(out.data, { today })).changed, false);
});
test("TBD conversion preserves ID and all plans, removes ended memberships", async () => {
  const d = await ready();
  planWith(d, ["tbd-1"]);
  d.plans.push(copyPlan(d.plans[0], "2안"));
  const next = clone(d),
    t = next.people.find((p) => p.id === "tbd-1");
  Object.assign(t, {
    kind: "confirmed",
    name: "전환",
    companyId: "skax",
    start: "2026-10-01",
  });
  validatePerson(
    next,
    t,
    d.people.find((p) => p.id === t.id),
    "convert",
    today,
  );
  await reconcile(next, d, { today });
  assert.equal(next.people.length, 19);
  for (const plan of next.plans) {
    assert(plan.groups[0].members.includes(t.id));
    assert.equal(plan.groups[0].leaderId, t.id);
  }
  t.end = "2026-10-20";
  cleanGroups(next, today);
  assert(next.plans.every((p) => !p.groups.length));
});
test("prospective/TBD future restriction, actual registration, duplicate names and 15 days", () => {
  const d = seed();
  assert.throws(
    () => validatePerson(d, p({ start: today }), null, "planned", today),
    /내일/,
  );
  assert.doesNotThrow(() =>
    validatePerson(
      d,
      p({ start: "2026-10-01", end: "2026-10-03" }),
      null,
      "actual",
      today,
    ),
  );
  assert.throws(
    () =>
      validatePerson(
        d,
        p({ start: "2026-11-01", end: "2026-11-14" }),
        null,
        "planned",
        today,
      ),
    /15일/,
  );
  assert.doesNotThrow(() =>
    validatePerson(
      d,
      p({ start: "2026-11-01", end: "2026-11-15" }),
      null,
      "planned",
      today,
    ),
  );
  assert.throws(
    () =>
      validatePerson(
        d,
        p({ kind: "tbd", name: "TBD#1", start: "2026-11-01" }),
        null,
        "planned",
        today,
      ),
    /표시명/,
  );
  assert.throws(
    () =>
      validatePerson(
        d,
        p({ kind: "tbd", name: "TBD#6", start: today }),
        null,
        "actual",
        today,
      ),
    /내일/,
  );
});
test("company and type locks cannot be bypassed by correcting start date", async () => {
  const d = await ready(),
    old = d.people[1],
    next = { ...clone(old), companyId: "d2l", start: "2027-01-01" };
  assert.throws(() => validatePerson(d, next, old, "actual", today), /업체/);
  const future = d.people.find((p) => p.name === "박훈");
  assert.throws(
    () =>
      validatePerson(
        d,
        { ...clone(future), companyId: "skax" },
        future,
        "actual",
        today,
      ),
    /타입/,
  );
  assert.doesNotThrow(() =>
    validatePerson(
      d,
      { ...clone(future), companyId: "d2l" },
      future,
      "actual",
      today,
    ),
  );
});
test("ID and IPv4 formats, leading zero and optional fields", () => {
  const d = seed(),
    value = p({
      start: "2026-11-01",
      extra: { skt: "P000001", doss: "DS005041", devdi: "0.255.1.10" },
    });
  assert.doesNotThrow(() => validatePerson(d, value, null, "planned", today));
  assert.throws(
    () =>
      validatePerson(
        d,
        { ...value, extra: { ...value.extra, devdi: "0.256.1.10" } },
        null,
        "planned",
        today,
      ),
    /IPv4/,
  );
  assert.throws(
    () =>
      validatePerson(
        d,
        { ...value, extra: { ...value.extra, skt: "P00001" } },
        null,
        "planned",
        today,
      ),
    /6자리/,
  );
  assert.throws(() => normalizeDate("20260230"));
  assert.equal(normalizeDate("20261101"), "2026-11-01");
});
test("plan copy remaps group IDs without cloning personnel/common positions", () => {
  const d = seed();
  planWith(d, ["person-1", "person-2"]);
  d.plans[0].parents.push({
    id: "par",
    name: "상위",
    groupIds: ["g"],
    leaderId: "person-1",
  });
  const copy = copyPlan(d.plans[0], "2안");
  assert.notEqual(copy.groups[0].id, "g");
  assert.equal(copy.parents[0].groupIds[0], copy.groups[0].id);
  assert.deepEqual(copy.groups[0].members, ["person-1", "person-2"]);
  assert.equal(d.people.length, 19);
});
test("empty groups and parents removed, empty plan retained", () => {
  const d = seed();
  planWith(d, ["person-1"]);
  d.plans[0].parents.push({
    id: "par",
    name: "상위",
    groupIds: ["g"],
    leaderId: "person-1",
  });
  d.people = d.people.filter((p) => p.id !== "person-1");
  cleanGroups(d, today);
  assert.equal(d.plans.length, 1);
  assert.equal(d.plans[0].groups.length, 0);
  assert.equal(d.plans[0].parents.length, 0);
});
test("representatives allow F/S, B/E and F/E independently and preserve others", () => {
  const d = seed();
  for (const [i, techId] of ["fs", "be", "fe"].entries()) {
    d.people.push(
      p({ id: "r" + i, companyId: "daewon", roleId: "designer", techId }),
    );
    appoint(d, "r" + i, today);
  }
  const reps = d.representativeIds
    .map((id) => d.people.find((p) => p.id === id))
    .filter((p) => p.companyId === "daewon");
  assert.equal(reps.length, 3);
  assert(d.representativeIds.includes("person-11"));
  assert.throws(() => appoint(d, "tbd-1", today), /업체/);
});
test("withdrawal blocked until representative changed, with last-current exception", async () => {
  const d = await ready(),
    next = clone(d);
  next.people[1].end = "2026-11-30";
  await assert.rejects(
    reconcile(next, d, { today, withdrawIds: ["person-1"] }),
    /현장대리인 변경 선 처리 후 철수 가능/,
  );
  const last = await ready();
  last.people = last.people.filter(
    (p) =>
      p.companyId !== "daewon" || p.id === "person-1" || p.id === "person-12",
  );
  const copy = clone(last);
  copy.people.find((p) => p.id === "person-1").end = "2026-11-30";
  await reconcile(copy, last, { today, withdrawIds: ["person-1"] });
  assert(!copy.representativeIds.includes("person-1"));
});
test("existing representatives take priority, multiple heirs require a cancellable choice", async () => {
  const d = await ready();
  appoint(d, "person-3", today);
  const next = clone(d);
  next.people[1].end = "2026-11-30";
  await reconcile(next, d, { today, withdrawIds: ["person-1"] });
  assert(!next.representativeIds.includes("person-1"));
  assert(next.representativeIds.includes("person-3"));
  d.people.push(
    p({
      id: "r-fe",
      companyId: "daewon",
      roleId: "designer",
      techId: "fe",
      start: "2026-01-01",
    }),
  );
  appoint(d, "r-fe", today);
  const before = JSON.stringify(d),
    change = clone(d);
  change.people = change.people.filter((p) => p.id !== "person-1");
  await assert.rejects(
    reconcile(change, d, { today, choose: async () => null }),
    /취소/,
  );
  assert.equal(JSON.stringify(d), before);
  const selected = clone(d);
  selected.people = selected.people.filter((p) => p.id !== "person-1");
  let calls = 0;
  const notices = await reconcile(selected, d, {
    today,
    choose: async (_, candidates) => {
      calls++;
      assert.equal(candidates.length, 2);
      return "r-fe";
    },
  });
  assert.equal(calls, 1);
  assert(selected.representativeIds.includes("person-3"));
  assert(selected.representativeIds.includes("r-fe"));
  assert(notices.some((x) => x.includes("r-fe") || x.includes("장은실")));
});
test("manual deletion succeeds current -> planned -> start -> registration successor order", async () => {
  const d = await ready(),
    next = clone(d);
  next.people = next.people.filter((p) => p.id !== "person-1");
  const notices = await reconcile(next, d, { today });
  assert(next.representativeIds.includes("person-2"));
  assert(notices.includes("대원씨앤씨의 현장대리인이 이건욱으로 변경 됨"));
});
test("default order places Focal first, header sort takes precedence, null last both ways", () => {
  const d = seed(),
    list = sortedPeople(d, d.people);
  assert.equal(list[0].name, "장은실");
  assert.equal(list[1].name, "송용주");
  assert.equal(sortedPeople(d, d.people, "name")[0].name, "강성구");
  for (const desc of [true, false]) {
    const list = sortedPeople(d, d.people, "company", desc);
    assert(list.slice(-5).every((p) => p.companyId === null));
  }
  assert.equal(sortedPeople(d, d.people, "start")[0].start, "2026-01-01");
});
test("schema and structure errors fail closed without mutation", () => {
  const d = seed();
  for (const mutate of [
    (d) => (d.schemaVersion = 2),
    (d) => (d.saveVersion = -1),
    (d) => (d.plans = []),
    (d) => d.people.push(clone(d.people[0])),
    (d) => (d.people[0].companyId = "missing"),
    (d) => d.representativeIds.push("missing"),
  ]) {
    const x = clone(d);
    mutate(x);
    assert.throws(() => validateData(x));
  }
  assert.equal(d.people.length, 19);
});
test("last current representative released before planned exit is not silently reappointed on restart", async () => {
  const d = await ready();
  d.people = d.people.filter(
    (p) =>
      p.companyId !== "daewon" || p.id === "person-1" || p.id === "person-12",
  );
  const next = clone(d);
  next.people.find((p) => p.id === "person-1").end = "2026-11-30";
  await reconcile(next, d, { today, withdrawIds: ["person-1"] });
  assert(!next.representativeIds.includes("person-1"));
  const restarted = await startup(next, { today });
  assert(!restarted.data.representativeIds.includes("person-1"));
  appoint(restarted.data, "person-1", today);
  assert(restarted.data.representativeIds.includes("person-1"));
});
test("empty existing data never regenerates seed records", async () => {
  const d = seed();
  d.people = [];
  d.representativeIds = [];
  d.chiefId = null;
  const out = await startup(d, { today });
  assert.equal(out.data.people.length, 0);
  assert.equal(out.changed, false);
});
test("TBD mass removal excludes all deleted representatives from heir candidates", async () => {
  const d = await ready();
  const ids = ["tbd-1", "tbd-2"];
  for (const [i, id] of ids.entries()) {
    const p = d.people.find((p) => p.id === id);
    Object.assign(p, {
      companyId: "daewon",
      roleId: "designer",
      techId: i ? "fe" : "fs",
      start: "2026-10-01",
      end: "2026-11-14",
    });
    appoint(d, id, today);
  }
  const out = await startup(d, {
    today,
    choose: async (_, candidates) => {
      assert(candidates.every((p) => !ids.includes(p.id)));
      return candidates[0].id;
    },
  });
  assert(ids.every((id) => !out.data.people.some((p) => p.id === id)));
  assert(!out.data.representativeIds.some((id) => ids.includes(id)));
});
