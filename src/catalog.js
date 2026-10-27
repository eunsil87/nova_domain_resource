import { CATALOG_BASELINE } from "./catalog-baseline.js";
export const CATALOG_LEVELS = [
  { key: "domains", label: "도메인", parent: null },
  { key: "l2", label: "L2", parent: "domains" },
  { key: "subcomponents", label: "Sub Component", parent: "l2" },
  { key: "l3", label: "L3", parent: "subcomponents" },
  { key: "l4", label: "L4", parent: "l3" },
];
export function emptyCatalog() {
  return {
    version: 1,
    sourceVersion: null,
    domains: [],
    l2: [],
    subcomponents: [],
    l3: [],
    l4: [],
  };
}
export function baselineCatalog() {
  return structuredClone(CATALOG_BASELINE);
}
export function catalogLevel(key) {
  const level = CATALOG_LEVELS.find((x) => x.key === key);
  if (!level) throw Error("유효한 Catalog 계층이 아닙니다.");
  return level;
}
export function catalogPath(catalog, key, id) {
  const path = [];
  let level = catalogLevel(key),
    node = catalog[key].find((x) => x.id === id);
  while (node) {
    path.unshift({ ...node, level: level.key });
    if (!level.parent) break;
    level = catalogLevel(level.parent);
    node = catalog[level.key].find((x) => x.id === node.parentId);
  }
  return path;
}
export function catalogRows(
  catalog,
  key,
  filters = {},
  query = "",
  requirement = "all",
  phase = "all",
) {
  catalogLevel(key);
  const q = query.trim().toLocaleLowerCase("ko");
  return catalog[key].filter((node) => {
    const path = catalogPath(catalog, key, node.id);
    return (
      Object.entries(filters).every(
        ([level, id]) =>
          !id || path.some((p) => p.level === level && p.id === id),
      ) &&
      (!q ||
        [node.code, node.name, node.koreanName, node.description].some(
          (value) =>
            String(value ?? "")
              .toLocaleLowerCase("ko")
              .includes(q),
        )) &&
      (key !== "l4" ||
        phase === "all" ||
        (phase === "unassigned"
          ? node.phase == null
          : node.phase === Number(phase))) &&
      (key !== "l4" ||
        requirement === "all" ||
        node.required === (requirement === "required"))
    );
  });
}
export function catalogCounts(catalog) {
  return {
    ...Object.fromEntries(
      CATALOG_LEVELS.map((l) => [l.key, catalog[l.key].length]),
    ),
    required: catalog.l4.filter((x) => x.required).length,
    optional: catalog.l4.filter((x) => !x.required).length,
  };
}
export function upsertCatalogNode(catalog, key, input, id = null) {
  const level = catalogLevel(key),
    old = id ? catalog[key].find((x) => x.id === id) : null;
  if (id && !old) throw Error("수정할 항목이 없습니다.");
  const code = String(input.code ?? "").trim(),
    name =
      String(input.name ?? "").trim() ||
      (catalog.version === 2 ? String(input.koreanName ?? " ").trim() : ""),
    koreanName = String(input.koreanName ?? "").trim() || null,
    parentId = level.parent ? input.parentId || null : null;
  if (
    catalog.version === 2 &&
    ["subcomponents", "l3", "l4"].includes(key) &&
    !koreanName
  )
    throw Error("한글 명칭을 입력해 주세요.");
  if (!code || !name) throw Error("ID와 명칭을 입력해 주세요.");
  if (code.length > 120 || name.length > 200 || (koreanName?.length ?? 0) > 200)
    throw Error("ID는 120자, 명칭은 200자 이내로 입력해 주세요.");
  if (catalog[key].some((x) => x.id !== id && x.code === code))
    throw Error("같은 계층에 이미 사용 중인 ID입니다.");
  if (level.parent && !catalog[level.parent].some((x) => x.id === parentId))
    throw Error("상위 항목을 선택해 주세요.");
  const node = {
    ...old,
    id: old?.id ?? crypto.randomUUID(),
    code,
    name,
    koreanName,
    parentId,
  };
  if (catalog.version === 1 && key === "subcomponents")
    node.assigneeIds = old?.assigneeIds ?? [];
  if (catalog.version === 2 && ["subcomponents", "l3", "l4"].includes(key)) {
    node.designerId = old
      ? old.designerId
      : key === "subcomponents"
        ? null
        : key === "l3"
          ? catalog.subcomponents.find((sc) => sc.id === parentId).designerId
          : catalogSubcomponent(catalog, "l3", parentId).designerId;
    if (key === "l4") {
      node.developerId = old?.developerId ?? null;
      node.phase = old?.phase ?? null;
    }
  }
  if (key === "l4") {
    node.description = String(input.description ?? "").trim() || null;
    if (typeof input.required !== "boolean")
      throw Error("필수/옵션을 선택해 주세요.");
    node.required = input.required;
    if ((node.description?.length ?? 0) > 20000)
      throw Error("기능 설명은 20,000자 이내로 입력해 주세요.");
  }
  if (old) catalog[key][catalog[key].findIndex((x) => x.id === id)] = node;
  else catalog[key].push(node);
  return node;
}
export function deleteCatalogNode(catalog, key, id) {
  const level = catalogLevel(key),
    node = catalog[key].find((x) => x.id === id);
  if (!node) throw Error("삭제할 항목이 없습니다.");
  const child = CATALOG_LEVELS.find((x) => x.parent === key),
    count = child
      ? catalog[child.key].filter((x) => x.parentId === id).length
      : 0;
  if (count)
    throw Error(
      `하위 ${child.label} ${count}건을 먼저 이동하거나 삭제해 주세요.`,
    );
  if (
    (key === "subcomponents" && node.assigneeIds?.length) ||
    node.designerId ||
    node.developerId
  )
    throw Error("담당자 연결을 먼저 해제해 주세요.");
  catalog[key] = catalog[key].filter((x) => x.id !== id);
}
export function setCatalogAssignees(data, subcomponentId, ids, today) {
  if (data.catalog?.version !== 1)
    throw Error("복수 담당자 편집은 이전 형식에서만 지원합니다.");
  const node = data.catalog?.subcomponents.find((x) => x.id === subcomponentId);
  if (!node) throw Error("담당자를 연결할 Sub Component가 없습니다.");
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length)
    throw Error("담당자를 중복 선택할 수 없습니다.");
  for (const id of ids) {
    const p = data.people.find((p) => p.id === id);
    if (!p) throw Error("선택한 인력이 없습니다.");
    if (
      p.kind === "confirmed" &&
      p.end < today &&
      !node.assigneeIds.includes(id)
    )
      throw Error("종료 인력을 새 담당자로 지정할 수 없습니다.");
  }
  node.assigneeIds = [...ids];
}
export function cleanCatalogAssignments(data) {
  if (!data.catalog) return;
  const ids = new Set(data.people.map((p) => p.id));
  for (const level of CATALOG_LEVELS)
    for (const node of data.catalog[level.key]) {
      if (node.assigneeIds)
        node.assigneeIds = node.assigneeIds.filter((id) => ids.has(id));
      if (node.legacyAssigneeIds)
        node.legacyAssigneeIds = node.legacyAssigneeIds.filter((id) =>
          ids.has(id),
        );
      if (node.designerId && !ids.has(node.designerId)) node.designerId = null;
      if (node.developerId && !ids.has(node.developerId))
        node.developerId = null;
    }
}
export function validateCatalog(catalog, people) {
  if (catalog === undefined) return;
  const fail = () => {
    throw Error(
      "Catalog 데이터 구조 또는 참조가 올바르지 않습니다. 원본을 유지합니다.",
    );
  };
  if (
    !catalog ||
    ![1, 2].includes(catalog.version) ||
    !(
      catalog.sourceVersion === null ||
      typeof catalog.sourceVersion === "string"
    )
  )
    fail();
  const allIds = new Set(),
    peopleIds = new Set(people.map((p) => p.id));
  for (const level of CATALOG_LEVELS) {
    if (!Array.isArray(catalog[level.key])) fail();
    const codes = new Set();
    for (const node of catalog[level.key]) {
      if (
        !node ||
        typeof node.id !== "string" ||
        !/^[A-Za-z0-9_-]+$/.test(node.id) ||
        allIds.has(node.id) ||
        typeof node.code !== "string" ||
        !node.code.trim() ||
        node.code !== node.code.trim() ||
        codes.has(node.code) ||
        typeof node.name !== "string" ||
        !node.name.trim() ||
        !(node.koreanName === null || typeof node.koreanName === "string")
      )
        fail();
      allIds.add(node.id);
      codes.add(node.code);
      if (
        level.parent
          ? !catalog[level.parent].some((x) => x.id === node.parentId)
          : node.parentId !== null
      )
        fail();
      if (
        catalog.version === 1 &&
        level.key === "subcomponents" &&
        (!Array.isArray(node.assigneeIds) ||
          new Set(node.assigneeIds).size !== node.assigneeIds.length ||
          node.assigneeIds.some((id) => !peopleIds.has(id)))
      )
        fail();
      if (catalog.version === 2) {
        if (
          ["subcomponents", "l3", "l4"].includes(level.key) &&
          node.designerId !== null &&
          !peopleIds.has(node.designerId)
        )
          fail();
        if (
          level.key === "l4" &&
          ((node.developerId !== null && !peopleIds.has(node.developerId)) ||
            ![null, 1, 2, 3].includes(node.phase))
        )
          fail();
        if (
          node.legacyAssigneeIds !== undefined &&
          (!Array.isArray(node.legacyAssigneeIds) ||
            new Set(node.legacyAssigneeIds).size !==
              node.legacyAssigneeIds.length ||
            node.legacyAssigneeIds.some((id) => !peopleIds.has(id)))
        )
          fail();
        if (node.assigneeIds !== undefined) fail();
      }
      if (
        level.key === "l4" &&
        (typeof node.required !== "boolean" ||
          !(node.description === null || typeof node.description === "string"))
      )
        fail();
    }
  }
}

export function catalogDisplayName(key, node) {
  return ["subcomponents", "l3", "l4"].includes(key)
    ? node.koreanName || "한글 명칭 미등록"
    : node.name;
}
export function upgradeCatalog(catalog, choices = {}) {
  if (catalog.version === 2) return structuredClone(catalog);
  if (catalog.version !== 1) throw Error("지원하지 않는 Catalog 버전입니다.");
  const next = structuredClone(catalog);
  next.version = 2;
  for (const sc of next.subcomponents) {
    const ids = sc.assigneeIds;
    let chosen;
    if (Object.hasOwn(choices, sc.id)) {
      chosen = choices[sc.id];
      if (chosen !== null && !ids.includes(chosen))
        throw Error("기존 담당자 중 설계자를 선택해 주세요.");
    } else if (ids.length > 1)
      throw Error(`${sc.code} 설계자를 선택해 주세요.`);
    else chosen = ids[0] ?? null;
    sc.designerId = chosen;
    sc.legacyAssigneeIds = [...ids];
    delete sc.assigneeIds;
  }
  for (const n of next.l3)
    n.designerId = next.subcomponents.find(
      (sc) => sc.id === n.parentId,
    ).designerId;
  for (const n of next.l4) {
    const l3 = next.l3.find((x) => x.id === n.parentId);
    n.designerId = next.subcomponents.find(
      (sc) => sc.id === l3.parentId,
    ).designerId;
    n.developerId = null;
    n.phase = null;
  }
  return next;
}
export function catalogSubcomponent(catalog, key, id) {
  return (
    catalogPath(catalog, key, id).find((n) => n.level === "subcomponents") ??
    null
  );
}
export function setCatalogDesigner(data, key, id, personId, today) {
  if (
    data.catalog?.version !== 2 ||
    !["subcomponents", "l3", "l4"].includes(key)
  )
    throw Error("단일 담당자 전환 후 설계자를 지정해 주세요.");
  const n = data.catalog[key].find((x) => x.id === id);
  if (!n) throw Error("항목이 없습니다.");
  checkCatalogPerson(data, personId, n.designerId, today);
  const previous = n.designerId;
  n.designerId = personId;
  if (key === "subcomponents") {
    const children = data.catalog.l3.filter((x) => x.parentId === id),
      ids = new Set(children.map((x) => x.id));
    for (const child of [
      ...children,
      ...data.catalog.l4.filter((x) => ids.has(x.parentId)),
    ])
      if (child.designerId === previous) child.designerId = personId;
  }
}
export function checkCatalogPerson(data, id, oldId, today) {
  if (id === null) return;
  const p = data.people.find((p) => p.id === id);
  if (!p) throw Error("선택한 인력이 없습니다.");
  if (p.kind === "confirmed" && p.end < today && oldId !== id)
    throw Error("종료 인력을 새 담당자로 지정할 수 없습니다.");
}
export function setCatalogDeveloper(data, id, personId, today) {
  if (data.catalog?.version !== 2)
    throw Error("단일 담당자 전환 후 지정해 주세요.");
  const n = data.catalog.l4.find((x) => x.id === id);
  if (!n) throw Error("L4 항목이 없습니다.");
  checkCatalogPerson(data, personId, n.developerId, today);
  n.developerId = personId;
}
export function setCatalogPhase(catalog, id, phase) {
  const n = catalog.l4.find((x) => x.id === id);
  if (catalog.version !== 2 || !n) throw Error("L4 항목이 없습니다.");
  if (![null, 1, 2, 3].includes(phase))
    throw Error("Phase는 1~3 중 하나 또는 미지정이어야 합니다.");
  n.phase = phase;
}
export function catalogPersonLinks(data, id) {
  if (!data.catalog) return [];
  const links = [];
  for (const level of CATALOG_LEVELS)
    for (const n of data.catalog[level.key]) {
      if (
        n.assigneeIds?.includes(id) ||
        n.designerId === id ||
        n.developerId === id ||
        n.legacyAssigneeIds?.includes(id)
      )
        links.push(n);
    }
  return links;
}
