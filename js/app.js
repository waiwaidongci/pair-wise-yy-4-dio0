/* 页面操作：地图、筛选、表单、配载视图与清单导出的交互。 */
(() => {
  const map = document.querySelector("#map");
  const form = document.querySelector("#form");
  const fields = form.elements;
  const list = document.querySelector("#list");
  const filter = document.querySelector("#filter");
  const diveFilter = document.querySelector("#diveFilter");
  const view = document.querySelector("#view");
  const listTitle = document.querySelector("#listTitle");
  const racksEl = document.querySelector("#racks");
  const pendingStrip = document.querySelector("#pendingStrip");
  const typeNames = { ceramic: "陶片", wood: "木构件", metal: "金属件", unknown: "未知物" };
  let pendingPoint = null; // 待落图的平面坐标

  for (let i = 0; i < 7; i++) {
    const rib = document.createElement("div");
    rib.className = "rib";
    rib.style.left = 28 + i * 7 + "%";
    map.appendChild(rib);
  }

  const fmtTime = value => (value ? String(value).replace("T", " ") : "未登记");
  const toLocalInput = date => {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };
  const rackName = item => {
    const rack = Archive.rackById(item.placement.rackId);
    return (rack ? rack.id + " " + rack.name : item.placement.rackId) + " · 架位" + (item.placement.slot + 1);
  };
  const statusPill = item => {
    if (item.placement) return '<span class="pill ok">' + rackName(item) + "</span>";
    if (Stowage.isConflict(item)) return '<span class="pill warn">冲突待处理</span>';
    return '<span class="pill wait">待配载</span>';
  };

  function render() {
    renderMarkers();
    renderDiveOptions();
    renderView();
    renderRacks();
  }
  function renderMarkers() {
    map.querySelectorAll(".marker").forEach(el => el.remove());
    const currentId = fields["id"].value;
    Archive.byDive(diveFilter.value).filter(typeMatch).forEach(mark => {
      const el = document.createElement("button");
      el.className = "marker " + mark.type + (mark.id === currentId ? " selected" : "") + (mark.placement ? "" : " unstowed");
      el.style.left = mark.x + "%";
      el.style.top = mark.y + "%";
      el.textContent = mark.code.slice(0, 2);
      el.title = mark.code + (mark.placement ? "" : "（待配载）");
      el.onclick = event => { event.stopPropagation(); edit(mark.id); };
      map.appendChild(el);
    });
  }
  function renderDiveOptions() {
    const current = diveFilter.value;
    diveFilter.innerHTML = '<option value="">全部潜次</option>' + Archive.diveList().map(d => "<option>" + d + "</option>").join("");
    diveFilter.value = current;
  }
  const typeMatch = item => !filter.value || item.type === filter.value;
  function renderView() {
    const dive = diveFilter.value;
    if (view.value === "timeline") return renderTimeline(Archive.byDive(dive).filter(typeMatch));
    if (view.value === "pending") return renderStaging("待配载区", Archive.pending(dive).filter(typeMatch));
    if (view.value === "allocated") return renderStaging("已配载架位", Archive.allocated(dive).filter(typeMatch));
    if (view.value === "conflicts") return renderStaging("冲突清单", Archive.conflicts(dive).filter(typeMatch));
    renderList(Archive.byDive(dive).filter(typeMatch));
  }
  function bindListClicks() {
    list.querySelectorAll("[data-id]").forEach(el => (el.onclick = () => edit(el.dataset.id)));
  }
  function renderList(data) {
    listTitle.textContent = "标记列表";
    list.className = "list";
    const currentId = fields["id"].value;
    list.innerHTML = data.map(m =>
      '<div class="item ' + (m.id === currentId ? "active" : "") + '" data-id="' + m.id + '"><b>' + m.code + "</b> " +
      '<span class="pill">' + typeNames[m.type] + "</span> " + statusPill(m) +
      '<div class="muted">' + m.dive + " · " + m.depth + " · " + m.orientation + "</div><div>" + (m.condition || "") + "</div></div>"
    ).join("");
    bindListClicks();
  }
  function renderTimeline(data) {
    listTitle.textContent = "潜次时间线";
    list.className = "timeline";
    const groups = data.reduce((acc, item) => ((acc[item.dive] ||= []).push(item), acc), {});
    list.innerHTML = Object.entries(groups).map(([dive, items]) =>
      '<div class="item"><b>' + dive + '</b><div class="muted">新增' + items.length + "个标记</div>" +
      items.sort(Stowage.liftOrder).map(i =>
        "<div>" + i.code + " · " + typeNames[i.type] + " · 起吊 " + fmtTime(i.liftedAt) + (i.placement ? " · 已上架" : " · 待配载") + "</div>"
      ).join("") + "</div>"
    ).join("");
  }
  function renderStaging(title, data) {
    listTitle.textContent = title + "（" + data.length + "）";
    list.className = "list";
    const currentId = fields["id"].value;
    list.innerHTML = data.map(item => {
      const pack = (Stowage.PACKAGING[item.packaging] || {}).label || item.packaging;
      const status = item.placement
        ? '<span class="pill ok">' + rackName(item) + "</span>"
        : (item.reasons || []).map(r => '<span class="pill warn">' + (Stowage.REASONS[r] || r) + "</span>").join(" ") || '<span class="pill wait">等待配载</span>';
      return '<div class="item ' + (item.id === currentId ? "active" : "") + '" data-id="' + item.id + '"><b>' + item.code + "</b> " +
        '<span class="pill">' + typeNames[item.type] + '</span> <span class="pill">' + pack + "</span> " + status +
        '<div class="muted">' + item.dive + " · 湿重 " + item.wetWeight + "kg · 起吊 " + fmtTime(item.liftedAt) + "</div></div>";
    }).join("") || '<div class="muted">暂无记录</div>';
    bindListClicks();
  }
  function renderRacks() {
    racksEl.innerHTML = Archive.rackView().map(rack => {
      const sling = Stowage.SLING_GRADES[rack.sling];
      const slots = Array.from({ length: rack.slots }, (_, slot) => {
        const occ = rack.occupants.find(o => o.placement.slot === slot);
        return occ
          ? '<button type="button" class="slot occ" data-id="' + occ.id + '" title="' + occ.code + " 湿重" + occ.wetWeight + 'kg">' + occ.code + "</button>"
          : '<span class="slot">空</span>';
      }).join("");
      const zones = rack.zones.map(z => typeNames[z]).join("/");
      const pct = Math.min(100, Math.round(rack.load / rack.capacity * 100));
      return '<div class="rack"><div class="rack-head"><b>' + rack.id + " " + rack.name + '</b><span class="pill">' + sling.label + " ≤" + sling.max + 'kg</span></div>' +
        '<div class="muted">分区：' + zones + " · 承重 " + rack.load + "/" + rack.capacity + "kg</div>" +
        '<div class="bar"><i style="width:' + pct + '%"></i></div><div class="slots">' + slots + "</div></div>";
    }).join("");
    racksEl.querySelectorAll("[data-id]").forEach(el => (el.onclick = () => edit(el.dataset.id)));
    const waiting = Archive.pending("");
    pendingStrip.innerHTML = waiting.length
      ? "<b>待配载区（" + waiting.length + "）</b>" + waiting.map(i =>
          '<button type="button" class="slot wait" data-id="' + i.id + '" title="' + (i.reasons || []).map(r => Stowage.REASONS[r] || r).join("、") + '">' + i.code + "</button>"
        ).join("")
      : "<b>待配载区</b><span class='muted'>暂无待配载遗物</span>";
    pendingStrip.querySelectorAll("[data-id]").forEach(el => (el.onclick = () => edit(el.dataset.id)));
  }

  function edit(id) {
    const mark = Archive.all().find(m => m.id === id);
    if (!mark) return;
    for (const [key, value] of Object.entries(mark)) {
      const field = fields[key];
      if (field && "value" in field) field.value = value ?? "";
    }
    pendingPoint = { x: mark.x, y: mark.y };
    render();
  }
  map.addEventListener("click", event => {
    const rect = map.getBoundingClientRect();
    pendingPoint = {
      x: Number(((event.clientX - rect.left) / rect.width * 100).toFixed(2)),
      y: Number(((event.clientY - rect.top) / rect.height * 100).toFixed(2))
    };
    form.reset();
    fields["id"].value = "";
    fields.code.value = "M-" + String(Archive.all().length + 1).padStart(3, "0");
    fields.dive.value = "DIVE-01";
    fields.wetWeight.value = 20;
    fields.packaging.value = "standard";
    fields.liftedAt.value = toLocalInput(new Date());
    render();
  });
  form.onsubmit = event => {
    event.preventDefault();
    if (!pendingPoint) pendingPoint = { x: 50, y: 50 };
    const data = Object.fromEntries(new FormData(form).entries());
    data.wetWeight = Number(data.wetWeight);
    const item = Archive.upsert({ ...data, ...pendingPoint });
    fields["id"].value = item.id;
    render();
  };
  document.querySelector("#deleteBtn").onclick = () => {
    const id = fields["id"].value;
    if (!id) return;
    Archive.remove(id);
    form.reset();
    pendingPoint = null;
    render();
  };
  document.querySelector("#exportBtn").onclick = () => {
    const blob = new Blob([JSON.stringify(Archive.manifest(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "deck-manifest.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  filter.onchange = render;
  diveFilter.onchange = render;
  view.onchange = render;
  render();
})();
