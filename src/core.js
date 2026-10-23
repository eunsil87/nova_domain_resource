export const SCHEMA = 1;
export const FOREVER = "9999-12-31";
export const clone = (x) => structuredClone(x);
export const uid = () => globalThis.crypto.randomUUID();
export function todayKST(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function dateValue(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s))
    throw Error("날짜를 YYYY-MM-DD 또는 숫자 8자리로 입력해 주세요.");
  const d = new Date(s + "T00:00:00Z");
  if (
    !Number.isFinite(+d) ||
    d.toISOString().slice(0, 10) !== s ||
    s < "0001-01-01"
  )
    throw Error("존재하지 않는 날짜입니다.");
  return +d;
}
export function normalizeDate(s, fallback = null) {
  if (!s) return fallback;
  s = s.trim().replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
  dateValue(s);
  return s;
}
export const days = (a, b) =>
  Math.round((dateValue(b) - dateValue(a)) / 86400000) + 1;
export function addDays(s, n) {
  return new Date(dateValue(s) + n * 86400000).toISOString().slice(0, 10);
}
export const typeOf = (d, p) =>
  d.companies.find((c) => c.id === p.companyId)?.type ?? null;
export const status = (p, t = todayKST()) =>
  p.kind === "tbd"
    ? "TBD"
    : p.end < t
      ? "종료"
      : p.start > t
        ? "투입 예정"
        : "투입 중";
export const nameOf = (list, id) => list.find((x) => x.id === id)?.name ?? "";
export function nextName(prefix, names, suffix = "") {
  let n = 1;
  while (names.includes(prefix + n + suffix)) n++;
  return prefix + n + suffix;
}
export function seed() {
  const companies = [
    ["skax", "SKAX", "정직원"],
    ["ags", "애커튼테크놀로지", "AGS"],
    ["daewon", "대원씨앤씨", "BP"],
    ["d2l", "디투엘", "BP"],
    ["info", "인포매니아", "BP"],
    ["dasom", "다솜에스엔씨", "BP"],
  ].map(([id, name, type]) => ({ id, name, type, active: true }));
  const rows = [
    ["장은실", "skax", "focal", null, "05-01"],
    ["유원기", "daewon", "designer", "be", "01-01"],
    ["이건욱", "daewon", "designer", "be", "04-16"],
    ["석세동", "daewon", "developer", "be", "09-16"],
    ["이지은", "daewon", "developer", "be", "10-01"],
    ["강성구", "daewon", "designer", "be", "07-01"],
    ["연준호", "daewon", "developer", "be", "10-01"],
    ["송용주", "d2l", "designer", "be", "01-01"],
    ["정우진", "d2l", "developer", "be", "10-01"],
    ["신주현", "info", "designer", "be", "06-01"],
    ["신태운", "info", "developer", "be", "10-01"],
    ["범미", "dasom", "designer", "fe", "10-01"],
    ["박훈", "daewon", "developer", "be", "11-01"],
    ["조기웅", "daewon", "developer", "be", "11-01"],
  ];
  const people = rows.map(([name, companyId, roleId, techId, start], i) => ({
    id: "person-" + i,
    kind: "confirmed",
    name,
    companyId,
    roleId,
    techId,
    start: "2026-" + start,
    end: FOREVER,
    everStarted: false,
    extra: {
      skt: null,
      doss: null,
      devdi: null,
      mydesk: null,
      local: null,
      seat: null,
      memo: null,
    },
  }));
  for (let i = 1; i <= 5; i++)
    people.push({
      id: "tbd-" + i,
      kind: "tbd",
      name: "TBD#" + i,
      companyId: null,
      roleId: null,
      techId: null,
      start: "2026-11-01",
      end: FOREVER,
      everStarted: false,
      extra: {
        skt: null,
        doss: null,
        devdi: null,
        mydesk: null,
        local: null,
        seat: null,
        memo: null,
      },
    });
  return {
    schemaVersion: SCHEMA,
    saveVersion: 0,
    initialized: true,
    projectName: "NOVA",
    partName: "Service Order(무선)",
    companies,
    roles: [
      { id: "focal", name: "Focal", active: true },
      { id: "designer", name: "설계자", active: true },
      { id: "developer", name: "개발자", active: true },
    ],
    technologies: [
      { id: "fs", name: "F/S", active: true },
      { id: "be", name: "B/E", active: true },
      { id: "fe", name: "F/E", active: true },
    ],
    people,
    targets: { 2026: 65000 },
    plans: [{ id: "plan-1", name: "1안", groups: [], parents: [] }],
    appliedPlanId: "plan-1",
    chiefId: "person-1",
    representativeIds: ["person-1", "person-7", "person-9", "person-11"],
    phases: [
      ["Phase 1", "2026-07-01", "2027-01-31", "2026-08-01", "2027-03-31"],
      ["Phase 2", "2027-02-01", "2027-08-31", "2027-04-01", "2027-11-30"],
      ["Phase 3", "2027-09-01", "2028-02-28", "2027-12-01", "2028-07-31"],
    ],
  };
}
// Rational arithmetic: sum unrounded month fractions, then round once per person.
export function annualMM(p, year) {
  let n = 0n,
    d = 1n;
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  for (let m = 1; m <= 12; m++) {
    const first = `${year}-${String(m).padStart(2, "0")}-01`;
    const count = new Date(Date.UTC(year, m, 0)).getUTCDate();
    const last = `${year}-${String(m).padStart(2, "0")}-${count}`;
    const a = p.start > first ? p.start : first,
      b = p.end < last ? p.end : last;
    if (a > b) continue;
    const k = BigInt(days(a, b)),
      c = BigInt(count);
    n = n * c + k * d;
    d *= c;
    const g = gcd(n, d);
    n /= g;
    d /= g;
  }
  return Number((n * 1000n * 2n + d) / (2n * d));
}
export function totals(d, year) {
  const out = { confirmed: 0, tbd: 0, types: { 정직원: 0, BP: 0, AGS: 0 } };
  for (const p of d.people) {
    const mm = annualMM(p, year);
    if (p.kind === "tbd") out.tbd += mm;
    else {
      out.confirmed += mm;
      out.types[typeOf(d, p)] += mm;
    }
  }
  return out;
}
export function needed(d, year, start, end) {
  const target = d.targets[year];
  if (target == null) throw Error("연간 목표를 먼저 설정해 주세요.");
  const t = totals(d, year),
    contribution = annualMM({ start, end }, year);
  const calc = (gap) =>
    gap <= 0 ? 0 : contribution > 0 ? Math.ceil(gap / contribution) : null;
  return {
    contribution,
    confirmed: calc(target - t.confirmed),
    planned: calc(target - t.confirmed - t.tbd),
  };
}
export function validatePerson(
  d,
  p,
  old = null,
  mode = "planned",
  t = todayKST(),
) {
  if (!p.name?.trim())
    throw Error(
      p.kind === "tbd"
        ? "TBD 표시명을 입력해 주세요."
        : "이름을 입력해 주세요.",
    );
  dateValue(p.start);
  dateValue(p.end);
  if (p.end < p.start) throw Error("종료일은 시작일보다 빠를 수 없습니다.");
  if (
    p.kind === "tbd" &&
    d.people.some((x) => x.id !== p.id && x.kind === "tbd" && x.name === p.name)
  )
    throw Error("이미 사용 중인 TBD 표시명입니다.");
  if ((p.kind === "tbd" || (!old && mode === "planned")) && p.start <= t)
    throw Error("신규 예정 인력과 TBD 시작일은 내일 이후여야 합니다.");
  const actual =
    p.kind === "confirmed" &&
    (mode === "actual" ||
      mode === "convert" ||
      old?.everStarted ||
      old?.start <= t);
  if (days(p.start, p.end) < 15 && !(actual && p.start <= t))
    throw Error("시작일과 종료일을 포함해 최소 15일이어야 합니다.");
  const company = d.companies.find((x) => x.id === p.companyId),
    type = company?.type;
  if (p.companyId && !company) throw Error("유효한 업체를 선택해 주세요.");
  if (p.kind === "confirmed" && !company) throw Error("업체를 선택해 주세요.");
  if (p.kind === "confirmed" && type !== "정직원" && (!p.roleId || !p.techId))
    throw Error("BP·AGS 확정 인력은 역할과 기술 구분이 필수입니다.");
  if (p.roleId === "focal" && type !== "정직원")
    throw Error("Focal 역할은 정직원만 선택할 수 있습니다.");
  if (old?.kind === "confirmed") {
    if (p.kind !== "confirmed")
      throw Error("확정 인력을 TBD로 되돌릴 수 없습니다.");
    if (p.companyId !== old.companyId && (old.everStarted || old.start <= t))
      throw Error("실제 투입한 인력의 업체는 변경할 수 없습니다.");
    if (type !== typeOf(d, old))
      throw Error("확정 인력의 직원 타입은 변경할 수 없습니다.");
  }
  for (const [key, prefix] of [
    ["skt", "P"],
    ["doss", "DS"],
  ])
    if (
      p.extra[key] &&
      !new RegExp("^" + prefix + "\\d{6}$").test(p.extra[key])
    )
      throw Error("가사번·DOSS ID는 숫자 6자리로 입력해 주세요.");
  for (const key of ["devdi", "mydesk", "local"])
    if (p.extra[key] && !/^\d{1,3}(\.\d{1,3}){3}$/.test(p.extra[key]))
      throw Error("IPv4 네 칸을 모두 입력해 주세요.");
    else if (p.extra[key]?.split(".").some((x) => +x > 255))
      throw Error("IPv4는 각 칸에 0~255를 입력해 주세요.");
  return p;
}
export const eligibleRep = (d, p, t) =>
  !!p &&
  ["BP", "AGS"].includes(typeOf(d, p)) &&
  !!p.roleId &&
  !!p.techId &&
  status(p, t) !== "종료";
export const repKey = (p) => [p.companyId, p.roleId, p.techId].join("|");
export function appoint(d, id, t = todayKST()) {
  const p = d.people.find((x) => x.id === id);
  if (!eligibleRep(d, p, t))
    throw Error("업체·역할·기술이 지정된 BP·AGS 인력을 선택해 주세요.");
  d.representativeIds = d.representativeIds.filter(
    (id) => repKey(d.people.find((x) => x.id === id)) !== repKey(p),
  );
  d.representativeIds.push(id);
  p.representativeReleased = false;
}
// Older files omit rootOrder; retain their original parents-first layout until edited.
export function layoutIds(plan) {
  const grouped = new Set(plan.parents.flatMap((p) => p.groupIds));
  const valid = [
    ...plan.parents.map((p) => p.id),
    ...plan.groups.filter((g) => !grouped.has(g.id)).map((g) => g.id),
  ];
  return [...new Set([...(plan.rootOrder ?? []), ...valid])].filter((id) =>
    valid.includes(id),
  );
}
export function moveGroup(
  plan,
  groupId,
  { parentId = null, anchorId = null, after = false } = {},
) {
  if (!plan.groups.some((g) => g.id === groupId))
    throw Error("이동할 그룹이 없습니다.");
  if (anchorId === groupId) return;
  const parent = parentId ? plan.parents.find((p) => p.id === parentId) : null;
  if (parentId && !parent) throw Error("대상 상위 그룹이 없습니다.");
  if (
    anchorId &&
    (parent
      ? !parent.groupIds.includes(anchorId)
      : !layoutIds(plan).includes(anchorId))
  )
    throw Error("이동 위치가 올바르지 않습니다.");
  const order = layoutIds(plan).filter((id) => id !== groupId);
  for (const p of plan.parents)
    p.groupIds = p.groupIds.filter((id) => id !== groupId);
  const list = parent ? parent.groupIds : order;
  const at = anchorId ? list.indexOf(anchorId) + (after ? 1 : 0) : list.length;
  list.splice(at, 0, groupId);
  plan.rootOrder = order;
}
export function moveParent(plan, parentId, anchorId = null, after = false) {
  if (!plan.parents.some((p) => p.id === parentId))
    throw Error("이동할 상위 그룹이 없습니다.");
  if (parentId === anchorId) return;
  const order = layoutIds(plan).filter((id) => id !== parentId);
  if (anchorId && !order.includes(anchorId))
    throw Error("이동 위치가 올바르지 않습니다.");
  order.splice(
    anchorId ? order.indexOf(anchorId) + (after ? 1 : 0) : order.length,
    0,
    parentId,
  );
  plan.rootOrder = order;
}
export function cleanGroups(d, t = todayKST()) {
  const ids = new Set(
    d.people.filter((p) => status(p, t) !== "종료").map((p) => p.id),
  );
  for (const plan of d.plans) {
    for (const g of plan.groups) {
      g.members = g.members.filter((id) => ids.has(id));
      if (!g.members.includes(g.leaderId)) g.leaderId = null;
    }
    plan.groups = plan.groups.filter((g) => g.members.length);
    for (const parent of plan.parents) {
      parent.groupIds = parent.groupIds.filter((id) =>
        plan.groups.some((g) => g.id === id),
      );
      const members = parent.groupIds.flatMap(
        (id) => plan.groups.find((g) => g.id === id).members,
      );
      if (!members.includes(parent.leaderId)) parent.leaderId = null;
    }
    plan.parents = plan.parents.filter((p) => p.groupIds.length);
    if (plan.rootOrder) plan.rootOrder = layoutIds(plan);
  }
  if (!d.people.some((p) => p.id === d.chiefId && status(p, t) === "투입 중"))
    d.chiefId = null;
}
// Every mutation runs on a copy. A cancelled selection never changes session data.
export async function reconcile(
  d,
  before,
  {
    today = todayKST(),
    choose = async () => {
      throw Error("인계 대상 선택이 필요합니다.");
    },
    withdrawIds = [],
    changedIds = [],
  } = {},
) {
  const notices = [],
    departing = new Set();
  for (const id of withdrawIds) {
    const p = d.people.find((p) => p.id === id);
    if (p) p.representativeReleased = true;
  }
  d.representativeIds = d.representativeIds.filter((id) =>
    before.people.some((p) => p.id === id),
  );
  for (const id of before.representativeIds) {
    const old = before.people.find((p) => p.id === id),
      p = d.people.find((p) => p.id === id);
    if (!old) continue;
    if (
      !eligibleRep(d, p, today) ||
      p.companyId !== old.companyId ||
      repKey(p) !== repKey(old) ||
      withdrawIds.includes(id)
    )
      departing.add(id);
  }
  d.representativeIds = d.representativeIds.filter(
    (id) =>
      !departing.has(id) &&
      eligibleRep(
        d,
        d.people.find((p) => p.id === id),
        today,
      ),
  );
  const handed = new Set();
  for (const id of departing) {
    const old = before.people.find((p) => p.id === id),
      p = d.people.find((p) => p.id === id),
      isWithdrawal = withdrawIds.includes(id) || status(old, today) === "종료";
    let reps = d.representativeIds
      .map((id) => d.people.find((p) => p.id === id))
      .filter(
        (x) =>
          x.companyId === old.companyId &&
          (!isWithdrawal || status(x, today) === "투입 중"),
      );
    let heir = null;
    if (reps.length) {
      heir = reps.length === 1 ? reps[0] : null;
      if (reps.length > 1) {
        const chosen = await choose("현장대리인 인계 대상 선택", reps);
        if (!chosen) throw Error("작업을 취소했습니다.");
        heir = reps.find((x) => x.id === chosen);
        if (!heir) throw Error("유효한 인계 대상을 선택해 주세요.");
      }
      handed.add(old.companyId);
    } else if (isWithdrawal) {
      const others = d.people.filter(
        (x) =>
          x.id !== id &&
          !departing.has(x.id) &&
          x.companyId === old.companyId &&
          status(x, today) === "투입 중",
      );
      if (others.length && withdrawIds.includes(id))
        throw Error("현장대리인 변경 선 처리 후 철수 가능");
    } else if (p && p.companyId === old.companyId && eligibleRep(d, p, today)) {
      appoint(d, id, today);
      continue;
    }
    if (!heir && !withdrawIds.includes(id)) {
      const candidates = d.people.filter(
        (x) =>
          !departing.has(x.id) &&
          x.id !== id &&
          x.companyId === old.companyId &&
          x.kind === "confirmed" &&
          eligibleRep(d, x, today),
      );
      candidates.sort(
        (a, b) =>
          (status(a, today) === "투입 중" ? 0 : 1) -
            (status(b, today) === "투입 중" ? 0 : 1) ||
          a.start.localeCompare(b.start) ||
          d.people.indexOf(a) - d.people.indexOf(b),
      );
      if (candidates.length) {
        heir = candidates[0];
        appoint(d, heir.id, today);
        handed.add(old.companyId);
      }
    }
    if (heir)
      notices.push(
        `${nameOf(d.companies, old.companyId)}의 현장대리인이 ${heir.name}으로 변경 됨`,
      );
  }
  for (const company of d.companies.filter((c) => c.type !== "정직원")) {
    if (
      handed.has(company.id) ||
      withdrawIds.some(
        (id) =>
          before.people.find((p) => p.id === id)?.companyId === company.id,
      )
    )
      continue;
    if (
      d.representativeIds.some((id) => {
        const p = d.people.find((p) => p.id === id);
        return p.companyId === company.id && status(p, today) === "투입 중";
      })
    )
      continue;
    const candidates = d.people
      .filter(
        (p) =>
          p.companyId === company.id &&
          !p.representativeReleased &&
          !departing.has(p.id) &&
          status(p, today) === "투입 중" &&
          eligibleRep(d, p, today),
      )
      .sort((a, b) => a.start.localeCompare(b.start));
    if (!candidates.length) continue;
    const earliest = candidates.filter((p) => p.start === candidates[0].start);
    const id =
      earliest.length === 1
        ? earliest[0].id
        : await choose(`${company.name} 현장대리인 최초 지정`, earliest);
    if (!id) throw Error("작업을 취소했습니다.");
    appoint(d, id, today);
  }
  for (const p of d.people)
    if (p.kind === "confirmed" && p.start <= today) p.everStarted = true;
  cleanGroups(d, today);
  return notices;
}
export async function startup(original, options = {}) {
  const today = options.today ?? todayKST(),
    d = clone(original);
  let next;
  if (+today.slice(8) <= 14) next = today.slice(0, 8) + "15";
  else {
    const x = addDays(today, 32 - Number(today.slice(8)));
    next = x.slice(0, 8) + "01";
  }
  const remove = new Set();
  for (const p of d.people)
    if (p.kind === "tbd" && p.start <= today) {
      p.start = next;
      if (p.end < next || days(next, p.end) < 15) remove.add(p.id);
    }
  d.people = d.people.filter((p) => !remove.has(p.id));
  await reconcile(d, original, { ...options, today });
  return { data: d, changed: JSON.stringify(d) !== JSON.stringify(original) };
}
export function copyPlan(plan, name) {
  const map = new Map(
    [...plan.groups, ...plan.parents].map((g) => [g.id, uid()]),
  );
  return {
    id: uid(),
    name,
    ...(plan.rootOrder
      ? { rootOrder: layoutIds(plan).map((id) => map.get(id)) }
      : {}),
    groups: plan.groups.map((g) => ({ ...clone(g), id: map.get(g.id) })),
    parents: plan.parents.map((p) => ({
      ...clone(p),
      id: map.get(p.id),
      groupIds: p.groupIds.map((id) => map.get(id)),
    })),
  };
}
export function validateData(d) {
  if (!d || d.schemaVersion !== SCHEMA)
    throw Error(
      "지원하지 않는 데이터 스키마입니다. 원본은 변경하지 않았습니다.",
    );
  const fail = () => {
    throw Error(
      "데이터 구조 또는 참조가 손상되었습니다. 원본은 변경하지 않았습니다.",
    );
  };
  if (
    d.initialized !== true ||
    !Number.isSafeInteger(d.saveVersion) ||
    d.saveVersion < 0 ||
    typeof d.projectName !== "string" ||
    typeof d.partName !== "string"
  )
    fail();
  for (const key of [
    "people",
    "companies",
    "roles",
    "technologies",
    "plans",
    "representativeIds",
    "phases",
  ])
    if (!Array.isArray(d[key])) fail();
  const unique = (list) =>
    new Set(list.map((x) => x.id)).size === list.length &&
    list.every(
      (x) => typeof x.id === "string" && /^[A-Za-z0-9_-]+$/.test(x.id),
    );
  for (const key of ["people", "companies", "roles", "technologies", "plans"])
    if (!unique(d[key])) fail();
  if (
    !d.plans.length ||
    !d.plans.some((p) => p.id === d.appliedPlanId) ||
    !d.targets ||
    typeof d.targets !== "object"
  )
    fail();
  if (
    Object.keys(d.targets).some((y) => !/^\d{4}$/.test(y) || Number(y) < 1000)
  )
    fail();
  if (
    Object.values(d.targets).some(
      (x) => x !== null && (!Number.isSafeInteger(x) || x < 0),
    )
  )
    fail();
  for (const c of d.companies)
    if (
      !c.name ||
      !["정직원", "BP", "AGS"].includes(c.type) ||
      typeof c.active !== "boolean"
    )
      fail();
  for (const key of ["roles", "technologies"])
    for (const x of d[key])
      if (!x.name || typeof x.active !== "boolean") fail();
  const personIds = new Set(d.people.map((p) => p.id)),
    refs = (list, id) => id === null || list.some((x) => x.id === id);
  for (const p of d.people) {
    if (
      p.representativeReleased !== undefined &&
      typeof p.representativeReleased !== "boolean"
    )
      fail();
    if (
      !["tbd", "confirmed"].includes(p.kind) ||
      !p.name ||
      typeof p.everStarted !== "boolean" ||
      !p.extra ||
      !refs(d.companies, p.companyId) ||
      !refs(d.roles, p.roleId) ||
      !refs(d.technologies, p.techId)
    )
      fail();
    dateValue(p.start);
    dateValue(p.end);
    if (p.end < p.start) fail();
    for (const key of [
      "skt",
      "doss",
      "devdi",
      "mydesk",
      "local",
      "seat",
      "memo",
    ])
      if (p.extra[key] !== null && typeof p.extra[key] !== "string") fail();
    if (
      p.kind === "confirmed" &&
      (!p.companyId || (typeOf(d, p) !== "정직원" && (!p.roleId || !p.techId)))
    )
      fail();
  }
  for (const plan of d.plans) {
    if (
      !plan.name ||
      !Array.isArray(plan.groups) ||
      !Array.isArray(plan.parents) ||
      !unique(plan.groups) ||
      !unique(plan.parents)
    )
      fail();
    if (!unique([...plan.groups, ...plan.parents])) fail();
    if (
      plan.rootOrder !== undefined &&
      (!Array.isArray(plan.rootOrder) ||
        new Set(plan.rootOrder).size !== plan.rootOrder.length ||
        plan.rootOrder.some((id) => !layoutIds(plan).includes(id)))
    )
      fail();
    const members = new Set(),
      groupIds = new Set();
    for (const g of plan.groups) {
      if (
        !g.name ||
        !Array.isArray(g.members) ||
        !g.members.length ||
        g.members.some((id) => !personIds.has(id) || members.has(id)) ||
        new Set(g.members).size !== g.members.length ||
        (g.leaderId !== null && !g.members.includes(g.leaderId))
      )
        fail();
      g.members.forEach((id) => members.add(id));
    }
    for (const p of plan.parents) {
      if (
        !p.name ||
        !Array.isArray(p.groupIds) ||
        !p.groupIds.length ||
        new Set(p.groupIds).size !== p.groupIds.length ||
        p.groupIds.some(
          (id) => !plan.groups.some((g) => g.id === id) || groupIds.has(id),
        )
      )
        fail();
      p.groupIds.forEach((id) => groupIds.add(id));
      if (
        p.leaderId !== null &&
        !p.groupIds
          .flatMap((id) => plan.groups.find((g) => g.id === id).members)
          .includes(p.leaderId)
      )
        fail();
    }
    const names = [...plan.groups, ...plan.parents].map((x) => x.name);
    if (new Set(names).size !== names.length) fail();
  }
  if (new Set(d.plans.map((p) => p.name)).size !== d.plans.length) fail();
  if (
    new Set(d.people.filter((p) => p.kind === "tbd").map((p) => p.name))
      .size !== d.people.filter((p) => p.kind === "tbd").length
  )
    fail();
  if (
    new Set(d.representativeIds).size !== d.representativeIds.length ||
    d.representativeIds.some((id) => !personIds.has(id)) ||
    (d.chiefId !== null && !personIds.has(d.chiefId))
  )
    fail();
  const reps = d.representativeIds.map((id) =>
    d.people.find((p) => p.id === id),
  );
  if (
    reps.some(
      (p) => !["BP", "AGS"].includes(typeOf(d, p)) || !p.roleId || !p.techId,
    ) ||
    new Set(reps.map(repKey)).size !== reps.length
  )
    fail();
  for (const p of d.phases) {
    if (
      !Array.isArray(p) ||
      p.length !== 5 ||
      p.some((x) => typeof x !== "string") ||
      !p[0]
    )
      fail();
    p.slice(1).forEach(dateValue);
    if (p[2] < p[1] || p[4] < p[3]) fail();
  }
  return d;
}
export function sortedPeople(
  d,
  list,
  column = null,
  descending = false,
  t = todayKST(),
) {
  const compare = (a, b) => String(a).localeCompare(String(b), "ko");
  const rank = (x, values) =>
    x == null ? 999 : values.indexOf(x) < 0 ? values.length : values.indexOf(x);
  const value = (p, key) =>
    ({
      name: p.name,
      state: status(p, t),
      type: typeOf(d, p),
      company: nameOf(d.companies, p.companyId) || null,
      role: p.roleId,
      tech: p.techId,
      start: p.start,
      end: p.end === FOREVER ? null : p.end,
      group:
        d.plans
          .find((x) => x.id === d.appliedPlanId)
          ?.groups.find((g) => g.members.includes(p.id))?.name ?? null,
    })[key];
  const cmp = (a, b, key) => {
    const x = value(a, key),
      y = value(b, key);
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
    let z;
    const values = {
      state: ["투입 중", "투입 예정", "TBD", "종료"],
      type: ["정직원", "BP", "AGS"],
      role: ["designer", "developer"],
      tech: ["fs", "be", "fe"],
    }[key];
    if (values) {
      z = rank(x, values) - rank(y, values);
      if (!z && x !== y)
        z = compare(
          key === "role"
            ? nameOf(d.roles, x)
            : key === "tech"
              ? nameOf(d.technologies, x)
              : x,
          key === "role"
            ? nameOf(d.roles, y)
            : key === "tech"
              ? nameOf(d.technologies, y)
              : y,
        );
    } else z = compare(x, y);
    return z;
  };
  return [...list].sort((a, b) => {
    if (column) {
      const x = value(a, column),
        y = value(b, column),
        z = cmp(a, b, column);
      return (
        (x == null || y == null ? z : descending ? -z : z) ||
        compare(a.name, b.name) ||
        d.people.indexOf(a) - d.people.indexOf(b)
      );
    }
    const focal = (p) => typeOf(d, p) === "정직원" && p.roleId === "focal";
    if (focal(a) !== focal(b)) return focal(a) ? -1 : 1;
    if (focal(a)) return compare(a.name, b.name);
    for (const key of [
      "state",
      "type",
      "role",
      "tech",
      "start",
      "end",
      "name",
    ]) {
      if (
        key === "tech" &&
        typeOf(d, a) === "정직원" &&
        typeOf(d, b) === "정직원" &&
        !a.roleId &&
        !b.roleId
      )
        return compare(a.name, b.name);
      const z = cmp(a, b, key);
      if (z) return z;
    }
    return d.people.indexOf(a) - d.people.indexOf(b);
  });
}

// Calendar position, not actual task completion. Includes both ends of each period.
export function phaseTimeline(phases, today = todayKST()) {
  dateValue(today);
  if (!phases.length)
    return { rows: [], ticks: [], current: [], position: null, range: "empty" };
  const allDates = phases.flatMap((p) => p.slice(1));
  allDates.forEach(dateValue);
  const start = allDates.reduce((a, b) => (a < b ? a : b)),
    end = allDates.reduce((a, b) => (a > b ? a : b));
  const first = dateValue(start),
    duration = dateValue(end) - first + 86400000;
  const at = (date) => ((dateValue(date) - first) / duration) * 100;
  const rows = phases.map(([name, ds, de, cs, ce]) => ({
    name,
    periods: [
      ["설계", ds, de],
      ["개발", cs, ce],
    ].map(([kind, start, end]) => {
      if (end < start)
        throw Error("Phase 종료일은 시작일보다 빠를 수 없습니다.");
      return {
        kind,
        start,
        end,
        left: at(start),
        width: ((days(start, end) * 86400000) / duration) * 100,
        state: today < start ? "upcoming" : today > end ? "past" : "current",
      };
    }),
  }));
  const ticks = [{ date: start, left: 0 }];
  let year = Number(start.slice(0, 4)),
    month = Number(start.slice(5, 7));
  while (year <= Number(end.slice(0, 4))) {
    if ([1, 4, 7, 10].includes(month)) {
      const date = `${year}-${String(month).padStart(2, "0")}-01`;
      if (date > start && date <= end && at(date) < 95)
        ticks.push({ date, left: at(date) });
    }
    month++;
    if (month === 13) {
      year++;
      month = 1;
    }
    if (`${year}-${String(month).padStart(2, "0")}-01` > end) break;
  }
  // Keep both ends readable for very short custom schedules as well.
  const readable = ticks.filter(
    (t, i) => i === 0 || (t.left >= 8 && t.left <= 92),
  );
  if (days(start, end) > 1) readable.push({ date: end, left: 100 });
  return {
    rows,
    ticks: readable,
    start,
    end,
    position: Math.max(0, Math.min(100, at(today))),
    range: today < start ? "before" : today > end ? "after" : "during",
    current: rows.flatMap((row) =>
      row.periods
        .filter((p) => p.state === "current")
        .map((p) => `${row.name} ${p.kind}`),
    ),
  };
}
