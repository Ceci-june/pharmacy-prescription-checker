// Kiểm tra 2 tab mới: thêm/sửa/xoá/tìm + dữ liệu còn sau khi tải lại trang.
const { chromium } = require('./node_modules/playwright');
const FILE = 'file:///Users/vy/Desktop/Personal/Giaidapduoc/otc-viewer.html';
const out = {};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => m.type() === 'error' && errors.push('console: ' + m.text()));
  page.on('dialog', d => d.accept());               // confirm() khi xoá / nhập
  await page.route('**', r => {
    const u = r.request().url();
    if (!u.startsWith('file://') && !u.startsWith('blob:')) { external.push(u); return r.abort(); }
    r.continue();
  });
  await page.goto(FILE);
  await page.evaluate(() => localStorage.removeItem('gdd.userdata.v1'));
  await page.reload();

  // ── tab Danh mục ──
  await page.click('.tab[data-tab="catalog"]');
  out.tabTitle = await page.locator('.dtitle h1').textContent();
  out.emptyState = (await page.locator('.empty2').textContent()).slice(0, 46);
  out.sidebarHidden = !(await page.locator('#side').isVisible());

  const addDrug = async (name, ing, extra = {}) => {
    await page.click('.btn:has-text("+ Thêm thuốc")');
    await page.fill('.frow:has-text("Tên thuốc") .fi', name);
    await page.fill('.frow:has-text("Hoạt chất") .fi', ing);
    for (const [label, val] of Object.entries(extra)) await page.fill(`.frow:has-text("${label}") .fi`, val);
    await page.click('.modal .btn:has-text("Thêm")');
  };

  // validate: bỏ trống trường bắt buộc
  await page.click('.btn:has-text("+ Thêm thuốc")');
  await page.click('.modal .btn:has-text("Thêm")');
  out.validation = await page.locator('.ferr').textContent();
  await page.click('.modal .btn:has-text("Huỷ")');

  await addDrug('Panadol Extra', 'Paracetamol + Caffeine', {
    'Chỉ định': 'Đau đầu, đau nửa đầu, đau răng',
    'Chống chỉ định': 'Suy gan nặng, mẫn cảm paracetamol',
    'Liều dùng & độ tuổi': '1–2 viên/lần, cách ≥4h, tối đa 8 viên/24h · từ 12 tuổi',
    'Thận trọng & tương tác': 'Không dùng chung thuốc chứa paracetamol khác. Warfarin: tăng INR.',
  });
  await addDrug('Efferalgan 500', 'Paracetamol');
  await addDrug('Nurofen', 'Ibuprofen');
  out.afterAdd3 = await page.locator('.item').count();

  // mở xem chi tiết
  await page.click('.item:has-text("Panadol Extra") .ihead');
  out.detailRows = await page.locator('.item:has-text("Panadol Extra") .ibody .kv').count();
  out.detailLabels = await page.locator('.item:has-text("Panadol Extra") .ibody .kv .k').allTextContents();

  // tìm theo hoạt chất
  await page.fill('input[type=search]', 'ibuprofen');
  out.searchByIngredient = await page.locator('.item').count();
  await page.fill('input[type=search]', 'paracetamol');
  out.searchByIngredient2 = await page.locator('.item').count();
  await page.fill('input[type=search]', 'panadol');
  out.searchByName = await page.locator('.item').count();
  await page.fill('input[type=search]', 'zzz');
  out.searchNoHit = (await page.locator('.empty2').textContent()).includes('không khớp')
    || (await page.locator('.empty2').textContent()).includes('khớp');
  await page.fill('input[type=search]', '');

  // sửa
  await page.click('.item:has-text("Nurofen") .btn:has-text("Sửa")');
  await page.fill('.frow:has-text("Tên thuốc") .fi', 'Nurofen Forte');
  await page.click('.modal .btn:has-text("Lưu thay đổi")');
  out.afterEdit = await page.locator('.item:has-text("Nurofen Forte")').count();

  // xoá
  await page.click('.item:has-text("Efferalgan") .btn:has-text("Xoá")');
  out.afterDelete = await page.locator('.item').count();

  // ── tab Thông tư ──
  await page.click('.tab[data-tab="circular"]');
  out.circTitle = await page.locator('.dtitle h1').textContent();
  await page.click('.btn:has-text("+ Thêm thông tư")');
  await page.fill('.frow:has-text("Tên thông tư") .fi', 'Thông tư 07/2017/TT-BYT');
  await page.fill('.frow:has-text("Nội dung") .fi', 'Ban hành danh mục thuốc không kê đơn.\nĐiều 1. Phạm vi áp dụng.\nĐiều 2. Danh mục.');
  await page.click('.modal .btn:has-text("Thêm")');
  await page.click('.btn:has-text("+ Thêm thông tư")');
  await page.fill('.frow:has-text("Tên thông tư") .fi', 'Thông tư 52/2017/TT-BYT');
  await page.fill('.frow:has-text("Nội dung") .fi', 'Quy định về đơn thuốc và kê đơn thuốc hoá dược.');
  await page.click('.modal .btn:has-text("Thêm")');
  out.circCount = await page.locator('.item').count();
  await page.fill('input[type=search]', 'kê đơn thuốc hoá dược');   // tìm trong nội dung
  out.circSearchInBody = await page.locator('.item').count();
  await page.fill('input[type=search]', '');

  // ── bền vững qua reload ──
  await page.reload();
  await page.click('.tab[data-tab="catalog"]');
  out.afterReloadDrugs = await page.locator('.item').count();
  await page.click('.tab[data-tab="circular"]');
  out.afterReloadCirc = await page.locator('.item').count();

  // ── xoá nhiều ──
  await page.click('.tab[data-tab="catalog"]');
  await page.locator('.item .ck').first().check();
  out.selCount = await page.locator('.selbar .cnt').textContent();
  await page.click('.btn:has-text("mục đã chọn")');
  out.afterBulkDelete = await page.locator('.item').count();

  // ── OTC Data tab vẫn nguyên ──
  await page.click('.tab[data-tab="otc"]');
  out.otcSidebarBack = await page.locator('#side').isVisible();
  await page.locator('.ditem', { hasText: 'Cảm cúm' }).first().click();
  out.otcStillWorks = await page.locator('.col.B .grp').count();

  out.externalRequests = external;
  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
  if (errors.length || external.length) process.exit(1);
})();
