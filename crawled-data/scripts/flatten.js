// Flatten the extracted JSON datasets into analysis-friendly CSV tables.
const fs = require('fs');
const path = require('path');

const DIR = process.argv[2];
const CSV = path.join(DIR, 'csv');
fs.mkdirSync(CSV, { recursive: true });
const load = n => JSON.parse(fs.readFileSync(path.join(DIR, n + '.json'), 'utf8'));

const cell = v => {
  if (v === null || v === undefined) return '';
  const s = Array.isArray(v) ? v.join(' | ') : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
function write(name, cols, rows) {
  const out = [cols.join(',')].concat(rows.map(r => cols.map(c => cell(r[c])).join(','))).join('\n');
  fs.writeFileSync(path.join(CSV, name + '.csv'), '﻿' + out); // BOM so Excel reads Vietnamese
  console.log(`${(name + '.csv').padEnd(24)} ${String(rows.length).padStart(5)} rows`);
}

const DISEASES = load('diseases');

// Labels taken verbatim from the app's getGroups(); u3m and maoi are data-only
// keys with no button of their own.
const SPECIAL = {
  u3m: 'Trẻ <3 tháng', u2y: 'Trẻ <2t', cu6: 'Trẻ <6t', c612: 'Trẻ 6–12t',
  preg: 'Thai phụ', bfeed: 'Cho bú', eld: 'Người cao tuổi', htn: 'Tăng huyết áp',
  dm: 'Đái tháo đường', suygan: 'Suy gan', suythan: 'Suy thận',
  maoi: 'Đang dùng iMAO',
};

// Sidebar section labels, verbatim from the app's `batches` array.
const BATCH = {
  respiratory: 'Hô hấp', digestive: 'Tiêu hoá', skin: 'Da liễu', eye: 'Mắt',
  allergy: 'Dị ứng & Da liễu', neuro: 'Thần kinh', musculo: 'Cơ xương khớp',
  gynecology: 'Phụ khoa', dental: 'Răng miệng', other: 'Khác',
};

write('diseases',
  ['id', 'batch', 'batch_label', 'batch2', 'name', 'sub', 'icon', 'color', 'symptoms', 'n_redflags', 'n_regimens', 'hidden_groups'],
  DISEASES.map(d => ({
    ...d,
    batch_label: BATCH[d.batch] || d.batch,
    batch2: d.batch2 || '',
    n_redflags: (d.redFlags || []).length,
    n_regimens: (d.dosing || []).length,
    hidden_groups: (d.noGroups || []).map(g => SPECIAL[g] || g),
  })));

write('patient_groups', ['id', 'data_key', 'label', 'icon', 'in_ui'], [
  ...['adult:null:Người lớn:👤', 'u2y:u2y:Trẻ <2t:👶', 'cu6:cu6:Trẻ <6t:🧒', 'c612:c612:Trẻ 6–12t:🎒',
    'preg:preg:Thai phụ:🤰', 'bf:bfeed:Cho bú:🤱', 'eld:eld:Người cao tuổi:👴', 'htn:htn:Tăng huyết áp:❤️‍🩹',
    'dm:dm:Đái tháo đường:💉', 'suygan:suygan:Suy gan:🟡', 'suythan:suythan:Suy thận:💧',
  ].map(s => { const [id, k, label, icon] = s.split(':'); return { id, data_key: k === 'null' ? '' : k, label, icon, in_ui: 'yes' }; }),
  { id: '', data_key: 'u3m', label: 'Trẻ <3 tháng', icon: '🚨', in_ui: 'no' },
  { id: '', data_key: 'maoi', label: 'Đang dùng iMAO', icon: '⛔', in_ui: 'no' },
]);

write('red_flags', ['disease_id', 'disease', 'urgency', 'flag', 'action'],
  DISEASES.flatMap(d => (d.redFlags || []).map(r => ({ disease_id: d.id, disease: d.name, urgency: r.u, flag: r.f, action: r.a }))));

// Tier A = prescription/causal, B = OTC by symptom, C = supportive/supplement
const treatments = [];
for (const d of DISEASES) {
  const base = { disease_id: d.id, disease: d.name };
  for (const x of (d.A && d.A.etc) || []) treatments.push({ ...base, tier: 'A', symptom_group: 'Điều trị căn nguyên — ETC (kê đơn)', drug: x.d, dose: x.dose || '', note: x.note });
  for (const x of (d.A && d.A.otc) || []) treatments.push({ ...base, tier: 'A', symptom_group: 'Điều trị căn nguyên — OTC', drug: x.d, dose: x.dose || '', note: x.note });
  for (const g of d.B || []) for (const x of g.drugs || []) treatments.push({ ...base, tier: 'B', symptom_group: g.sym, drug: x.n, dose: x.d, note: x.note });
  for (const x of d.C || []) treatments.push({ ...base, tier: 'C', symptom_group: 'Hỗ trợ / TPCN', drug: x.n, dose: x.d, note: x.note });
}
write('treatments', ['disease_id', 'disease', 'tier', 'symptom_group', 'drug', 'dose', 'note'], treatments);

write('regimens', ['disease_id', 'disease', 'regimen', 'drugs', 'note', 'interactions'],
  DISEASES.flatMap(d => (d.dosing || []).map(r => ({ disease_id: d.id, disease: d.name, regimen: r.name, drugs: r.drugs, note: r.note, interactions: r.ints }))));

write('special_populations', ['disease_id', 'disease', 'population_code', 'population', 'guidance'],
  DISEASES.flatMap(d => Object.entries(d.special || {}).map(([k, v]) =>
    ({ disease_id: d.id, disease: d.name, population_code: k, population: SPECIAL[k] || k, guidance: v }))));

const PHARM = load('pharm');
write('pharmacology', ['drug', 'class', 'mechanism', 'pharmacokinetics', 'contraindications', 'warnings', 'max_dose'],
  Object.entries(PHARM).map(([n, p]) => ({ drug: n, class: p.cls, mechanism: p.mech, pharmacokinetics: p.pk, contraindications: p.ci, warnings: p.warn, max_dose: p.dmax })));

write('drug_safety', ['drug', 'population_code', 'population', 'allowed', 'dose', 'warning'],
  Object.entries(load('drug_safety')).flatMap(([drug, pops]) => Object.entries(pops).map(([k, v]) =>
    ({ drug, population_code: k, population: SPECIAL[k] || k, allowed: v.show ? 'yes' : 'no', dose: v.dose || '', warning: v.warn || '' }))));

write('interactions', ['pair', 'drug_a', 'drug_b', 'severity', 'description'],
  Object.entries(load('inters')).map(([pair, v]) =>
    ({ pair, drug_a: pair.split('|')[0], drug_b: pair.split('|')[1], severity: v.sev, description: v.desc })));

const NAME_BY_ID = Object.fromEntries(DISEASES.map(d => [d.id, d.name]));
const quiz = [];
for (const [bank, arr] of Object.entries(load('quiz_bank_map'))) {
  arr.forEach((q, i) => {
    const opts = q.opts || (q.type === 'tf' ? ['Đúng', 'Sai'] : []);
    const ansIdx = q.type === 'tf' ? (q.ans === true ? 0 : 1) : q.ans;
    quiz.push({
      bank, disease: NAME_BY_ID[bank] || bank, idx: i + 1, category: q.cat, type: q.type,
      question: q.q, options: opts, answer_index: ansIdx, answer: opts[ansIdx] ?? String(q.ans),
      explanation: q.exp, icon: q.icon || '',
    });
  });
}
write('quiz_questions', ['bank', 'disease', 'idx', 'category', 'type', 'question', 'options', 'answer_index', 'answer', 'explanation', 'icon'], quiz);
