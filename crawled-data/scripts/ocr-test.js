// Kiểm OCR end-to-end trong viewer: quét ảnh bảng BHYT → khớp Danh mục → thêm vào đơn.
const { chromium } = require('./node_modules/playwright');

const FILE = 'file:///Users/vy/Desktop/Personal/Giaidapduoc/otc-viewer.html';
const XLS = '/Users/vy/Desktop/Personal/Giaidapduoc/danh-muc-import.xlsx';
const IMG = process.argv[2] || '/tmp/rxlike.png';

(async () => {
  const out = {};
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const page = await ctx.newPage();
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 140)));
  page.on('console', m => m.type() === 'error' && errors.push('console: ' + m.text().slice(0, 140)));
  page.on('dialog', d => d.accept());
  await page.route('**', r => {
    const u = r.request().url();
    if (!/^(file|blob|data):/.test(u)) { external.push(u); return r.abort(); }
    r.continue();
  });

  await page.goto(FILE);
  await page.evaluate(() => localStorage.removeItem('gdd.userdata.v1'));
  await page.reload();

  // nạp danh mục 191 thuốc
  await page.waitForSelector('.tab[data-tab="catalog"]');
  await page.click('.tab[data-tab="catalog"]');
  await page.waitForSelector('.btn:has-text("Nạp từ Excel")');
  const fc = page.waitForEvent('filechooser');
  await page.click('.btn:has-text("Nạp từ Excel")');
  await (await fc).setFiles(XLS);
  await page.waitForTimeout(2000);

  // tab kiểm tra đơn + ảnh
  await page.click('.tab[data-tab="rx"]');
  await page.waitForSelector('.drop');
  const fc2 = page.waitForEvent('filechooser');
  await page.locator('.drop').click();
  await (await fc2).setFiles(IMG);
  await page.waitForTimeout(700);
  out.hasScanButton = await page.locator('.btn:has-text("Quét tên thuốc")').count();

  const t0 = Date.now();
  await page.click('.btn:has-text("Quét tên thuốc")');
  // `S` khai báo bằng let nên KHÔNG có trên window — phải dò qua binding toàn cục.
  await page.waitForFunction(
    () => typeof S !== 'undefined' && S.rxBusy === false
      && ((S.rxText && S.rxText.length > 0) || /lỗi|không đọc/.test(S.rxOcrState || '')),
    null, { timeout: 180000 });
  out.ocrState = await page.evaluate(() => S.rxOcrState || '');
  out.ocrSeconds = +((Date.now() - t0) / 1000).toFixed(1);
  await page.waitForTimeout(500);

  out.ocrText = (await page.evaluate(() => S.rxText)).split('\n').filter(Boolean);
  // thuốc khớp tên được TỰ THÊM vào cột phải, không cần bấm gì
  out.autoBanner = (await page.locator('.warnbox.ok').first().innerText()).split('\n')[0];
  out.inPrescription = await page.locator('.rxrow').count();
  out.autoNames = await page.locator('.rxrow .inm').allTextContents();
  out.autoLabelled = (await page.locator('.rxrow .iing').allTextContents())
    .filter(t => /nhận từ ảnh|phần đầu/.test(t)).length;
  const ambCard = page.locator('.card', { hasText: 'cần bạn chọn' });
  out.ambLines = await ambCard.count() ? await ambCard.locator('.ambrow > div').first().allTextContents() : [];
  out.dupWarnings = await page.locator('.warnbox.dup').count();

  // quét lại không nhân đôi thuốc đã có trong đơn
  await page.click('.btn:has-text("Quét lại")');
  await page.waitForFunction(() => typeof S !== 'undefined' && S.rxBusy === false, null, { timeout: 180000 });
  await page.waitForTimeout(600);
  out.afterRescan = await page.locator('.rxrow').count();

  out.externalRequests = external;
  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  await page.screenshot({ path: 'ocr.png' });
  await browser.close();
  if (errors.length || external.length) process.exit(1);
})();
