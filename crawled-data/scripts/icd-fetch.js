// Thu toàn bộ danh mục ICD-10 từ API công khai của yhoc.io.
//
// Khác hai bộ kia, ICD-10 có CẤU TRÚC CÂY nên không phải mò chuỗi con: đi theo
// chương → block → nhóm 3 ký tự → mã lá. Duyệt cây chắc hơn nhiều, vì mỗi nhánh
// có số con nhỏ hơn trần 100 của máy chủ, không nhánh nào bị cắt.
//
//   /api/icd/children?block=A00-A09  → các nhóm 3 ký tự trong block
//   /api/icd/search?q=A00&limit=100  → chính nhóm đó + mọi mã con, KÈM ĐỦ CỜ
//
// Dùng search ở bước cuối thay vì children?group= vì children chỉ trả về 3 cờ, còn
// search trả về đủ: chương, dagger/asterisk, giới, tử vong, mã chi tiết hơn…
const fs = require('fs');
const path = require('path');

const BLOCKS_IN = process.argv[2];   // JSON danh sách block lấy từ trang
const OUT = process.argv[3];
const DELAY = +(process.env.DELAY || 130);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(p) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch('https://yhoc.io' + p, { headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      return Array.isArray(j.docs) ? j.docs : [];
    } catch (e) {
      if (i >= 4) throw new Error(p + ' → ' + e.message);
      await sleep(700 * i);
    }
  }
}

(async () => {
  const blocks = JSON.parse(fs.readFileSync(BLOCKS_IN, 'utf8'));
  console.log(`${blocks.length} block`);

  // ── bước 1: block → nhóm 3 ký tự ──
  const groups = new Map();
  let n = 0;
  for (const b of blocks) {
    for (const g of await api('/api/icd/children?block=' + encodeURIComponent(b.blockCode))) {
      if (!groups.has(g.code)) groups.set(g.code, { ...g, block: b });
    }
    process.stdout.write(`\r  bước 1: ${++n}/${blocks.length} block · ${groups.size} nhóm   `);
    await sleep(DELAY);
  }
  console.log();

  // ── bước 2: mỗi nhóm → chính nó + mã con, kèm đủ cờ ──
  const codes = new Map();
  n = 0;
  const overflow = [];
  for (const [code, g] of groups) {
    const docs = await api(`/api/icd/search?q=${encodeURIComponent(code)}&limit=100`);
    // Nhóm nào chạm trần 100 thì ghi lại — ICD không có nhóm nào đông thế, nếu có
    // nghĩa là `q` khớp cả vào tên chứ không riêng mã, phải xem lại.
    if (docs.length >= 100) overflow.push(code);
    for (const d of docs) {
      if (!d.code || !String(d.code).toUpperCase().startsWith(code)) continue;
      if (!codes.has(d.code)) codes.set(d.code, { ...d, blockCode: g.block.blockCode, blockVi: g.block.blockVi });
    }
    process.stdout.write(`\r  bước 2: ${++n}/${groups.size} nhóm · ${codes.size} mã   `);
    await sleep(DELAY);
  }
  console.log();

  // ── bước 3: mã đã thu hồi (nếu có) ──
  let retired = [];
  try { retired = await api('/api/icd/retired?q='); } catch (e) { console.log('  (bỏ qua mã thu hồi: ' + e.message + ')'); }

  const rows = [...codes.values()].sort((a, b) => a.code.localeCompare(b.code, 'en'));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
  if (retired.length) fs.writeFileSync(OUT.replace(/\.json$/, '-retired.json'), JSON.stringify(retired, null, 1));

  console.log(`\nxong: ${rows.length} mã · ${groups.size} nhóm · ${retired.length} mã thu hồi`);
  if (overflow.length) console.log('CẢNH BÁO — nhóm chạm trần 100: ' + overflow.join(', '));
  const lv = {};
  rows.forEach(r => { const k = r.code.length; lv[k] = (lv[k] || 0) + 1; });
  console.log('theo độ dài mã:', Object.entries(lv).sort().map(([k, v]) => k + ' ký tự:' + v).join('  '));
  console.log(`→ ${OUT}`);
})().catch(e => { console.error('\nLỖI: ' + e.message); process.exit(1); });
