// Kiểm chức năng dùng chung dữ liệu qua file.
//
// Cảnh phải đúng: nhập Danh mục ở "trình duyệt A", mở ở "trình duyệt B" trên cùng máy
// thì phải THẤY. Hai hồ sơ trình duyệt riêng = hai localStorage riêng, nên nếu B thấy
// được thì chỉ có thể là nhờ file chung, không thể nhờ localStorage.
//
// Playwright không bấm được hộp thoại chọn file của hệ điều hành, nên test gắn sẵn
// "tay nắm" file vào trang (cùng thứ mà showSaveFilePicker trả về) rồi gọi đúng những
// hàm mà nút bấm sẽ gọi.
const { chromium } = require('./node_modules/playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

const FILE = process.argv[2] || 'file:///Users/vy/Desktop/Personal/Giaidapduoc/otc-viewer.html';
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-share-'));
const DATA = path.join(DIR, 'du-lieu.json');
const out = {};

// Tay nắm file giả, đủ dùng cho fsSync/fsFlush: getFile + createWritable + quyền.
const FAKE = `(path) => {
  window.__disk = window.__disk || {};
  const h = {
    name: 'du-lieu.json',
    async queryPermission() { return 'granted'; },
    async requestPermission() { return 'granted'; },
    async getFile() {
      const t = window.__disk[path] == null ? '' : window.__disk[path];
      return { text: async () => t };
    },
    async createWritable() {
      let buf = '';
      return { write: async c => { buf += c; }, close: async () => { window.__disk[path] = buf; } };
    },
  };
  return h;
}`;

(async () => {
  const b = await chromium.launch();
  const errors = [];

  // Hai hồ sơ riêng biệt = hai trình duyệt khác nhau trên cùng máy.
  const mo = async (ctx, disk) => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(String(e)));
    p.on('console', m => m.type() === 'error' && errors.push('console: ' + m.text()));
    await p.addInitScript(d => { window.__disk = d; }, disk);
    await p.goto(FILE);
    return p;
  };

  let disk = {};                                  // "ổ đĩa" dùng chung giữa hai hồ sơ

  // ── Trình duyệt A: nối file rồi nhập một thuốc ──
  const ctxA = await b.newContext();
  const A = await mo(ctxA, disk);
  await A.evaluate(`fsHandle = (${FAKE})('du-lieu.json')`);
  await A.evaluate(() => fsSync());
  out.A_trangThaiSauKhiNoi = await A.evaluate(() => S.fsState);

  await A.evaluate(() => {
    UD.drugs.push({ id: 'x1', name: 'PANADOL EXTRA (viên nén)', ing: 'Paracetamol + Caffein',
                    icd: '', cls: '', ind: '', ci: '', dose: '', caut: '' });
    UD.circulars.push({ id: 'c1', name: 'Thông tư thử', body: 'nội dung' });
    udSave();
  });
  await A.waitForTimeout(900);                    // chờ qua khoảng gộp ghi 400ms
  disk = await A.evaluate(() => window.__disk);
  out.fileDaGhi = !!disk['du-lieu.json'];
  out.fileChua = (() => {
    const o = JSON.parse(disk['du-lieu.json'] || '{}');
    return { soThuoc: (o.drugs || []).length, soThongTu: (o.circulars || []).length, coMocThoiGian: !!o.savedAt };
  })();

  // ── Trình duyệt B: hồ sơ mới toanh, nối cùng file ──
  const ctxB = await b.newContext();
  const B = await mo(ctxB, disk);
  out.B_truocKhiNoi = await B.evaluate(() => ({
    soThuoc: UD.drugs.length, soThongTu: UD.circulars.length,
  }));
  await B.evaluate(`fsHandle = (${FAKE})('du-lieu.json')`);
  await B.evaluate(() => fsSync());
  out.B_sauKhiNoi = await B.evaluate(() => ({
    soThuoc: UD.drugs.length, tenThuoc: (UD.drugs[0] || {}).name,
    soThongTu: UD.circulars.length, trangThai: S.fsState,
  }));

  // ── B sửa tiếp, A mở lại phải thấy ──
  await B.evaluate(() => {
    UD.drugs.push({ id: 'x2', name: 'EFFERALGAN 500 (viên sủi)', ing: 'Paracetamol 500mg',
                    icd: '', cls: '', ind: '', ci: '', dose: '', caut: '' });
    udSave();
  });
  await B.waitForTimeout(900);
  disk = await B.evaluate(() => window.__disk);

  const A2 = await mo(await b.newContext(), disk);
  await A2.evaluate(`fsHandle = (${FAKE})('du-lieu.json')`);
  await A2.evaluate(() => fsSync());
  out.A_moLaiThayCuaB = await A2.evaluate(() => ({
    soThuoc: UD.drugs.length, ten: UD.drugs.map(d => d.name).sort(),
  }));

  // ── Bên nào lưu SAU thì bên đó thắng, không phải bên nào nối sau ──
  const C = await mo(await b.newContext(), disk);
  await C.evaluate(() => {
    // máy này có dữ liệu cũ hơn file
    const cu = { drugs: [{ id: 'z', name: 'THUỐC CŨ', ing: 'x' }], circulars: [], inters: [],
                 seeded: ['icd', 'yhct', 'pl3'], codes: {}, savedAt: 1 };
    localStorage.setItem('gdd.userdata.v1', JSON.stringify(cu));
  });
  await C.reload();
  await C.evaluate(`fsHandle = (${FAKE})('du-lieu.json')`);
  await C.evaluate(() => fsSync());
  out.fileMoiHonThiThangLocal = await C.evaluate(() => UD.drugs.map(d => d.name).sort());

  // mã tham chiếu không được chui vào file dùng chung
  out.kichThuocFile = (disk['du-lieu.json'] || '').length;
  out.maTrongBoNhoVanDu = await A2.evaluate(() => (UD.codes.icd || []).length);

  // ── File TRỐNG đi kèm bản phát hành không được xoá dữ liệu đã có ──
  // Đây là cảnh mất dữ liệu dễ xảy ra nhất: người dùng nhập Danh mục xong mới bấm nối
  // vào file trống có sẵn trong thư mục.
  const TRONG = JSON.stringify({ drugs: [], circulars: [], inters: [], seeded: [], codes: {}, savedAt: 0 });
  const D = await mo(await b.newContext(), { 'trong.json': TRONG });
  await D.evaluate(() => {
    UD.drugs.push({ id: 'k1', name: 'DANH MỤC TÔI ĐÃ NHẬP', ing: 'abc',
                    icd: '', cls: '', ind: '', ci: '', dose: '', caut: '' });
    udSave();
  });
  await D.evaluate(`fsHandle = (${FAKE})('trong.json')`);
  await D.evaluate(() => fsSync());
  await D.waitForTimeout(700);
  out.fileTrongKhongXoaDuLieu = await D.evaluate(() => ({
    conTrenMay: UD.drugs.map(d => d.name),
    daDayLenFile: JSON.parse(window.__disk['trong.json'] || '{}').drugs.map(d => d.name),
  }));

  // ── Nhưng xoá hết CÓ CHỦ Ý thì vẫn phải đồng bộ sang máy kia ──
  const XOA_HET = JSON.stringify({ drugs: [], circulars: [], inters: [],
                                   seeded: ['icd', 'yhct', 'pl3'], codes: {}, savedAt: Date.now() });
  const E = await mo(await b.newContext(), { 'xoa.json': XOA_HET });
  await E.evaluate(() => {
    UD.drugs.push({ id: 'k2', name: 'THUỐC CŨ CỦA MÁY NÀY', ing: 'abc',
                    icd: '', cls: '', ind: '', ci: '', dose: '', caut: '' });
    const o = JSON.parse(localStorage.getItem('gdd.userdata.v1') || '{}');
    o.drugs = UD.drugs; o.savedAt = 1;        // máy này cũ hơn
    localStorage.setItem('gdd.userdata.v1', JSON.stringify(o));
  });
  await E.evaluate(`fsHandle = (${FAKE})('xoa.json')`);
  await E.evaluate(() => fsSync());
  out.xoaCoChuYVanDongBo = await E.evaluate(() => UD.drugs.length);

  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  await b.close();
  fs.rmSync(DIR, { recursive: true, force: true });
})();
