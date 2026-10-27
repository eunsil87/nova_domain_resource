import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  catalogCounts,
  catalogPath,
  catalogRows,
  upsertCatalogNode,
  deleteCatalogNode,
  setCatalogAssignees,
  validateCatalog,
} from "../src/catalog.js";
const today = "2026-10-26",
  SC = "cat-subcomponents-TMFC007-SC01";
const withCatalog = () => ({ ...seed(), catalog: baselineCatalog() });
test("baseline rows reproduce the supplied document including all names, descriptions, parents and flags", async () => {
  const c = baselineCatalog(),
    text = await readFile(
      new URL(
        "../docs/catalog/NOVA_SO_RO_L2_L4_Functional_Catalog_v3.0.md",
        import.meta.url,
      ),
      "utf8",
    );
  const rows = text
    .split("\n")
    .map((l) =>
      l
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((x) => x.trim()),
    )
    .filter((r) => r.length === 15 && ["EPC", "SVC", "RSC"].includes(r[0]));
  assert.deepEqual(catalogCounts(c), {
    domains: 3,
    l2: 5,
    subcomponents: 12,
    l3: 20,
    l4: 106,
    required: 86,
    optional: 20,
  });
  assert.equal(rows.length, 106);
  for (const r of rows) {
    const n = c.l4.find((x) => x.code === r[10]),
      path = catalogPath(c, "l4", n.id);
    assert.deepEqual(
      path.map((p) => p.code),
      [r[0], r[1], r[4], r[7], r[10]],
    );
    assert.deepEqual(
      path.slice(1).map((p) => [p.name, p.koreanName]),
      [
        [r[2], r[3]],
        [r[5], r[6]],
        [r[8], r[9]],
        [r[11], r[12]],
      ],
    );
    assert.equal(n.description, r[13]);
    assert.equal(n.required, r[14] === "필수");
  }
  validateCatalog(c, seed().people);
});
test("old schema 1 data with no catalog remains valid, does not initialize on startup or get rewritten", async () => {
  const d = (await startup(seed(), { today })).data;
  d.schemaVersion = 1;
  assert.equal(d.catalog, undefined);
  validateData(d);
  const output = await startup(d, { today });
  assert.equal(output.changed, false);
  assert.equal(output.data.catalog, undefined);
  assert.equal(output.data.schemaVersion, 1);
});
test("schema 2 validates catalog; old schema cannot silently contain or lose assignment data", () => {
  const d = withCatalog();
  d.schemaVersion = 2;
  validateData(d);
  d.schemaVersion = 1;
  assert.throws(() => validateData(d), /스키마 2/);
});
test("all five levels support add, rename, parent changes and leaf-first deletion", () => {
  const c = emptyCatalog(),
    keys = ["domains", "l2", "subcomponents", "l3", "l4"];
  let parentId = null;
  const nodes = keys.map((key, i) => {
    const n = upsertCatalogNode(c, key, {
      code: "CODE-" + i,
      name: "Name " + i,
      koreanName: "이름 " + i,
      parentId,
      description: "상세 기능",
      required: false,
    });
    parentId = n.id;
    return n;
  });
  const id = nodes[1].id;
  upsertCatalogNode(c, "l2", { ...nodes[1], code: "RENAMED", name: "New" }, id);
  assert.equal(c.subcomponents[0].parentId, id);
  assert.equal(catalogPath(c, "l4", nodes[4].id)[1].code, "RENAMED");
  for (let i = 4; i >= 0; i--) deleteCatalogNode(c, keys[i], nodes[i].id);
  assert.deepEqual(catalogCounts(c), {
    domains: 0,
    l2: 0,
    subcomponents: 0,
    l3: 0,
    l4: 0,
    required: 0,
    optional: 0,
  });
});
test("duplicate codes and invalid parents or mandatory fields fail before mutation", () => {
  const c = baselineCatalog(),
    before = clone(c);
  for (const input of [
    { code: c.l2[0].code, name: "중복", parentId: c.domains[0].id },
    { code: "NEW", name: "등록", parentId: "missing" },
    { code: "NEW", name: "", parentId: c.domains[0].id },
  ])
    assert.throws(() => upsertCatalogNode(c, "l2", input));
  assert.deepEqual(c, before);
  assert.throws(() =>
    upsertCatalogNode(c, "l4", {
      code: "NEW",
      name: "명칭",
      parentId: c.l3[0].id,
      required: "필수",
    }),
  );
});
test("deletion is blocked for children and assigned Sub Components; no cascade data loss", () => {
  const d = withCatalog();
  assert.throws(
    () => deleteCatalogNode(d.catalog, "domains", d.catalog.domains[0].id),
    /하위 L2/,
  );
  const n = upsertCatalogNode(d.catalog, "subcomponents", {
    code: "CUSTOM",
    name: "단위",
    parentId: d.catalog.l2[0].id,
  });
  setCatalogAssignees(d, n.id, ["person-0"], today);
  const before = clone(d);
  assert.throws(
    () => deleteCatalogNode(d.catalog, "subcomponents", n.id),
    /담당자/,
  );
  assert.deepEqual(d, before);
  setCatalogAssignees(d, n.id, [], today);
  deleteCatalogNode(d.catalog, "subcomponents", n.id);
  assert(!d.catalog.subcomponents.some((x) => x.id === n.id));
});
test("rename or move preserves child internal references and multiple common assignees", () => {
  const d = withCatalog(),
    sc = d.catalog.subcomponents.find((x) => x.id === SC),
    oldPath = catalogPath(
      d.catalog,
      "l4",
      d.catalog.l4.find(
        (n) => n.parentId === d.catalog.l3.find((x) => x.parentId === SC).id,
      ).id,
    );
  setCatalogAssignees(d, SC, ["person-0", "person-1", "tbd-1"], today);
  upsertCatalogNode(
    d.catalog,
    "subcomponents",
    {
      ...sc,
      code: "RENAMED-SC",
      name: "이름 변경",
      parentId: d.catalog.l2[0].id,
    },
    SC,
  );
  assert.deepEqual(sc.assigneeIds, ["person-0", "person-1", "tbd-1"]);
  assert.equal(catalogPath(d.catalog, "l4", oldPath.at(-1).id)[2].id, SC);
  assert.equal(
    catalogPath(d.catalog, "l4", oldPath.at(-1).id)[1].id,
    d.catalog.l2[0].id,
  );
  validateData(d);
});
test("new assignments exclude ended people but retain existing ended assignments for reassignment", () => {
  const d = withCatalog();
  setCatalogAssignees(d, SC, ["person-0"], today);
  d.people[0].end = "2026-10-25";
  assert.doesNotThrow(() => setCatalogAssignees(d, SC, ["person-0"], today));
  setCatalogAssignees(d, SC, [], today);
  assert.throws(() => setCatalogAssignees(d, SC, ["person-0"], today), /종료/);
  assert.throws(
    () => setCatalogAssignees(d, SC, ["person-1", "person-1"], today),
    /중복/,
  );
});
test("person delete and startup TBD removal clean assignments, but ended personnel are retained", async () => {
  const d = (await startup(withCatalog(), { today })).data;
  setCatalogAssignees(d, SC, ["person-0", "tbd-1", "tbd-2"], today);
  const copy = clone(d);
  copy.people = copy.people.filter((p) => p.id !== "person-0");
  await reconcile(copy, d, { today });
  assert.deepEqual(
    copy.catalog.subcomponents.find((x) => x.id === SC).assigneeIds,
    ["tbd-1", "tbd-2"],
  );
  d.people.find((p) => p.id === "tbd-1").start = "2026-10-01";
  d.people.find((p) => p.id === "tbd-1").end = "2026-11-14";
  d.people[0].end = "2026-10-25";
  const after = await startup(d, { today });
  assert.deepEqual(
    after.data.catalog.subcomponents.find((x) => x.id === SC).assigneeIds,
    ["person-0", "tbd-2"],
  );
  validateData(after.data);
});
test("filtering supports parent paths, Korean names, full descriptions and required/optional distinction", () => {
  const c = baselineCatalog(),
    svc = c.domains.find((n) => n.code === "SVC");
  assert.equal(catalogRows(c, "l4", { domains: svc.id }).length, 45);
  assert.equal(catalogRows(c, "l4", {}, "", "optional").length, 20);
  assert(
    catalogRows(c, "l4", {}, "실행차수").some((n) =>
      n.description.includes("실행차수"),
    ),
  );
  const n = c.l4[0];
  assert(catalogRows(c, "l4", {}, n.koreanName).some((x) => x.id === n.id));
});
test("invalid version, duplicate IDs, orphan parents and missing-person assignments are rejected without rewriting", () => {
  for (const change of [
    (c) => (c.version = 99),
    (c) => (c.l2[0].parentId = "missing"),
    (c) => c.l4.push(clone(c.l4[0])),
    (c) => (c.subcomponents[0].assigneeIds = ["missing"]),
  ]) {
    const d = withCatalog();
    change(d.catalog);
    assert.throws(() => validateData(d));
  }
});
test("catalog edits never change existing personnel, groups or M/M, including all-empty catalog reload", async () => {
  const d = (await startup(seed(), { today })).data,
    before = clone(d),
    mm = totals(d, 2026);
  d.catalog = emptyCatalog();
  upsertCatalogNode(d.catalog, "domains", { code: "NEW", name: "새 도메인" });
  deleteCatalogNode(d.catalog, "domains", d.catalog.domains[0].id);
  const reloaded = await startup(JSON.parse(JSON.stringify(d)), { today });
  assert.equal(reloaded.changed, false);
  assert.deepEqual(reloaded.data.catalog.domains, []);
  assert.deepEqual(d.people, before.people);
  assert.deepEqual(d.plans, before.plans);
  assert.deepEqual(totals(d, 2026), mm);
});

test("TBD confirmation preserves Sub Component assignments and does not duplicate personnel", async () => {
  const d = withCatalog();
  setCatalogAssignees(d, SC, ["tbd-1"], today);
  const next = clone(d),
    person = next.people.find((p) => p.id === "tbd-1");
  Object.assign(person, {
    kind: "confirmed",
    name: "담당자 확정",
    companyId: "skax",
    start: "2026-10-01",
  });
  await reconcile(next, d, { today });
  assert.deepEqual(
    next.catalog.subcomponents.find((n) => n.id === SC).assigneeIds,
    ["tbd-1"],
  );
  assert.equal(next.people.length, 19);
  validateData(next);
});
