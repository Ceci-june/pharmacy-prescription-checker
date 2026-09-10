// Gợi ý mã ICD-10 cho từng thuốc bằng cách đối chiếu ô "Chỉ định" với tên chẩn đoán ICD.
// Thuần đối chiếu chữ, không suy diễn y khoa: chỉ nhận khi cụm từ chẩn đoán XUẤT HIỆN
// trong phần chỉ định. Kết quả là KHUYẾN NGHỊ, dược sĩ phải tự xác nhận.
const X = require('./xlsx.mini.min.js');
const fs = require('fs');
const path = require('path');

const XLSX_IN = process.argv[2];
const ICD_JSON = process.argv[3];
const XLSX_OUT = process.argv[4];
const MAX = 4;   // tối đa 4 mã mỗi thuốc

// GIỮ NGUYÊN DẤU tiếng Việt. Bỏ dấu sẽ nhập nhằng hở/ho, đầu/đau, phần/phân — từng làm
// Ambroxol (thuốc ho) khớp "vết thương hở ở đầu".
const norm = s => String(s || '').toLowerCase()
  .replace(/[^0-9a-zà-ỹ]+/gi, ' ').replace(/\s+/g, ' ').trim();

// Bỏ phần chú thích và đuôi mơ hồ để lấy cụm lõi của chẩn đoán.
const TAIL = /(,?\s*(không xác định|không đặc hiệu|vị trí khác|vị trí không xác định|không kèm biến chứng|không biến chứng|không phân loại mục khác|phân loại nơi khác|mục khác|khác))+$/;
function coreOf(dx) {
  let t = norm(String(dx).replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' '));
  for (let i = 0; i < 3; i++) t = t.replace(TAIL, '').trim();
  return t;
}

// Từ quá phổ biến trong văn bản y khoa → không tính là bằng chứng đặc trưng.
const STOP = new Set(('bệnh viêm cấp tính mạn không xác định do và hoặc các ở tại khác người lớn trẻ em '
  + 'vị trí thuốc điều trị chứng trong ngoài sau trước khi bị có thể một hai nhiều phân loại mục nơi '
  + 'đặc hiệu kèm biến chứng trên dưới gây từ đầy lên là cho đến với mà như thật phần vùng của được '
  + 'dạng thể loại tình trạng nguyên phát thứ phát chỉ số cụ mức trường hợp này đó liều dùng '
  + 'uống tiêm ngày lần tuổi kèm theo nặng nhẹ vừa').split(' '));
const toks = s => norm(s).split(' ').filter(Boolean);
// Giữ cả từ 2 ký tự: bỏ chúng thì "vết thương HỞ ở DA đầu" rút còn "vết thương đầu",
// khiến kháng sinh trị "nhiễm khuẩn vết thương" khớp nhầm mã chấn thương.
const distinct = s => [...new Set(toks(s).filter(t => t.length >= 2 && !STOP.has(t)))];

const icd = JSON.parse(fs.readFileSync(ICD_JSON, 'utf8'))
  .map(r => ({ ...r, core: coreOf(r.dx), dist: distinct(coreOf(r.dx)) }));
const wb = X.read(fs.readFileSync(XLSX_IN));
const SHEET = wb.SheetNames[0];
const rows = X.utils.sheet_to_json(wb.Sheets[SHEET], { defval: '' });

// Thứ tự cột phải khớp DRUG_FIELDS của viewer: ICD nằm ngay sau Hoạt chất.
const ORDER = ['Tên thuốc', 'Hoạt chất', 'ICD khuyến nghị', 'Nhóm dược lý', 'Chỉ định',
  'Chống chỉ định', 'Liều dùng & độ tuổi', 'Thận trọng & tương tác'];
const COLS = ORDER.filter(c => c === 'ICD khuyến nghị' || Object.keys(rows[0]).includes(c))
  .concat(Object.keys(rows[0]).filter(c => !ORDER.includes(c)));

let filled = 0;
const report = [];
for (const r of rows) {
  const hay = ' ' + norm([r['Chỉ định'], r['Tên thuốc']].join(' . ')) + ' ';
  const hits = [];
  for (const c of icd) {
    // Bỏ chương S/T (chấn thương, bỏng, vết thương hở) khỏi phần GỢI Ý: chỉ định thuốc
    // hầu như không ánh xạ sang mã chấn thương, và đây là nguồn khớp nhầm có hệ thống
    // ("nhiễm khuẩn vết thương" → "vết thương hở ở da đầu"). Chúng vẫn tra được ở tab ICD 10.
    if (/^[ST]/.test(c.code)) continue;
    const D = c.dist;
    if (!D.length) continue;
    // Khớp CẢ TỪ. Dùng tiền tố thì ' ho' trúng luôn 'hoạt', 'hông', 'hoặc' → rác hàng loạt
    // (Allopurinol từng ra "gãy xương", Amlodipin ra "vết thương hở").
    const got = D.filter(t => hay.includes(' ' + t + ' '));
    const cover = got.length / D.length;
    // Cần ≥2 từ đặc trưng, phủ ≥60%, và ít nhất 1 từ dài ≥5 ký tự — tức một thuật ngữ thật,
    // không phải toàn từ ngắn dùng chung ("vet", "phan", "vung").
    if (got.length >= 2 && cover >= 0.8 && got.some(t => t.length >= 5)) {
      hits.push({ code: c.code, dx: c.dx, core: c.core, score: got.length + cover, got });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  const keep = [];
  for (const h of hits) {
    if (keep.some(k => k.core.includes(h.core) || h.core.includes(k.core))) continue;
    keep.push(h);
    if (keep.length >= MAX) break;
  }
  r['ICD khuyến nghị'] = keep.map(h => h.code).join(', ');
  if (keep.length) filled++;
  report.push({ name: r['Tên thuốc'], codes: keep.map(h => h.code + ' — ' + h.dx.slice(0, 42) + '   [khớp: ' + h.got.join(', ') + ']') });
}

if (XLSX_OUT) {
  const out = X.utils.book_new();
  const ws = X.utils.json_to_sheet(rows, { header: COLS });
  ws['!cols'] = COLS.map(c => ({ wch: c === 'Tên thuốc' ? 26 : c === 'ICD khuyến nghị' ? 22 : 46 }));
  X.utils.book_append_sheet(out, ws, SHEET);
  fs.writeFileSync(XLSX_OUT, X.write(out, { bookType: 'xlsx', type: 'buffer' }));
  console.log(`${path.basename(XLSX_OUT)} — ${rows.length} thuốc, ${filled} có gợi ý ICD (${rows.length - filled} để trống)\n`);
}

const show = +(process.env.SHOW || 0);
if (show) report.slice(0, show).forEach(x => {
  console.log('── ' + String(x.name).slice(0, 52));
  x.codes.length ? x.codes.forEach(c => console.log('     ' + c)) : console.log('     (không có)');
});
module.exports = { report, filled };
