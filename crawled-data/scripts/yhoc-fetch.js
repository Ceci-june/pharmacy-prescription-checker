// Thu thập toàn bộ danh mục YHCT và PL3 từ API công khai của yhoc.io.
//
// API không có offset/page và chặn cứng ở 100 bản ghi mỗi lượt, nhưng `q` khớp
// CHUỖI CON (cả trong mã lẫn trong tên). Nên cách phủ hết là: hỏi từng tiền tố,
// hễ lượt nào trả về đúng 100 (tức là bị cắt) thì nối thêm 1 ký tự rồi hỏi lại,
// đệ quy cho tới khi không lượt nào chạm trần. Gộp theo khoá duy nhất.
//
// YHCT: mọi mã đều dạng U##.### nên duyệt theo MÃ — chỉ cần bảng chữ "0-9." là phủ hết,
//       rẻ hơn hẳn mò theo tên tiếng Việt.
// PL3:  không có mã gốc, phải mò theo tên; cắt sẵn theo tham số `letter` để chia nhỏ.
//
// Chạy tuần tự, nghỉ giữa các lượt — không ép tải lên máy chủ của họ.
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2];
const SET = process.argv[3];
const DELAY = +(process.env.DELAY || 220);
const CAP = 100;

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
// Máy chủ CẮT khoảng trắng hai đầu của `q`, nên nối thêm ' ' hay '-' không thu hẹp
// được kết quả: nhánh đó cứ chạm trần mãi và đệ quy rơi vào vòng vô tận
// ("ac    g" vẫn trả về đúng 100). Vì vậy bảng nối dài chỉ gồm chữ và số.
const NAME_ALPHA = LETTERS.concat('0123456789'.split(''));
// Ký tự thứ hai của tên thì vẫn có thể là ' ' hoặc '-' ("Agonist --Alpha..."),
// nên lượt gieo mầm phải tính cả chúng.
const SEED2 = NAME_ALPHA.concat([' ', '-']);

const CFG = {
  yhct: {
    url: 'https://yhoc.io/api/yhct/search',
    key: d => d.code,
    seed: ['U'],
    alpha: '0123456789.'.split(''),
  },
  pl3: {
    url: 'https://yhoc.io/api/pl3/search',
    key: d => d.displayName,
    // Mỗi chữ cái đầu là một rổ riêng. Trong rổ L, mọi tên đều bắt đầu bằng L nên
    // hỏi hết cặp "L?" là phủ trọn rổ — tên nào cũng dài ≥2 ký tự, tức luôn rơi vào
    // đúng một cặp. Cặp nào chạm trần thì nối thêm ký tự rồi đào tiếp.
    seed: LETTERS.flatMap(L => SEED2.map(c => ({ letter: L.toUpperCase(), q: L + c }))),
    alpha: NAME_ALPHA,
  },
  // Quét vét: KHÔNG dùng bộ lọc rổ chữ cái. Hoá ra cột `letter` của họ không phải lúc
  // nào cũng là chữ đầu của tên ("Anti-infective NEC - bismuth, local" nằm ngoài rổ A),
  // nên chia theo rổ là bỏ sót. Gieo bằng TOÀN BỘ cặp 2 ký tự [a-z0-9]: tên nào cũng
  // chứa ít nhất một cặp như vậy, nên không thể lọt.
  pl3all: {
    url: 'https://yhoc.io/api/pl3/search',
    key: d => d.displayName,
    seed: NAME_ALPHA.flatMap(a => NAME_ALPHA.map(b => ({ q: a + b }))),
    alpha: NAME_ALPHA,
  },
}[SET];
if (!CFG || !OUT) { console.error('dùng: node yhoc-fetch.js <out.json> <yhct|pl3>'); process.exit(1); }

const seen = new Map();
const done = new Set();
let reqs = 0, saturated = 0;
const gaveUp = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ask({ q, letter }) {
  const p = new URLSearchParams({ q, limit: String(CAP) });
  if (letter) p.set('letter', letter);
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(`${CFG.url}?${p}`, { headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      reqs++;
      return Array.isArray(j.docs) ? j.docs : [];
    } catch (e) {
      // Lỗi mạng lẻ tẻ thì lùi dần rồi thử lại; quá 4 lần thì dừng để biết mà vá.
      if (attempt >= 4) throw new Error(`${JSON.stringify(p.toString())}: ${e.message}`);
      await sleep(600 * attempt);
    }
  }
}

async function crawl(node) {
  const id = (node.letter || '') + '\u0000' + node.q;
  if (done.has(id)) return;
  done.add(id);
  const docs = await ask(node);
  for (const d of docs) {
    const k = CFG.key(d);
    if (k != null && !seen.has(k)) seen.set(k, d);
  }
  const full = docs.length >= CAP;
  if (full) saturated++;
  process.stdout.write(`\r  ${reqs} lượt · ${seen.size} bản ghi · "${node.letter || ''}${node.letter ? '/' : ''}${node.q}"${' '.repeat(14)}`);
  await sleep(DELAY);
  // Chỉ đào sâu khi lượt này bị cắt — chưa chạm trần nghĩa là tiền tố này đã lấy hết.
  if (!full) return;
  // Chặn đào vô tận nếu máy chủ lại chuẩn hoá `q` theo kiểu ta chưa lường: báo ra
  // để còn biết chỗ nào có thể thiếu, thay vì âm thầm bỏ sót.
  if (node.q.length >= 8) { gaveUp.push((node.letter || '') + ':' + node.q); return; }
  for (const c of CFG.alpha) await crawl({ ...node, q: node.q + c });
}

(async () => {
  console.log(`Thu thập ${SET.toUpperCase()} từ ${CFG.url}`);
  for (const s of CFG.seed) await crawl(typeof s === 'string' ? { q: s } : s);
  console.log(`\n  xong: ${seen.size} bản ghi · ${reqs} lượt · ${saturated} lượt chạm trần`);
  if (gaveUp.length) console.log('  CẢNH BÁO — bỏ dở ' + gaveUp.length + ' nhánh: ' + gaveUp.slice(0, 10).join(', '));
  const rows = [...seen.values()].sort((a, b) =>
    String(CFG.key(a)).localeCompare(String(CFG.key(b)), 'vi'));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
  console.log(`  → ${OUT}`);
})().catch(e => { console.error('\nLỖI: ' + e.message); process.exit(1); });
