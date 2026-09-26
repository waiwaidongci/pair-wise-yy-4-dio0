/* 页面操作：地图标记、表单编辑、筛选时间线与配载台渲染。规则走 Allocation，存取走 Storage。 */
const map = document.querySelector("#map");
const form = document.querySelector("#form");
const list = document.querySelector("#list");
const filter = document.querySelector("#filter");
const view = document.querySelector("#view");
const listTitle = document.querySelector("#listTitle");
const diveFilter = document.querySelector("#diveFilter");
const racksEl = document.querySelector("#racks");
const stagingList = document.querySelector("#stagingList");
const typeNames = { ceramic: "陶片", wood: "木构件", metal: "金属件", unknown: "未知物" };
const packNames = { A: "A 加固木箱", B: "B 标准箱", C: "C 简易托垫" };
let marks = Storage.loadMarks();
let racks = Storage.loadRacks();
let pending = null;
let activeTab = "pending";
let evaluation = null;

for (let i = 0; i < 7; i++) {
  const rib = document.createElement("div");
  rib.className = "rib";
  rib.style.left = 28 + i * 7 + "%";
  map.appendChild(rib);
}

function rackLabel(mark) {
  if (!mark.allocation) return "待配载区";
  const rack = racks.find(r => r.id === mark.allocation.rackId);
  return (rack ? rack.name : mark.allocation.rackId) + " · 位" + (mark.allocation.slot + 1);
}

function render() {
  map.querySelectorAll(".marker").forEach(el => el.remove());
  const filtered = filter.value ? marks.filter(m => m.type === filter.value) : marks;
  filtered.forEach(mark => {
    const el = document.createElement("button");
    el.className = "marker " + mark.type + (mark.id === form.id.value ? " selected" : "");
    el.style.left = mark.x + "%";
    el.style.top = mark.y + "%";
    el.textContent = mark.code.slice(0, 2);
    el.onclick = event => { event.stopPropagation(); edit(mark.id); };
    map.appendChild(el);
  });
  if (view.value === "timeline") renderTimeline(filtered);
  else renderList(filtered);
  renderStaging();
}

function renderList(data) {
  listTitle.textContent = "标记列表";
  list.className = "list";
  list.innerHTML = data.map(m => '<div class="item '+(m.id===form.id.value?'active':'')+'" data-id="'+m.id+'"><b>'+m.code+'</b> <span class="pill">'+typeNames[m.type]+'</span> <span class="pill">'+(m.allocation?rackLabel(m):"待配载区")+'</span><div class="muted">'+m.dive+' · '+m.depth+' · '+m.orientation+' · 湿重'+m.wetWeight+'kg</div><div>'+m.condition+'</div></div>').join("");
  list.querySelectorAll("[data-id]").forEach(el => el.onclick = () => edit(el.dataset.id));
}

function renderTimeline(data) {
  listTitle.textContent = "潜次时间线";
  list.className = "timeline";
  const groups = data.reduce((map, item) => ((map[item.dive] ||= []).push(item), map), {});
  list.innerHTML = Object.entries(groups).map(([dive, items]) => '<div class="item"><b>'+dive+'</b><div class="muted">新增'+items.length+'个标记</div>'+items.map(i => '<div>'+i.liftTime+' 起吊 · '+i.code+' · '+typeNames[i.type]+'</div>').join("")+'</div>').join("");
}

/* ---------- 配载台 ---------- */

function renderStaging() {
  evaluation = Allocation.evaluate(marks, racks);
  // 判定结果写回档案：配上的记架位，落配的进待配载区
  for (const mark of marks) {
    const a = evaluation.assignments.get(mark.id);
    if (a) mark.allocation = { ...a, key: Allocation.allocationKey(mark) };
    else delete mark.allocation;
  }
  Storage.saveMarks(marks);
  renderDiveOptions();
  renderRacks();
  renderTabs();
  renderStagingList();
}

function renderDiveOptions() {
  const dives = [...new Set(marks.map(m => m.dive))].sort();
  const cur = diveFilter.value;
  diveFilter.innerHTML = '<option value="">全部潜次</option>' + dives.map(d => '<option value="'+d+'"'+(d===cur?' selected':'')+'>'+d+'</option>').join("");
}

function renderRacks() {
  racksEl.innerHTML = racks.map(rack => {
    const occ = evaluation.occupants.get(rack.id) || [];
    const used = occ.reduce((s, m) => s + m.wetWeight, 0);
    const pct = Math.min(100, used / rack.capacity * 100);
    const full = occ.length >= rack.slots || used >= rack.capacity;
    return '<div class="rack'+(full?' full':'')+'"><b>'+rack.name+'</b> <span class="pill">'+Allocation.ZONE_NAMES[rack.zone]+'</span>' +
      '<div class="bar"><i style="width:'+pct+'%"></i></div>' +
      '<div class="muted">承重 '+used.toFixed(1)+'/'+rack.capacity+'kg · 架位 '+occ.length+'/'+rack.slots+' · 吊带 '+rack.sling+'</div>' +
      '<div class="muted">'+(occ.length ? occ.map(m => m.code).join("、") : "空架")+'</div></div>';
  }).join("");
}

function renderTabs() {
  const allocated = marks.filter(m => m.allocation).length;
  const pendingCount = evaluation.conflicts.length;
  document.querySelectorAll("#tabs button").forEach(btn => {
    const tab = btn.dataset.tab;
    const n = tab === "allocated" ? allocated : pendingCount;
    btn.textContent = btn.dataset.label + "（" + n + "）";
    btn.classList.toggle("active", tab === activeTab);
  });
}

function inDive(mark) {
  return !diveFilter.value || mark.dive === diveFilter.value;
}

function renderStagingList() {
  const dim = diveFilter.value ? "潜次 " + diveFilter.value : "全部潜次";
  if (activeTab === "allocated") {
    const rows = marks.filter(m => m.allocation && inDive(m));
    stagingList.innerHTML = '<div class="muted">'+dim+' · 已配载 '+rows.length+' 件</div>' + (rows.map(m =>
      '<div class="item" data-id="'+m.id+'"><b>'+m.code+'</b> <span class="pill">'+typeNames[m.type]+'</span> <span class="pill">'+rackLabel(m)+'</span><div class="muted">'+m.dive+' · '+m.liftTime+' 起吊 · 湿重'+m.wetWeight+'kg · '+packNames[m.packGrade]+'</div></div>'
    ).join("") || '<div class="muted">暂无已配载出水物</div>');
  } else if (activeTab === "conflicts") {
    const rows = evaluation.conflicts.filter(c => inDive(c.mark));
    stagingList.innerHTML = '<div class="muted">'+dim+' · 冲突 '+rows.length+' 件</div>' + (rows.map(c =>
      '<div class="item" data-id="'+c.mark.id+'"><b>'+c.mark.code+'</b> <span class="pill">'+typeNames[c.mark.type]+'</span><div class="muted">'+c.mark.dive+' · '+c.mark.liftTime+' 起吊 · 湿重'+c.mark.wetWeight+'kg · '+packNames[c.mark.packGrade]+'</div>'+c.reasons.map(r => '<div class="reason">✕ '+r+'</div>').join("")+'</div>'
    ).join("") || '<div class="muted">暂无冲突</div>');
  } else {
    const rows = evaluation.conflicts.filter(c => inDive(c.mark)).map(c => c.mark);
    stagingList.innerHTML = '<div class="muted">'+dim+' · 待配载区 '+rows.length+' 件</div>' + (rows.map(m =>
      '<div class="item" data-id="'+m.id+'"><b>'+m.code+'</b> <span class="pill">'+typeNames[m.type]+'</span> <span class="pill">待配载区</span><div class="muted">'+m.dive+' · '+m.liftTime+' 起吊 · 湿重'+m.wetWeight+'kg · '+packNames[m.packGrade]+'</div></div>'
    ).join("") || '<div class="muted">待配载区为空</div>');
  }
  stagingList.querySelectorAll("[data-id]").forEach(el => el.onclick = () => edit(el.dataset.id));
}

/* ---------- 标记编辑 ---------- */

function edit(id) {
  const mark = marks.find(m => m.id === id);
  if (!mark) return;
  for (const [key, value] of Object.entries(mark)) if (form[key]) form[key].value = value;
  pending = { x: mark.x, y: mark.y };
  render();
}

map.addEventListener("click", event => {
  const rect = map.getBoundingClientRect();
  pending = { x: Number(((event.clientX - rect.left) / rect.width * 100).toFixed(2)), y: Number(((event.clientY - rect.top) / rect.height * 100).toFixed(2)) };
  form.reset();
  form.id.value = "";
  form.code.value = "M-" + String(marks.length + 1).padStart(3, "0");
  form.dive.value = "DIVE-01";
  form.liftTime.value = "08:30";
  render();
});

form.onsubmit = event => {
  event.preventDefault();
  if (!pending) pending = { x: 50, y: 50 };
  const data = Object.fromEntries(new FormData(form).entries());
  data.wetWeight = Number(data.wetWeight) || 0;
  if (data.id) Object.assign(marks.find(m => m.id === data.id), data, pending);
  else marks.push({ ...data, id: crypto.randomUUID(), ...pending });
  Storage.saveMarks(marks);
  render();
};

document.querySelector("#deleteBtn").onclick = () => {
  if (!form.id.value) return;
  marks = marks.filter(m => m.id !== form.id.value);
  form.reset(); pending = null;
  Storage.saveMarks(marks);
  render();
};

document.querySelector("#exportBtn").onclick = () => {
  const payload = { exportedAt: new Date().toISOString(), racks, marks };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "dive-marks.json"; a.click(); URL.revokeObjectURL(a.href);
};

document.querySelectorAll("#tabs button").forEach(btn => {
  btn.onclick = () => { activeTab = btn.dataset.tab; renderTabs(); renderStagingList(); };
});
filter.onchange = render; view.onchange = render; diveFilter.onchange = () => { renderTabs(); renderStagingList(); };
render();
