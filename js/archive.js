/* 暂存档案：遗物登记、转运架台账与配载状态的持久化维护。 */
window.Archive = (() => {
  const MARKS_KEY = "zfl30Marks";
  const RACKS_KEY = "zfl30Racks";
  // 调整重量、类型或包装后，原架位立即失效并按新值重排
  const STAGING_FIELDS = ["wetWeight", "type", "packaging"];

  const DEFAULT_RACKS = [
    { id: "R-1", name: "陶瓷转运架", zones: ["ceramic", "unknown"], capacity: 120, sling: "S2", slots: 4 },
    { id: "R-2", name: "木作转运架", zones: ["wood"], capacity: 260, sling: "S3", slots: 3 },
    { id: "R-3", name: "金属转运架", zones: ["metal"], capacity: 320, sling: "S3", slots: 3 },
    { id: "R-4", name: "综合暂存架", zones: ["ceramic", "wood", "metal", "unknown"], capacity: 90, sling: "S1", slots: 3 }
  ];

  let racks = read(RACKS_KEY) || DEFAULT_RACKS;
  let items = (read(MARKS_KEY) || []).map(normalize);
  if (!items.length) items = seed();
  settleAndSave();

  function read(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }
  function save() {
    localStorage.setItem(MARKS_KEY, JSON.stringify(items));
    localStorage.setItem(RACKS_KEY, JSON.stringify(racks));
  }
  function settleAndSave() {
    Stowage.settle(items, racks);
    save();
  }
  function normalize(item) {
    return {
      ...item,
      wetWeight: Number(item.wetWeight ?? 20),
      packaging: item.packaging || "standard",
      liftedAt: item.liftedAt || "",
      placement: item.placement && item.placement.rackId
        ? { rackId: item.placement.rackId, slot: Number(item.placement.slot) }
        : null,
      reasons: Array.isArray(item.reasons) ? item.reasons : []
    };
  }
  function seed() {
    const at = minutesAgo => new Date(Date.now() - minutesAgo * 60000).toISOString().slice(0, 16);
    return [
      { id: crypto.randomUUID(), code: "A-017", type: "ceramic", dive: "DIVE-01", x: 42, y: 46, depth: "17.8m", orientation: "东", condition: "边缘残缺", note: "靠近船肋", wetWeight: 12, packaging: "fragile", liftedAt: at(190) },
      { id: crypto.randomUUID(), code: "W-003", type: "wood", dive: "DIVE-02", x: 58, y: 39, depth: "18.2m", orientation: "西北", condition: "稳定", note: "疑似横梁", wetWeight: 88, packaging: "standard", liftedAt: at(150) },
      { id: crypto.randomUUID(), code: "M-011", type: "metal", dive: "DIVE-02", x: 63, y: 52, depth: "18.2m", orientation: "南", condition: "锈蚀", note: "铁炮残件", wetWeight: 210, packaging: "reinforced", liftedAt: at(120) },
      { id: crypto.randomUUID(), code: "C-044", type: "ceramic", dive: "DIVE-03", x: 37, y: 55, depth: "18.6m", orientation: "东北", condition: "完整", note: "青花碗", wetWeight: 26, packaging: "fragile", liftedAt: at(80) },
      { id: crypto.randomUUID(), code: "X-101", type: "unknown", dive: "DIVE-03", x: 49, y: 62, depth: "18.9m", orientation: "东", condition: "待清理", note: "大型凝结物，湿重远超各架承重", wetWeight: 480, packaging: "standard", liftedAt: at(30) }
    ].map(normalize);
  }

  function upsert(data) {
    let item = items.find(i => i.id === data.id);
    if (item) {
      const stagingChanged = STAGING_FIELDS.some(field => String(item[field]) !== String(data[field]));
      Object.assign(item, data);
      if (stagingChanged) item.placement = null; // 原架位立即失效
    } else {
      item = normalize({ ...data, id: crypto.randomUUID(), placement: null, reasons: [] });
      items.push(item);
    }
    settleAndSave();
    return item;
  }
  function remove(id) {
    items = items.filter(i => i.id !== id);
    settleAndSave(); // 释放出的架位按起吊时刻补位
  }

  const all = () => items;
  const diveList = () => [...new Set(items.map(i => i.dive))].sort();
  const byDive = dive => (dive ? items.filter(i => i.dive === dive) : items);
  const pending = dive => byDive(dive).filter(i => !i.placement).sort(Stowage.liftOrder);
  const allocated = dive => byDive(dive).filter(i => i.placement).sort(Stowage.liftOrder);
  const conflicts = dive => byDive(dive).filter(i => Stowage.isConflict(i)).sort(Stowage.liftOrder);
  const rackById = id => racks.find(r => r.id === id);
  function rackView() {
    return racks.map(rack => {
      const occupants = Stowage.rackOccupants(rack, items).sort(Stowage.liftOrder);
      return { ...rack, occupants, load: Stowage.rackLoad(rack, items), freeSlots: rack.slots - occupants.length };
    });
  }
  function manifest() {
    return {
      generatedAt: new Date().toISOString(),
      dives: diveList(),
      racks: rackView().map(({ occupants, ...rack }) => ({ ...rack, occupantCodes: occupants.map(i => i.code) })),
      items: [...items].sort(Stowage.liftOrder).map(item => ({
        ...item,
        status: item.placement ? "已配载" : "待配载",
        rackName: item.placement ? (rackById(item.placement.rackId) || {}).name || null : null,
        reasonText: (item.reasons || []).map(r => Stowage.REASONS[r] || r)
      }))
    };
  }

  return { upsert, remove, all, byDive, diveList, pending, allocated, conflicts, rackById, rackView, manifest };
})();
