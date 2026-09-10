// In ra các thuốc chưa làm + số trang, để tiếp tục sau khi mất ngữ cảnh.
const fs = require('fs');
const idx = fs.readFileSync('pages/_index.txt', 'utf8').trim().split('\n')
  .map(l => { const [n, name] = l.split('|'); return { n: +n, name }; });
const done = new Set(fs.existsSync('rows.jsonl')
  ? fs.readFileSync('rows.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l).n) : []);
const todo = idx.filter(d => !done.has(d.n));
console.log(`xong ${done.size}/${idx.length} — còn ${todo.length}`);
const N = +(process.argv[2] || 6);
for (const d of todo.slice(0, N)) {
  const pages = fs.readdirSync('pages').filter(f => f.startsWith(String(d.n).padStart(3,'0') + '-')).sort();
  console.log(`${String(d.n).padStart(3,'0')}  ${d.name}  →  ${pages.join(' ')}`);
}
