/* 配载判定：转运架匹配规则与配载计算。纯函数，不读写存储、不操作页面。 */
const Allocation = (() => {
  const SLING_RANK = { S1: 1, S2: 2, S3: 3 };
  const ZONE_NAMES = { ceramic: "陶瓷区", wood: "木作区", metal: "金属区", general: "通用区" };

  // 按湿重确定所需吊带等级
  function requiredSling(wetWeight) {
    if (wetWeight >= 100) return "S3";
    if (wetWeight >= 30) return "S2";
    return "S1";
  }

  // 陶瓷类与简易包装均按易碎品处理
  function isFragile(mark) {
    return mark.type === "ceramic" || mark.packGrade === "C";
  }

  // 配载键：重量、类型或包装任一变化，原架位立即失效
  function allocationKey(mark) {
    return [mark.wetWeight, mark.type, mark.packGrade].join("|");
  }

  // 单件对单架的规则检查，返回违反原因列表（空数组表示可上架）
  function rackProblems(mark, rack, occupants) {
    const problems = [];
    if (rack.zone !== "general" && rack.zone !== mark.type) {
      problems.push("材质分区不符（需" + (ZONE_NAMES[mark.type] || "通用区") + "）");
    }
    const used = occupants.reduce((sum, m) => sum + m.wetWeight, 0);
    if (used + mark.wetWeight > rack.capacity) {
      problems.push("超重：架余量" + (rack.capacity - used).toFixed(1) + "kg < 湿重" + mark.wetWeight + "kg");
    }
    const need = requiredSling(mark.wetWeight);
    if (SLING_RANK[rack.sling] < SLING_RANK[need]) {
      problems.push("吊带等级不足（需" + need + "，架为" + rack.sling + "）");
    }
    const hasMetal = occupants.some(o => o.type === "metal");
    const hasFragile = occupants.some(o => isFragile(o));
    if (isFragile(mark) && hasMetal) problems.push("易碎品不可与金属件同架");
    if (mark.type === "metal" && hasFragile) problems.push("金属件不可与易碎品同架");
    return problems;
  }

  function firstFreeSlot(rack, usedSlots) {
    for (let s = 0; s < rack.slots; s++) if (!usedSlots.has(s)) return s;
    return -1;
  }

  // 全量配载：先保留仍有效的原架位，再为失效/新件按起吊时刻顺序重排
  function evaluate(marks, racks) {
    const order = [...marks].sort((a, b) =>
      String(a.dive).localeCompare(String(b.dive)) ||
      String(a.liftTime).localeCompare(String(b.liftTime)) ||
      String(a.code).localeCompare(String(b.code))
    );
    const assignments = new Map(); // markId -> { rackId, slot }
    const occupants = new Map();   // rackId -> [mark]
    const usedSlots = new Map();   // rackId -> Set(slot)
    const rackById = new Map(racks.map(r => [r.id, r]));

    function place(mark, rack, slot) {
      assignments.set(mark.id, { rackId: rack.id, slot });
      if (!occupants.has(rack.id)) occupants.set(rack.id, []);
      occupants.get(rack.id).push(mark);
      if (!usedSlots.has(rack.id)) usedSlots.set(rack.id, new Set());
      usedSlots.get(rack.id).add(slot);
    }

    // 第一遍：保留原架位。键值一致、分区与规则仍通过、架位未被占，则别人抢不走
    for (const mark of order) {
      const a = mark.allocation;
      if (!a || a.key !== allocationKey(mark)) continue;
      const rack = rackById.get(a.rackId);
      if (!rack || a.slot >= rack.slots) continue;
      if (usedSlots.get(rack.id) && usedSlots.get(rack.id).has(a.slot)) continue;
      if (rackProblems(mark, rack, occupants.get(rack.id) || []).length) continue;
      place(mark, rack, a.slot);
    }

    // 第二遍：未配载的按序找第一个全规则通过的架空位
    const conflicts = [];
    for (const mark of order) {
      if (assignments.has(mark.id)) continue;
      const reasons = new Set();
      let placed = false;
      for (const rack of racks) {
        const occ = occupants.get(rack.id) || [];
        const problems = rackProblems(mark, rack, occ);
        if (occ.length >= rack.slots) problems.push("架位已满");
        problems.forEach(p => reasons.add(p));
        if (problems.length) continue;
        const slot = firstFreeSlot(rack, usedSlots.get(rack.id) || new Set());
        if (slot < 0) { reasons.add("架位已满"); continue; }
        place(mark, rack, slot);
        placed = true;
        break;
      }
      if (!placed) {
        if (!reasons.size) reasons.add("无可用转运架");
        conflicts.push({ mark, reasons: [...reasons] });
      }
    }
    return { assignments, conflicts, occupants };
  }

  return { SLING_RANK, ZONE_NAMES, requiredSling, isFragile, allocationKey, rackProblems, evaluate };
})();
