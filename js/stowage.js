/* 配载判定：转运架承重、材质分区、吊带等级与混放规则的纯逻辑判定。 */
window.Stowage = (() => {
  const SLING_GRADES = {
    S1: { label: "S1 轻型吊带", max: 60 },
    S2: { label: "S2 中型吊带", max: 150 },
    S3: { label: "S3 重型吊带", max: 400 }
  };
  const PACKAGING = {
    standard: { label: "标准包装", fragile: false },
    reinforced: { label: "加固包装", fragile: false },
    fragile: { label: "易碎专护", fragile: true }
  };
  const REASONS = {
    zone: "材质分区不符",
    overweight: "超出转运架承重",
    sling: "吊带等级不足",
    mixing: "易碎品与金属件混放",
    "no-slot": "架位已满"
  };
  // 硬冲突：出现这些原因的遗物只能留在待配载区
  const HARD_REASONS = ["zone", "overweight", "sling", "mixing"];

  const isFragile = item => !!(PACKAGING[item.packaging] && PACKAGING[item.packaging].fragile);
  const isMetal = item => item.type === "metal";

  function rackOccupants(rack, items) {
    return items.filter(i => i.placement && i.placement.rackId === rack.id);
  }
  function rackLoad(rack, items) {
    return rackOccupants(rack, items).reduce((sum, i) => sum + Number(i.wetWeight || 0), 0);
  }
  function firstFreeSlot(rack, items) {
    const used = new Set(rackOccupants(rack, items).map(i => i.placement.slot));
    for (let slot = 0; slot < rack.slots; slot++) if (!used.has(slot)) return slot;
    return -1;
  }
  // 单架判定：返回 null 表示可以入架，否则返回失败原因代码
  function checkRack(rack, item, items) {
    if (!rack.zones.includes(item.type)) return "zone";
    if (rackLoad(rack, items) + Number(item.wetWeight) > rack.capacity) return "overweight";
    const sling = SLING_GRADES[rack.sling];
    if (!sling || Number(item.wetWeight) > sling.max) return "sling";
    const occupants = rackOccupants(rack, items);
    const mixed = (isFragile(item) && occupants.some(isMetal)) || (isMetal(item) && occupants.some(isFragile));
    if (mixed) return "mixing";
    if (firstFreeSlot(rack, items) < 0) return "no-slot";
    return null;
  }
  // 为单件寻找架位；成功返回 { rackId, slot }，失败返回 { reasons: [...] }
  function allocate(item, racks, items) {
    const reasons = [];
    for (const rack of racks) {
      const failed = checkRack(rack, item, items);
      if (!failed) return { rackId: rack.id, slot: firstFreeSlot(rack, items) };
      if (!reasons.includes(failed)) reasons.push(failed);
    }
    return { reasons };
  }
  const liftOrder = (a, b) =>
    String(a.liftedAt || "").localeCompare(String(b.liftedAt || "")) || String(a.code).localeCompare(String(b.code));
  // 全量重排：已占用架位不被抢走，失效架位释放后按起吊时刻先后重排
  function settle(items, racks) {
    const sorted = [...items].sort(liftOrder);
    const kept = [];
    for (const item of sorted) {
      if (!item.placement) continue;
      const rack = racks.find(r => r.id === item.placement.rackId);
      const slotTaken = kept.some(i => i.placement.rackId === item.placement.rackId && i.placement.slot === item.placement.slot);
      const slotValid = rack && item.placement.slot >= 0 && item.placement.slot < rack.slots;
      if (rack && slotValid && !slotTaken && !checkRack(rack, item, kept)) kept.push(item);
      else item.placement = null;
    }
    for (const item of sorted) {
      if (item.placement) { item.reasons = []; continue; }
      const result = allocate(item, racks, kept);
      if (result.rackId) {
        item.placement = { rackId: result.rackId, slot: result.slot };
        item.reasons = [];
        kept.push(item);
      } else {
        item.placement = null;
        item.reasons = result.reasons;
      }
    }
    return items;
  }
  const isConflict = item => !item.placement && (item.reasons || []).some(r => HARD_REASONS.includes(r));

  return { SLING_GRADES, PACKAGING, REASONS, HARD_REASONS, isFragile, rackOccupants, rackLoad, firstFreeSlot, checkRack, allocate, settle, isConflict, liftOrder };
})();
