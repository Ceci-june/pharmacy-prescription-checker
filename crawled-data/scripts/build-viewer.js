// Inline the extracted JSON into the viewer template -> one self-contained file.
const fs = require('fs');
const path = require('path');

const DIR = process.argv[2];
const TPL = process.argv[3];
const OUT = process.argv[4];
const load = n => JSON.parse(fs.readFileSync(path.join(DIR, n + '.json'), 'utf8'));

const data = {
  diseases: load('diseases'),
  pharm: load('pharm'),
  drugSafety: load('drug_safety'),
  inters: load('inters'),
  symFilter: load('sym_filter'),
  meta: load('data_meta'),
  quiz: load('quiz_bank_map'),
  icd10: load('icd10'),      // ICD_10.xlsx → icd-to-json.js
};

// `</script>` and the U+2028/9 line separators would break the inline script tag.
const json = JSON.stringify(data)
  .replace(/</g, '\\u003c')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

let tpl = fs.readFileSync(TPL, 'utf8');
// LUÔN dùng hàm làm replacement. Chuỗi thay thế bị diễn giải `$&` `$$` `` $` `` `$'`
// — SheetJS có "0$&" nên nếu truyền chuỗi, `$&` sẽ bị thay bằng chính placeholder.
const SLOT = '/*__DATA__*/null';
if (!tpl.includes(SLOT)) throw new Error('template placeholder missing');
tpl = tpl.replace(SLOT, () => json);

// SheetJS (Apache-2.0) nhúng thẳng vào file — trang phải chạy offline, không gọi CDN.
const XSLOT = '/*__XLSX__*/';
if (tpl.includes(XSLOT)) {
  const libPath = path.join(__dirname, 'node_modules/xlsx/dist/xlsx.mini.min.js');
  const alt = path.join(path.dirname(TPL), 'xlsx.mini.min.js');
  const src = fs.existsSync(libPath) ? libPath : alt;
  if (!fs.existsSync(src)) throw new Error('không tìm thấy xlsx.mini.min.js (cạnh template hoặc trong node_modules)');
  const lib = fs.readFileSync(src, 'utf8').replace(/<\/script/gi, () => '<\\/script');
  tpl = tpl.replace(XSLOT, () => lib);
}
// Tesseract.js + core + eng.traineddata, nhúng để OCR chạy offline (xem build-ocr-assets.js).
const OSLOT = '/*__OCR__*/';
if (tpl.includes(OSLOT)) {
  const p = path.join(__dirname, 'ocr-assets.js');
  const alt = path.join(path.dirname(TPL), 'ocr-assets.js');
  const src = fs.existsSync(p) ? p : alt;
  if (!fs.existsSync(src)) throw new Error('không tìm thấy ocr-assets.js — chạy build-ocr-assets.js trước');
  const ocr = fs.readFileSync(src, 'utf8').replace(/<\/script/gi, () => '<\\/script');
  tpl = tpl.replace(OSLOT, () => ocr);
}
fs.writeFileSync(OUT, tpl);

// Chốt lại: placeholder không được còn sót, và thư viện phải nguyên vẹn từng byte.
if (/__DATA__|__XLSX__/.test(fs.readFileSync(OUT, 'utf8'))) {
  throw new Error('placeholder còn sót trong file build — nghi bị $& diễn giải');
}

const kb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(2);
console.log(`${path.basename(OUT)} — ${kb} MB`);
console.log(`  ${data.diseases.length} bệnh · ${Object.keys(data.pharm).length} hoạt chất · ` +
  `${Object.values(data.quiz).reduce((a, b) => a + b.length, 0)} câu hỏi`);
