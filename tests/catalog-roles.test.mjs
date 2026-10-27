import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  clone,
  startup,
  reconcile,
  validateData,
  totals,
} from "../src/core.js";
import {
  baselineCatalog,
  emptyCatalog,
  upgradeCatalog,
  catalogDisplayName,
  catalogPath,
  catalogRows,
  upsertCatalogNode,
  setCatalogDesigner,
  setCatalogDeveloper,
  setCatalogPhase,
  deleteCatalogNode,
  validateCatalog,
} from "../src/catalog.js";
const day = "2026-10-27",
  scId = "cat-subcomponents-TMFC007-SC01";
const ready = () => ({ ...seed(), catalog: upgradeCatalog(baselineCatalog()) });
const children = (d) => {
  const l3 = d.catalog.l3.filter((n) => n.parentId === scId);
  return {
    l3,
    l4: d.catalog.l4.filter((n) => l3.some((p) => p.id === n.parentId)),
  };
};
test("legacy conversion never guesses multiple owners, preserves source and all previous IDs", () => {
  const c = baselineCatalog(),
    sc = c.subcomponents.find((n) => n.id === scId);
  sc.assigneeIds = ["person-1", "person-2"];
  const before = clone(c);
  assert.throws(() => upgradeCatalog(c), /선택/);
  assert.deepEqual(c, before);
  const next = upgradeCatalog(c, { [scId]: "person-2" });
  assert.deepEqual(
    next.subcomponents.find((n) => n.id === scId).legacyAssigneeIds,
    ["person-1", "person-2"],
  );
  assert.equal(
    next.subcomponents.find((n) => n.id === scId).designerId,
    "person-2",
  );
  assert.equal(next.version, 2);
  assert.deepEqual(
    next.l4.map((n) => n.id),
    c.l4.map((n) => n.id),
  );
  assert(next.l4.every((n) => n.phase === null && n.developerId === null));
  validateCatalog(next, seed().people);
});
test("empty and single-owner conversion is deterministic; migration is idempotent", () => {
  const c = baselineCatalog();
  c.subcomponents[0].assigneeIds = ["tbd-1"];
  const out = upgradeCatalog(c);
  assert.equal(out.subcomponents[0].designerId, "tbd-1");
  assert.deepEqual(upgradeCatalog(out), out);
  assert.equal(upgradeCatalog(emptyCatalog()).version, 2);
});
test("SC A to B changes exactly current A values independently across L3 and L4, not previous editing provenance", () => {
  const d = ready();
  setCatalogDesigner(d, "subcomponents", scId, "person-1", day);
  const { l3, l4 } = children(d);
  assert([...l3, ...l4].every((n) => n.designerId === "person-1"));
  setCatalogDesigner(d, "l3", l3[0].id, "person-2", day);
  setCatalogDesigner(d, "l4", l4[1].id, "tbd-1", day);
  setCatalogDesigner(d, "l4", l4[2].id, "person-2", day);
  setCatalogDesigner(d, "l4", l4[2].id, "person-1", day);
  setCatalogDesigner(d, "subcomponents", scId, "person-3", day);
  assert.equal(l3[0].designerId, "person-2");
  assert.equal(l4[0].designerId, "person-3");
  assert.equal(l4[1].designerId, "tbd-1");
  assert.equal(l4[2].designerId, "person-3");
  assert(
    d.catalog.l4
      .filter((n) => !l4.includes(n))
      .every((n) => n.designerId === null),
  );
  validateData(d);
});
test("SC unassignment and initial assignment follow exact value equality including null", () => {
  const d = ready(),
    { l3, l4 } = children(d);
  setCatalogDesigner(d, "l4", l4[0].id, "tbd-1", day);
  setCatalogDesigner(d, "subcomponents", scId, "person-1", day);
  assert.equal(l4[0].designerId, "tbd-1");
  assert.equal(l3[0].designerId, "person-1");
  setCatalogDesigner(d, "subcomponents", scId, null, day);
  assert.equal(l4[0].designerId, "tbd-1");
  assert.equal(l3[0].designerId, null);
});
test("L3 direct overrides never cascade; new L4 derives SC designer; moving existing nodes keeps assignments", () => {
  const d = ready();
  setCatalogDesigner(d, "subcomponents", scId, "person-1", day);
  const { l3, l4 } = children(d);
  setCatalogDesigner(d, "l3", l3[0].id, "person-2", day);
  assert.equal(l4[0].designerId, "person-1");
  const n = upsertCatalogNode(d.catalog, "l4", {
    code: "NEW",
    name: "",
    koreanName: "신규",
    parentId: l3[0].id,
    description: null,
    required: true,
  });
  assert.equal(n.designerId, "person-1");
  assert.equal(n.name, "신규");
  const otherSC = d.catalog.subcomponents.find((n) => n.id !== scId);
  upsertCatalogNode(
    d.catalog,
    "l3",
    { ...l3[0], parentId: otherSC.id },
    l3[0].id,
  );
  assert.equal(
    d.catalog.l3.find((n) => n.id === l3[0].id).designerId,
    "person-2",
  );
  assert.equal(
    d.catalog.l4.find((n) => n.id === l4[0].id).designerId,
    "person-1",
  );
  validateData(d);
});
test("each role and Phase is one value; same person/TBD may design and develop; phases are optional 1-3", () => {
  const d = ready(),
    id = children(d).l4[0].id;
  setCatalogDesigner(d, "l4", id, "tbd-1", day);
  setCatalogDeveloper(d, id, "tbd-1", day);
  setCatalogPhase(d.catalog, id, 2);
  assert.equal(catalogRows(d.catalog, "l4", {}, "", "all", "2").length, 1);
  assert.equal(
    catalogRows(d.catalog, "l4", {}, "", "all", "unassigned").length,
    105,
  );
  for (const value of [0, 4, "1", [1, 2]])
    assert.throws(() => setCatalogPhase(d.catalog, id, value));
  setCatalogPhase(d.catalog, id, null);
  assert.equal(d.catalog.l4.find((n) => n.id === id).developerId, "tbd-1");
  assert.throws(() => deleteCatalogNode(d.catalog, "l4", id), /담당자/);
});
test("TBD confirmation preserves both roles; deletion and startup TBD removal clean roles and archived links only for removed people", async () => {
  const d = (await startup(ready(), { today: day })).data,
    id = children(d).l4[0].id;
  setCatalogDesigner(d, "l4", id, "tbd-1", day);
  setCatalogDeveloper(d, id, "tbd-1", day);
  const confirmed = clone(d),
    p = confirmed.people.find((p) => p.id === "tbd-1");
  Object.assign(p, {
    kind: "confirmed",
    name: "확정 담당자",
    companyId: "skax",
    start: "2026-10-01",
  });
  await reconcile(confirmed, d, { today: day });
  assert.equal(
    confirmed.catalog.l4.find((n) => n.id === id).designerId,
    "tbd-1",
  );
  const removed = clone(confirmed);
  removed.people = removed.people.filter((p) => p.id !== "tbd-1");
  await reconcile(removed, confirmed, { today: day });
  assert.equal(removed.catalog.l4.find((n) => n.id === id).designerId, null);
  assert.equal(removed.catalog.l4.find((n) => n.id === id).developerId, null);
  d.people.find((p) => p.id === "tbd-1").start = "2026-10-01";
  d.people.find((p) => p.id === "tbd-1").end = "2026-11-14";
  assert.equal(
    (await startup(d, { today: day })).data.catalog.l4.find((n) => n.id === id)
      .developerId,
    null,
  );
});
test("ended assignments remain visible but cannot be newly chosen; invalid roles/versions/phases fail closed", () => {
  const d = ready(),
    id = children(d).l4[0].id;
  setCatalogDesigner(d, "l4", id, "person-0", day);
  d.people[0].end = "2026-10-26";
  assert.doesNotThrow(() => setCatalogDesigner(d, "l4", id, "person-0", day));
  assert.throws(() => setCatalogDeveloper(d, id, "person-0", day), /종료/);
  for (const change of [
    (d) => (d.catalog.l4[0].designerId = "missing"),
    (d) => (d.catalog.l4[0].phase = 4),
    (d) => (d.schemaVersion = 2),
    (d) => (d.catalog.version = 99),
  ]) {
    const c = clone(d);
    change(c);
    assert.throws(() => validateData(c));
  }
});
test("English/Korean display is level-specific without deleting original names; assignments never affect M/M or plans", () => {
  const d = ready(),
    before = clone(d),
    mm = totals(d, 2026);
  assert.equal(
    catalogDisplayName("l2", d.catalog.l2[1]),
    "Service Order Management",
  );
  assert.equal(
    catalogDisplayName("subcomponents", d.catalog.subcomponents[1]),
    "서비스 주문 처리",
  );
  assert.equal(
    catalogDisplayName("l4", { name: "Keep English", koreanName: null }),
    "한글 명칭 미등록",
  );
  setCatalogDesigner(d, "subcomponents", scId, "tbd-1", day);
  assert.deepEqual(d.plans, before.plans);
  assert.deepEqual(d.people, before.people);
  assert.deepEqual(totals(d, 2026), mm);
  assert.equal(
    d.catalog.subcomponents[1].name,
    before.catalog.subcomponents[1].name,
  );
});
