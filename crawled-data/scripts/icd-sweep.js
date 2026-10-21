// Quét trọn ICD-10 theo NHÓM 3 KÝ TỰ, không dựa vào danh sách block.
//
// Vì sao bỏ cách đi theo block: danh sách block server-render của trang không đủ
// (chương II "U tân sinh" chỉ có 4 block, thực tế khoảng 18), nên đi từ block xuống
// sẽ hụt hẳn nhiều nhánh mà không có dấu hiệu gì báo.
//
// Mã ICD-10 cấp 3 luôn là CHỮ CÁI + 2 CHỮ SỐ, tức chỉ có 26 × 100 khả năng. Hỏi hết
// 2.600 khả năng đó thì phủ trọn bảng theo đúng định nghĩa, không phải tin vào dữ liệu
// điều hướng của trang. Mỗi lượt `search?q=<nhóm>` trả về chính nhóm đó và mọi mã con
// kèm đủ cờ trạng thái.
//
// Nhóm nào chạm trần 100 (chương cơ xương khớp dùng thêm ký tự thứ 5 chỉ vị trí) thì
// hỏi tiếp theo từng tiền tố con để không bị cắt.
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2];
const SEED_IN = process.argv[3];           // tuỳ chọn: gộp thêm kết quả lượt trước
const DELAY = +(process.env.DELAY || 120);
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

const codes = new Map();
// Mã mang sẵn ký hiệu † / * trong chuỗi ("A17†"), nên so tiền tố phải bỏ chúng ra.
const bare = c => String(c || '').replace(/[†*]/g, '').toUpperCase();

async function pull(prefix, depth) {
  const docs = await api(`/api/icd/search?q=${encodeURIComponent(prefix)}&limit=100`);
  let kept = 0;
  for (const d of docs) {
    if (!d.code || !bare(d.code).startsWith(prefix)) continue;
    kept++;
    if (!codes.has(d.code)) codes.set(d.code, d);
  }
  await sleep(DELAY);
  // Chạm trần thì chia nhỏ tiếp. Độ sâu 3 là đủ cho mã dài nhất (M05.10†).
  if (docs.length >= 100 && depth < 3) {
    const next = depth === 0 ? '.' : '';
    for (const c of '0123456789'.split('')) await pull(prefix + next + c, depth + 1);
  }
  return kept;
}

(async () => {
  if (SEED_IN && fs.existsSync(SEED_IN)) {
    for (const r of JSON.parse(fs.readFileSync(SEED_IN, 'utf8'))) codes.set(r.code, r);
    console.log(`gộp sẵn ${codes.size} mã từ lượt trước`);
  }
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  let done = 0, live = 0;
  for (const L of LETTERS) {
    for (let n = 0; n < 100; n++) {
      const g = L + String(n).padStart(2, '0');
      if (await pull(g, 0)) live++;
      process.stdout.write(`\r  ${++done}/2600 nhóm thử · ${live} nhóm có thật · ${codes.size} mã   `);
    }
  }
  const rows = [...codes.values()].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
  console.log(`\nxong: ${rows.length} mã · ${live} nhóm có thật`);
  console.log(`→ ${OUT}`);
})().catch(e => { console.error('\nLỖI: ' + e.message); process.exit(1); });
