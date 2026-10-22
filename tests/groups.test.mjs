import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  clone,
  layoutIds,
  moveGroup,
  moveParent,
  cleanGroups,
  copyPlan,
  validateData,
  totals,
  startup,
} from "../src/core.js";
function fixture() {
  const d = seed(),
    p = d.plans[0];
  p.groups = ["a", "b", "c", "d"].map((id, i) => ({
    id,
    name: "그룹 " + id,
    members: ["person-" + i],
    leaderId: "person-" + i,
  }));
  return d;
}
test("old data without rootOrder retains previous parents-first order and is not rewritten on startup", async () => {
  const d = (await startup(fixture(), { today: "2026-10-22" })).data,
    p = d.plans[0];
  p.parents = [
    {
      id: "parent-a",
      name: "상위",
      groupIds: ["a", "b"],
      leaderId: "person-0",
    },
  ];
  assert.deepEqual(layoutIds(p), ["parent-a", "c", "d"]);
  assert.equal(p.rootOrder, undefined);
  assert.equal((await startup(d, { today: "2026-10-22" })).changed, false);
  assert.equal(validateData(d), d);
});
test("drag reorder works before and after standalone group without changing members or M/M", () => {
  const d = fixture(),
    p = d.plans[0],
    groups = clone(p.groups),
    before = totals(d, 2026);
  moveGroup(p, "a", { anchorId: "c", after: true });
  cleanGroups(d, "2026-10-22");
  assert.deepEqual(layoutIds(p), ["b", "c", "a", "d"]);
  moveGroup(p, "d", { anchorId: "b" });
  cleanGroups(d, "2026-10-22");
  assert.deepEqual(layoutIds(p), ["d", "b", "c", "a"]);
  assert.deepEqual(p.groups, groups);
  assert.deepEqual(totals(d, 2026), before);
  validateData(d);
});
test("child ordering and movement across parents preserve groups and clear only ineligible upper leaders", () => {
  const d = fixture(),
    p = d.plans[0];
  p.parents = [
    { id: "pa", name: "상위A", groupIds: ["a", "b"], leaderId: "person-0" },
    { id: "pb", name: "상위B", groupIds: ["c"], leaderId: "person-2" },
  ];
  moveGroup(p, "a", { parentId: "pa", anchorId: "b", after: true });
  cleanGroups(d, "2026-10-22");
  assert.deepEqual(p.parents[0].groupIds, ["b", "a"]);
  assert.equal(p.parents[0].leaderId, "person-0");
  moveGroup(p, "a", { parentId: "pb", anchorId: "c" });
  cleanGroups(d, "2026-10-22");
  assert.deepEqual(p.parents[1].groupIds, ["a", "c"]);
  assert.equal(p.parents[0].leaderId, null);
  assert.equal(p.groups[0].leaderId, "person-0");
  assert.equal(p.parents[1].leaderId, "person-2");
  validateData(d);
});
test("unbundling the last child removes only its empty parent and positions standalone group", () => {
  const d = fixture(),
    p = d.plans[0];
  p.parents = [
    { id: "pa", name: "상위A", groupIds: ["a"], leaderId: "person-0" },
  ];
  moveGroup(p, "a", { anchorId: "c", after: true });
  cleanGroups(d, "2026-10-22");
  assert.deepEqual(layoutIds(p), ["b", "c", "a", "d"]);
  assert.equal(p.parents.length, 0);
  assert.equal(p.groups.length, 4);
  assert.equal(d.people.length, 19);
  assert.equal(p.groups[0].leaderId, "person-0");
  validateData(d);
});
test("upper groups and standalone groups can be interleaved in persistent root order", () => {
  const d = fixture(),
    p = d.plans[0];
  p.parents = [
    { id: "pa", name: "상위A", groupIds: ["a"], leaderId: "person-0" },
    { id: "pb", name: "상위B", groupIds: ["b"], leaderId: "person-1" },
  ];
  moveParent(p, "pa", "d", true);
  assert.deepEqual(layoutIds(p), ["pb", "c", "d", "pa"]);
  moveParent(p, "pb", "c", true);
  assert.deepEqual(layoutIds(p), ["c", "pb", "d", "pa"]);
  cleanGroups(d, "2026-10-22");
  assert.deepEqual(layoutIds(JSON.parse(JSON.stringify(p))), [
    "c",
    "pb",
    "d",
    "pa",
  ]);
  validateData(d);
});
test("plan copy remaps all layout IDs and later moves stay isolated", () => {
  const d = fixture(),
    p = d.plans[0];
  p.parents = [
    { id: "pa", name: "상위A", groupIds: ["a", "b"], leaderId: "person-0" },
  ];
  moveParent(p, "pa", "c", true);
  const copied = copyPlan(p, "2안");
  d.plans.push(copied);
  assert.deepEqual(
    layoutIds(copied).map(
      (id) =>
        [...copied.groups, ...copied.parents].find((x) => x.id === id).name,
    ),
    ["그룹 c", "상위A", "그룹 d"],
  );
  const before = clone(p);
  moveGroup(copied, copied.groups[0].id);
  cleanGroups(d, "2026-10-22");
  assert.deepEqual(p, before);
  assert.equal(d.people.length, 19);
  validateData(d);
});
test("invalid/self drops do not corrupt data; duplicate/unknown layout references are rejected", () => {
  const d = fixture(),
    p = d.plans[0],
    before = clone(p);
  moveGroup(p, "a", { anchorId: "a" });
  assert.deepEqual(p, before);
  assert.throws(() => moveGroup(p, "a", { parentId: "missing" }));
  assert.deepEqual(p, before);
  assert.throws(() => moveGroup(p, "a", { anchorId: "missing" }));
  assert.deepEqual(p, before);
  p.rootOrder = ["a", "a"];
  assert.throws(() => validateData(d));
  p.rootOrder = ["missing"];
  assert.throws(() => validateData(d));
});
