// Kiểm tra tab "Tra cứu mã y khoa" sau khi nhúng sẵn dữ liệu YHCT và PL3.
//
// Phần đáng lo nhất là logic NẠP SẴN: phải phân biệt được "người dùng cố tình xoá
// sạch một bộ" (để yên) với "bản cũ lưu [] vì bản build khi đó chưa có dữ liệu bộ
// đó" (phải nạp). Sai chỗ này thì hoặc là dữ liệu tự mọc lại sau khi xoá, hoặc là
// người dùng cũ không bao giờ thấy YHCT/PL3. Mỗi nhánh một ca kiểm thử riêng.
const { chromium } = require('./node_modules/playwright');
const FILE = 'file:///Users/vy/Desktop/Personal/Giaidapduoc/otc-viewer.html';
const KEY = 'gdd.userdata.v1';
const out = {};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => m.type() === 'error' && errors.push('console: ' + m.text()));
  page.on('dialog', d => d.accept());
  await page.route('**', r => {
    const u = r.request().url();
    if (!u.startsWith('file://') && !u.startsWith('blob:')) { external.push(u); return r.abort(); }
    r.continue();
  });
  await page.goto(FILE);

  const reset = async state => {
    await page.evaluate(([k, s]) => {
      if (s === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(s));
    }, [KEY, state]);
    await page.reload();
    await page.click('.tab[data-tab="icd"]');
  };
  const counts = () => page.$$eval('.subtab', ns =>
    Object.fromEntries(ns.map(n => [n.childNodes[0].textContent.trim(), +n.querySelector('.cnt').textContent])));
  const pick = async tab => { await page.click(`.subtab:has-text("${tab}")`); };

  // ── 1. máy mới: cả 3 bộ phải có dữ liệu nhúng sẵn ──
  await reset(null);
  out.fresh = await counts();

  // ── 2. bản cũ: có ICD đã sửa, YHCT/PL3 rỗng và KHÔNG có cờ seeded ──
  // Mong đợi: ICD giữ nguyên bản đã sửa (1 mã), YHCT/PL3 được nạp đầy.
  await reset({
    drugs: [], circulars: [], inters: [],
    codes: { icd: [{ id: 'x1', code: 'J00', dx: 'Tôi tự sửa', note: 'giữ nguyên' }], yhct: [], pl3: [] },
  });
  out.legacy = await counts();
  out.legacyIcdKept = await page.locator('.icdrow .dx').first().textContent();

  // ── 3. người dùng cố tình xoá sạch YHCT (có cờ seeded) → phải để yên ──
  await reset({
    drugs: [], circulars: [], inters: [],
    codes: { icd: [], yhct: [], pl3: [] },
    seeded: ['icd', 'yhct', 'pl3'],
  });
  out.deletedStaysEmpty = await counts();

  // ── 4. tra YHCT bằng mã ICD-10 tương ứng và bằng tên y học hiện đại ──
  await reset(null);
  await pick('YHCT');
  await page.fill('input[type=search]', 'A37');
  out.yhctByIcd = await page.locator('.icdrow').count();
  await page.fill('input[type=search]', 'ho gà');
  out.yhctByModern = await page.locator('.icdrow').count();

  // mở một dòng: phải thấy các cột riêng của YHCT
  await page.click('.icdrow');
  out.yhctExtras = await page.$$eval('.icdsub .exgrid .k', ns => ns.map(n => n.textContent));
  out.yhctLinksIcd = (await page.locator('.icdsub').textContent()).includes('A37');

  // ── 5. PL3: mã ngộ độc ở cột Mã, 4 mã còn lại ở phần mở rộng ──
  await pick('PL3 Thuốc/Hóa chất');
  await page.fill('input[type=search]', 'paraquat');
  out.pl3Hits = await page.locator('.icdrow').count();
  out.pl3Code = await page.locator('.icdrow .code').first().textContent();
  await page.click('.icdrow');
  out.pl3Extras = await page.$$eval('.icdsub .exgrid .k', ns => ns.map(n => n.textContent));
  out.pl3Values = await page.$$eval('.icdsub .exgrid .v', ns => ns.map(n => n.textContent));
  // tra ngược bằng một mã phụ (X48 là cột "Tai nạn") — tìm kiếm phải quét cả cột riêng
  await page.fill('input[type=search]', 'X48');
  out.pl3ByExtraCol = await page.locator('.icdrow').count();

  // ── 6. ô thống kê "Mã bị hủy" phải đếm cả YHCT (Ngừng dùng) ──
  await page.fill('input[type=search]', '');
  out.statTiles = await page.$$eval('.stats .stat', ns =>
    ns.map(n => n.querySelector('.l').textContent + '=' + n.querySelector('.n').textContent));

  // ── 6b. chặn vẽ: 4000+ mã không được dựng hết thành DOM ──
  await pick('YHCT');
  await page.fill('input[type=search]', '');
  out.cappedRows = await page.locator('.icdrow').count();
  out.hasShowMore = await page.locator('.btn:has-text("Hiện thêm")').count();
  await page.click('.btn:has-text("Hiện thêm")');
  out.afterShowMore = await page.locator('.icdrow').count();
  // gõ tìm kiếm phải đặt lại mức hiện, không giữ mức đã nới
  await page.fill('input[type=search]', 'U5');
  await page.fill('input[type=search]', '');
  out.capResetOnSearch = await page.locator('.icdrow').count();

  // ── 7. chip trạng thái của YHCT dựng từ giá trị thật ──
  await pick('YHCT');
  out.yhctStatusChips = await page.$$eval('.chips .chip', ns => ns.map(n => n.textContent));

  // ── 8. sửa một mã rồi tải lại: phải còn ──
  await page.fill('input[type=search]', 'U50.011');
  await page.click('.icdrow .btn:has-text("Sửa")');
  await page.fill('.frow:has-text("Ghi chú") .fi', 'ghi chú thử');
  await page.click('.modal .btn:has-text("Lưu thay đổi")');
  await page.reload();
  await page.click('.tab[data-tab="icd"]');
  await pick('YHCT');
  await page.fill('input[type=search]', 'ghi chú thử');
  out.editSurvivesReload = await page.locator('.icdrow').count();

  out.errors = errors;
  out.external = external;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
