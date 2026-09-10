// Kiểm Xuất Excel / Nạp từ Excel: round-trip + file do người dùng tự soạn.
const { chromium } = require('./node_modules/playwright');
const X = require('./node_modules/xlsx/dist/xlsx.mini.min.js');
const fs = require('fs');

const FILE = 'file:///Users/vy/Desktop/Personal/Giaidapduoc/otc-viewer.html';
const EXP = '/tmp/exp.xlsx', USER = '/tmp/user.xlsx';

const SEED = {
  drugs: [
    {id:'1', name:'Panadol Extra', ing:'Paracetamol + Caffeine', ind:'Đau đầu, đau nửa đầu',
     ci:'Suy gan nặng', dose:'1–2 viên/lần, tối đa 8 viên/24h — từ 12 tuổi',
     caut:'Dòng 1\nDòng 2 — Warfarin ↑INR'},
    {id:'2', name:'Nurofen Forte', ing:'Ibuprofen 400mg', ind:'Đau, viêm', ci:'Loét dạ dày',
     dose:'400 mg × 3 lần/ngày — từ 12 tuổi', caut:'Thận trọng: hen, THA'},
  ],
  circulars: [{id:'c1', name:'Thông tư 07/2017/TT-BYT', body:'Điều 1.\nĐiều 2. Danh mục.'}],
};

(async () => {
  const out = {};
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads:true, viewport:{width:1440,height:950} });
  const page = await ctx.newPage();
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => m.type() === 'error' && errors.push('console: ' + m.text()));
  page.on('dialog', d => d.accept());
  await page.route('**', r => {
    const u = r.request().url();
    if (!/^(file|blob):/.test(u)) { external.push(u); return r.abort(); }
    r.continue();
  });

  await page.goto(FILE);
  out.xlsxLoaded = await page.evaluate(() => typeof XLSX === 'object' && !!XLSX.utils);
  await page.evaluate(s => localStorage.setItem('gdd.userdata.v1', JSON.stringify(s)), SEED);
  await page.reload();
  await page.click('.tab[data-tab="catalog"]');

  out.buttons = await page.locator('.tbar .btn').allTextContents();
  out.seedButtonGone = !out.buttons.some(b => b.includes('OTC Data'));

  // ── xuất ──
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.btn:has-text("Xuất Excel")')]);
  out.fileName = dl.suggestedFilename();
  await dl.saveAs(EXP);

  // xác minh bằng thư viện phía node (độc lập với trang)
  const wb = X.read(fs.readFileSync(EXP));
  out.sheets = wb.SheetNames;
  const d = X.utils.sheet_to_json(wb.Sheets['Danh mục'], {defval:''});
  const c = X.utils.sheet_to_json(wb.Sheets['Thông tư'], {defval:''});
  out.exportedDrugRows = d.length;
  out.exportedCircRows = c.length;
  out.headers = Object.keys(d[0]);
  out.keptNewline = /\n/.test(d.find(r => r['Tên thuốc'] === 'Panadol Extra')['Thận trọng & tương tác']);
  out.keptVietnamese = d[0]['Hoạt chất'].includes('Paracetamol');

  // ── nạp lại chính file vừa xuất (kỳ vọng: cộng thêm) ──
  let fc = page.waitForEvent('filechooser');
  await page.click('.btn:has-text("Nạp từ Excel")');
  await (await fc).setFiles(EXP);
  await page.waitForTimeout(500);
  out.afterReimportDrugs = await page.locator('.item').count();
  await page.click('.tab[data-tab="circular"]');
  out.afterReimportCirc = await page.locator('.item').count();

  // ── file người dùng tự soạn: 1 sheet, tên sheet lạ, chỉ có tiêu đề cột ──
  const uwb = X.utils.book_new();
  X.utils.book_append_sheet(uwb, X.utils.json_to_sheet([
    {'Tên thuốc':'Augmentin 625', 'Hoạt chất':'Amoxicillin + Clavulanic acid', 'Chỉ định':'Nhiễm khuẩn hô hấp'},
    {'Tên thuốc':'', 'Hoạt chất':'(hàng trống phải bị bỏ qua)', 'Chỉ định':''},
    {'Tên thuốc':'Zinnat 500', 'Hoạt chất':'Cefuroxime', 'Chỉ định':'Nhiễm khuẩn'},
  ]), 'Sheet1');
  fs.writeFileSync(USER, X.write(uwb, {bookType:'xlsx', type:'buffer'}));

  await page.click('.tab[data-tab="catalog"]');
  const before = await page.locator('.item').count();
  fc = page.waitForEvent('filechooser');
  await page.click('.btn:has-text("Nạp từ Excel")');
  await (await fc).setFiles(USER);
  await page.waitForTimeout(500);
  out.userFileAdded = (await page.locator('.item').count()) - before;
  out.blankRowSkipped = out.userFileAdded === 2;
  await page.fill('input[type=search]', 'clavulanic');
  out.searchImported = await page.locator('.item').count();
  await page.fill('input[type=search]', '');

  // ── file không phải Excel ──
  fs.writeFileSync('/tmp/bad.txt', 'không phải excel');
  fc = page.waitForEvent('filechooser');
  await page.click('.btn:has-text("Nạp từ Excel")');
  await (await fc).setFiles('/tmp/bad.txt');
  await page.waitForTimeout(500);
  out.survivesBadFile = await page.locator('.item').count();

  out.externalRequests = external;
  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  [EXP, USER, '/tmp/bad.txt'].forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });
  await browser.close();
  if (errors.length || external.length) process.exit(1);
})();
