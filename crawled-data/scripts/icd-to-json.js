// ICD_10.xlsx → icd10.json (nhúng vào viewer như dữ liệu tra cứu chỉ đọc).
const X = require('./xlsx.mini.min.js');
const fs = require('fs');
const path = require('path');

const SRC = process.argv[2], OUT = process.argv[3];
const wb = X.read(fs.readFileSync(SRC));
const rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });

const seen = new Set(), out = [];
for (const r of rows) {
  const code = String(r['Mã ICD'] || '').trim();
  const dx = String(r['Chẩn đoán'] || '').trim();
  if (!code || !dx) continue;
  const key = code + '|' + dx;
  if (seen.has(key)) continue;
  seen.add(key);
  out.push({ code, dx });
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`${path.basename(OUT)} — ${out.length} mã (bỏ ${rows.length - out.length} dòng trùng/trống)`);
const ch = {};
out.forEach(r => { const c = r.code[0]; ch[c] = (ch[c] || 0) + 1; });
console.log('theo chương:', Object.entries(ch).sort().map(([k, v]) => k + ':' + v).join('  '));
