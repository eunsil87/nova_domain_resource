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
} from "./core.js";
import { FolderStore, rememberHandle, recalledHandle } from "./storage.js";
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
};
const labels = {
  annual: "연간 현황",
  people: "인력 관리",
  groups: "그룹 설정",
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
      )}</nav><footer><span>${esc(d.partName)}</span><small>Focal · 개인 워크스페이스</small></footer></aside><header><strong>${esc(d.partName)}</strong><div class="actions"><span class="saved ${state.dirty ? "unsaved" : ""}" role="status">${state.dirty ? "저장하지 않은 변경 사항" : "저장 완료"}</span>${button("save", state.busy ? "저장 중…" : "저장", "primary", state.busy ? "disabled" : "")}</div></header><main>${{ annual: annualView, people: peopleView, groups: groupsView, settings: settingsView }[state.page]()}</main>`;
  window.scrollTo(0, scroll);
  bindMain();
}
function heading(title, desc, actions = "") {
  return `<div class="heading"><div><h1>${esc(title)}</h1><p>${esc(desc)}</p></div><div class="actions">${actions}</div></div>`;
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
    `<section class="card phase"><div class="phase-head"><h2>${esc(d.projectName)} Phase별 일정</h2><small>참고 일정</small></div><table><thead><tr><th>Phase</th><th>설계 기간</th><th>개발 기간</th></tr></thead><tbody>${d.phases.map((p) => `<tr><td><strong>${esc(p[0])}</strong></td><td>${esc(p[1])} ~ ${esc(p[2])}</td><td>${esc(p[3])} ~ ${esc(p[4])}</td></tr>`).join("")}</tbody></table><p class="muted">Phase 3 이후 빅뱅 오픈 · 오픈일 미정 · 원본 일정표와 대조 전 참고 일정입니다.</p></section>` +
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
  return `<div class="group-card" draggable="true" data-drag-group="${g.id}" data-drop-group="${g.id}"><h3>${esc(g.name)} · ${g.members.length}명</h3><div class="actions" style="margin-bottom:10px"><small>리더 ${esc(nameOf(state.data.people, g.leaderId))}</small>${button("edit-group", "그룹 편집", "ghost small", `data-id="${g.id}"`)}</div>${members.map((p) => memberHTML(p, p.id === g.leaderId)).join("")}</div>`;
}
function groupsView() {
  const d = state.data,
    p = viewedPlan(),
    assigned = new Set(p.groups.flatMap((g) => g.members)),
    unassigned = sortedPeople(
      d,
      d.people.filter((p) => status(p) !== "종료" && !assigned.has(p.id)),
    );
  const grouped = new Set(p.parents.flatMap((x) => x.groupIds));
  return (
    heading(
      "그룹 설정",
      "동일한 전체 인력으로 여러 구성을 만들고 비교합니다.",
    ) +
    `<div class="tabs">${d.plans.map((x) => button("view-plan", esc(x.name) + (x.id === d.appliedPlanId ? " · 적용 중" : ""), x.id === p.id ? "active" : "", `data-id="${x.id}"`)).join("")}${button("plans", "안 관리")}${button("compare", "구성안 비교", "", d.plans.length < 2 ? 'disabled title="새 안이나 복사본을 만들어 주세요"' : "")}${button("apply-plan", p.id === d.appliedPlanId ? "현재 적용 안" : "이 안 적용", "", p.id === d.appliedPlanId ? "disabled" : "")}</div><section class="card schedule"><span><strong>개발반장 ${esc(nameOf(d.people, d.chiefId))}</strong><small> · 모든 구성안 공통</small></span><div class="actions">${button("chief", "변경·해제")}${button("representatives", "현장대리인 관리")}</div></section><div class="toolbar"><strong>조회 ${esc(p.name)} · ${p.groups.length}개 그룹 · 배정 ${assigned.size}명 / 미배정 ${unassigned.length}명</strong><div class="actions">${button("add-group", "그룹 만들기")}${button("add-parent", "상위 그룹 설정", "", !p.groups.length ? 'disabled title="인력 그룹을 먼저 만들어 주세요"' : "")}</div></div><div class="group-layout"><div class="group-area ${!p.groups.length ? "empty" : ""}" data-drop-ungrouped="true">${!p.groups.length ? `<h3>첫 그룹을 만들어 주세요.</h3><p>구성원을 선택한 뒤 리더를 지정할 수 있습니다.<br>다른 배치를 비교하려면 안을 복사하거나 새 안을 만드세요.</p>${button("add-group", "그룹 만들기", "primary")}` : ""}${p.parents.map((parent) => `<section class="parent" draggable="true" data-drag-parent="${parent.id}" data-drop-parent="${parent.id}"><div class="parent-title"><strong>${esc(parent.name)} · 상위 그룹</strong><div class="actions"><small>리더 ${esc(nameOf(d.people, parent.leaderId))} · ${parent.groupIds.reduce((n, id) => n + (p.groups.find((g) => g.id === id)?.members.length ?? 0), 0)}명</small>${button("edit-parent", "편집", "small", `data-id="${parent.id}"`)}</div></div><div class="group-grid">${parent.groupIds.map((id) => groupHTML(p.groups.find((g) => g.id === id))).join("")}</div></section>`).join("")}<div class="group-grid">${p.groups
      .filter((g) => !grouped.has(g.id))
      .map(groupHTML)
      .join(
        "",
      )}</div></div><section class="card" data-drop-unassigned="true"><h3>미배정 · ${unassigned.length}명</h3><div class="unassigned-members">${unassigned.map((p) => memberHTML(p)).join("")}</div>${unassigned.length ? "" : '<p class="muted">모든 대상 인력이 배정되어 있습니다.</p>'}</section></div><p class="muted">인력·그룹·상위 그룹을 드래그해 이동합니다. 인력 한 명은 안마다 한 그룹에 소속됩니다. 리더는 편집 팝업에서 지정합니다.</p>`
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
      const result = await startup(seed(), { choose: (title, people) => choose(title, people, seed()) });
      data = await store.save(result.data);
    } else {
      const result = await startup(data, { choose: (title, people) => choose(title, people, data) });
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
function parentDialog(id = null) {
  const planId = viewedPlan().id,
    plan = viewedPlan(),
    parent = plan.parents.find((p) => p.id === id);
  dialog({
    title: parent ? "상위 그룹 수정" : "상위 그룹 만들기",
    body: `<div class="form-grid">${field("상위 그룹명", textInput("name", parent?.name ?? "", 'required maxlength="100"'))}${field("상위 리더", `<select name="leaderId"></select>`)}</div><h3 style="margin-top:24px">하위 인력 그룹</h3><div class="choice-list">${plan.groups.map((g) => `<label><input type="checkbox" name="group" value="${g.id}" ${parent?.groupIds.includes(g.id) ? "checked" : ""}><span>${esc(g.name)} · ${g.members.length}명</span></label>`).join("")}</div><p class="muted">다른 상위 그룹의 하위 그룹을 선택하면 이 안에서 이동합니다. 상위 그룹을 해제해도 하위 그룹과 인력은 유지됩니다.</p>`,
    left: parent ? button("remove-parent", "묶음 해제·삭제", "danger") : "",
    onApply: async (f) => {
      const ids = new FormData(f).getAll("group"),
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
        for (const x of p.parents)
          x.groupIds = x.groupIds.filter((gid) => !ids.includes(gid));
        const current = p.parents.find((x) => x.id === id);
        if (current)
          Object.assign(current, { name, groupIds: ids, leaderId: leader });
        else
          p.parents.push({ id: uid(), name, groupIds: ids, leaderId: leader });
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
  root.querySelectorAll("[draggable=true]").forEach((el) =>
    el.addEventListener("dragstart", (e) => {
      e.stopPropagation();
      dragData = {
        planId: viewedPlan().id,
        person: el.dataset.dragPerson,
        group: el.dataset.dragGroup,
        parent: el.dataset.dragParent,
      };
      e.dataTransfer.setData("text/plain", "nova-move");
      e.dataTransfer.effectAllowed = "move";
    }),
  );
  root.addEventListener("dragover", (e) => {
    if (!dragData) return;
    const target = e.target.closest(
      "[data-drop-group],[data-drop-unassigned],[data-drop-parent],[data-drop-ungrouped]",
    );
    if (target) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  });
  root.addEventListener("drop", (e) => {
    if (!dragData) return;
    e.preventDefault();
    const drag = dragData;
    dragData = null;
    const target = e.target.closest(
      "[data-drop-group],[data-drop-unassigned],[data-drop-parent],[data-drop-ungrouped]",
    );
    if (!target || drag.planId !== viewedPlan().id) return;
    const beforePerson =
      e.target.closest("[data-drop-person]")?.dataset.dropPerson;
    pendingDrop = async () => {
      try {
        await mutate((d) => {
          const plan = d.plans.find((p) => p.id === drag.planId);
          if (drag.person) {
            const p = d.people.find((p) => p.id === drag.person);
            if (!p || status(p) === "종료") return;
            const groupId = target.dataset.dropGroup,
              was = plan.groups.find((g) => g.members.includes(p.id));
            if (!groupId && !target.dataset.dropUnassigned) return;
            const oldIndex = was?.members.indexOf(p.id);
            for (const g of plan.groups)
              g.members = g.members.filter((id) => id !== p.id);
            const group = plan.groups.find((g) => g.id === groupId);
            if (group) {
              const before = beforePerson;
              let index =
                before === p.id
                  ? oldIndex
                  : before
                    ? group.members.indexOf(before)
                    : -1;
              if (index < 0) index = group.members.length;
              group.members.splice(index, 0, p.id);
            }
          } else if (drag.group) {
            const moving = plan.groups.find((g) => g.id === drag.group);
            if (!moving) return;
            const targetGroup = target.dataset.dropGroup;
            if (targetGroup === moving.id) return;
            let parentId = target.dataset.dropParent;
            if (targetGroup)
              parentId = plan.parents.find((x) =>
                x.groupIds.includes(targetGroup),
              )?.id;
            for (const x of plan.parents)
              x.groupIds = x.groupIds.filter((id) => id !== moving.id);
            if (parentId) {
              const parent = plan.parents.find((x) => x.id === parentId);
              let at = parent.groupIds.indexOf(targetGroup);
              if (at < 0) at = parent.groupIds.length;
              parent.groupIds.splice(at, 0, moving.id);
            } else {
              plan.groups = plan.groups.filter((g) => g.id !== moving.id);
              let at = plan.groups.findIndex((g) => g.id === targetGroup);
              if (at < 0) at = plan.groups.length;
              plan.groups.splice(at, 0, moving);
            }
          } else if (drag.parent) {
            const targetParent = target.dataset.dropParent;
            if (!targetParent || targetParent === drag.parent) return;
            const moving = plan.parents.find((p) => p.id === drag.parent);
            plan.parents = plan.parents.filter((p) => p.id !== moving.id);
            plan.parents.splice(
              plan.parents.findIndex((p) => p.id === targetParent),
              0,
              moving,
            );
          }
          cleanGroups(d);
        });
      } catch (e) {
        toast(e.message);
      }
    };
  });
  root.addEventListener("dragend", () => {
    dragData = null;
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
