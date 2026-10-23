// Kiểm tra tab "Tái khám". Toàn bộ rủi ro nằm ở số học ngày tháng, nên test bám vào
// đúng những chỗ dễ sai âm thầm: lệch một ngày, qua tháng, qua năm, năm nhuận, và
// múi giờ (new Date('2026-10-20') là mốc UTC — ở múi giờ âm sẽ lùi mất một ngày).
const { chromium } = require('./node_modules/playwright');
const FILE = 'file:///Users/vy/Desktop/Personal/Giaidapduoc/otc-viewer.html';
const out = {};

// Chạy ở múi giờ ÂM để bẫy lỗi UTC. Nếu parse sai, mọi ngày sẽ lùi 1.
const TZ = 'America/Los_Angeles';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, timezoneId: TZ });
  const page = await ctx.newPage();
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => m.type() === 'error' && errors.push('console: ' + m.text()));
  await page.route('**', r => {
    const u = r.request().url();
    if (!u.startsWith('file://') && !u.startsWith('blob:')) { external.push(u); return r.abort(); }
    r.continue();
  });
  await page.goto(FILE);
  await page.evaluate(() => localStorage.removeItem('gdd.userdata.v1'));
  await page.reload();

  // Tái khám đứng ngay TRƯỚC Thông tư; OTC Data là tab cuối cùng.
  out.tabOrder = await page.$$eval('#tabs .tab', ns => ns.map(n => n.textContent).join(' | '));
  await page.click('.tab[data-tab="recall"]');
  out.title = await page.locator('.dtitle h1').textContent();
  out.defaultsToToday = await page.inputValue('.frow:has-text("Ngày khám") .fi');
  out.todayInBrowser = await page.evaluate(() => {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
  });

  const DATE = '.frow:has-text("Ngày khám") .fi';
  const calc = async (date, days) => {
    await page.fill(DATE, date);
    await page.fill('input[type=number]', String(days));
    const tiles = await page.$$eval('.stats .stat', ns =>
      ns.map(n => ({ n: n.querySelector('.n').textContent, l: n.querySelector('.l').textContent })));
    return tiles;
  };

  // 1. ca cơ bản: 30 ngày thuốc từ 01/10/2026
  //    hết thuốc 30/10 (ngày đầu đã tính là ngày 1), tái khám 31/10
  out.basic = (await calc('01/10/2026', 30)).map(t => t.n);

  // 2. 1 ngày thuốc: uống hết ngay hôm đó, tái khám hôm sau
  out.oneDay = (await calc('01/10/2026', 1)).map(t => t.n);

  // 3. qua năm
  out.crossYear = (await calc('20/12/2026', 30)).map(t => t.n);

  // 4. tháng 2 năm nhuận 2028 (29/02 phải tồn tại)
  out.leap = (await calc('01/02/2028', 29)).map(t => t.n);

  // 5. tháng 2 năm KHÔNG nhuận 2027
  out.nonLeap = (await calc('01/02/2027', 29)).map(t => t.n);

  // 6. thứ trong tuần phải đúng — 01/10/2026 là thứ Năm
  const t6 = await calc('01/10/2026', 7);
  out.weekdayLabels = t6.map(t => t.l);

  // 7. cảnh báo cuối tuần: 03/10/2026 là thứ Bảy → khám 26/09 + 7 ngày
  await calc('26/09/2026', 7);
  out.weekendWarn = await page.locator('.flag.med .f').count()
    ? await page.locator('.flag.med .f').textContent() : '(không có)';
  // ngày thường thì không được cảnh báo
  await calc('01/10/2026', 7);
  out.noWarnOnWeekday = await page.locator('.flag.med').count();

  // 8. đầu vào không hợp lệ
  await page.fill('input[type=number]', '0');
  out.zeroDays = (await page.locator('.card .bd').last().textContent()).trim();
  await page.fill('input[type=number]', '-5');
  out.negDays = (await page.locator('.card .bd').last().textContent()).trim();
  out.noTilesWhenInvalid = await page.locator('.stats .stat').count();

  // 9. chip chọn nhanh điền vào ô số
  await page.click('.chip:has-text("90 ngày")');
  out.chipFills = await page.inputValue('input[type=number]');
  out.chipActive = await page.locator('.chip.on').textContent();

  // 9b. gõ tay một con số trùng chip thì chip đó cũng phải sáng
  await page.fill('input[type=number]', '14');
  out.chipSyncsWithTyping = await page.locator('.chip.on').count()
    ? await page.locator('.chip.on').textContent() : '(không chip nào sáng)';
  await page.fill('input[type=number]', '13');
  out.noChipForOddNumber = await page.locator('.chip.on').count();

  // 10. nút Hôm nay
  await page.fill(DATE, '01/01/2020');
  await page.click('.btn:has-text("Hôm nay")');
  out.todayButton = await page.inputValue(DATE);

  // ── 10b. các kiểu gõ ngày người ta hay dùng, và ngày không có thật ──
  const tryDate = async v => {
    await page.fill(DATE, v);
    await page.fill('input[type=number]', '7');
    const tiles = await page.$$eval('.stats .stat .n', ns => ns.map(n => n.textContent));
    return tiles[0] || '(không tính được)';
  };
  out.dateFormats = {
    'gạch chéo': await tryDate('01/10/2026'),
    'gạch ngang': await tryDate('01-10-2026'),
    'dấu chấm': await tryDate('01.10.2026'),
    'năm 2 chữ số': await tryDate('01/10/26'),
    'không đệm 0': await tryDate('1/10/2026'),
  };
  // 31/02 không tồn tại — phải từ chối, không được tự trôi sang 03/03
  out.rejectsImpossible = await tryDate('31/02/2026');
  // thứ tự kiểu Mỹ phải bị hiểu theo NGÀY/tháng, không phải tháng/ngày
  out.readsAsDayFirst = await tryDate('03/07/2026');

  // 11. rời tab rồi quay lại thì giữ nguyên số liệu đang nhập
  await page.click('.tab[data-tab="otc"]');
  await page.click('.tab[data-tab="recall"]');
  out.keepsStateDays = await page.inputValue('input[type=number]');

  out.errors = errors;
  out.external = external;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
