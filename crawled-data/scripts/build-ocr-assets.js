// Gói tài nguyên Tesseract thành 1 file JS để nhúng vào trang (chạy offline, không CDN).
// Cách nhúng: worker + core → blob URL; traineddata → truyền thẳng bytes qua createWorker([{code,data}]),
// nhờ vậy không cần langPath nên không có fetch nào (fetch trên file:// bị CORS chặn).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = process.argv[2] || 'ocr-assets.js';
const CORE = 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js';
const WORKER = 'node_modules/tesseract.js/dist/worker.min.js';
const MAIN = 'node_modules/tesseract.js/dist/tesseract.min.js';
const TRAINED = '/opt/homebrew/share/tessdata/eng.traineddata';

const b64 = f => fs.readFileSync(f).toString('base64');
const gzB64 = f => zlib.gzipSync(fs.readFileSync(f), { level: 9 }).toString('base64');

// Worker và core phải NỐI LÀM MỘT: trong blob worker trên file://, importScripts một blob URL
// khác sẽ bị chặn (NetworkError). getCore() bỏ qua importScripts nếu global.TesseractCore đã có,
// nên chỉ cần đặt core trước worker trong cùng một script là xong.
// Vá một lỗi của tesseract.js 7.0.0: hàm initialize dựng tên ngôn ngữ bằng `l.data`
// (mảng byte) thay vì `l.code`, nên khi truyền traineddata trực tiếp thì Tesseract đi tìm
// file tên "31,139,8,..." rồi báo "initialization failed".
function patchWorker(src) {
  const BUG = 'return"string"==typeof t?t:t.data})).join("+")';
  const FIX = 'return"string"==typeof t?t:t.code})).join("+")';
  const hits = src.split(BUG).length - 1;
  if (hits !== 1) throw new Error(`vá worker thất bại: tìm thấy ${hits} chỗ khớp (cần đúng 1)`);
  return src.split(BUG).join(FIX);
}

const parts = {
  worker: Buffer.from(
    fs.readFileSync(CORE, 'utf8') + '\n;\n' + patchWorker(fs.readFileSync(WORKER, 'utf8')),
  ).toString('base64'),
  eng: gzB64(TRAINED),      // tesseract tự nhận gzip qua magic number 1F 8B
};

const js = `// Tesseract.js 7.0.0 + core LSTM + eng.traineddata (Apache-2.0) — nhúng để chạy offline.
${fs.readFileSync(MAIN, 'utf8')}
;window.__OCR_ASSETS = ${JSON.stringify(parts)};
`;
fs.writeFileSync(OUT, js);

const mb = n => (n / 1048576).toFixed(2) + ' MB';
console.log(`${OUT} — ${mb(fs.statSync(OUT).size)}`);
for (const [k, v] of Object.entries(parts)) console.log(`  ${k.padEnd(7)} base64 ${mb(v.length)}`);
