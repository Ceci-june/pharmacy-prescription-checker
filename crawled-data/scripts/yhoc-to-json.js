// yhct.json / pl3.json (bản thô thu từ API yhoc.io) → dạng dùng được cho viewer.
//
// Viewer lưu mọi bộ mã theo cùng một hình: {code, dx, status, note} + vài cột riêng
// của từng bộ (xem `extra` trong CODE_SETS). Script này chỉ đổi tên trường và dịch
// nhãn trạng thái sang tiếng Việt — không suy diễn, không bịa thêm dữ liệu.
const fs = require('fs');
const path = require('path');

const SET = process.argv[2];          // yhct | pl3
const SRC = process.argv[3];
const OUT = process.argv[4];
const rows = JSON.parse(fs.readFileSync(SRC, 'utf8'));

// Nhãn trạng thái của họ là tiếng Anh; chip lọc trong viewer hiện nguyên văn giá trị
// nên phải dịch ở đây, không dịch lúc hiển thị.
const STATUS = {
  active: 'Đang dùng',
  new: 'Mã mới',
  modified: 'Đã sửa đổi',
  discontinued: 'Ngừng dùng',
};

const trim = v => String(v == null ? '' : v).trim();
let fellBack = 0;
let out;

if (SET === 'yhct') {
  out = rows.map(r => {
    // Một số ít bản ghi gốc bỏ trống tên YHCT; lấy tên y học hiện đại thay thế để dòng
    // không bị khuyết tên, nhưng đánh dấu lại ở ghi chú cho người tra biết.
    let dx = trim(r.nameYhct);
    let note = '';
    if (!dx) { dx = trim(r.nameModern); note = 'Bản gốc bỏ trống tên YHCT'; fellBack++; }
    return {
      code: trim(r.code),
      dx,
      icd10: trim(r.icd10Code),
      modern: trim(r.nameModern),
      billing: trim(r.billingName),
      status: STATUS[trim(r.status)] || trim(r.status),
      note,
    };
  });
} else if (SET === 'pl3') {
  // PL3 không có "mã" riêng cho từng chất: mỗi chất ứng với 5 mã ICD theo ý định
  // (ngộ độc / tai nạn / tự tử / không rõ / tác dụng phụ khi dùng đúng liều).
  // Lấy mã ngộ độc (T) làm cột Mã vì đó là mã chẩn đoán chính khi ngộ độc.
  out = rows.map(r => ({
    code: trim(r.poisoning),
    dx: trim(r.displayName),
    acc: trim(r.accidental),
    self: trim(r.selfHarm),
    undet: trim(r.undetermined),
    adv: trim(r.adverse),
    status: '',
    note: '',
  }));
} else {
  console.error('dùng: node yhoc-to-json.js <yhct|pl3> <src.json> <out.json>');
  process.exit(1);
}

out = out.filter(r => r.code && r.dx);
out.sort((a, b) => a.code.localeCompare(b.code, 'vi') || a.dx.localeCompare(b.dx, 'vi'));
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));

console.log(`${path.basename(OUT)} — ${out.length} mã (bỏ ${rows.length - out.length} dòng thiếu mã/tên)`);
if (fellBack) console.log(`  ${fellBack} dòng phải mượn tên y học hiện đại vì bản gốc bỏ trống tên YHCT`);
const st = {};
out.forEach(r => { st[r.status || '(không ghi)'] = (st[r.status || '(không ghi)'] || 0) + 1; });
console.log('  trạng thái:', Object.entries(st).map(([k, v]) => k + ':' + v).join('  '));
