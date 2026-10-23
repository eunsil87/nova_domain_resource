import test from "node:test";
import assert from "node:assert/strict";
import { seed, clone, phaseTimeline, validateData } from "../src/core.js";
test("whole schedule includes all three phases with overlapping design/development and current calendar position", () => {
  const d = seed(),
    before = clone(d),
    m = phaseTimeline(d.phases, "2026-10-23");
  assert.equal(m.start, "2026-07-01");
  assert.equal(m.end, "2028-07-31");
  assert.equal(m.rows.length, 3);
  assert.equal(m.rows.flatMap((r) => r.periods).length, 6);
  assert.deepEqual(m.current, ["Phase 1 설계", "Phase 1 개발"]);
  assert.equal(m.range, "during");
  assert(m.position > 0 && m.position < 100);
  assert.equal(m.ticks[0].left, 0);
  assert.equal(m.ticks.at(-1).left, 100);
  assert(
    m.rows.every((r) =>
      r.periods.every(
        (p) => p.left >= 0 && p.width > 0 && p.left + p.width <= 100.000001,
      ),
    ),
  );
  assert.deepEqual(d, before);
});
test("start/end dates are inclusive and the next day changes the period state", () => {
  const p = [
    ["Custom", "2027-01-01", "2027-01-15", "2027-02-01", "2027-02-15"],
  ];
  assert.deepEqual(phaseTimeline(p, "2027-01-01").current, ["Custom 설계"]);
  assert.deepEqual(phaseTimeline(p, "2027-01-15").current, ["Custom 설계"]);
  const gap = phaseTimeline(p, "2027-01-16");
  assert.equal(gap.range, "during");
  assert.deepEqual(gap.current, []);
  assert.equal(gap.rows[0].periods[0].state, "past");
  assert.equal(gap.rows[0].periods[1].state, "upcoming");
  assert.deepEqual(phaseTimeline(p, "2027-02-15").current, ["Custom 개발"]);
});
test("before and after schedule clamp the marker without incorrectly claiming an active phase", () => {
  const phases = seed().phases;
  const before = phaseTimeline(phases, "2026-06-30"),
    after = phaseTimeline(phases, "2028-08-01");
  assert.equal(before.position, 0);
  assert.equal(before.range, "before");
  assert.equal(after.position, 100);
  assert.equal(after.range, "after");
  assert.deepEqual(before.current, []);
  assert.deepEqual(after.current, []);
  assert(
    before.rows.every((r) => r.periods.every((p) => p.state === "upcoming")),
  );
  assert(after.rows.every((r) => r.periods.every((p) => p.state === "past")));
});
test("leap-year dates are exact and Phase 3 reference end stays February 28", () => {
  const m = phaseTimeline(seed().phases, "2028-02-29");
  assert.equal(m.rows[2].periods[0].end, "2028-02-28");
  assert.equal(m.rows[2].periods[0].state, "past");
  assert(m.current.includes("Phase 3 개발"));
  assert(!m.current.includes("Phase 3 설계"));
});
test("empty and single-day project schedules do not divide by zero or hardcode NOVA", () => {
  const empty = phaseTimeline([], "2026-10-23");
  assert.equal(empty.range, "empty");
  assert.deepEqual(empty.rows, []);
  const single = phaseTimeline(
    [["검토", "2026-10-23", "2026-10-23", "2026-10-23", "2026-10-23"]],
    "2026-10-23",
  );
  assert.equal(single.position, 0);
  assert.deepEqual(single.current, ["검토 설계", "검토 개발"]);
  assert(single.rows[0].periods.every((p) => p.width === 100));
  assert.equal(single.ticks.length, 1);
});
test("malformed phase dates and reversed intervals are rejected before startup can write", () => {
  for (const [start, end] of [
    ["2026-02-30", "2026-03-31"],
    ["2026-12-01", "2026-01-01"],
  ]) {
    const d = seed();
    d.phases[0][1] = start;
    d.phases[0][2] = end;
    assert.throws(() => validateData(d));
    assert.throws(() => phaseTimeline(d.phases, "2026-10-23"));
  }
});
