// Kiểm tra gõ tiếng Việt vào các ô tìm kiếm.
//
// Lỗi cũ: mỗi phím gõ lại dựng lại ô input, nên ô đang ghép dấu bị gỡ khỏi trang giữa
// chừng → bộ gõ mất trạng thái, gõ ra chữ không dấu. Test này bắt đúng cái đó bằng hai
// cách bổ sung cho nhau:
//   1. Gõ từng phím thật (pressSequentially) rồi đối chiếu giá trị ô — nếu ô bị thay
//      mới giữa chừng, các phím sau rơi vào ô đã mất tiêu điểm và giá trị sẽ cụt.
//   2. Diễn lại đúng chuỗi sự kiện composition của bộ gõ (a + ^ → â). Nếu ô bị gỡ khỏi
//      DOM giữa compositionstart và compositionend thì không bao giờ ra được chữ có dấu.
// Và mốc quyết định: ô input phải là CÙNG MỘT phần tử trước và sau khi gõ.
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
  page.on('dialog', d => d.accept());
  await page.route('**', r => {
    const u = r.request().url();
    if (!u.startsWith('file://') && !u.startsWith('blob:')) { external.push(u); return r.abort(); }
    r.continue();
  });
  await page.goto(FILE);
  await page.evaluate(() => localStorage.removeItem('gdd.userdata.v1'));
  await page.reload();

  // Đánh dấu phần tử đang có để biết nó có bị thay mới hay không.
  const tag = sel => page.$eval(sel, n => { n.__mark = (n.__mark || 0) + 1; return n.__mark; });
  const stillSame = sel => page.$eval(sel, n => n.__mark === 1);

  // Diễn lại chuỗi sự kiện của bộ gõ: ghép "a" + dấu mũ thành "â".
  const composeAccent = sel => page.$eval(sel, n => {
    n.focus();
    const fire = (type, data) => n.dispatchEvent(new CompositionEvent(type, { data, bubbles: true }));
    fire('compositionstart', '');
    n.value += 'a';
    n.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    fire('compositionupdate', 'â');
    // bộ gõ thay "a" vừa gõ bằng "â"
    n.value = n.value.slice(0, -1) + 'â';
    n.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    fire('compositionend', 'â');
    n.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: false }));
    return n.value;
  });

  // ── 1. Tra cứu mã y khoa (ô người dùng báo lỗi) ──
  await page.click('.tab[data-tab="icd"]');
  const icdSel = '.tbar input[type=search]';
  await tag(icdSel);
  await page.click(icdSel);
  await page.locator(icdSel).pressSequentially('viêm phổi', { delay: 25 });
  out.icdTyped = await page.inputValue(icdSel);
  out.icdSameNode = await stillSame(icdSel);
  out.icdCompose = await composeAccent(icdSel);

  // gõ xong vẫn phải lọc đúng: "sốt" có trong ICD-10
  await page.fill(icdSel, '');
  await page.locator(icdSel).pressSequentially('sốt', { delay: 25 });
  out.icdFiltersOnAccented = await page.locator('.icdrow').count();
  out.icdFirstHit = await page.locator('.icdrow .dx').first().textContent();

  // sang bộ YHCT rồi gõ tiếng Việt có dấu
  await page.click('.subtab:has-text("YHCT")');
  await tag(icdSel);
  await page.locator(icdSel).pressSequentially('đau đầu', { delay: 25 });
  out.yhctTyped = await page.inputValue(icdSel);
  out.yhctSameNode = await stillSame(icdSel);
  out.yhctHits = await page.locator('.icdrow').count();

  // ── 2. Danh mục ──
  await page.click('.tab[data-tab="catalog"]');
  await page.click('.btn:has-text("+ Thêm thuốc")');
  await page.fill('.frow:has-text("Tên thuốc") .fi', 'Thuốc ho Bổ phế');
  await page.fill('.frow:has-text("Hoạt chất") .fi', 'Cao lá thường xuân');
  await page.click('.modal .btn:has-text("Thêm")');
  const catSel = '.tbar input[type=search]';
  await tag(catSel);
  await page.locator(catSel).pressSequentially('bổ phế', { delay: 25 });
  out.catTyped = await page.inputValue(catSel);
  out.catSameNode = await stillSame(catSel);
  out.catHits = await page.locator('.item').count();
  out.catSubtitle = await page.locator('.dtitle .sub').textContent();

  // ── 3. Thông tư ──
  await page.click('.tab[data-tab="circular"]');
  await tag(catSel);
  await page.locator(catSel).pressSequentially('nghị định', { delay: 25 });
  out.circTyped = await page.inputValue(catSel);
  out.circSameNode = await stillSame(catSel);

  // ── 4. Tương tác (ô tìm thuốc bên trái) ──
  await page.click('.tab[data-tab="inter"]');
  const ixSel = '.card input[type=search]';
  await tag(ixSel);
  await page.locator(ixSel).pressSequentially('thuốc ho', { delay: 25 });
  out.interTyped = await page.inputValue(ixSel);
  out.interSameNode = await stillSame(ixSel);
  out.interPicks = await page.locator('.ixpick').count();

  // ── 5. Kiểm tra đơn ──
  await page.click('.tab[data-tab="rx"]');
  await tag('#rxq');
  await page.locator('#rxq').pressSequentially('bổ phế', { delay: 25 });
  out.rxTyped = await page.inputValue('#rxq');
  out.rxSameNode = await stillSame('#rxq');
  out.rxSuggestions = await page.locator('.hit').count();

  out.errors = errors;
  out.external = external;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
