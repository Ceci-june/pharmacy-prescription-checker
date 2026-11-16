// Nạp sẵn file dữ liệu dùng chung từ một file Excel đã xuất ra trước đó.
//
// Chạy qua trình duyệt chứ không tự đọc Excel bằng Node, để dùng ĐÚNG bộ nhập của ứng
// dụng — cùng cách khớp tên cột, cùng cách bỏ dòng trống. Viết lại logic đó ở Node thì
// sớm muộn cũng lệch so với bản chạy thật.
//
// Riêng sheet ICD phải xử lý thêm. Bộ nhập của app CHÈN THÊM dòng, mà bản build giờ đã
// có sẵn 15.844 mã, nên 336 dòng ICD trong file Excel cũ sẽ thành mã trùng. Phần lớn
// trùng khít nên bỏ đi là xong, nhưng vài chục dòng có chữ khác (chú thích riêng người
// dùng thêm vào tên chẩn đoán) — những dòng đó áp thành SỬA ĐỔI trên đúng mã sẵn có,
// giữ được chữ của người dùng mà không đẻ ra mã trùng.
const { chromium } = require('./node_modules/playwright');
const fs = require('fs');
const path = require('path');

const VIEWER = process.argv[2];      // otc-viewer.html
const XLSX = process.argv[3];        // danhmuc-thongtu.xlsx
const OUT = process.argv[4];         // du-lieu-tra-cuu-duoc.json
if (!VIEWER || !XLSX || !OUT) {
  console.error('dùng: node seed-datafile.js <otc-viewer.html> <file.xlsx> <ra.json>');
  process.exit(1);
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => m.type() === 'error' && errs.push('console: ' + m.text()));
  p.on('dialog', d => d.accept());

  await p.goto('file://' + VIEWER.split('/').map(encodeURIComponent).join('/'));
  await p.evaluate(() => localStorage.removeItem('gdd.userdata.v1'));
  await p.reload();

  // nạp bằng chính nút "Nạp từ Excel" của app
  await p.click('.tab[data-tab="catalog"]');
  const fc = p.waitForEvent('filechooser');
  await p.click('.btn:has-text("Nạp từ Excel")');
  await (await fc).setFiles(XLSX);
  await p.waitForTimeout(3000);

  const kq = await p.evaluate(() => {
    // Dòng do nhập vào có id ngẫu nhiên; dòng gốc của bản build có id dạng "icd#12".
    const laGoc = r => /^[a-z0-9]+#\d+$/.test(String(r.id || ''));
    const bc = {};
    for (const key in UD.codes) {
      const seed = seedCodes(key);
      const theoMa = new Map(seed.map(r => [r.code, r]));
      const traMa = c => String(c || '').replace(/[†*]/g, '').toUpperCase();
      const theoMaTran = new Map(seed.map(r => [traMa(r.code), r]));
      const giu = [], sua = [];
      let trungKhit = 0, themMoi = 0;
      for (const r of UD.codes[key]) {
        if (laGoc(r)) { giu.push(r); continue; }
        const g = theoMa.get(r.code) || theoMaTran.get(traMa(r.code));
        if (!g) { giu.push(r); themMoi++; continue; }   // mã thật sự chưa có -> giữ
        if ((g.dx || '') === (r.dx || '') && !String(r.note || '').trim()) { trungKhit++; continue; }
        // cùng mã, khác chữ -> ghi đè lên dòng gốc, KHÔNG thêm dòng mới
        sua.push({ id: g.id, moi: Object.assign({}, g, r, { id: g.id }) });
      }
      const theoId = new Map(giu.map(r => [r.id, r]));
      for (const s of sua) theoId.set(s.id, s.moi);
      UD.codes[key] = giu.map(r => theoId.get(r.id) || r);
      bc[key] = { trungKhitBoDi: trungKhit, apThanhSuaDoi: sua.length, themMoi };
    }
    udSave();
    const payload = JSON.parse(localStorage.getItem('gdd.userdata.v1'));
    return {
      payload,
      bc,
      soThuoc: UD.drugs.length,
      soThongTu: UD.circulars.length,
      soTuongTac: UD.inters.length,
      soMa: Object.fromEntries(Object.entries(UD.codes).map(([k, v]) => [k, v.length])),
    };
  });

  if (errs.length) { console.error('LỖI JS:', errs); process.exit(1); }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(kq.payload, null, 1));

  console.log(`${path.basename(OUT)} — ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`);
  console.log(`  ${kq.soThuoc} thuốc · ${kq.soThongTu} thông tư · ${kq.soTuongTac} cặp tương tác`);
  for (const [k, v] of Object.entries(kq.bc)) {
    if (!v.trungKhitBoDi && !v.apThanhSuaDoi && !v.themMoi) continue;
    console.log(`  ${k}: ${v.trungKhitBoDi} dòng trùng khít (bỏ) · ${v.apThanhSuaDoi} áp thành sửa đổi · ${v.themMoi} mã mới`);
  }
  console.log(`  tổng số mã sau khi gộp: ` +
    Object.entries(kq.soMa).map(([k, v]) => k + ':' + v).join('  '));
  await b.close();
})();
