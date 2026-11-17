// Danh mục nạp sẵn: MỞ FILE HTML LÀ PHẢI THẤY, không phải nối file, không phải nhập lại.
//
// Mỗi cảnh chạy trên một hồ sơ trình duyệt riêng. Cảnh B là cảnh đã làm hỏng bản trước:
// trình duyệt từng mở app nên bản lưu mang mốc MỚI HƠN file, tuy rỗng không.
const { chromium } = require('./node_modules/playwright');
const VIEWER = process.argv[2];
const LSKEY = 'gdd.userdata.v1';
const out = {};
const errs = [];

const FAKE = `() => ({
  name: 'du-lieu.json',
  async queryPermission(){return 'granted';}, async requestPermission(){return 'granted';},
  async getFile(){ return { text: async () => window.__disk }; },
  async createWritable(){ let b=''; return { write: async c=>{b+=c;}, close: async ()=>{ window.__disk=b; } }; },
})`;

(async () => {
  const b = await chromium.launch();
  // Chú ý: evaluate(<chuỗi>) chỉ TÍNH BIỂU THỨC, không gọi hàm. Muốn cài sẵn bản lưu
  // thì phải truyền hàm thật kèm tham số, nếu không cảnh test rỗng mà vẫn "đạt".
  const mo = async (truoc, disk, luu) => {
    const ctx = await b.newContext();
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e)));
    p.on('console', m => m.type() === 'error' && errs.push('console: ' + m.text()));
    if (disk != null) await p.addInitScript(d => { window.__disk = d; }, disk);
    await p.goto('file://' + VIEWER.split('/').map(encodeURIComponent).join('/'));
    if (luu) { await p.evaluate(([k, v]) => localStorage.setItem(k, v), [LSKEY, luu]); }
    if (truoc) await p.evaluate(truoc);
    if (truoc || luu) await p.reload();
    return p;
  };
  const dem = p => p.evaluate(() => {
    const ma = {};
    for (const r of (UD.codes.icd || [])) ma[r.code] = (ma[r.code] || 0) + 1;
    const ten = {};
    for (const d of UD.drugs) ten[d.name] = (ten[d.name] || 0) + 1;
    return {
      thuoc: UD.drugs.length,
      thuocTrung: Object.keys(ten).filter(k => ten[k] > 1).length,
      tuongTac: UD.inters.length,
      icd: (UD.codes.icd || []).length,
      maTrung: Object.keys(ma).filter(k => ma[k] > 1).length,
      coLuu: (localStorage.getItem('gdd.userdata.v1') || '').length,
    };
  });

  // A. Mở lần đầu, không nối file, không làm gì.
  let p = await mo();
  out.A_moLanDau = await dem(p);
  await p.click('.tab[data-tab="catalog"]');
  await p.fill('.tbar input[type=search]', 'boganic');
  out.A_timBoganic = await p.locator('.item').count();
  out.A_chuThichICD = await p.evaluate(() =>
    ((UD.codes.icd || []).find(r => r.code === 'A97.0') || {}).dx);

  // B. Trình duyệt ĐÃ từng mở app (bản lưu rỗng, mốc mới hơn) — cảnh làm hỏng bản trước.
  p = await mo(() => { udSave(); });
  out.B_daTungMoApp = await dem(p);

  // C. Bản lưu CŨ chứa đúng 178 thuốc của người dùng (định dạng mảng, id ngẫu nhiên).
  const cu178 = await p.evaluate(() => JSON.stringify({
    drugs: seedRows('drugs').map((d, i) => Object.assign({}, d, { id: 'cu' + i })),
    circulars: [], inters: [], codes: {}, seeded: ['icd', 'yhct', 'pl3'], savedAt: 1,
  }));
  p = await mo(null, null, cu178);
  out.C_banLuuCuDuDanhMuc = await dem(p);
  out.C_coBanLuu = (await dem(p)).coLuu > 0;

  // D. Bản lưu cũ chỉ có vài thuốc tự nhập -> phải có cả thuốc đó lẫn 178 thuốc chung.
  p = await mo(null, null, JSON.stringify({
    drugs: [{ id: 't1', name: 'THUỐC TÔI TỰ NHẬP', ing: 'x' }],
    circulars: [], inters: [], codes: {}, seeded: ['icd', 'yhct', 'pl3'], savedAt: 1 }));
  out.D_banLuuCuVaiThuoc = await dem(p);
  out.D_conThuocTuNhap = await p.evaluate(() => UD.drugs.some(d => d.name === 'THUỐC TÔI TỰ NHẬP'));

  // E. Xoá sạch CÓ CHỦ Ý thì mở lại phải vẫn rỗng, không tự mọc lại.
  p = await mo(() => { UD.drugs = []; udSave(); });
  out.E_xoaSachRoiMoLai = (await dem(p)).thuoc;

  // F. Sửa một thuốc nạp sẵn -> mở lại phải còn nguyên chữ đã sửa.
  p = await mo(() => { UD.drugs[0].name = 'TÔI ĐÃ SỬA TÊN'; udSave(); });
  out.F_suaRoiMoLai = await p.evaluate(() => ({
    soThuoc: UD.drugs.length, ten: UD.drugs.find(d => d.name === 'TÔI ĐÃ SỬA TÊN') ? 'còn' : 'MẤT',
  }));

  // G. Nối vào file TRỐNG đi kèm bản phát hành: không được xoá Danh mục nạp sẵn.
  const TRONG = JSON.stringify({ drugs: [], circulars: [], inters: [], seeded: [], codes: {}, savedAt: 0 });
  p = await mo(null, TRONG);
  await p.evaluate(`fsHandle = (${FAKE})()`);
  await p.evaluate(() => fsSync());
  await p.waitForTimeout(700);
  out.G_noiFileTrong = (await dem(p)).thuoc;

  // H. Máy đã mở app (mốc mới, rỗng) nối vào file CÓ dữ liệu -> phải NHẬN, không đẩy đè.
  const COND = JSON.stringify({ drugs: [{ id: 'f1', name: 'THUỐC TỪ FILE', ing: 'x' }],
    circulars: [], inters: [], seeded: ['icd', 'yhct', 'pl3', 'drugs', 'circulars', 'inters'],
    codes: {}, savedAt: Date.now() + 1 });
  p = await mo(() => { udSave(); }, COND);
  await p.evaluate(`fsHandle = (${FAKE})()`);
  await p.evaluate(() => fsSync());
  await p.waitForTimeout(700);
  out.H_nhanTuFile = await p.evaluate(() => ({
    tren: UD.drugs.map(d => d.name), trongFile: (JSON.parse(window.__disk || '{}').drugs || {}).add,
  }));

  out.errors = errs;
  console.log(JSON.stringify(out, null, 1));
  await b.close();
  const A = out.A_moLanDau;
  const hong = errs.length || A.thuoc !== 178 || A.maTrung || A.thuocTrung
    || !out.C_coBanLuu                       // không cài được bản lưu = cảnh C/D rỗng
    || out.C_banLuuCuDuDanhMuc.thuoc !== 178 // bản lưu cũ đủ 178 -> không được nhân đôi
    || out.D_banLuuCuVaiThuoc.thuoc !== 179 || !out.D_conThuocTuNhap
    || out.E_xoaSachRoiMoLai !== 0 || out.F_suaRoiMoLai.ten !== 'còn'
    || out.G_noiFileTrong !== 178
    || !out.H_nhanTuFile.tren.includes('THUỐC TỪ FILE');
  process.exit(hong ? 1 : 0);
})();
