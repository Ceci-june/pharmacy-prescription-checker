// Tạo resources/index.html cho bản Neutralino standalone:
// = otc-viewer.html + client neutralino.js + Neutralino.init().
const fs = require('fs');
const path = require('path');

const SRC = process.argv[2];                 // otc-viewer.html
const APPDIR = process.argv[3];              // GiaiDapDuocApp
const OUT = path.join(APPDIR, 'resources/index.html');

let html = fs.readFileSync(SRC, 'utf8');
// SheetJS chứa chuỗi `var ro="</body></html>"`, nên PHẢI chèn vào </body> CUỐI CÙNG.
// Dùng indexOf/replace sẽ chèn vào giữa thư viện → đóng <script> sớm, dump mã ra trang.
const at = html.lastIndexOf('</body>');
if (at < 0) throw new Error('không thấy </body>');

const boot = `
<script src="js/neutralino.js"></script>
<script>
  // Bật API hệ thống để Xuất/Nạp Excel dùng hộp thoại của macOS/Windows —
  // WKWebView của Neutralino không hỗ trợ <a download>.
  try { Neutralino.init(); } catch (e) { console.warn('Neutralino init:', e); }
</script>
`;

html = html.slice(0, at) + boot + html.slice(at);   // giữ nguyên </body></html> ở cuối
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log('resources/index.html —', (fs.statSync(OUT).size / 1024 / 1024).toFixed(2), 'MB');
