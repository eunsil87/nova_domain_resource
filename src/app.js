import {
  SCHEMA,
  FOREVER,
  clone,
  uid,
  todayKST,
  dateValue,
  normalizeDate,
  days,
  addDays,
  typeOf,
  status,
  nameOf,
  nextName,
  seed,
  annualMM,
  totals,
  needed,
  validatePerson,
  eligibleRep,
  repKey,
  appoint,
  cleanGroups,
  reconcile,
  startup,
  copyPlan,
  validateData,
  sortedPeople,
  layoutIds,
  moveGroup,
  moveParent,
  phaseTimeline,
} from "./core.js";
import { FolderStore, rememberHandle, recalledHandle } from "./storage.js";
import { CATALOG_BASELINE } from "./catalog-baseline.js";
import {
  CATALOG_LEVELS,
  baselineCatalog,
  emptyCatalog,
  catalogLevel,
  catalogPath,
  catalogRows,
  catalogCounts,
  upsertCatalogNode,
  deleteCatalogNode,
  upgradeCatalog,
  catalogDisplayName,
  catalogSubcomponent,
  setCatalogDesigner,
  setCatalogDeveloper,
  setCatalogPhase,
  catalogPersonLinks,
} from "./catalog.js";
const $ = (s) => document.querySelector(s),
  esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const mm = (n) =>
  (n / 1000).toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
const state = {
  data: null,
  store: null,
  handle: null,
  dirty: false,
  page: "annual",
  year: Number(todayKST().slice(0, 4)),
  viewPlan: null,
  sort: null,
  desc: false,
  ended: false,
  range: 30,
  settings: "project",
  ready: false,
  error: "",
  busy: false,
  remembered: false,
  scroll: 0,
  catalogLevel: "l4",
  catalogFilters: {},
  catalogQuery: "",
  catalogRequirement: "all",
  catalogPhase: "all",
};
const labels = {
  annual: "연간 현황",
  people: "인력 관리",
  groups: "그룹 설정",
  catalog: "Catalog 관리",
  settings: "기본 설정",
};
const dialogs = [];
let toastTimer;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 7000);
}
function option(value, label, selected = false) {
  return `<option value="${esc(value)}" ${selected ? "selected" : ""}>${esc(label)}</option>`;
}
function select(
  name,
  list,
  current,
  { blank = true, disabled = false, filter = () => true } = {},
) {
  return `<select name="${name}" ${disabled ? "disabled" : ""}>${blank ? option("", "선택 안 함", !current) : ""}${list
    .filter((x) => filter(x) && (x.active !== false || x.id === current))
    .map((x) => option(x.id, x.name, x.id === current))
    .join("")}</select>`;
}
function field(label, content, full = false, hint = "") {
  return `<label class="field ${full ? "full" : ""}"><span>${label}</span>${content}${hint ? `<span class="hint">${hint}</span>` : ""}</label>`;
}
function textInput(name, value = "", attributes = "") {
  return `<input name="${name}" value="${esc(value)}" ${attributes}>`;
}
function dateInput(name, value, min = null) {
  return `<div class="date-inputs">${textInput(name, value === "9999-12-31" ? "" : value, 'type="text" inputmode="numeric" placeholder="YYYYMMDD" maxlength="10" autocomplete="off"')}<label class="calendar" title="달력 선택"><span aria-hidden="true">▦</span><input type="date" aria-label="${name === "start" ? "시작일" : "종료일"} 달력" data-calendar="${name}" value="${value === FOREVER ? "" : esc(value)}" ${min ? `min="${min}"` : ""}></label></div>`;
}
function button(action, label, cls = "", attrs = "") {
  return `<button type="button" data-action="${action}" class="${cls}" ${attrs}>${label}</button>`;
}
function activePlan() {
  return state.data.plans.find((p) => p.id === state.data.appliedPlanId);
}
function viewedPlan() {
  return state.data.plans.find((p) => p.id === state.viewPlan) || activePlan();
}
function groupOf(id, plan = activePlan()) {
  return plan.groups.find((g) => g.members.includes(id));
}
function snapshotForm(form) {
  return JSON.stringify([...new FormData(form)]);
}
function dialog({
  title,
  body,
  apply = "적용",
  onApply,
  left = "",
  wide = false,
  guard = true,
  onClose,
  setup,
}) {
  const previous = document.activeElement;
  const layer = document.createElement("div");
  layer.className = "modal-layer" + (!state.ready ? " startup" : "");
  const id = "dialog-" + uid();
  layer.innerHTML = `<form class="dialog ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="${id}"><div class="dialog-head"><h2 id="${id}">${esc(title)}</h2><button type="button" data-close aria-label="닫기" class="ghost">✕</button></div><div class="dialog-body">${body}<div class="error" role="alert" hidden></div></div><div class="dialog-foot"><div>${left}</div><div class="right"><button type="button" data-close>취소</button>${onApply ? `<button class="primary" type="submit">${apply}</button>` : ""}</div></div></form>`;
  for (const x of dialogs) {
    x.layer.inert = true;
    x.layer.style.visibility = "hidden";
  }
  $("#modals").append(layer);
  const form = layer.querySelector("form");
  let baseline;
  let closed = false;
  const item = {
    layer,
    form,
    close,
    isDirty: () => guard && snapshotForm(form) !== baseline,
    refreshBaseline: () => (baseline = snapshotForm(form)),
  };
  dialogs.push(item);
  function finish() {
    if (closed) return;
    closed = true;
    dialogs.splice(dialogs.indexOf(item), 1);
    layer.remove();
    const parent = dialogs.at(-1);
    if (parent) {
      parent.layer.inert = false;
      parent.layer.style.visibility = "";
    }
    previous?.focus();
  }
  async function close(force = false) {
    if (!force && guard && snapshotForm(form) !== baseline) {
      if (
        !(await confirmDialog(
          "변경 내용을 버리시겠습니까?",
          "팝업의 미적용 변경만 버립니다. 이미 적용한 변경은 유지됩니다.",
          "버리기",
        ))
      )
        return;
    }
    finish();
    onClose?.();
  }
  layer
    .querySelectorAll("[data-close]")
    .forEach((b) => (b.onclick = () => close()));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!onApply || form.classList.contains("busy")) return;
    const err = form.querySelector(".error");
    err.hidden = true;
    form.classList.add("busy");
    try {
      const result = await onApply(form, item);
      if (result !== false) finish();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      err.scrollIntoView({ block: "nearest" });
    } finally {
      form.classList.remove("busy");
    }
  });
  form.addEventListener("change", (e) => {
    if (e.target.dataset.calendar) {
      const input = form.elements[e.target.dataset.calendar];
      input.value = e.target.value;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (e.target.name === "start" || e.target.name === "end") {
      try {
        const normalized = normalizeDate(e.target.value);
        if (normalized) e.target.value = normalized;
      } catch {}
    }
  });
  layer.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
    if (e.key === "Tab") {
      const els = [
        ...form.querySelectorAll("button,input,select,textarea,[tabindex]"),
      ].filter((x) => !x.disabled && x.offsetParent !== null);
      const first = els[0],
        last = els.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  });
  setup?.(form, item);
  baseline = snapshotForm(form);
  setTimeout(
    () =>
      form
        .querySelector("input:not([type=hidden]),select,textarea,button")
        ?.focus(),
    0,
  );
  return item;
}
function confirmDialog(title, body, apply = "확인") {
  return new Promise((resolve) =>
    dialog({
      title,
      body: `<p>${esc(body)}</p>`,
      apply,
      guard: false,
      onApply: () => resolve(true),
      onClose: () => resolve(false),
    }),
  );
}
function choose(title, people, metadata = state.data || seed()) {
  return new Promise((resolve) =>
    dialog({
      title,
      body: `<p class="muted">후보를 선택해야 작업을 완료할 수 있습니다. 취소하면 원래 작업도 반영하지 않습니다.</p><div class="choice-list">${people.map((p) => `<label><input type="radio" name="candidate" value="${esc(p.id)}" required><span><strong>${esc(p.name)}</strong><br><small>${esc(nameOf(metadata.roles, p.roleId))} · ${esc(nameOf(metadata.technologies, p.techId))}</small></span></label>`).join("")}</div>`,
      apply: "선택",
      guard: false,
      onApply: (f) => resolve(f.elements.candidate.value),
      onClose: () => resolve(null),
    }),
  );
}
function commit(data) {
  validateData(data);
  if (JSON.stringify(data) !== JSON.stringify(state.data)) {
    state.data = data;
    state.dirty = true;
  }
  render(true);
}
async function mutate(fn, { refs = false } = {}) {
  const before = state.data,
    d = clone(before);
  await fn(d);
  const notices = refs ? await reconcile(d, before, { choose }) : [];
  commit(d);
  if (notices.length) toast(notices.join("\n"));
}
function render(keepScroll = false) {
  const scroll = keepScroll ? window.scrollY : 0;
  if (!state.ready) {
    renderConnection();
    return;
  }
  const d = state.data;
  $("#app").innerHTML =
    `<aside class="sidebar"><div class="brand">${esc(d.projectName)}</div><div class="brand-sub">FOCAL WORKSPACE</div><nav aria-label="주 메뉴">${Object.entries(
      labels,
    )
      .map(([key, label]) =>
        button(
          "page",
          label,
          state.page === key ? "active" : "",
          `data-page="${key}" ${state.page === key ? 'aria-current="page"' : ""}`,
        ),
      )
      .join(
        "",
      )}</nav><footer><span>${esc(d.partName)}</span><small>Focal · 개인 워크스페이스</small></footer></aside><header><strong>${esc(d.partName)}</strong><div class="actions"><span class="saved ${state.dirty ? "unsaved" : ""}" role="status">${state.dirty ? "저장하지 않은 변경 사항" : "저장 완료"}</span>${button("save", state.busy ? "저장 중…" : "저장", "primary", state.busy ? "disabled" : "")}</div></header><main class="${state.page === "catalog" ? "catalog-page" : ""}">${{ annual: annualView, people: peopleView, groups: groupsView, catalog: catalogView, settings: settingsView }[state.page]()}</main>`;
  window.scrollTo(0, scroll);
  bindMain();
}
function heading(title, desc, actions = "") {
  return `<div class="heading"><div><h1>${esc(title)}</h1><p>${esc(desc)}</p></div><div class="actions">${actions}</div></div>`;
}
function catalogLabel(node, key = node.level) {
  const name = catalogDisplayName(key, node);
  return node.code === name ? node.code : `${node.code} · ${name}`;
}
function selectedCatalogFilters(key = state.catalogLevel) {
  const index = CATALOG_LEVELS.findIndex((l) => l.key === key);
  return Object.fromEntries(
    CATALOG_LEVELS.slice(0, index).map((l) => [
      l.key,
      state.catalogFilters[l.key] || null,
    ]),
  );
}
function catalogOwnerSelect(value, attributes = "") {
  const people = sortedPeople(
    state.data,
    state.data.people.filter((p) => status(p) !== "종료" || p.id === value),
  );
  return `<select ${attributes} aria-label="${attributes.includes("developer") ? "개발자" : "설계자"}">${option("", "미지정", !value)}${people.map((p) => option(p.id, p.name + (p.kind === "tbd" ? " · TBD" : status(p) === "종료" ? " · 종료" : ""), p.id === value)).join("")}</select>`;
}
function catalogPhaseSelect(value, attributes = "") {
  return `<select ${attributes} aria-label="L4 Phase">${option("", "미지정", value == null)}${[1, 2, 3].map((n) => option(n, "Phase " + n, n === value)).join("")}</select>`;
}
function catalogOwnerCell(key, n) {
  const sc = catalogSubcomponent(state.data.catalog, key, n.id),
    person = state.data.people.find((p) => p.id === n.designerId);
  return `<div class="catalog-assignment ${person?.kind === "tbd" ? "is-tbd" : ""}">${catalogOwnerSelect(n.designerId, `data-catalog-designer="${n.id}" data-level="${key}"`)}${key !== "subcomponents" ? `<small>${n.designerId === sc?.designerId ? "SC와 동일" : "개별 지정"}</small>` : ""}</div>`;
}
function catalogContext(c) {
  const sc = c.subcomponents.find(
      (n) => n.id === state.catalogFilters.subcomponents,
    ),
    l3 = c.l3.find((n) => n.id === state.catalogFilters.l3);
  if (!sc) return "";
  return `<section class="catalog-context"><div><strong>Sub Component 설계자</strong><span>${esc(catalogDisplayName("subcomponents", sc))}</span>${catalogOwnerSelect(sc.designerId, `id="catalog-context-sc"`)}${button("catalog-context-designer", "변경", "small", `data-id="${sc.id}"`)}<small>현재 기존 설계자와 같은 하위 L3·L4만 함께 변경됩니다.</small></div>${l3 ? `<div><strong>L3 ${esc(catalogDisplayName("l3", l3))}</strong>${catalogOwnerSelect(l3.designerId, `data-catalog-designer="${l3.id}" data-level="l3"`)}</div>` : ""}</section>`;
}
function catalogView() {
  const c = state.data.catalog,
    counts = catalogCounts(c ?? CATALOG_BASELINE);
  const intro = heading(
    "Catalog 관리",
    "기능 구조와 설계·개발 담당자를 한눈에 관리합니다.",
    button(
      "catalog-chart-pending",
      "할당 현황",
      "",
      'disabled title="집계 기준을 확정한 뒤 제공합니다"',
    ) +
      (c?.version === 2
        ? button(
            "catalog-add",
            catalogLevel(state.catalogLevel).label + " 추가",
            "primary",
          )
        : ""),
  );
  if (!c)
    return (
      intro +
      `<section class="card catalog-welcome"><h2>서비스오더 Catalog 시작하기</h2><p>기준 자료를 불러오거나 빈 Catalog에서 시작할 수 있습니다. 기존 인력·그룹은 유지됩니다.</p><div class="catalog-counts">${CATALOG_LEVELS.map((l) => `<div><strong>${counts[l.key]}</strong><small>${l.label}</small></div>`).join("")}</div><p class="muted">L4 필수 ${counts.required}건 · 옵션 ${counts.optional}건</p><div class="actions">${button("catalog-initialize", "서비스오더 v3.0으로 시작", "primary", 'data-mode="baseline"')}${button("catalog-initialize", "빈 Catalog로 시작", "", 'data-mode="empty"')}</div><p class="muted">적용 후 상단 저장을 눌러야 파일에 반영됩니다.</p></section>`
    );
  if (c.version === 1)
    return (
      intro +
      `<section class="card catalog-welcome"><h2>설계·개발 담당자 방식으로 전환</h2><p>기존 복수 담당자에서 Sub Component 설계자 한 명을 정합니다. 하위 L3·L4에 기본 지정하고 L4 개발자와 Phase는 미지정으로 시작합니다.</p><p class="notice">여러 담당자가 있으면 직접 선택합니다. 이전 담당자 목록은 전환 전 정보로 보존하며 자동으로 한 명을 고르지 않습니다. 전환 취소 시 현재 데이터는 그대로입니다.</p><div class="choice-list catalog-assignee-list">${c.subcomponents.map((n) => `<div><strong>${esc(catalogLabel(n, "subcomponents"))}</strong><p class="muted">기존 담당자: ${n.assigneeIds.length ? n.assigneeIds.map((id) => esc(nameOf(state.data.people, id))).join(", ") : "미지정"}</p></div>`).join("")}</div>${button("catalog-upgrade", "담당자 방식 전환", "primary")}</section>`
    );
  const key = state.catalogLevel,
    index = CATALOG_LEVELS.findIndex((l) => l.key === key),
    level = catalogLevel(key),
    list = catalogRows(
      c,
      key,
      selectedCatalogFilters(),
      state.catalogQuery,
      state.catalogRequirement,
      state.catalogPhase,
    );
  const filters = CATALOG_LEVELS.slice(0, index)
    .map((l) =>
      field(
        l.label,
        `<select data-catalog-filter="${l.key}" aria-label="Catalog ${l.label} 필터">${option("", "전체")}${catalogRows(
          c,
          l.key,
          selectedCatalogFilters(l.key),
        )
          .map((n) =>
            option(
              n.id,
              l.key === "l2"
                ? catalogLabel(n, l.key)
                : catalogDisplayName(l.key, n),
              state.catalogFilters[l.key] === n.id,
            ),
          )
          .join("")}</select>`,
      ),
    )
    .join("");
  const rows = list
    .map((n) => {
      const next = CATALOG_LEVELS[index + 1],
        path = catalogPath(c, key, n.id).slice(0, -1),
        childCount = next
          ? c[next.key].filter((x) => x.parentId === n.id).length
          : 0;
      return `<tr data-catalog-row="${n.id}" data-level="${key}" tabindex="0" aria-label="${esc(n.code)} ${esc(catalogDisplayName(key, n))}"><td class="catalog-code">${esc(n.code)}</td><td><strong>${esc(catalogDisplayName(key, n))}</strong></td>${key === "l4" ? `<td><span class="badge ${n.required ? "current" : "tbd"}">${n.required ? "필수" : "옵션"}</span></td><td>${catalogPhaseSelect(n.phase, `data-catalog-phase="${n.id}"`)}</td><td>${catalogOwnerCell(key, n)}</td><td><div class="catalog-assignment ${state.data.people.find((p) => p.id === n.developerId)?.kind === "tbd" ? "is-tbd" : ""}">${catalogOwnerSelect(n.developerId, `data-catalog-developer="${n.id}"`)}</div></td>` : `${index ? `<td class="catalog-path">${path.map((p) => esc(catalogLabel(p))).join(" › ")}</td>` : ""}${["subcomponents", "l3"].includes(key) ? `<td>${catalogOwnerCell(key, n)}</td>` : ""}<td>${next.label} ${childCount}건</td>`}<td><div class="actions">${button("catalog-edit", "수정", "small", `data-level="${key}" data-id="${n.id}"`)}${next ? button("catalog-drill", "하위 보기", "small ghost", `data-level="${key}" data-id="${n.id}"`) : ""}</div></td></tr>`;
    })
    .join("");
  return (
    intro +
    `<div class="catalog-counts">${CATALOG_LEVELS.map((l) => `<button type="button" data-action="catalog-level" data-level="${l.key}" class="${l.key === key ? "selected" : ""}"><strong>${counts[l.key]}</strong><small>${l.label}</small></button>`).join("")}</div><div class="tabs catalog-tabs">${CATALOG_LEVELS.map((l) => button("catalog-level", l.label, l.key === key ? "active" : "", `data-level="${l.key}"`)).join("")}</div><section class="card catalog-filter-panel"><div class="catalog-filters ${key === "l4" ? "l4-filters" : ""}">${filters}${key === "l4" ? field("Phase", `<select id="catalog-phase-filter" aria-label="Catalog Phase 필터">${option("all", "전체", state.catalogPhase === "all")}${option("unassigned", "미지정", state.catalogPhase === "unassigned")}${[1, 2, 3].map((n) => option(n, "Phase " + n, state.catalogPhase === String(n))).join("")}</select>`) : ""}${field("ID·명칭·설명 검색", textInput("catalogQuery", state.catalogQuery, 'id="catalog-query" type="search" maxlength="200" placeholder="검색어 입력"'))}${key === "l4" ? field("필수여부", `<select id="catalog-requirement" aria-label="Catalog 필수여부">${option("all", "전체", state.catalogRequirement === "all")}${option("required", "필수", state.catalogRequirement === "required")}${option("optional", "옵션", state.catalogRequirement === "optional")}</select>`) : ""}</div><div class="catalog-filter-foot"><small>기준 자료 ${c.sourceVersion ? "v" + esc(c.sourceVersion) : "직접 등록"} · L4 필수 ${counts.required} / 옵션 ${counts.optional}</small>${button("catalog-clear-filters", "조회 조건 초기화", "small")}</div></section>${catalogContext(c)}<div class="toolbar"><strong>${level.label} ${list.length}건 <small>전체 ${counts[key]}건</small></strong><small>선택 변경은 현재 작업에 적용되며 파일 반영은 상단 저장을 누릅니다.</small></div><div class="table-wrap"><table class="catalog-table role-catalog"><thead><tr><th>${key === "l4" ? "L4 " : ""}ID</th><th>${key === "l2" ? "영문 명칭" : ["subcomponents", "l3", "l4"].includes(key) ? "한글 기능 명칭" : "명칭"}</th>${key === "l4" ? "<th>필수여부</th><th>Phase</th><th>설계자</th><th>개발자</th>" : `${index ? "<th>상위 경로</th>" : ""}${["subcomponents", "l3"].includes(key) ? "<th>설계자</th>" : ""}<th>하위 항목</th>`}<th>관리</th></tr></thead><tbody>${rows}</tbody></table>${list.length ? "" : '<div class="catalog-empty"><h3>표시할 항목이 없습니다.</h3><p class="muted">조회 조건을 초기화하거나 항목을 추가해 주세요.</p>' + button("catalog-add", level.label + " 추가", "primary") + "</div>"}</div><p class="muted">SC와 동일은 현재 설계자 ID가 같은 상태입니다. 이전 편집 이력과 관계없이 SC의 기존 설계자와 같으면 함께 변경됩니다.</p>`
  );
}
function catalogNavigate(key, id) {
  const c = state.data.catalog,
    index = CATALOG_LEVELS.findIndex((l) => l.key === key);
  if (!CATALOG_LEVELS[index + 1]) {
    catalogNodeDialog(key, id);
    return;
  }
  state.catalogFilters = Object.fromEntries(
    catalogPath(c, key, id).map((n) => [n.level, n.id]),
  );
  state.catalogLevel = CATALOG_LEVELS[index + 1].key;
  state.catalogQuery = "";
  state.catalogRequirement = "all";
  state.catalogPhase = "all";
  render();
}
async function catalogConfirmDesigner(key, id, value) {
  if (key !== "subcomponents") return true;
  const c = state.data.catalog,
    sc = c.subcomponents.find((n) => n.id === id);
  if (sc.designerId === value) return true;
  const l3 = c.l3.filter((n) => n.parentId === id),
    ids = new Set(l3.map((n) => n.id)),
    l4 = c.l4.filter((n) => ids.has(n.parentId));
  return confirmDialog(
    "하위 설계자 함께 변경",
    `${nameOf(state.data.people, sc.designerId) || "미지정"} → ${nameOf(state.data.people, value) || "미지정"}\n현재 기존 설계자와 같은 L3 ${l3.filter((n) => n.designerId === sc.designerId).length}건, L4 ${l4.filter((n) => n.designerId === sc.designerId).length}건만 변경합니다. 다른 설계자는 유지합니다.`,
  );
}
async function catalogApplyDesigner(key, id, value) {
  try {
    if (!(await catalogConfirmDesigner(key, id, value))) {
      render(true);
      return;
    }
    await mutate((d) => setCatalogDesigner(d, key, id, value, todayKST()));
  } catch (e) {
    toast(e.message);
    render(true);
  }
}
function bindCatalog() {
  if (state.page !== "catalog") return;
  document.querySelectorAll("[data-catalog-row]").forEach((row) => {
    row.onclick = (e) => {
      if (e.target.closest("button,select,input")) return;
      catalogNavigate(row.dataset.level, row.dataset.catalogRow);
    };
    row.onkeydown = (e) => {
      if (e.target === row && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        catalogNavigate(row.dataset.level, row.dataset.catalogRow);
      }
    };
  });
  document.querySelectorAll("[data-catalog-filter]").forEach(
    (input) =>
      (input.onchange = () => {
        const key = input.dataset.catalogFilter,
          index = CATALOG_LEVELS.findIndex((l) => l.key === key);
        for (const l of CATALOG_LEVELS.slice(index))
          delete state.catalogFilters[l.key];
        if (input.value)
          for (const n of catalogPath(state.data.catalog, key, input.value))
            state.catalogFilters[n.level] = n.id;
        render(true);
      }),
  );
  const query = $("#catalog-query");
  if (query) {
    let composing = false;
    const update = () => {
      if (!query.isConnected) return;
      const position = query.selectionStart;
      state.catalogQuery = query.value;
      render(true);
      const input = $("#catalog-query");
      input.focus();
      input.setSelectionRange(position, position);
    };
    query.addEventListener("compositionstart", () => (composing = true));
    query.addEventListener("compositionend", () => {
      composing = false;
      update();
    });
    query.addEventListener("input", (e) => {
      if (!composing && !e.isComposing) update();
    });
  }
  const requirement = $("#catalog-requirement");
  if (requirement)
    requirement.onchange = () => {
      state.catalogRequirement = requirement.value;
      render(true);
    };
  const phase = $("#catalog-phase-filter");
  if (phase)
    phase.onchange = () => {
      state.catalogPhase = phase.value;
      render(true);
    };
  document
    .querySelectorAll("[data-catalog-designer]")
    .forEach(
      (input) =>
        (input.onchange = () =>
          catalogApplyDesigner(
            input.dataset.level,
            input.dataset.catalogDesigner,
            input.value || null,
          )),
    );
  document
    .querySelectorAll("[data-catalog-developer],[data-catalog-phase]")
    .forEach(
      (input) =>
        (input.onchange = async () => {
          try {
            await mutate((d) => {
              if (input.dataset.catalogDeveloper)
                setCatalogDeveloper(
                  d,
                  input.dataset.catalogDeveloper,
                  input.value || null,
                  todayKST(),
                );
              else
                setCatalogPhase(
                  d.catalog,
                  input.dataset.catalogPhase,
                  input.value ? Number(input.value) : null,
                );
            });
          } catch (e) {
            toast(e.message);
            render(true);
          }
        }),
    );
}
async function initializeCatalog(mode) {
  if (
    !(await confirmDialog(
      "Catalog 시작하기",
      mode === "baseline"
        ? "서비스오더 v3.0 기준 106개 L4를 현재 작업에 추가할까요?"
        : "빈 Catalog로 시작할까요?",
    ))
  )
    return;
  await mutate((d) => {
    if (d.catalog) throw Error("기존 Catalog는 덮어쓸 수 없습니다.");
    d.catalog = upgradeCatalog(
      mode === "baseline" ? baselineCatalog() : emptyCatalog(),
    );
    d.schemaVersion = SCHEMA;
  });
}
function catalogUpgradeDialog() {
  const c = state.data.catalog;
  if (c?.version !== 1) return;
  dialog({
    title: "기존 담당자를 단일 설계자로 전환",
    body: `<p>Sub Component별 설계자를 확인합니다. 여러 명이면 한 명 또는 미지정을 직접 선택해 주세요. 이전 목록은 전환 전 정보로 보존합니다.</p><div class="choice-list catalog-assignee-list">${c.subcomponents.map((sc) => field(esc(catalogLabel(sc, "subcomponents")), `<select name="legacy-${sc.id}" required>${sc.assigneeIds.length > 1 ? option("", "선택해 주세요", true) : ""}${option("none", "미지정", !sc.assigneeIds.length)}${sc.assigneeIds.map((id) => option(id, nameOf(state.data.people, id), sc.assigneeIds.length === 1)).join("")}</select>`)).join("")}</div><p class="muted">하위 설계자는 선택한 SC 설계자로 시작합니다. 개발자와 Phase는 미지정이며 상단 저장 전에는 파일을 바꾸지 않습니다.</p>`,
    apply: "전환 적용",
    onApply: async (f) => {
      const choices = Object.fromEntries(
        c.subcomponents.map((sc) => [
          sc.id,
          f.elements["legacy-" + sc.id].value === "none"
            ? null
            : f.elements["legacy-" + sc.id].value,
        ]),
      );
      await mutate((d) => {
        d.catalog = upgradeCatalog(d.catalog, choices);
        d.schemaVersion = SCHEMA;
      });
    },
  });
}
function catalogNodeDialog(key = state.catalogLevel, id = null) {
  const c = state.data.catalog;
  if (c?.version !== 2) return;
  const level = catalogLevel(key),
    old = id ? c[key].find((n) => n.id === id) : null,
    lower = ["subcomponents", "l3", "l4"].includes(key),
    parentId = old?.parentId ?? state.catalogFilters[level.parent] ?? null;
  const parents = level.parent
    ? c[level.parent].map((n) => ({
        ...n,
        name: catalogPath(c, level.parent, n.id)
          .map((p) => catalogLabel(p))
          .join(" › "),
      }))
    : [];
  const body = `<div class="form-grid">${level.parent ? field("상위 " + catalogLevel(level.parent).label, select("parentId", parents, parentId), true) : ""}${field('ID <b class="required">*</b>', textInput("code", old?.code ?? "", 'required maxlength="120"'))}${field((lower ? "한글 명칭" : "영문 명칭") + ' <b class="required">*</b>', textInput(lower ? "koreanName" : "name", lower ? (old?.koreanName ?? "") : (old?.name ?? ""), 'required maxlength="200"'))}${field(lower ? "참고 영문명칭 (선택)" : "한글 명칭 (선택)", textInput(lower ? "name" : "koreanName", lower ? (old?.name ?? "") : (old?.koreanName ?? ""), 'maxlength="200"'))}${lower && old ? field("설계자", catalogOwnerSelect(old.designerId, 'name="designerId"')) : ""}${key === "l4" ? field("필수여부", `<select name="required">${option("required", "필수", old?.required !== false)}${option("optional", "옵션", old?.required === false)}</select>`) + field("Phase", catalogPhaseSelect(old?.phase ?? null, 'name="phase"')) + (old ? field("개발자", catalogOwnerSelect(old.developerId, 'name="developerId"')) : "") + field("기능 설명", `<textarea name="description" rows="6" maxlength="20000">${esc(old?.description)}</textarea>`, true) : ""}</div><p class="muted">기존 항목의 상위 소속을 변경해도 설계자와 하위 ID는 유지됩니다. 새 L3·L4 설계자는 소속 SC에서 기본 지정합니다.</p>${old?.legacyAssigneeIds?.length ? `<p class="notice">전환 전 담당자(보존): ${old.legacyAssigneeIds.map((id) => esc(nameOf(state.data.people, id))).join(", ")} · 현재 설계자와 별도 정보입니다.</p>` : ""}`;
  dialog({
    title: `${level.label} ${old ? "수정" : "추가"}`,
    body,
    wide: key === "l4",
    left: old ? button("catalog-remove", "삭제", "danger") : "",
    onApply: async (f) => {
      const v = Object.fromEntries(new FormData(f));
      if (
        lower &&
        old &&
        !(await catalogConfirmDesigner(key, id, v.designerId || null))
      )
        return false;
      await mutate((d) => {
        const n = upsertCatalogNode(
          d.catalog,
          key,
          { ...v, required: v.required === "required" },
          id,
        );
        if (lower && old)
          setCatalogDesigner(d, key, n.id, v.designerId || null, todayKST());
        if (key === "l4") {
          setCatalogPhase(d.catalog, n.id, v.phase ? Number(v.phase) : null);
          if (old)
            setCatalogDeveloper(d, n.id, v.developerId || null, todayKST());
        }
      });
    },
    setup: (f, item) => {
      f.querySelector("[data-action=catalog-remove]")?.addEventListener(
        "click",
        async () => {
          try {
            deleteCatalogNode(clone(state.data.catalog), key, id);
            if (
              !(await confirmDialog(
                `${level.label} 삭제`,
                `${old.code} · ${catalogDisplayName(key, old)} 항목을 삭제할까요?`,
                "삭제",
              ))
            )
              return;
            await mutate((d) => deleteCatalogNode(d.catalog, key, id));
            for (const l of CATALOG_LEVELS)
              if (state.catalogFilters[l.key] === id)
                delete state.catalogFilters[l.key];
            item.close(true);
            render(true);
          } catch (e) {
            const error = f.querySelector(".error");
            error.textContent = e.message;
            error.hidden = false;
            error.scrollIntoView({ block: "nearest" });
          }
        },
      );
    },
  });
}

function phaseView(d) {
  const today = todayKST(),
    model = phaseTimeline(d.phases, today);
  const statusLabel = {
    current: "기간 중",
    upcoming: "예정",
    past: "기간 종료",
  };
  const current = model.current.length
    ? model.current.join(" · ")
    : model.range === "before"
      ? "표시 일정 시작 전"
      : model.range === "after"
        ? "표시 일정 종료 후"
        : model.range === "empty"
          ? "등록된 일정 없음"
          : "현재 해당하는 설계·개발 기간 없음";
  const timeline = model.rows.length
    ? `<div class="phase-legend"><span><i class="dot"></i>설계</span><span><i class="dot phase-dev-dot"></i>개발</span><small>강조 테두리: 오늘이 포함된 기간 · 실제 작업 진척률과는 다릅니다.</small></div><div class="phase-timeline" aria-label="전체 Phase 일정과 오늘 위치"><div class="timeline-labels"><div class="timeline-corner">Phase</div>${model.rows.map((row) => `<div class="timeline-row-label"><strong>${esc(row.name)}</strong>${row.periods.some((p) => p.state === "current") ? "<small>현재 기간</small>" : ""}</div>`).join("")}</div><div class="timeline-plot">${model.ticks.map((tick, i) => `<div class="timeline-tick ${tick.left === 100 ? "last" : ""}" style="left:${tick.left}%"><span>${esc(tick.date.slice(0, 7).replace("-", "."))}</span></div>`).join("")}<div class="timeline-tracks">${model.rows.map((row) => `<div class="timeline-track">${row.periods.map((p) => `<div tabindex="0" role="img" class="phase-bar ${p.kind === "설계" ? "design" : "development"} ${p.state}" style="left:${p.left}%;width:${p.width}%" title="${esc(row.name)} ${p.kind}: ${p.start} ~ ${p.end} (${statusLabel[p.state]})" aria-label="${esc(row.name)} ${p.kind} ${p.start}부터 ${p.end}까지, ${statusLabel[p.state]}">${p.kind}<span>${p.state === "current" ? " · 기간 중" : ""}</span></div>`).join("")}</div>`).join("")}</div><div class="timeline-today ${model.position < 12 ? "near-start" : model.position > 88 ? "near-end" : ""}" data-range="${model.range}" style="left:${model.position}%" aria-label="오늘 ${today}"><span>오늘${model.range === "before" ? " · 시작 전" : model.range === "after" ? " · 종료 후" : ""}</span></div></div></div>`
    : '<p class="muted">등록된 Phase 일정이 없습니다.</p>';
  return `<section class="card phase"><div class="phase-head"><h2>${esc(d.projectName)} Phase별 일정</h2><small>참고 일정</small></div><div class="phase-now"><strong>오늘 ${today}</strong><span>일정상 현재: ${esc(current)}</span></div>${timeline}<table class="phase-dates"><thead><tr><th>Phase</th><th>설계 기간</th><th>개발 기간</th></tr></thead><tbody>${d.phases.map((p) => `<tr><td><strong>${esc(p[0])}</strong></td><td>${esc(p[1])} ~ ${esc(p[2])}</td><td>${esc(p[3])} ~ ${esc(p[4])}</td></tr>`).join("")}</tbody></table><p class="muted phase-note">Phase 3 이후 빅뱅 오픈 · 오픈일 미정 · 원본 일정표와 대조 전 참고 일정입니다. 현재 위치는 조회 연도와 별개로 한국 날짜를 기준으로 표시합니다.</p></section>`;
}
function annualView() {
  const d = state.data,
    t = totals(d, state.year),
    target = d.targets[state.year],
    delta = target == null ? null : t.confirmed - target;
  const years = Array.from(
    new Set([
      state.year,
      ...Object.keys(d.targets).map(Number),
      ...Array.from(
        { length: 7 },
        (_, i) => Number(todayKST().slice(0, 4)) - 2 + i,
      ),
    ]),
  ).sort();
  const events = upcoming();
  const max = Math.max(target ?? 0, t.confirmed + t.tbd, 1000);
  const axis = Math.ceil(max / 10000) * 10000;
  const stat = (title, value, sub, cls = "") =>
    `<section class="card stat"><small>${title}</small><div class="number ${cls}">${value}</div><small>${sub}</small></section>`;
  return (
    heading(
      "연간 인력 현황",
      "연간 목표와 확정 인력의 예상 실적을 확인합니다.",
      button("calculator", "필요 인원 계산") +
        button("previous-year", "‹", "", 'aria-label="이전 연도"') +
        `<select id="year" aria-label="조회 연도">${years.map((y) => option(y, y + "년", y === state.year)).join("")}</select>` +
        button("next-year", "›", "", 'aria-label="다음 연도"') +
        button("target", "목표 설정"),
    ) +
    phaseView(d) +
    `<div class="stats">${stat("연간 목표 M/M", target == null ? "미설정" : mm(target), "연도별 전체 목표")}${stat("연말 예상 실적", mm(t.confirmed), "정직원 + BP + AGS · TBD 제외", "blue")}${stat("목표 대비 차이", delta == null ? "미설정" : (delta > 0 ? "+" : "") + mm(delta), delta == null ? "목표 미설정" : `${mm(Math.abs(delta))} M/M ${delta < 0 ? "부족" : "초과"}${target > 0 ? " · 달성률 " + ((t.confirmed / target) * 100).toFixed(3) + "%" : ""}`)}${stat("TBD 계획 M/M", mm(t.tbd), "미확정 계획은 실적과 별도 집계")}</div>` +
    `<section class="card schedule"><div class="actions"><select id="range" aria-label="다가오는 일정 기간">${[14, 30].map((n) => option(n, "향후 " + n + "일", n === state.range)).join("")}</select><span>투입 확정 <strong>${events.filter((x) => x.kind === "투입").length}명</strong> · TBD <strong>${events.filter((x) => x.kind === "TBD").length}명</strong> · 철수 <strong>${events.filter((x) => x.kind === "철수").length}명</strong></span><small>${todayKST()} ~ ${addDays(todayKST(), state.range)} · 한국 날짜</small></div>${button("schedule", "일정 보기")}</section>` +
    `<section class="card"><h2>직원 타입별 연말 예상 실적</h2><div class="type-stats">${Object.entries(
      t.types,
    )
      .map(
        ([type, value]) =>
          `<div class="type-stat"><small>${type}</small><strong>${mm(value)} M/M</strong><small>${d.people.filter((p) => p.kind === "confirmed" && typeOf(d, p) === type).length}명 등록</small></div>`,
      )
      .join("")}</div></section>` +
    `<section class="card"><h2>${state.year}년 연간 투입 계획</h2><div class="legend"><span><i class="dot"></i>확정 예상 실적 ${mm(t.confirmed)}</span><span><i class="dot yellow"></i>TBD 계획 ${mm(t.tbd)}</span><strong>계획 합계 ${mm(t.confirmed + t.tbd)} M/M</strong></div><div class="chart" role="img" aria-label="확정 예상 실적 ${mm(t.confirmed)}, TBD 계획 ${mm(t.tbd)}, 목표 ${target == null ? "미설정" : mm(target)} M/M"><div class="segment confirmed" style="width:${(t.confirmed / axis) * 100}%">${t.confirmed / axis > 0.15 ? mm(t.confirmed) : ""}</div><div class="segment tbd" style="left:${(t.confirmed / axis) * 100}%;width:${(t.tbd / axis) * 100}%">${t.tbd / axis > 0.1 ? mm(t.tbd) : ""}</div>${target == null ? "" : `<div class="target-line" style="left:${(target / axis) * 100}%"><span class="target-label">목표 ${mm(target)}</span></div>`}</div><div class="axis">${Array.from({ length: 6 }, (_, i) => `<span>${mm((axis * i) / 5)}</span>`).join("")}</div>${target == null ? '<p class="muted">목표 미설정 · 목표를 설정하면 목표선을 표시합니다.</p>' : ""}</section>`
  );
}
function upcoming() {
  const t = todayKST(),
    last = addDays(t, state.range),
    out = [];
  for (const p of state.data.people) {
    if (p.start > t && p.start <= last)
      out.push({ p, date: p.start, kind: p.kind === "tbd" ? "TBD" : "투입" });
    if (p.kind === "confirmed" && p.end >= t && p.end <= last)
      out.push({ p, date: p.end, kind: "철수" });
  }
  return out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.p.name.localeCompare(b.p.name, "ko"),
  );
}
function peopleView() {
  const d = state.data,
    list = sortedPeople(
      d,
      d.people.filter((p) => state.ended || status(p) !== "종료"),
      state.sort,
      state.desc,
    );
  const columns = [
    ["name", "이름"],
    ["state", "상태"],
    ["type", "직원 타입"],
    ["company", "업체"],
    ["role", "역할"],
    ["tech", "기술 구분"],
    ["group", "그룹"],
    ["start", "투입 시작일"],
    ["end", "투입 종료 예정일"],
  ];
  return (
    heading(
      "인력 관리",
      "현재 인력과 예정 인력, TBD를 함께 관리합니다.",
      button("add-tbd", "TBD 추가") +
        button("add-person", "인력 등록", "primary"),
    ) +
    `<div class="toolbar"><strong>전체 ${d.people.length}명 · 확정 ${d.people.filter((p) => p.kind === "confirmed").length} / TBD ${d.people.filter((p) => p.kind === "tbd").length}</strong><div class="actions"><label class="check muted"><input id="ended" type="checkbox" ${state.ended ? "checked" : ""}>종료 인력 포함</label>${button("default-sort", "기본 순서")}</div></div><div class="table-wrap"><table class="people-table"><thead><tr>${columns.map(([key, label]) => `<th aria-sort="${state.sort === key ? (state.desc ? "descending" : "ascending") : "none"}">${button("sort", label + " " + (state.sort === key ? (state.desc ? "↓" : "↑") : "↕"), "", 'data-column="' + key + '"')}</th>`).join("")}</tr></thead><tbody>${list.map((p) => `<tr data-person="${esc(p.id)}" tabindex="0" aria-label="${esc(p.name)} 상세"><td><strong>${esc(p.name)}</strong></td><td><span class="badge ${status(p) === "투입 중" ? "current" : p.kind === "tbd" ? "tbd" : ""}">${status(p)}</span></td><td>${esc(typeOf(d, p))}</td><td>${esc(nameOf(d.companies, p.companyId))}</td><td>${esc(nameOf(d.roles, p.roleId))}</td><td>${esc(nameOf(d.technologies, p.techId))}</td><td>${esc(groupOf(p.id)?.name)}</td><td>${esc(p.start)}</td><td>${p.end === FOREVER ? "" : esc(p.end)}</td></tr>`).join("")}</tbody></table>${list.length ? "" : '<p class="muted" style="padding:20px">표시할 인력이 없습니다.</p>'}</div><p class="muted">행 클릭 → 상세·수정 팝업 · 헤더 클릭 → 정렬 · 그룹은 ${esc(activePlan().name)} 기준</p>`
  );
}
function memberHTML(p, leader = false) {
  return `<div class="group-member ${leader ? "leader" : ""}" draggable="true" data-drag-person="${esc(p.id)}" data-drop-person="${esc(p.id)}">${button("person", `${esc(p.name)}${leader ? " · 리더" : ""}<small> · ${esc(nameOf(state.data.roles, p.roleId))} ${esc(nameOf(state.data.technologies, p.techId))}${status(p) === "투입 예정" ? " · 예정" : ""}</small>`, "ghost small", `data-id="${esc(p.id)}"`)}</div>`;
}
function groupHTML(g) {
  const members = [...g.members]
    .sort((a, b) => (a === g.leaderId ? -1 : b === g.leaderId ? 1 : 0))
    .map((id) => state.data.people.find((p) => p.id === id))
    .filter(Boolean);
  return `<div class="group-card" draggable="true" data-drag-group="${g.id}" data-drop-group="${g.id}"><h3 class="group-title" title="드래그하여 묶거나 순서를 바꿉니다"><span class="drag-grip" aria-hidden="true">⠿</span>${esc(g.name)} · ${g.members.length}명</h3><div class="actions" style="margin-bottom:10px"><small>리더 ${esc(nameOf(state.data.people, g.leaderId))}</small>${button("edit-group", "그룹 편집", "ghost small", `data-id="${g.id}"`)}</div>${members.map((p) => memberHTML(p, p.id === g.leaderId)).join("")}</div>`;
}
function groupsView() {
  const d = state.data,
    p = viewedPlan(),
    assigned = new Set(p.groups.flatMap((g) => g.members)),
    unassigned = sortedPeople(
      d,
      d.people.filter((p) => status(p) !== "종료" && !assigned.has(p.id)),
    );
  const parentHTML = (parent) =>
    `<section class="parent" draggable="true" data-drag-parent="${parent.id}" data-drop-parent="${parent.id}"><div class="parent-title"><strong title="드래그하여 순서를 바꿉니다"><span class="drag-grip" aria-hidden="true">⠿</span>${esc(parent.name)} · 상위 그룹</strong><div class="actions"><small>리더 ${esc(nameOf(d.people, parent.leaderId))} · ${parent.groupIds.reduce((n, id) => n + (p.groups.find((g) => g.id === id)?.members.length ?? 0), 0)}명</small>${button("edit-parent", "편집", "small", `data-id="${parent.id}"`)}</div></div><div class="group-grid">${parent.groupIds.map((id) => groupHTML(p.groups.find((g) => g.id === id))).join("")}</div></section>`;
  const items = layoutIds(p)
    .map((id) => {
      const parent = p.parents.find((x) => x.id === id);
      return parent
        ? parentHTML(parent)
        : groupHTML(p.groups.find((g) => g.id === id));
    })
    .join("");
  return (
    heading(
      "그룹 설정",
      "동일한 전체 인력으로 여러 구성을 만들고 비교합니다.",
    ) +
    `<div class="tabs">${d.plans.map((x) => button("view-plan", esc(x.name) + (x.id === d.appliedPlanId ? " · 적용 중" : ""), x.id === p.id ? "active" : "", `data-id="${x.id}"`)).join("")}${button("plans", "안 관리")}${button("compare", "구성안 비교", "", d.plans.length < 2 ? 'disabled title="새 안이나 복사본을 만들어 주세요"' : "")}${button("apply-plan", p.id === d.appliedPlanId ? "현재 적용 안" : "이 안 적용", "", p.id === d.appliedPlanId ? "disabled" : "")}</div><section class="card schedule"><span><strong>개발반장 ${esc(nameOf(d.people, d.chiefId))}</strong><small> · 모든 구성안 공통</small></span><div class="actions">${button("chief", "변경·해제")}${button("representatives", "현장대리인 관리")}</div></section><div class="toolbar"><strong>조회 ${esc(p.name)} · ${p.groups.length}개 그룹 · 배정 ${assigned.size}명 / 미배정 ${unassigned.length}명</strong><div class="actions">${button("add-group", "그룹 만들기")}${button("add-parent", "상위 그룹 설정", "", !p.groups.length ? 'disabled title="인력 그룹을 먼저 만들어 주세요"' : "")}</div></div><p class="drag-help" id="drag-feedback" role="status">그룹 제목의 ⠿를 드래그하세요. 카드 가운데에 놓으면 묶고, 가장자리에 놓으면 순서를 바꿉니다.</p><div class="group-layout"><div class="group-area ${!p.groups.length ? "empty" : ""}" data-drop-ungrouped="true">${!p.groups.length ? `<h3>첫 그룹을 만들어 주세요.</h3><p>구성원을 선택한 뒤 리더를 지정할 수 있습니다.<br>다른 배치를 비교하려면 안을 복사하거나 새 안을 만드세요.</p>${button("add-group", "그룹 만들기", "primary")}` : ""}<div class="root-layout">${items}</div>${p.parents.length ? '<div class="ungroup-drop" data-drop-ungrouped="true">그룹을 여기로 끌어 상위 그룹 밖으로 꺼내기</div>' : ""}</div><section class="card" data-drop-unassigned="true"><h3>미배정 · ${unassigned.length}명</h3><div class="unassigned-members">${unassigned.map((p) => memberHTML(p)).join("")}</div>${unassigned.length ? "" : '<p class="muted">모든 대상 인력이 배정되어 있습니다.</p>'}</section></div><p class="muted">인력·그룹·상위 그룹을 드래그해 이동합니다. 인력 한 명은 안마다 한 그룹에 소속됩니다. 리더는 편집 팝업에서 지정합니다.</p>`
  );
}
function settingsView() {
  const d = state.data,
    key = state.settings;
  const tabs = [
    ["project", "프로젝트·업무"],
    ["companies", "업체"],
    ["roles", "역할"],
    ["technologies", "기술 구분"],
  ];
  return (
    heading("기본 설정", "등록할 때 사용하는 기본값을 관리합니다.") +
    `<div class="settings-tabs">${tabs.map(([k, l]) => button("settings-tab", l, k === key ? "active" : "", `data-tab="${k}"`)).join("")}</div>` +
    (key === "project"
      ? `<section class="card"><div class="toolbar"><h2>프로젝트·업무 파트</h2>${button("edit-project", "수정")}</div><table><tbody><tr><th>프로젝트명</th><td>${esc(d.projectName)}</td></tr><tr><th>업무 파트명</th><td>${esc(d.partName)}</td></tr></tbody></table></section>`
      : `<div class="toolbar"><h2>${tabs.find((x) => x[0] === key)[1]} 기본값</h2>${button("add-master", tabs.find((x) => x[0] === key)[1] + " 추가")}</div><table class="settings-table"><thead><tr><th>이름</th><th>적용 구분</th><th>사용 상태</th><th>관리</th></tr></thead><tbody>${d[key].map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(key === "companies" ? x.type : key === "roles" ? (x.id === "focal" ? "정직원 전용" : "업무 역할") : "기술 구분")}</td><td>${x.active ? "사용" : "사용 안 함"}</td><td>${button("edit-master", "수정", "ghost small", `data-id="${esc(x.id)}"`)}</td></tr>`).join("")}</tbody></table><p class="muted">사용 안 함 값도 기존 인력의 표시·연결은 유지됩니다.</p>`)
  );
}
function bindMain() {
  document
    .querySelectorAll("#app [data-action]")
    .forEach((b) => (b.onclick = () => dispatch(b)));
  document.querySelectorAll("[data-person]").forEach((row) => {
    row.onclick = () => personDialog(row.dataset.person);
    row.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        personDialog(row.dataset.person);
      }
    };
  });
  if ($("#year"))
    $("#year").onchange = (e) => {
      state.year = +e.target.value;
      render(true);
    };
  if ($("#range"))
    $("#range").onchange = (e) => {
      state.range = +e.target.value;
      render(true);
    };
  if ($("#ended"))
    $("#ended").onchange = (e) => {
      state.ended = e.target.checked;
      render(true);
    };
  bindDrag();
  bindCatalog();
}
async function dispatch(b) {
  try {
    switch (b.dataset.action) {
      case "page":
        state.page = b.dataset.page;
        render();
        break;
      case "save":
        await save();
        break;
      case "connection":
        await connect(true);
        break;
      case "catalog-initialize":
        await initializeCatalog(b.dataset.mode);
        break;
      case "catalog-level":
        state.catalogLevel = b.dataset.level;
        state.catalogQuery = "";
        state.catalogRequirement = "all";
        state.catalogPhase = "all";
        render(true);
        break;
      case "catalog-add":
        catalogNodeDialog();
        break;
      case "catalog-edit":
        catalogNodeDialog(b.dataset.level, b.dataset.id);
        break;
      case "catalog-drill":
        catalogNavigate(b.dataset.level, b.dataset.id);
        break;
      case "catalog-upgrade":
        catalogUpgradeDialog();
        break;
      case "catalog-context-designer":
        await catalogApplyDesigner(
          "subcomponents",
          b.dataset.id,
          $("#catalog-context-sc").value || null,
        );
        break;
      case "catalog-clear-filters":
        state.catalogFilters = {};
        state.catalogQuery = "";
        state.catalogRequirement = "all";
        state.catalogPhase = "all";
        render(true);
        break;
      case "add-person":
        personDialog();
        break;
      case "add-tbd":
        personDialog(null, "tbd");
        break;
      case "person":
        personDialog(b.dataset.id);
        break;
      case "sort":
        state.desc = state.sort === b.dataset.column ? !state.desc : false;
        state.sort = b.dataset.column;
        render(true);
        break;
      case "default-sort":
        state.sort = null;
        state.desc = false;
        render(true);
        break;
      case "target":
        targetDialog();
        break;
      case "previous-year":
        state.year = Math.max(1000, state.year - 1);
        render(true);
        break;
      case "next-year":
        state.year = Math.min(9999, state.year + 1);
        render(true);
        break;
      case "schedule":
        scheduleDialog();
        break;
      case "calculator":
        calculatorDialog();
        break;
      case "view-plan":
        state.viewPlan = b.dataset.id;
        render(true);
        break;
      case "plans":
        plansDialog();
        break;
      case "apply-plan":
        if (
          await confirmDialog(
            "이 안 적용",
            `${viewedPlan().name}을 인력 목록의 소속 표시 기준으로 적용합니다. 인력·M/M·공통 직책은 바뀌지 않습니다.`,
          )
        )
          await mutate((d) => (d.appliedPlanId = viewedPlan().id));
        break;
      case "compare":
        compareSelect();
        break;
      case "add-group":
        groupDialog();
        break;
      case "edit-group":
        groupDialog(b.dataset.id);
        break;
      case "add-parent":
        parentDialog();
        break;
      case "edit-parent":
        parentDialog(b.dataset.id);
        break;
      case "chief":
        chiefDialog();
        break;
      case "representatives":
        representativesDialog();
        break;
      case "settings-tab":
        state.settings = b.dataset.tab;
        render(true);
        break;
      case "edit-project":
        projectDialog();
        break;
      case "add-master":
        masterDialog(state.settings);
        break;
      case "edit-master":
        masterDialog(state.settings, b.dataset.id);
        break;
    }
  } catch (e) {
    toast(e.message);
  }
}
async function save() {
  if (state.busy) return false;
  state.busy = true;
  render(true);
  try {
    state.data = await state.store.save(state.data);
    state.dirty = false;
    toast("저장했습니다.");
    return true;
  } catch (e) {
    dialog({
      title: "저장하지 못했습니다",
      body: `<div class="error" role="alert">${esc(e.message)}</div><p>현재 변경 사항은 유지됩니다. 원인을 해결한 뒤 다시 저장해 주세요.</p>${["NotAllowedError", "NotFoundError", "SecurityError"].includes(e.name) ? button("repair-connection", "앱 폴더 연결", "primary") : ""}`,
      guard: false,
      setup: (f, item) => {
        f.querySelector("[data-action=repair-connection]")?.addEventListener(
          "click",
          async () => {
            try {
              const handle = await showDirectoryPicker({
                  mode: "readwrite",
                  id: "nova-folder",
                }),
                candidate = new FolderStore(handle);
              await candidate.permission(true);
              await candidate.load();
              if (candidate.baseline !== state.store.baseline)
                throw Error(
                  "현재 작업과 연결된 앱 폴더를 선택해 주세요. 다른 데이터로 연결하지 않았습니다.",
                );
              state.store = candidate;
              state.handle = handle;
              try {
                await rememberHandle(handle);
              } catch {}
              item.close(true);
              await save();
            } catch (e) {
              if (e.name !== "AbortError") toast(e.message);
            }
          },
        );
      },
    });
    return false;
  } finally {
    state.busy = false;
    render(true);
  }
}
function renderConnection() {
  $("#app").innerHTML =
    `<section class="card connection"><div class="mark">NOVA FOCAL</div><h1>${state.error ? "시작하지 못했습니다" : "인력 관리 워크스페이스"}</h1><p>앱 폴더를 연결하면 인력과 투입 계획을 관리할 수 있습니다.<br>변경 사항은 저장 버튼을 눌렀을 때 반영됩니다.</p>${state.error ? `<div class="error" role="alert">${esc(state.error)}</div>` : ""}<div class="actions">${state.handle ? button("resume", state.busy ? "시작 처리 중…" : "재시도", "primary", state.busy ? "disabled" : "") : ""}${!state.handle || state.error?.includes("권한") ? button("pick", "앱 폴더 연결", state.handle ? "" : "primary", state.busy ? "disabled" : "") : ""}</div><div class="note">인터넷 연결 없이 실행됩니다. 처음 사용하는 폴더에서는 새 데이터를 만들기 전에 확인합니다.<br>한 데이터는 한 탭에서 사용해 주세요. 데이터 오류가 발생해도 원본을 초기화하지 않습니다.</div></section>`;
  $("#app")
    .querySelector("[data-action=pick]")
    ?.addEventListener("click", () => connect());
  $("#app")
    .querySelector("[data-action=resume]")
    ?.addEventListener("click", () => openHandle(state.handle, true));
}
async function pendingChanges() {
  if (!state.dirty) return true;
  return new Promise((resolve) => {
    const item = dialog({
      title: "저장하지 않은 변경 사항",
      body: "<p>진행하기 전에 현재 변경 사항을 어떻게 처리할까요?</p>",
      apply: "저장 후 진행",
      guard: false,
      left: button("discard-session", "저장하지 않고 진행", "danger"),
      onApply: async () => {
        if (await save()) resolve(true);
        else return false;
      },
      onClose: () => resolve(false),
      setup: (f, item) => {
        f.querySelector("[data-action=discard-session]").onclick = () => {
          resolve(true);
          item.close(true);
        };
      },
    });
  });
}
async function connect(replace = false) {
  if (replace && !(await pendingChanges())) return;
  if (!window.showDirectoryPicker) {
    state.error =
      "이 브라우저는 앱 폴더 연결을 지원하지 않습니다. 최신 Edge 또는 Chrome에서 열어 주세요.";
    renderConnection();
    return;
  }
  try {
    const handle = await showDirectoryPicker({
      mode: "readwrite",
      id: "nova-folder",
    });
    await openHandle(handle, true, replace);
  } catch (e) {
    if (e.name !== "AbortError") {
      if (state.ready) toast(e.message);
      else {
        state.error = e.message;
        renderConnection();
      }
    }
  }
}
async function openHandle(handle, request = false, replace = false) {
  const previous = {
    data: state.data,
    store: state.store,
    handle: state.handle,
    ready: state.ready,
    dirty: state.dirty,
  };
  state.handle = handle;
  state.busy = true;
  if (!replace) renderConnection();
  try {
    const store = new FolderStore(handle);
    await store.permission(request);
    let data = await store.load();
    if (data === null) {
      if (
        !(await confirmDialog(
          "새 워크스페이스 만들기",
          "이 폴더에 NOVA 초기 데이터가 없습니다. 확정 인력 14명과 TBD 5명으로 새 데이터를 만들까요?",
          "만들기",
        ))
      ) {
        Object.assign(state, previous);
        state.busy = false;
        render();
        return;
      }
      const result = await startup(seed(), {
        choose: (title, people) => choose(title, people, seed()),
      });
      data = await store.save(result.data);
    } else {
      const result = await startup(data, {
        choose: (title, people) => choose(title, people, data),
      });
      data = result.changed ? await store.save(result.data) : result.data;
    }
    state.data = data;
    state.store = store;
    state.ready = true;
    state.dirty = false;
    state.error = "";
    state.viewPlan = data.appliedPlanId;
    try {
      await rememberHandle(handle);
    } catch {
      toast(
        "폴더 연결을 기억하지 못했습니다. 다음 실행 시 다시 연결해 주세요.",
      );
    }
    render();
  } catch (e) {
    if (previous.ready) {
      Object.assign(state, previous);
      toast("연결을 변경하지 못했습니다. " + e.message);
    } else {
      state.ready = false;
      state.error = [
        "NotAllowedError",
        "NotFoundError",
        "SecurityError",
      ].includes(e.name)
        ? "앱 폴더 연결 또는 접근 권한을 다시 확인해 주세요."
        : e.message;
    }
    render();
  } finally {
    state.busy = false;
    render(true);
  }
}
function prefixInput(name, value, prefix) {
  return `<div class="prefix"><b>${prefix}</b>${textInput(name, value?.slice(prefix.length) ?? "", 'inputmode="numeric" maxlength="6" pattern="[0-9]{6}" placeholder="숫자 6자리"')}</div>`;
}
function ipInput(name, value) {
  const parts = value?.split(".") ?? [];
  return `<div class="ip">${[0, 1, 2, 3].map((i) => (i ? "<span>.</span>" : "") + textInput(`${name}${i}`, parts[i] ?? "", `inputmode="numeric" maxlength="3" pattern="[0-9]{1,3}" aria-label="${name} ${i + 1}번째 칸"`)).join("")}</div>`;
}
function personDialog(id = null, kind = "confirmed", convert = false) {
  const d = state.data,
    old = id ? d.people.find((p) => p.id === id) : null;
  if (id && !old) return;
  const p = old
    ? clone(old)
    : {
        id: uid(),
        kind,
        name:
          kind === "tbd"
            ? nextName(
                "TBD#",
                d.people.filter((p) => p.kind === "tbd").map((p) => p.name),
              )
            : "",
        companyId: null,
        roleId: null,
        techId: null,
        start: addDays(todayKST(), 1),
        end: FOREVER,
        everStarted: false,
        extra: {},
      };
  if (convert) {
    p.kind = "confirmed";
    p.name = "";
  }
  const locked =
      old?.kind === "confirmed" && (old.everStarted || old.start <= todayKST()),
    planId = d.appliedPlanId,
    group = groupOf(p.id),
    isNew = !old;
  const body = `${old?.kind === "tbd" && !convert ? `<div class="notice" style="margin-bottom:20px">확정된 인력은 전환 버튼에서 이름과 필수 정보를 입력해 주세요. ${button("convert", "확정 전환", "small")}</div>` : ""}<div class="form-grid">${isNew && p.kind === "confirmed" ? field("등록 방식", `<select name="mode">${option("planned", "투입 예정 등록", true)}${option("actual", "실제 투입 정보")}</select>`, true) : ""}${field(p.kind === "tbd" ? 'TBD 표시명 <b class="required">*</b>' : '이름 <b class="required">*</b>', textInput("name", p.name, 'required maxlength="100"'))}${field("업체" + (p.kind === "confirmed" ? ' <b class="required">*</b>' : ""), select("companyId", d.companies, p.companyId, { disabled: locked, blank: p.kind === "tbd" || isNew || convert, filter: (c) => !old || old.kind === "tbd" || c.type === typeOf(d, old) }) + (!locked ? button("add-company", "업체 추가", "ghost small") : ""), false, locked ? "실제 투입한 인력은 업체 변경 불가" : "직원 타입은 업체에서 자동 결정됩니다.")}${field("업무 역할", select("roleId", d.roles, p.roleId))}${field("기술 구분", select("techId", d.technologies, p.techId))}${field('투입 시작일 <b class="required">*</b>', dateInput("start", p.start, p.kind === "tbd" || isNew ? addDays(todayKST(), 1) : null))}${field("투입 종료 예정일", dateInput("end", p.end), false, "빈칸이면 종료 미정 · 시작일과 종료일 포함 최소 15일")}${field("그룹 · " + esc(activePlan().name), select("groupId", activePlan().groups, group?.id ?? null, { filter: () => true }))}${field("현재 표시 상태", `<div style="padding:10px 0">${status(p)}${locked ? " · 업체 잠금" : ""}</div>`)}<div class="full" style="grid-column:1/-1"><div class="line"></div><h3>추가 정보</h3></div>${field("SKT 가사번", prefixInput("skt", p.extra.skt, "P"))}${field("DOSS ID", prefixInput("doss", p.extra.doss, "DS"))}${field("DeVDI IP", ipInput("devdi", p.extra.devdi))}${field("MyDesk IP", ipInput("mydesk", p.extra.mydesk))}${field("Local IP", ipInput("local", p.extra.local))}${field("좌석번호", textInput("seat", p.extra.seat, 'maxlength="100"'))}${field("메모", `<textarea name="memo" rows="3" maxlength="5000">${esc(p.extra.memo)}</textarea>`, true)}</div>`;
  dialog({
    title: convert
      ? "TBD 확정 전환"
      : old
        ? `${old.name} · 상세 수정`
        : p.kind === "tbd"
          ? "TBD 추가"
          : "인력 등록",
    body,
    left: old ? button("delete", "삭제", "danger") : "",
    onApply: async (f) => {
      const values = Object.fromEntries(new FormData(f));
      const next = {
        ...p,
        name: values.name.trim(),
        companyId: locked ? p.companyId : values.companyId || null,
        roleId: values.roleId || null,
        techId: values.techId || null,
        start: normalizeDate(values.start),
        end: normalizeDate(values.end, FOREVER),
        extra: {},
      };
      if (!next.start) throw Error("시작일을 입력해 주세요.");
      for (const [key, prefix] of [
        ["skt", "P"],
        ["doss", "DS"],
      ])
        next.extra[key] = values[key] ? prefix + values[key] : null;
      for (const key of ["devdi", "mydesk", "local"]) {
        const parts = [0, 1, 2, 3].map((i) => values[key + i]);
        next.extra[key] = parts.every((x) => !x) ? null : parts.join(".");
      }
      next.extra.seat = values.seat.trim() || null;
      next.extra.memo = values.memo.trim() || null;
      validatePerson(
        state.data,
        next,
        old,
        convert ? "convert" : (values.mode ?? (old ? "actual" : "planned")),
      );
      const before = state.data,
        copy = clone(before);
      const at = copy.people.findIndex((p) => p.id === next.id);
      if (at >= 0) copy.people[at] = next;
      else copy.people.push(next);
      const plan = copy.plans.find((x) => x.id === planId);
      if (values.groupId && !plan.groups.some((g) => g.id === values.groupId))
        throw Error("선택한 그룹이 더 이상 존재하지 않습니다.");
      if (values.groupId && status(next) === "종료")
        throw Error("종료 인력은 그룹에 배정할 수 없습니다.");
      const originalGroup = plan.groups.find((g) =>
        g.members.includes(next.id),
      );
      if (originalGroup?.id !== (values.groupId || undefined)) {
        for (const g of plan.groups)
          g.members = g.members.filter((id) => id !== next.id);
        const target = plan.groups.find((g) => g.id === values.groupId);
        if (target) target.members.push(next.id);
      }
      const withdrawIds =
        old &&
        old.kind === "confirmed" &&
        status(old) === "투입 중" &&
        next.end !== FOREVER &&
        next.end !== old.end
          ? [next.id]
          : [];
      const notices = await reconcile(copy, before, {
        choose,
        withdrawIds,
        changedIds: [next.id],
      });
      commit(copy);
      if (notices.length) toast(notices.join("\n"));
    },
    setup: (f, item) => {
      const company = f.elements.companyId;
      const updateRoles = () => {
        const selected = company.value,
          type = typeOf(state.data, { companyId: selected });
        for (const op of f.elements.roleId.options)
          if (op.value === "focal") op.disabled = type !== "정직원";
      };
      company.onchange = updateRoles;
      updateRoles();
      f.querySelector("[data-action=add-company]")?.addEventListener(
        "click",
        () =>
          masterDialog("companies", null, () => {
            const value = company.value;
            company.innerHTML =
              (p.kind === "tbd" || isNew || convert
                ? option("", "선택 안 함", !value)
                : "") +
              state.data.companies
                .filter(
                  (c) =>
                    (c.active || c.id === value) &&
                    (!old ||
                      old.kind === "tbd" ||
                      c.type === typeOf(state.data, old)),
                )
                .map((c) => option(c.id, c.name, c.id === value))
                .join("");
            updateRoles();
          }),
      );
      if (f.elements.mode)
        f.elements.mode.onchange = () => {
          const cal = f.querySelector("[data-calendar=start]");
          if (f.elements.mode.value === "actual") cal.removeAttribute("min");
          else cal.min = addDays(todayKST(), 1);
        };
      f.querySelector("[data-action=convert]")?.addEventListener(
        "click",
        async () => {
          if (
            snapshotForm(f) !== snapshotFormInitial &&
            !(await confirmDialog(
              "변경 내용을 버리시겠습니까?",
              "현재 상세 팝업의 미적용 변경을 버리고 확정 전환합니다.",
              "버리기",
            ))
          )
            return;
          await item.close(true);
          personDialog(id, "confirmed", true);
        },
      );
      f.querySelector("[data-action=delete]")?.addEventListener(
        "click",
        async () => {
          try {
            if (await deletePerson(old.id)) {
              await item.close(true);
            }
          } catch (e) {
            const er = f.querySelector(".error");
            er.hidden = false;
            er.textContent = e.message;
          }
        },
      );
      const snapshotFormInitial = snapshotForm(f);
    },
  });
}
async function deletePerson(id) {
  const p = state.data.people.find((x) => x.id === id);
  const warnings = [];
  for (const sc of catalogPersonLinks(state.data, id))
    warnings.push(
      `Catalog: ${sc.code} (${sc.koreanName || sc.name}) 담당자 연결 해제`,
    );
  for (const plan of state.data.plans) {
    for (const g of [...plan.groups, ...plan.parents])
      if (g.leaderId === id)
        warnings.push(`${plan.name}: 해당 인력 삭제 시 (${g.name}) 확인 필요`);
  }
  if (
    !(await confirmDialog(
      `${p.name} 삭제`,
      `${p.name}의 투입 기록을 삭제합니다.\n${warnings.join("\n")}`,
      "삭제",
    ))
  )
    return false;
  await mutate(
    (d) => {
      d.people = d.people.filter((x) => x.id !== id);
    },
    { refs: true },
  );
  return true;
}
function targetDialog(onChanged = null) {
  const year = state.year;
  dialog({
    title: `${year}년 연간 목표 설정`,
    body: field(
      "연간 목표 M/M",
      textInput(
        "target",
        state.data.targets[year] == null
          ? ""
          : (state.data.targets[year] / 1000).toFixed(3),
        'type="number" min="0" step="0.001" placeholder="미설정"',
      ),
      false,
      "빈칸은 목표 미설정이며 0과 구분됩니다.",
    ),
    onApply: async (f) => {
      const value = f.elements.target.value;
      if (
        value !== "" &&
        (!Number.isFinite(+value) ||
          +value < 0 ||
          !/^(\d+)(\.\d{1,3})?$/.test(value))
      )
        throw Error("0 이상, 소수점 셋째 자리까지 입력해 주세요.");
      await mutate(
        (d) =>
          (d.targets[year] =
            value === "" ? null : Math.round(Number(value) * 1000)),
      );
      onChanged?.();
    },
  });
}
function scheduleDialog() {
  const events = upcoming();
  dialog({
    title: "다가오는 투입·철수 일정",
    wide: true,
    guard: false,
    body: `<p class="muted">${todayKST()} ~ ${addDays(todayKST(), state.range)} · 한국 날짜 기준</p><table><thead><tr><th>날짜</th><th>구분</th><th>이름</th><th>업체</th><th>역할</th></tr></thead><tbody>${events.map((x) => `<tr><td>${x.date}</td><td>${x.kind}</td><td>${button("schedule-person", esc(x.p.name), "ghost", `data-id="${x.p.id}"`)}</td><td>${esc(nameOf(state.data.companies, x.p.companyId))}</td><td>${esc(nameOf(state.data.roles, x.p.roleId))}</td></tr>`).join("")}</tbody></table>${events.length ? "" : "<p>예정된 일정이 없습니다.</p>"}`,
    setup: (f) =>
      f
        .querySelectorAll("[data-action=schedule-person]")
        .forEach((b) => (b.onclick = () => personDialog(b.dataset.id))),
  });
}
function calculatorDialog() {
  const year = state.year;
  dialog({
    title: `${year}년 목표 부족분 필요 인원 계산`,
    body: `<div class="notice" data-summary></div><div class="form-grid" style="margin-top:24px">${field("가정 투입 시작일", dateInput("start", addDays(todayKST(), 1), addDays(todayKST(), 1)))}${field("가정 종료일", dateInput("end", FOREVER))}</div><div data-result style="margin:24px 0"></div><div class="actions">${button("calc-target", "목표 설정")}${button("calculate", "계산")}</div><div class="line"></div>${field("추가할 TBD 인원 수", textInput("count", "0", 'type="number" min="0" step="1"'))}<p class="muted">확인 후 개별 TBD를 생성합니다. 업체·역할·기술은 미정이며 적용 후 전역 저장이 필요합니다.</p>`,
    apply: "TBD 등록 확인",
    setup: (f, item) => {
      let last = "";
      const recalc = () => {
        const t = totals(state.data, year),
          target = state.data.targets[year];
        f.querySelector("[data-summary]").textContent =
          `연간 목표 ${target == null ? "미설정" : mm(target)} · 확정 예상 실적 ${mm(t.confirmed)} · 기존 TBD 계획 ${mm(t.tbd)} M/M`;
        try {
          const start = normalizeDate(f.elements.start.value),
            end = normalizeDate(f.elements.end.value, FOREVER);
          if (!start || start <= todayKST() || days(start, end) < 15)
            throw Error(
              "내일 이후 시작일과 최소 15일의 가정 기간을 확인해 주세요.",
            );
          const result = needed(state.data, year, start, end);
          f.querySelector("[data-result]").textContent =
            `1명당 기여 ${mm(result.contribution)} M/M · 확정 기준 ${result.confirmed ?? "기간 확인 필요"}명 · 기존 TBD 반영 후 ${result.planned ?? "기간 확인 필요"}명`;
          const key = JSON.stringify([start, end, state.data.targets[year], t]);
          if (last !== key) {
            f.elements.count.value = result.planned ?? 0;
            last = key;
          }
        } catch (e) {
          f.querySelector("[data-result]").textContent = e.message;
        }
      };
      f.querySelector("[data-action=calculate]").onclick = recalc;
      f.addEventListener("change", recalc);
      f.querySelector("[data-action=calc-target]").onclick = () =>
        targetDialog(recalc);
      recalc();
    },
    onApply: async (f) => {
      const start = normalizeDate(f.elements.start.value),
        end = normalizeDate(f.elements.end.value, FOREVER),
        count = Number(f.elements.count.value);
      const n = needed(state.data, year, start, end);
      if (n.planned == null)
        throw Error("조회 연도와 겹치는 투입 기간을 입력해 주세요.");
      if (!Number.isSafeInteger(count) || count < 1)
        throw Error("추가할 TBD 인원을 1명 이상 입력해 주세요.");
      if (count > 10000)
        throw Error("한 번에 등록 가능한 인원은 10,000명입니다.");
      if (
        !(await confirmDialog(
          "TBD 추가",
          `${start} ~ ${end === FOREVER ? "종료 미정" : end} 기간의 TBD ${count}명을 추가할까요?`,
        ))
      )
        return false;
      await mutate((d) => {
        for (let i = 0; i < count; i++) {
          const p = {
            id: uid(),
            kind: "tbd",
            name: nextName(
              "TBD#",
              d.people.filter((p) => p.kind === "tbd").map((p) => p.name),
            ),
            companyId: null,
            roleId: null,
            techId: null,
            start,
            end,
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
          };
          validatePerson(d, p);
          d.people.push(p);
        }
      });
    },
  });
}
function uniqueName(list, name, id) {
  name = name.trim();
  if (!name) throw Error("이름을 입력해 주세요.");
  if (list.some((x) => x.id !== id && x.name === name))
    throw Error("이미 사용 중인 이름입니다.");
  return name;
}
function groupDialog(id = null) {
  const planId = viewedPlan().id,
    plan = viewedPlan(),
    g = plan.groups.find((g) => g.id === id),
    members = g?.members ?? [],
    people = sortedPeople(
      state.data,
      state.data.people.filter((p) => status(p) !== "종료"),
    );
  const makeName = nextName(
    "Group#",
    [...plan.groups, ...plan.parents].map((x) => x.name),
  );
  dialog({
    title: g ? "인력 그룹 수정" : "인력 그룹 만들기",
    body: `<div class="form-grid">${field("그룹명", textInput("name", g?.name ?? makeName, 'required maxlength="100"'))}${field("리더", `<select name="leaderId"></select>`)}</div><h3 style="margin-top:26px">구성원 선택</h3><p class="muted">다른 그룹의 인력을 선택하면 이 안에서만 이동합니다. 한 명을 선택하면 자동 리더로 지정합니다.</p><div class="choice-list group-choices">${people.map((p) => `<label><input type="checkbox" name="member" value="${p.id}" ${members.includes(p.id) ? "checked" : ""}><span>${esc(p.name)} <small>${esc(nameOf(state.data.roles, p.roleId))} ${groupOf(p.id, plan) ? " · " + esc(groupOf(p.id, plan).name) : ""}</small></span></label>`).join("")}</div>`,
    left: g ? button("remove-group", "그룹 삭제", "danger") : "",
    onApply: async (f) => {
      const ids = new FormData(f).getAll("member"),
        leader = f.elements.leaderId.value || null;
      if (!ids.length) throw Error("구성원을 한 명 이상 선택해 주세요.");
      if (!g && !leader) throw Error("새 그룹의 리더를 지정해 주세요.");
      if (leader && !ids.includes(leader))
        throw Error("리더는 그룹 구성원이어야 합니다.");
      await mutate((d) => {
        const target = d.plans.find((p) => p.id === planId),
          name = uniqueName(
            [...target.groups, ...target.parents],
            f.elements.name.value,
            id,
          );
        for (const x of target.groups)
          x.members = x.members.filter((pid) => !ids.includes(pid));
        const current = target.groups.find((x) => x.id === id);
        if (current)
          Object.assign(current, { name, members: ids, leaderId: leader });
        else
          target.groups.push({
            id: uid(),
            name,
            members: ids,
            leaderId: leader,
          });
        cleanGroups(d);
      });
    },
    setup: (f, item) => {
      const update = () => {
        const chosen = [...f.querySelectorAll("[name=member]:checked")].map(
            (x) => x.value,
          ),
          previous = f.elements.leaderId.value;
        f.elements.leaderId.innerHTML =
          option("", "리더 미지정") +
          chosen
            .map((id) =>
              option(
                id,
                nameOf(state.data.people, id),
                previous === id ||
                  (chosen.length === 1 && (!g || !members.includes(id))),
              ),
            )
            .join("");
      };
      update();
      if (g?.leaderId) f.elements.leaderId.value = g.leaderId;
      f.querySelectorAll("[name=member]").forEach((x) => (x.onchange = update));
      f.querySelector("[data-action=remove-group]")?.addEventListener(
        "click",
        async () => {
          if (
            !(await confirmDialog(
              "그룹 삭제",
              `${g.name}을 삭제합니다. 인력은 유지하고 이 안의 배정만 해제합니다.`,
              "삭제",
            ))
          )
            return;
          await mutate((d) => {
            const p = d.plans.find((p) => p.id === planId);
            p.groups = p.groups.filter((x) => x.id !== id);
            cleanGroups(d);
          });
          item.close(true);
        },
      );
    },
  });
}
function parentDialog(
  id = null,
  { planId = viewedPlan().id, groupIds = [], anchorId = null } = {},
) {
  const plan = state.data.plans.find((p) => p.id === planId),
    parent = plan.parents.find((p) => p.id === id);
  dialog({
    title: parent ? "상위 그룹 수정" : "상위 그룹 만들기",
    body: `<div class="form-grid">${field("상위 그룹명", textInput("name", parent?.name ?? "", 'required maxlength="100"'))}${field("상위 리더", `<select name="leaderId"></select>`)}</div><h3 style="margin-top:24px">하위 인력 그룹</h3><div class="choice-list">${plan.groups.map((g) => `<label><input type="checkbox" name="group" value="${g.id}" ${(parent?.groupIds ?? groupIds).includes(g.id) ? "checked" : ""}><span>${esc(g.name)} · ${g.members.length}명</span></label>`).join("")}</div><p class="muted">다른 상위 그룹의 하위 그룹을 선택하면 이 안에서 이동합니다. 상위 그룹을 해제해도 하위 그룹과 인력은 유지됩니다.</p>`,
    left: parent ? button("remove-parent", "묶음 해제·삭제", "danger") : "",
    onApply: async (f) => {
      const checked = new FormData(f).getAll("group"),
        previousOrder = parent?.groupIds ?? groupIds,
        ids = [
          ...previousOrder.filter((id) => checked.includes(id)),
          ...checked.filter((id) => !previousOrder.includes(id)),
        ],
        leader = f.elements.leaderId.value || null;
      if (!ids.length) throw Error("하위 그룹을 하나 이상 선택해 주세요.");
      const available = ids.flatMap(
        (id) => plan.groups.find((g) => g.id === id)?.members ?? [],
      );
      if (leader && !available.includes(leader))
        throw Error("리더는 하위 그룹의 인력이어야 합니다.");
      await mutate((d) => {
        const p = d.plans.find((p) => p.id === planId),
          name = uniqueName(
            [...p.groups, ...p.parents],
            f.elements.name.value,
            id,
          );
        const order = layoutIds(p);
        for (const x of p.parents)
          x.groupIds = x.groupIds.filter((gid) => !ids.includes(gid));
        const current = p.parents.find((x) => x.id === id);
        if (current)
          Object.assign(current, { name, groupIds: ids, leaderId: leader });
        else {
          const created = { id: uid(), name, groupIds: ids, leaderId: leader };
          p.parents.push(created);
          if (anchorId)
            p.rootOrder = order.flatMap((item) =>
              item === anchorId ? [created.id] : [item],
            );
        }
        cleanGroups(d);
      });
    },
    setup: (f, item) => {
      const update = () => {
        const ids = new FormData(f).getAll("group"),
          members = ids.flatMap(
            (id) => plan.groups.find((g) => g.id === id)?.members ?? [],
          ),
          previous = f.elements.leaderId.value;
        f.elements.leaderId.innerHTML =
          option("", "리더 미지정") +
          members
            .map((id) =>
              option(id, nameOf(state.data.people, id), id === previous),
            )
            .join("");
      };
      update();
      if (parent?.leaderId) f.elements.leaderId.value = parent.leaderId;
      f.querySelectorAll("[name=group]").forEach((x) => (x.onchange = update));
      f.querySelector("[data-action=remove-parent]")?.addEventListener(
        "click",
        async () => {
          if (
            !(await confirmDialog(
              "상위 그룹 해제",
              `${parent.name}의 묶음만 해제합니다. 하위 그룹과 구성원은 유지됩니다.`,
            ))
          )
            return;
          await mutate((d) => {
            const p = d.plans.find((p) => p.id === planId);
            p.parents = p.parents.filter((x) => x.id !== id);
            cleanGroups(d);
          });
          item.close(true);
        },
      );
    },
  });
}
function plansDialog() {
  const d = state.data;
  dialog({
    title: "구성안 관리",
    guard: false,
    body: `<div class="choice-list">${d.plans.map((p) => `<div class="card" style="margin:0;padding:16px"><strong>${esc(p.name)}${p.id === d.appliedPlanId ? " · 적용 중" : ""}</strong><div class="actions" style="margin-top:12px">${button("rename-plan", "이름 변경", "small", `data-id="${p.id}"`)}${button("copy-plan", "복사", "small", `data-id="${p.id}"`)}${button("delete-plan", "삭제", "small danger", `data-id="${p.id}" ${p.id === d.appliedPlanId || d.plans.length === 1 ? 'disabled title="다른 안을 먼저 적용해 주세요"' : ""}`)}</div></div>`).join("")}</div><div style="margin-top:20px">${button("new-plan", "빈 구성안 만들기", "primary")}</div>`,
    setup: (f, item) =>
      f.querySelectorAll("[data-action]").forEach(
        (b) =>
          (b.onclick = async () => {
            try {
              const id = b.dataset.id;
              if (b.dataset.action === "delete-plan") {
                if (
                  !(await confirmDialog(
                    "구성안 삭제",
                    `${nameOf(state.data.plans, id)}의 배치만 삭제합니다. 공통 인력은 유지됩니다.`,
                    "삭제",
                  ))
                )
                  return;
                await mutate((d) => {
                  if (d.appliedPlanId === id || d.plans.length === 1)
                    throw Error(
                      "적용 중인 안과 마지막 안은 삭제할 수 없습니다.",
                    );
                  d.plans = d.plans.filter((p) => p.id !== id);
                });
                item.close(true);
                plansDialog();
              } else {
                const old = state.data.plans.find((p) => p.id === id),
                  action = b.dataset.action;
                dialog({
                  title:
                    action === "rename-plan"
                      ? "구성안 이름 변경"
                      : action === "copy-plan"
                        ? "구성안 복사"
                        : "빈 구성안 만들기",
                  body: field(
                    "구성안 이름",
                    textInput(
                      "name",
                      action === "rename-plan"
                        ? old.name
                        : nextName(
                            "",
                            state.data.plans.map((p) => p.name),
                            "안",
                          ),
                      'required maxlength="100"',
                    ),
                  ),
                  onApply: async (f) => {
                    await mutate((d) => {
                      const name = uniqueName(
                        d.plans,
                        f.elements.name.value,
                        action === "rename-plan" ? id : null,
                      );
                      if (action === "rename-plan")
                        d.plans.find((p) => p.id === id).name = name;
                      else {
                        const p =
                          action === "copy-plan"
                            ? copyPlan(
                                d.plans.find((p) => p.id === id),
                                name,
                              )
                            : { id: uid(), name, groups: [], parents: [] };
                        d.plans.push(p);
                        state.viewPlan = p.id;
                      }
                    });
                    setTimeout(() => {
                      item.close(true);
                      plansDialog();
                    }, 0);
                  },
                });
              }
            } catch (e) {
              toast(e.message);
            }
          }),
      ),
  });
}
function compareSelect() {
  dialog({
    title: "비교할 구성안 선택",
    guard: false,
    body: `<p>두 개 이상의 안을 선택해 동일한 인력의 배치를 비교합니다.</p><div class="choice-list">${state.data.plans.map((p) => `<label><input type="checkbox" name="plan" value="${p.id}"><span>${esc(p.name)}${p.id === state.data.appliedPlanId ? " · 적용 중" : ""}</span></label>`).join("")}</div>`,
    apply: "비교",
    onApply: (f) => {
      const ids = new FormData(f).getAll("plan");
      if (ids.length < 2) throw Error("두 개 이상의 안을 선택해 주세요.");
      setTimeout(() => compareDialog(ids), 0);
    },
  });
}
function compareDialog(ids) {
  const d = state.data,
    people = sortedPeople(
      d,
      d.people.filter((p) => status(p) !== "종료"),
    );
  const signature = (p, id) => {
    const g = groupOf(id, p),
      parent = p.parents.find((x) => x.groupIds.includes(g?.id));
    return [
      g?.name ?? "",
      g?.members.slice().sort().join(","),
      g?.leaderId === id,
      parent?.name ?? "",
      parent?.leaderId === id,
    ].join("|");
  };
  dialog({
    title: "구성안 비교",
    wide: true,
    guard: false,
    body: `<p class="muted">동일한 전체 인력 ${people.length}명 · 소속·그룹 리더가 다른 행을 강조합니다. 비교는 적용 안을 변경하지 않습니다.</p><div class="compare-grid">${ids
      .map((id) => d.plans.find((p) => p.id === id))
      .filter(Boolean)
      .map((plan) => {
        const assigned = new Set(plan.groups.flatMap((g) => g.members));
        return `<section class="compare-plan"><h2>${esc(plan.name)}${plan.id === d.appliedPlanId ? " · 적용 중" : ""}</h2>${button("edit-compare-plan", "이 안 편집", "small", `data-id="${plan.id}"`)}<p class="muted">${plan.groups.length}개 그룹 · 배정 ${assigned.size} / 미배정 ${people.length - assigned.size}<br>리더 공석 ${plan.groups.filter((g) => !g.leaderId).length + plan.parents.filter((p) => !p.leaderId).length}곳</p>${plan.parents.map((p) => `<p><strong>${esc(p.name)}</strong> · 상위 리더 ${esc(nameOf(d.people, p.leaderId))}<br><small>${p.groupIds.map((id) => esc(nameOf(plan.groups, id))).join(" · ")}</small></p>`).join("")}${people
          .map((p) => {
            const g = groupOf(p.id, plan),
              parent = plan.parents.find((x) => x.groupIds.includes(g?.id)),
              different =
                new Set(
                  ids.map((id) =>
                    signature(
                      d.plans.find((p) => p.id === id),
                      p.id,
                    ),
                  ),
                ).size > 1;
            return `<div class="compare-person ${different ? "different" : ""}"><strong>${esc(p.name)}</strong><small>${parent ? esc(parent.name) + " / " : ""}${esc(g?.name ?? "미배정")}${g?.leaderId === p.id ? " · 그룹 리더" : ""}${parent?.leaderId === p.id ? " · 상위 리더" : ""}</small></div>`;
          })
          .join("")}</section>`;
      })
      .join("")}</div>`,
    setup: (f, item) =>
      f.querySelectorAll("[data-action=edit-compare-plan]").forEach(
        (b) =>
          (b.onclick = () => {
            state.viewPlan = b.dataset.id;
            render(true);
            item.close(true);
          }),
      ),
  });
}
function chiefDialog() {
  const d = state.data,
    people = d.people.filter((p) => status(p) === "투입 중");
  dialog({
    title: "개발반장 지정·해제",
    body: `<p class="muted">모든 구성안에 공통으로 적용합니다. 현재 투입 중인 확정 인력만 지정할 수 있습니다.</p>${field("개발반장", select("chiefId", people, d.chiefId))}`,
    onApply: async (f) => {
      const id = f.elements.chiefId.value || null;
      if (
        id &&
        !state.data.people.some((p) => p.id === id && status(p) === "투입 중")
      )
        throw Error("현재 투입 중인 인력을 선택해 주세요.");
      await mutate((d) => (d.chiefId = id));
    },
  });
}
function representativesDialog() {
  const d = state.data;
  dialog({
    title: "현장대리인 관리",
    wide: true,
    guard: false,
    body: `<p class="muted">업체·역할·기술 조합별 한 명을 지정합니다. 같은 조합 선택은 교체이고 다른 조합 선택은 추가 선임입니다.</p><table><thead><tr><th>업체</th><th>이름</th><th>역할</th><th>기술</th><th>상태</th></tr></thead><tbody>${d.representativeIds
      .map((id) => d.people.find((p) => p.id === id))
      .map(
        (p) =>
          `<tr><td>${esc(nameOf(d.companies, p.companyId))}</td><td>${esc(p.name)}</td><td>${esc(nameOf(d.roles, p.roleId))}</td><td>${esc(nameOf(d.technologies, p.techId))}</td><td>${status(p)}</td></tr>`,
      )
      .join("")}</tbody></table><div class="line"></div>${field(
      "선임할 인력",
      select(
        "representative",
        d.people
          .filter((p) => eligibleRep(d, p, todayKST()))
          .map((p) => ({
            ...p,
            name: `${p.name} · ${nameOf(d.companies, p.companyId)} · ${nameOf(d.roles, p.roleId)} ${nameOf(d.technologies, p.techId)} · ${status(p)}`,
          })),
        null,
      ),
    )}`,
    apply: "추가 선임·교체",
    onApply: async (f) => {
      const id = f.elements.representative.value;
      if (!id) throw Error("선임할 인력을 선택해 주세요.");
      const p = state.data.people.find((p) => p.id === id),
        current = state.data.representativeIds
          .map((id) => state.data.people.find((p) => p.id === id))
          .find((x) => repKey(x) === repKey(p));
      if (
        current?.id !== id &&
        current &&
        !(await confirmDialog(
          "현장대리인 교체",
          `${current.name} 대신 ${p.name}을 같은 업체·역할·기술의 현장대리인으로 지정할까요?`,
        ))
      )
        return false;
      await mutate((d) => appoint(d, id));
    },
  });
}
function projectDialog() {
  dialog({
    title: "프로젝트·업무 파트 수정",
    body: `<div class="form-grid">${field("프로젝트명", textInput("projectName", state.data.projectName, 'required maxlength="100"'))}${field("업무 파트명", textInput("partName", state.data.partName, 'required maxlength="100"'))}</div>`,
    onApply: async (f) => {
      const project = f.elements.projectName.value.trim(),
        part = f.elements.partName.value.trim();
      if (!project || !part)
        throw Error("프로젝트명과 업무 파트명을 입력해 주세요.");
      await mutate((d) => {
        d.projectName = project;
        d.partName = part;
      });
    },
  });
}
function masterDialog(key, id = null, onChanged = null) {
  const old = state.data[key].find((x) => x.id === id),
    used =
      key === "companies" && state.data.people.some((p) => p.companyId === id);
  dialog({
    title: `${{ companies: "업체", roles: "역할", technologies: "기술 구분" }[key]} ${old ? "수정" : "추가"}`,
    body: `<div class="form-grid">${field("이름", textInput("name", old?.name ?? "", 'required maxlength="100"'))}${key === "companies" ? field("직원 타입", `<select name="type" ${used ? "disabled" : ""}>${["정직원", "BP", "AGS"].map((t) => option(t, t, t === (old?.type ?? "BP"))).join("")}</select>`, false, used ? "인력이 참조하는 업체의 타입은 변경할 수 없습니다." : "") : ""}${field("사용 상태", `<select name="active">${option("true", "사용", old?.active !== false)}${option("false", "사용 안 함", old?.active === false)}</select>`)}</div>`,
    onApply: async (f) => {
      await mutate((d) => {
        const name = uniqueName(d[key], f.elements.name.value, id),
          active = f.elements.active.value === "true";
        if (old) {
          const x = d[key].find((x) => x.id === id);
          if (key === "companies" && !used) x.type = f.elements.type.value;
          x.name = name;
          x.active = active;
        } else
          d[key].push({
            id: uid(),
            name,
            active,
            ...(key === "companies" ? { type: f.elements.type.value } : {}),
          });
      });
      onChanged?.();
    },
  });
}
let dragData = null;
function bindDrag() {
  const root = $("main");
  if (!root) return;
  let pendingDrop = null;
  const defaultHint = $("#drag-feedback")?.textContent;
  const clearMarkers = () =>
    root.querySelectorAll("[data-drop-intent]").forEach((el) => {
      el.removeAttribute("data-drop-intent");
      el.removeAttribute("data-drop-axis");
    });
  const describe = (e, drag) => {
    if (!drag || drag.planId !== viewedPlan().id) return null;
    const card = e.target.closest("[data-drop-group]"),
      parent = e.target.closest("[data-drop-parent]"),
      unassigned = e.target.closest("[data-drop-unassigned]"),
      outside = e.target.closest("[data-drop-ungrouped]");
    const side = (el, axis) => {
      const r = el.getBoundingClientRect();
      return (
        axis === "horizontal"
          ? e.clientX < r.x + r.width / 2
          : e.clientY < r.y + r.height / 2
      )
        ? "before"
        : "after";
    };
    if (drag.person) {
      if (card)
        return {
          el: card,
          kind: "person",
          groupId: card.dataset.dropGroup,
          beforePerson:
            e.target.closest("[data-drop-person]")?.dataset.dropPerson,
          label: "이 그룹에 인력 배정",
          intent: "inside",
        };
      if (unassigned)
        return {
          el: unassigned,
          kind: "person",
          label: "미배정으로 이동",
          intent: "inside",
        };
      return null;
    }
    if (drag.parent) {
      const el = parent || card;
      if (el) {
        const id = parent?.dataset.dropParent || card.dataset.dropGroup;
        if (id === drag.parent) return null;
        const intent = side(el, "vertical");
        return {
          el,
          kind: "parent",
          anchorId: id,
          after: intent === "after",
          intent,
          axis: "vertical",
          label:
            intent === "after" ? "이 항목 뒤로 이동" : "이 항목 앞으로 이동",
        };
      }
      if (outside)
        return {
          el: outside,
          kind: "parent",
          intent: "inside",
          label: "맨 뒤로 이동",
        };
      return null;
    }
    if (drag.group) {
      if (card) {
        if (card.dataset.dropGroup === drag.group) return null;
        const r = card.getBoundingClientRect(),
          horizontal = Math.min(48, r.width * 0.18),
          vertical = Math.min(32, r.height * 0.18);
        let intent = null,
          axis = "horizontal";
        if (e.clientX < r.x + horizontal) intent = "before";
        else if (e.clientX > r.right - horizontal) intent = "after";
        else if (e.clientY < r.y + vertical) {
          intent = "before";
          axis = "vertical";
        } else if (e.clientY > r.bottom - vertical) {
          intent = "after";
          axis = "vertical";
        }
        const parentId = parent?.dataset.dropParent ?? null;
        if (intent)
          return {
            el: card,
            kind: "group",
            parentId,
            anchorId: card.dataset.dropGroup,
            after: intent === "after",
            intent,
            axis,
            label:
              intent === "after" ? "이 그룹 뒤로 이동" : "이 그룹 앞으로 이동",
          };
        if (parentId)
          return {
            el: card,
            kind: "group",
            parentId,
            anchorId: card.dataset.dropGroup,
            after: true,
            intent: "inside",
            label:
              viewedPlan().parents.find((p) => p.groupIds.includes(drag.group))
                ?.id === parentId
                ? "이 그룹 뒤로 이동"
                : "이 상위 그룹에 넣기",
          };
        return {
          el: card,
          kind: "bundle",
          anchorId: card.dataset.dropGroup,
          intent: "inside",
          label: "두 그룹을 상위 그룹으로 묶기",
        };
      }
      if (parent) {
        const r = parent.getBoundingClientRect();
        if (e.clientY < r.y + 18 || e.clientY > r.bottom - 18) {
          const intent = side(parent, "vertical");
          return {
            el: parent,
            kind: "group",
            anchorId: parent.dataset.dropParent,
            parentId: null,
            after: intent === "after",
            intent,
            axis: "vertical",
            label:
              intent === "after"
                ? "상위 그룹 뒤에 독립 배치"
                : "상위 그룹 앞에 독립 배치",
          };
        }
        return {
          el: parent,
          kind: "group",
          parentId: parent.dataset.dropParent,
          intent: "inside",
          label: "이 상위 그룹에 넣기",
        };
      }
      if (outside)
        return {
          el: outside,
          kind: "group",
          parentId: null,
          intent: "inside",
          label: "상위 그룹 밖, 맨 뒤로 이동",
        };
    }
    return null;
  };
  root.querySelectorAll("[draggable=true]").forEach((el) =>
    el.addEventListener("dragstart", (e) => {
      e.stopPropagation();
      dragData = {
        planId: viewedPlan().id,
        person: el.dataset.dragPerson,
        group: el.dataset.dragGroup,
        parent: el.dataset.dragParent,
      };
      el.classList.add("dragging");
      root.classList.add("is-dragging");
      e.dataTransfer.setData("text/plain", "nova-move");
      e.dataTransfer.effectAllowed = "move";
    }),
  );
  root.addEventListener("dragover", (e) => {
    const target = describe(e, dragData);
    clearMarkers();
    if (target) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      target.el.dataset.dropIntent = target.intent;
      target.el.dataset.dropAxis = target.axis || "horizontal";
    }
    const feedback = $("#drag-feedback");
    if (feedback) feedback.textContent = target?.label || defaultHint;
  });
  root.addEventListener("dragleave", (e) => {
    if (!root.contains(e.relatedTarget)) clearMarkers();
  });
  root.addEventListener("drop", (e) => {
    const target = describe(e, dragData),
      drag = dragData;
    if (!target) return;
    e.preventDefault();
    pendingDrop = async () => {
      try {
        if (target.kind === "bundle") {
          parentDialog(null, {
            planId: drag.planId,
            groupIds: [target.anchorId, drag.group],
            anchorId: target.anchorId,
          });
          return;
        }
        await mutate((d) => {
          const plan = d.plans.find((p) => p.id === drag.planId);
          if (!plan) throw Error("구성안이 없습니다.");
          if (target.kind === "person") {
            const p = d.people.find((p) => p.id === drag.person);
            if (!p || status(p) === "종료") return;
            const was = plan.groups.find((g) => g.members.includes(p.id)),
              oldIndex = was?.members.indexOf(p.id);
            for (const g of plan.groups)
              g.members = g.members.filter((id) => id !== p.id);
            const group = plan.groups.find((g) => g.id === target.groupId);
            if (group) {
              let index =
                target.beforePerson === p.id
                  ? oldIndex
                  : group.members.indexOf(target.beforePerson);
              if (index < 0) index = group.members.length;
              group.members.splice(index, 0, p.id);
            }
          } else if (target.kind === "group")
            moveGroup(plan, drag.group, target);
          else if (target.kind === "parent")
            moveParent(plan, drag.parent, target.anchorId, target.after);
          cleanGroups(d);
        });
      } catch (e) {
        toast(e.message);
      }
    };
  });
  root.addEventListener("dragend", () => {
    dragData = null;
    clearMarkers();
    root.classList.remove("is-dragging");
    root
      .querySelectorAll(".dragging")
      .forEach((el) => el.classList.remove("dragging"));
    const feedback = $("#drag-feedback");
    if (feedback) feedback.textContent = defaultHint;
    const run = pendingDrop;
    pendingDrop = null;
    if (run) setTimeout(run, 0);
  });
}
window.addEventListener("beforeunload", (e) => {
  if (state.dirty || dialogs.some((x) => x.isDirty())) {
    e.preventDefault();
    e.returnValue = "";
  }
});
// Refresh derived date displays across midnight without running persistent startup cleanup.
let renderedDate = todayKST();
function refreshDateDisplay() {
  const date = todayKST();
  if (
    !state.ready ||
    document.hidden ||
    dialogs.length ||
    date === renderedDate
  )
    return;
  renderedDate = date;
  render(true);
}
document.addEventListener("visibilitychange", refreshDateDisplay);
setInterval(refreshDateDisplay, 60000);
async function boot() {
  renderConnection();
  try {
    const handle = await recalledHandle();
    if (handle) {
      state.handle = handle;
      const permission = await handle.queryPermission({ mode: "readwrite" });
      if (permission === "granted") await openHandle(handle);
      else renderConnection();
    }
  } catch {
    state.error =
      "폴더 연결 정보를 기억하지 못했습니다. 앱 폴더를 다시 연결해 주세요.";
    renderConnection();
  }
}
boot();
