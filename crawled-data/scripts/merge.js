// Gom rows.jsonl + parts/*.jsonl → kiểm tra → xuất Excel.
const fs = require('fs');
const path = require('path');
const X = require('./node_modules/xlsx/dist/xlsx.mini.min.js');

const DIR = __dirname;
const OUT = process.argv[2] || '/Users/vy/Desktop/Personal/Giaidapduoc/danh-muc-import.xlsx';
const KEYS = ['n', 'name', 'ing', 'cls', 'ind', 'ci', 'dose', 'caut'];
const COLS = ['Tên thuốc', 'Hoạt chất', 'Nhóm dược lý', 'Chỉ định', 'Chống chỉ định',
  'Liều dùng & độ tuổi', 'Thận trọng & tương tác'];
const MAP = { 'Tên thuốc':'name', 'Hoạt chất':'ing', 'Nhóm dược lý':'cls', 'Chỉ định':'ind',
  'Chống chỉ định':'ci', 'Liều dùng & độ tuổi':'dose', 'Thận trọng & tương tác':'caut' };

const index = fs.readFileSync(path.join(DIR, 'pages/_index.txt'), 'utf8').trim().split('\n')
  .map(l => { const [n, name] = l.split('|'); return { n: +n, file: name }; });

// ── đọc mọi nguồn ──
const files = ['rows.jsonl', ...fs.readdirSync(path.join(DIR, 'parts')).filter(f => f.endsWith('.jsonl')).map(f => 'parts/' + f)];
const rows = [], badJson = [];
for (const f of files) {
  const p = path.join(DIR, f);
  if (!fs.existsSync(p)) continue;
  fs.readFileSync(p, 'utf8').split('\n').filter(l => l.trim()).forEach((l, i) => {
    try { const o = JSON.parse(l); o._src = f; rows.push(o); }
    catch (e) { badJson.push(`${f}:${i + 1} — ${e.message.slice(0, 70)}`); }
  });
}

// ── kiểm tra ──
const byN = new Map(), dupes = [];
for (const r of rows) {
  if (byN.has(r.n)) dupes.push(`n=${r.n} (${byN.get(r.n)._src} và ${r._src})`);
  else byN.set(r.n, r);
}
const missing = index.filter(d => !byN.has(d.n));
const missingKeys = [], unreadable = [], emptyCore = [];
for (const [n, r] of byN) {
  const lack = KEYS.filter(k => !(k in r));
  if (lack.length) missingKeys.push(`n=${n}: thiếu khoá ${lack.join(', ')}`);
  for (const k of ['ind', 'ci', 'dose', 'ing']) if (!String(r[k] || '').trim()) emptyCore.push(`n=${n} (${r.name || '?'}): ${k} rỗng`);
  if (/không đọc rõ/i.test(JSON.stringify(r))) unreadable.push(`n=${n} (${r.name || '?'})`);
}

// ── xuất ──
const CAP = 32000;
let capped = 0;
const out = [...byN.values()].sort((a, b) => a.n - b.n).map(r => {
  const o = {};
  for (const c of COLS) {
    let v = String(r[MAP[c]] == null ? '' : r[MAP[c]]).trim();
    if (v.length > CAP) { v = v.slice(0, CAP) + ' […cắt bớt]'; capped++; }
    o[c] = v;
  }
  return o;
});
const wb = X.utils.book_new();
const ws = X.utils.json_to_sheet(out, { header: COLS });
ws['!cols'] = [{wch:26},{wch:30},{wch:26},{wch:52},{wch:46},{wch:52},{wch:56}];
X.utils.book_append_sheet(wb, ws, 'Danh mục');
fs.writeFileSync(OUT, X.write(wb, { bookType: 'xlsx', type: 'buffer' }));

// ── báo cáo ──
const line = (t, arr) => { console.log(`${t}: ${arr.length}`); arr.slice(0, 12).forEach(x => console.log('   ' + x)); if (arr.length > 12) console.log(`   … và ${arr.length - 12} mục nữa`); };
console.log(`\n${path.basename(OUT)} — ${out.length}/${index.length} thuốc\n`);
console.log('độ đầy từng cột:');
for (const c of COLS) console.log('  ' + c.padEnd(23) + out.filter(r => r[c]).length + '/' + out.length);
console.log('');
line('JSON lỗi', badJson);
line('trùng n', dupes);
line('còn thiếu', missing.map(d => `n=${d.n} ${d.file}`));
line('thiếu khoá', missingKeys);
line('ô cốt lõi rỗng', emptyCore);
line('có chỗ không đọc rõ (cần soát tay)', unreadable);
if (capped) console.log(`\n${capped} ô bị cắt vì vượt giới hạn 32.767 ký tự của Excel`);
