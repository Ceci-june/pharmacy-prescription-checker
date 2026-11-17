// Dựng userseed.json — Danh mục / Thông tư / Tương tác nạp sẵn cho bản build — từ một
// file Excel đã xuất ra trước đó.
//
// Chạy qua trình duyệt chứ không tự đọc Excel bằng Node, để dùng ĐÚNG bộ nhập của ứng
// dụng: cùng cách khớp tên cột, cùng cách bỏ dòng trống. Viết lại logic đó ở Node thì
// sớm muộn cũng lệch so với bản chạy thật.
//
// Riêng sheet ICD phải tách riêng. Bộ nhập CHÈN THÊM dòng, mà bản build đã có sẵn hơn
// 15.000 mã, nên nhập thẳng là đẻ ra mã trùng. Dòng trùng khít thì bỏ; dòng cùng mã mà
// khác chữ (người dùng tự chú thích thêm vào tên chẩn đoán) thì ghi ra `codeEdits` để
// build-viewer.js áp thẳng lên dữ liệu tham chiếu.
const { chromium } = require('./node_modules/playwright');
const fs = require('fs');
const path = require('path');

const VIEWER = process.argv[2];      // otc-viewer.html (bản build nào cũng được)
const XLSX = process.argv[3];        // danhmuc-thongtu.xlsx
const OUT = process.argv[4];         // crawled-data/userseed.json
if (!VIEWER || !XLSX || !OUT) {
  console.error('dùng: node seed-userdata.js <otc-viewer.html> <file.xlsx> <userseed.json>');
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
    // Dòng nhập vào mang id ngẫu nhiên; dòng nạp sẵn của bản build mang id "drugs#12".
    // Lọc theo đó để lần chạy sau (trên bản build ĐÃ có dữ liệu nạp sẵn) không nhân đôi.
    const laGoc = r => /^[a-z0-9]+#\d+$/.test(String(r.id || ''));
    const sach = arr => (arr || []).filter(r => !laGoc(r)).map(r => {
      const o = Object.assign({}, r); delete o.id; return o;    // id sinh lại khi nạp
    });

    const traMa = c => String(c || '').replace(/[†*]/g, '').toUpperCase().trim();
    const icdGoc = (typeof seedRows === 'function' ? seedRows : seedCodes)('icd');
    const theoMa = new Map(icdGoc.map(r => [traMa(r.code), r]));
    const codeEdits = [];
    let trungKhit = 0;
    const maLa = [];
    for (const r of (UD.codes.icd || [])) {
      if (laGoc(r)) continue;
      const g = theoMa.get(traMa(r.code));
      if (!g) { maLa.push(r.code); continue; }
      if ((g.dx || '') === (r.dx || '') && !String(r.note || '').trim()) { trungKhit++; continue; }
      codeEdits.push({ code: r.code, dx: r.dx, note: r.note || '' });
    }

    return {
      drugs: sach(UD.drugs), circulars: sach(UD.circulars), inters: sach(UD.inters),
      codeEdits: { icd: codeEdits },
      bc: { trungKhit, suaDoi: codeEdits.length, maLa },
    };
  });

  if (errs.length) { console.error('LỖI JS:', errs); process.exit(1); }
  if (kq.bc.maLa.length) {
    console.error('Có mã ICD không nằm trong bản build:', kq.bc.maLa.slice(0, 10));
    process.exit(1);
  }

  const out = { drugs: kq.drugs, circulars: kq.circulars, inters: kq.inters, codeEdits: kq.codeEdits };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));

  console.log(`${path.basename(OUT)} — ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`);
  console.log(`  ${out.drugs.length} thuốc · ${out.circulars.length} thông tư · ${out.inters.length} cặp tương tác`);
  console.log(`  ICD: ${kq.bc.trungKhit} dòng trùng khít (bỏ) · ${kq.bc.suaDoi} chú thích giữ lại · 0 mã lạ`);
  await b.close();
})();
