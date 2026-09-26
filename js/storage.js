/* 暂存档案：潜水标记与转运架数据的读写、默认值与旧记录迁移。 */
const Storage = (() => {
  const MARKS_KEY = "zfl30Marks";
  const RACKS_KEY = "zfl30Racks";

  const DEFAULT_RACKS = [
    { id: "R-01", name: "陶瓷专架", zone: "ceramic", capacity: 120, sling: "S1", slots: 6 },
    { id: "R-02", name: "木作专架", zone: "wood", capacity: 200, sling: "S2", slots: 4 },
    { id: "R-03", name: "金属专架", zone: "metal", capacity: 320, sling: "S3", slots: 4 },
    { id: "R-04", name: "通用暂存架", zone: "general", capacity: 150, sling: "S2", slots: 6 }
  ];

  const DEFAULT_MARKS = [
    { id: crypto.randomUUID(), code: "A-017", type: "ceramic", dive: "DIVE-01", x: 42, y: 46, depth: "17.8m", orientation: "东", condition: "边缘残缺", note: "靠近船肋", wetWeight: 18, packGrade: "B", liftTime: "09:10" },
    { id: crypto.randomUUID(), code: "W-003", type: "wood", dive: "DIVE-02", x: 58, y: 39, depth: "18.2m", orientation: "西北", condition: "稳定", note: "疑似横梁", wetWeight: 64, packGrade: "B", liftTime: "10:25" },
    { id: crypto.randomUUID(), code: "M-011", type: "metal", dive: "DIVE-02", x: 50, y: 55, depth: "18.6m", orientation: "正北", condition: "锈蚀", note: "铁锚残件", wetWeight: 140, packGrade: "A", liftTime: "11:05" }
  ];

  // 旧记录缺少配载字段时补默认值
  function migrate(mark) {
    return {
      wetWeight: 10,
      packGrade: "B",
      liftTime: "08:30",
      ...mark,
      wetWeight: Number(mark.wetWeight) || 0,
      packGrade: mark.packGrade || "B",
      liftTime: mark.liftTime || "08:30"
    };
  }

  function loadMarks() {
    let marks = [];
    try { marks = JSON.parse(localStorage.getItem(MARKS_KEY) || "[]"); } catch (e) { marks = []; }
    if (!marks.length) {
      marks = DEFAULT_MARKS;
      saveMarks(marks);
    }
    return marks.map(migrate);
  }

  function loadRacks() {
    try {
      const racks = JSON.parse(localStorage.getItem(RACKS_KEY) || "null");
      if (Array.isArray(racks) && racks.length) return racks;
    } catch (e) { /* 落到默认 */ }
    saveRacks(DEFAULT_RACKS);
    return DEFAULT_RACKS.map(r => ({ ...r }));
  }

  function saveMarks(marks) { localStorage.setItem(MARKS_KEY, JSON.stringify(marks)); }
  function saveRacks(racks) { localStorage.setItem(RACKS_KEY, JSON.stringify(racks)); }

  return { loadMarks, loadRacks, saveMarks, saveRacks };
})();
