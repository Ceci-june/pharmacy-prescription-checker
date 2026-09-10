// Kiểm tính toàn vẹn của file build — bắt đúng 2 lỗi đã gặp:
//  1) String.replace diễn giải `$&` trong chuỗi thay thế → placeholder bị chèn vào thư viện.
//  2) Chèn thẻ script vào `</body>` ĐẦU TIÊN, mà SheetJS có chuỗi "</body></html>"
//     → <script> bị đóng sớm, mã thư viện đổ ra trang thành text.
const { chromium } = require('./node_modules/playwright');
const fs = require('fs');
const path = require('path');

const LIB = fs.readFileSync(path.join(__dirname, 'node_modules/xlsx/dist/xlsx.mini.min.js'), 'utf8')
  .replace(/<\/script/gi, () => '<\\/script');

const TARGETS = [
  '/Users/vy/Desktop/Personal/Giaidapduoc/otc-viewer.html',
  '/Users/vy/Desktop/Personal/Giaidapduoc/GiaiDapDuocApp/resources/index.html',
];

(async () => {
  const browser = await chromium.launch();
  let bad = 0;

  for (const f of TARGETS) {
    const name = f.split('/').slice(-2).join('/');
    const src = fs.readFileSync(f, 'utf8');
    const checks = {};

    checks['không còn placeholder'] = !/__DATA__|__XLSX__/.test(src);
    checks['thư viện nguyên byte'] = src.includes(LIB);

    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto('file://' + f);

    const r = await page.evaluate(() => {
      // Text lọt ra ngoài #shell = dấu hiệu <script> bị đóng sớm.
      const stray = [...document.body.childNodes]
        .filter(n => n.nodeType === 3 && n.textContent.trim().length > 20)
        .map(n => n.textContent.trim().slice(0, 60));
      // Số thẻ script phải đúng như build sinh ra, không bị nhân lên do parse sai.
      return {
        stray,
        scripts: document.querySelectorAll('script').length,
        xlsx: typeof XLSX === 'object' && !!XLSX.utils && typeof XLSX.write === 'function',
        // đường mã từng bị `$&` phá: định dạng số của SheetJS
        fmt: (() => { try { return XLSX.SSF.format('00,000.0', 1234.5); } catch (e) { return 'ERR ' + e.message; } })(),
        shellFills: document.getElementById('shell') ? document.getElementById('shell').getBoundingClientRect().height > 400 : false,
      };
    });

    checks['không có text lạ trong body'] = r.stray.length === 0;
    checks['XLSX dùng được'] = r.xlsx;
    checks['định dạng số không bị hỏng'] = !String(r.fmt).includes('__XLSX__') && !String(r.fmt).startsWith('ERR');
    checks['0 lỗi JS'] = errors.length === 0;

    console.log('\n' + name);
    for (const [k, v] of Object.entries(checks)) {
      console.log('  ' + (v ? '✓' : '✗') + ' ' + k);
      if (!v) bad++;
    }
    console.log('  (script tags: ' + r.scripts + ', SSF.format("00,000.0", 1234.5) = ' + JSON.stringify(r.fmt) + ')');
    if (r.stray.length) console.log('  text lạ: ' + JSON.stringify(r.stray, null, 1));
    if (errors.length) console.log('  lỗi: ' + errors.join(' | '));
    await page.close();
  }

  await browser.close();
  console.log(bad ? '\n✗ ' + bad + ' kiểm tra thất bại' : '\n✓ tất cả kiểm tra đạt');
  process.exit(bad ? 1 : 0);
})();
