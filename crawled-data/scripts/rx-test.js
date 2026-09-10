// Kiểm tab Kiểm tra đơn thuốc: dán clipboard, chọn file, đối chiếu danh mục, bắt trùng hoạt chất.
const { chromium } = require('./node_modules/playwright');
const X = require('./node_modules/xlsx/dist/xlsx.mini.min.js');
const fs = require('fs');

const FILE = 'file:///Users/vy/Desktop/Personal/Giaidapduoc/otc-viewer.html';
const XLS = '/Users/vy/Desktop/Personal/Giaidapduoc/danh-muc-import.xlsx';
// ảnh PNG 2x2 nhỏ để giả lập ảnh đơn
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP4z8DwHwwZ/oOZ/xkYGAAAdQUJqbxJ9wAAAABJRU5ErkJggg==', 'base64');

(async () => {
  const out = {};
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, permissions: [] });
  const page = await ctx.newPage();
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => m.type() === 'error' && errors.push('console: ' + m.text()));
  page.on('dialog', d => d.accept());
  await page.route('**', r => {
    const u = r.request().url();
    if (!/^(file|blob|data):/.test(u)) { external.push(u); return r.abort(); }
    r.continue();
  });

  await page.goto(FILE);
  await page.evaluate(() => localStorage.removeItem('gdd.userdata.v1'));
  await page.reload();

  // tab tồn tại + trạng thái danh mục trống
  await page.click('.tab[data-tab="rx"]');
  out.title = await page.locator('.dtitle h1').textContent();
  out.warnsEmptyCatalog = await page.locator('.warnbox.miss').count();

  // nạp danh mục 191 thuốc
  await page.click('.tab[data-tab="catalog"]');
  const fc = page.waitForEvent('filechooser');
  await page.click('.btn:has-text("Nạp từ Excel")');
  await (await fc).setFiles(XLS);
  await page.waitForTimeout(2000);
  await page.click('.tab[data-tab="rx"]');
  out.sub = await page.locator('.dtitle .sub').textContent();

  // ── dán ảnh từ bộ nhớ đệm (sự kiện paste) ──
  fs.writeFileSync('/tmp/rx.png', PNG);
  await page.evaluate(async b64 => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const file = new File([arr], 'don.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  }, PNG.toString('base64'));
  await page.waitForTimeout(600);
  out.pastedImage = await page.locator('.rximg').count();
  out.imgIsDataUrl = await page.evaluate(() => (S.rxImg || '').startsWith('data:image/'));

  // phóng to / thu nhỏ
  await page.locator('.rximg').click();
  out.zoomOn = await page.evaluate(() => S.rxZoom);
  await page.locator('.rximg').click();
  out.zoomOff = await page.evaluate(() => S.rxZoom === false);

  // ── thêm thuốc trùng hoạt chất: 2 sản phẩm cùng chứa paracetamol ──
  await page.fill('#rxq', 'dopagan');
  await page.waitForTimeout(300);
  await page.locator('.hit').first().click();
  await page.fill('#rxq', 'panactol');
  await page.waitForTimeout(300);
  out.hitsForPanactol = await page.locator('.hit').count();
  if (out.hitsForPanactol) await page.locator('.hit').first().click();
  await page.waitForTimeout(300);
  out.rxCount = await page.locator('.rxrow').count();
  out.dupWarnings = await page.locator('.warnbox.dup').count();
  out.dupText = out.dupWarnings ? (await page.locator('.warnbox.dup').first().innerText()).replace(/\n/g, ' | ') : '';

  // mở chi tiết một thuốc → phải lấy đủ trường từ danh mục
  await page.locator('.rxrow').first().locator('.rxhead').click();
  out.detailFields = await page.locator('.rxrow .ibody .kv .k').allTextContents();

  // ── thuốc ngoài danh mục ──
  await page.fill('#rxq', 'thuốc-không-tồn-tại-xyz');
  await page.waitForTimeout(300);
  out.offerAddOutside = await page.locator('.btn:has-text("ngoài danh mục")').count();
  await page.click('.btn:has-text("ngoài danh mục")');
  await page.waitForTimeout(300);
  out.missWarnings = await page.locator('.warnbox.miss').count();
  out.missRows = await page.locator('.rxrow.miss').count();

  // bỏ 1 thuốc
  const before = await page.locator('.rxrow').count();
  await page.locator('.rxrow').first().locator('.btn:has-text("Bỏ")').click();
  out.afterRemove = (await page.locator('.rxrow').count()) === before - 1;

  // ── chọn ảnh từ máy (input file) ──
  await page.click('.btn:has-text("Đổi ảnh")');
  const fc2 = page.waitForEvent('filechooser');
  await page.locator('.drop').click();
  await (await fc2).setFiles('/tmp/rx.png');
  await page.waitForTimeout(600);
  out.uploadedFromDisk = await page.locator('.rximg').count();

  // các tab khác không bị ảnh hưởng
  await page.click('.tab[data-tab="otc"]');
  out.otcOk = await page.locator('#side').isVisible();
  await page.locator('.ditem', { hasText: 'Cảm cúm' }).first().click();
  out.otcGroups = await page.locator('.col.B .grp').count();

  out.externalRequests = external;
  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  fs.unlinkSync('/tmp/rx.png');
  await browser.close();
  if (errors.length || external.length) process.exit(1);
})();
