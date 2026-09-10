// rows.jsonl (1 thuốc / dòng) → file Excel đúng định dạng Nạp từ Excel của tab Danh mục.
const X = require('./node_modules/xlsx/dist/xlsx.mini.min.js');
const fs = require('fs');

const SRC = process.argv[2] || 'rows.jsonl';
const OUT = process.argv[3] || '/Users/vy/Desktop/Personal/Giaidapduoc/danh-muc-import.xlsx';

const COLS = ['Tên thuốc', 'Hoạt chất', 'Nhóm dược lý', 'Chỉ định', 'Chống chỉ định',
  'Liều dùng & độ tuổi', 'Thận trọng & tương tác'];
const KEY = { 'Tên thuốc':'name', 'Hoạt chất':'ing', 'Nhóm dược lý':'cls', 'Chỉ định':'ind',
  'Chống chỉ định':'ci', 'Liều dùng & độ tuổi':'dose', 'Thận trọng & tương tác':'caut' };

const seen = new Set();
const rows = fs.readFileSync(SRC, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  .filter(r => { if (seen.has(r.name)) return false; seen.add(r.name); return true; })
  .sort((a, b) => a.name.localeCompare(b.name, 'vi'));

const CAP = 32000;   // giới hạn ô của Excel là 32.767
let capped = 0;
const out = rows.map(r => {
  const o = {};
  for (const c of COLS) {
    let v = String(r[KEY[c]] == null ? '' : r[KEY[c]]).trim();
    if (v.length > CAP) { v = v.slice(0, CAP) + ' […cắt bớt]'; capped++; }
    o[c] = v;
  }
  return o;
});

const wb = X.utils.book_new();
const ws = X.utils.json_to_sheet(out, { header: COLS });
ws['!cols'] = [{wch:26},{wch:30},{wch:26},{wch:52},{wch:46},{wch:52},{wch:56}];
X.utils.book_append_sheet(wb, ws, 'Danh mục');
// bản mini không có writeFile trong Node → ghi buffer bằng fs
fs.writeFileSync(OUT, X.write(wb, { bookType: 'xlsx', type: 'buffer' }));

const filled = c => out.filter(r => r[c]).length;
console.log(`${OUT.split('/').pop()} — ${out.length} thuốc`);
console.log('độ đầy từng cột:');
for (const c of COLS) console.log('  ' + c.padEnd(22) + filled(c) + '/' + out.length);
if (capped) console.log(`(${capped} ô bị cắt vì vượt giới hạn Excel)`);
