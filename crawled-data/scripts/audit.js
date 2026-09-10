// Coverage audit: every leaf string in the source data must be reachable in the viewer.
const { chromium } = require('./node_modules/playwright');
const path = '/Users/vy/Desktop/Personal/Giaidapduoc/crawled-data/';
const DIS = require(path + 'diseases.json');
const PHARM = require(path + 'pharm.json');
const SAFE = require(path + 'drug_safety.json');
const INTERS = require(path + 'inters.json');
const QUIZ = require(path + 'quiz_bank_map.json');

const norm = s => String(s).replace(/\s+/g, ' ').trim();
// Collect leaf strings worth checking (skip ids/colors/codes handled separately).
function leaves(o, skipKeys, out = []) {
  if (typeof o === 'string') { if (o.trim().length > 3) out.push(o); return out; }
  if (Array.isArray(o)) { o.forEach(x => leaves(x, skipKeys, out)); return out; }
  if (o && typeof o === 'object') {
    for (const k of Object.keys(o)) if (!skipKeys.includes(k)) leaves(o[k], skipKeys, out);
  }
  return out;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('file:///Users/vy/Desktop/Personal/Giaidapduoc/otc-viewer.html');

  const missing = [];

  for (const d of DIS) {
    // Render under every selectable group, with symptom filter OFF, and union the text.
    const text = await page.evaluate(id => {
      const dd = DIS.find(x => x.id === id);
      const avail = GROUPS.filter(g => !g.k || !(dd.noGroups || []).includes(g.k));
      let acc = '';
      for (const g of avail) {
        S.id = id; S.syms = []; S.group = g.id;
        renderMain();
        acc += ' ' + document.getElementById('main').innerText;
      }
      return acc.replace(/\s+/g, ' ');
    }, d.id);

    // skip: structural keys, and `ints`/`grp_show` which are lookup tokens not prose
    const want = leaves(d, ['id', 'batch', 'batch2', 'color', 'icon', 'noGroups', 'ints', 'grp_show', 'u']);
    for (const s of new Set(want)) {
      if (!text.includes(norm(s))) missing.push({ disease: d.id, text: s.slice(0, 90) });
    }
  }

  // ── PHARM reachability: which drug names anywhere in the tree open a sheet? ──
  const reachable = new Set();
  for (const d of DIS) {
    for (const x of (d.A.etc || [])) reachable.add(String(x.d || '').replace(/^⚠️\s*/, ''));
    for (const x of (d.A.otc || [])) reachable.add(String(x.d || '').replace(/^⚠️\s*/, ''));
    for (const g of d.B) for (const x of g.drugs) reachable.add(String(x.n || '').replace(/^⚠️\s*/, ''));
    for (const x of (d.C || [])) reachable.add(String(x.n || '').replace(/^⚠️\s*/, ''));
  }
  // Trang "Tra cứu dược lý" liệt kê mọi key nên coi là mở được nếu nó xuất hiện ở đó.
  const indexed = await page.evaluate(() => {
    S.page = 'index'; S.dq = ''; renderMain();
    const names = [...document.querySelectorAll('.dcard .dn')].map(n => n.textContent);
    S.page = 'disease'; renderMain();
    return names;
  });
  const idx = new Set(indexed);
  const pharmUnreachable = Object.keys(PHARM).filter(n => !reachable.has(n) && !idx.has(n));
  const safeUnreachable = Object.keys(SAFE).filter(n => !reachable.has(n) && !idx.has(n));

  // ── PHARM sheet field coverage (sample every reachable drug that has an entry) ──
  const sheetMissing = [];
  const withPharm = [...reachable].filter(n => PHARM[n]);
  for (const n of withPharm) {
    const t = await page.evaluate(nm => { sheet(nm); const s = document.getElementById('sh').innerText; close(); return s.replace(/\s+/g, ' '); }, n);
    const p = PHARM[n];
    for (const [k, v] of Object.entries(p)) if (v && !t.includes(norm(v))) sheetMissing.push(n + ' → ' + k);
    // every drug_safety population for this drug should be listed
    for (const k of Object.keys(SAFE[n] || {})) {
      const g = { u3m: 'Trẻ <3 tháng', u2y: 'Trẻ <2t', cu6: 'Trẻ <6t', c612: 'Trẻ 6–12t', preg: 'Thai phụ',
        bfeed: 'Cho bú', eld: 'Người cao tuổi', htn: 'Tăng huyết áp', dm: 'Đái tháo đường', suygan: 'Suy gan', suythan: 'Suy thận' }[k];
      if (g && !t.includes(g)) sheetMissing.push(n + ' → an toàn nhóm ' + k + ' không hiện');
    }
  }

  // ── INTERS reachability ──
  const usedTokens = new Set();
  DIS.forEach(d => (d.dosing || []).forEach(r => (r.ints || []).forEach(t => usedTokens.add(t))));
  const intersOnIndex = await page.evaluate(() => {
    S.page = 'index'; renderMain();
    const t = document.getElementById('main').innerText;
    S.page = 'disease'; renderMain();
    return t;
  });
  const intersUnreachable = Object.keys(INTERS)
    .filter(k => !usedTokens.has(k.split('|')[0]) && !intersOnIndex.includes(INTERS[k].desc));

  // ── quiz field coverage ──
  const quizBanksUnreachable = Object.keys(QUIZ).filter(b => !DIS.some(d => d.id === b) && b !== 'dyspepsia');
  const diseasesNoQuiz = DIS.filter(d => !QUIZ[d.id] && !(d.id === 'indigestion')).map(d => d.id);

  console.log(JSON.stringify({
    diseaseTextMissing: missing,
    pharmEntriesNeverReachable: pharmUnreachable,
    drugSafetyEntriesNeverReachable: safeUnreachable,
    pharmSheetFieldMissing: [...new Set(sheetMissing)],
    intersNeverShown: intersUnreachable,
    quizBanksUnreachable, diseasesNoQuiz,
    jsErrors: errors,
  }, null, 1));

  await browser.close();
})();
