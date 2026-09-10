// Extract embedded datasets from the OTC Review Tool page into JSON files.
const fs = require('fs');
const path = require('path');

const SRC = process.argv[2];
const OUT = process.argv[3];
const html = fs.readFileSync(SRC, 'utf8');
fs.mkdirSync(OUT, { recursive: true });

// `S` (state mặc định của UI) cố tình không lấy — là trạng thái giao diện, không phải nội dung.
const NAMES = ['PHARM', 'INTERS', 'DISEASES', 'DATA_META', 'DRUG_SAFETY', 'SYM_FILTER', 'QUIZ_BANK_MAP'];

// Scan forward from `start` (index of the opening { or [) honouring strings,
// template literals, comments and regex-free code until the literal closes.
function matchLiteral(src, start) {
  const open = src[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === quote) break;
        i++;
      }
      continue;
    }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced literal starting at ' + start);
}

const summary = {};
for (const name of NAMES) {
  const re = new RegExp('\\bconst\\s+' + name + '\\s*=\\s*', 'g');
  const m = re.exec(html);
  if (!m) { console.error('MISS', name); continue; }
  let i = m.index + m[0].length;
  if (html[i] !== '{' && html[i] !== '[') { console.error('SKIP (not a literal)', name); continue; }
  const expr = matchLiteral(html, i);
  let value;
  try {
    value = new Function('return (' + expr + ')')();
  } catch (e) {
    console.error('EVAL FAIL', name, e.message);
    continue;
  }
  const file = path.join(OUT, name.toLowerCase() + '.json');
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
  const count = Array.isArray(value) ? value.length : Object.keys(value).length;
  summary[name] = count;
  console.log(`${name.padEnd(14)} ${String(count).padStart(6)} records  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}
