// Kiểm bộ khớp tên thuốc trong tab Kiểm tra đơn — gọi thẳng rxScan() với danh mục và
// chữ OCR dựng sẵn, không chạy OCR thật, để mỗi ca là một phép thử xác định.
//
// Hai phía phải cùng đúng, và phía thứ hai mới là phía nguy hiểm:
//   - khi có một thuốc HƠN HẲN thì phải tự chọn (nếu không, người dùng phải bấm tay
//     cho một dòng vốn đã rõ ràng);
//   - khi KHÔNG có thuốc nào hơn hẳn thì phải tiếp tục hỏi — chọn sai là sai thuốc.
const { chromium } = require('./node_modules/playwright');
const FILE = 'file:///Users/vy/Desktop/Personal/Giaidapduoc/otc-viewer.html';

const mk = list => list.map((d, i) => Object.assign(
  { id: 'd' + i, icd: '', cls: '', ind: '', ci: '', dose: '', caut: '' }, d));

const CASES = [
  {
    ten: 'Hoạt huyết dưỡng não — ca người dùng báo',
    // Dòng OCR thật, đọc méo: "dưỡng não" ra "ducing ndo", "lăng" ra "ling".
    ocr: "'Hoat huyet ducing ndo dinh 1 ling, Bach qua | 28",
    drugs: [
      { name: 'Hoạt huyết dưỡng não (Viên nén bao đường)', ing: 'Đinh lăng ; Cao lá bạch quả' },
      { name: 'Bổ Huyết Ích Não (Viên nang cứng)', ing: 'Đương quy, Bạch Quả' },
    ],
    // Cùng trúng chữ "huyet", nhưng chỉ thuốc đầu trúng thêm hoat + dinh + bach.
    mongDoi: { tuThem: ['Hoạt huyết dưỡng não (Viên nén bao đường)'], moHo: 0 },
  },
  {
    ten: 'Hai sản phẩm cùng tên khác dạng bào chế — PHẢI tiếp tục hỏi',
    ocr: 'Paracetamol 500mg | Paracetamol | Vien | 20',
    drugs: [
      { name: 'Paracetamol 500mg (viên nén)', ing: 'Paracetamol 500mg' },
      { name: 'Paracetamol 500mg (viên đặt)', ing: 'Paracetamol 500mg' },
    ],
    mongDoi: { tuThem: [], moHo: 1 },
  },
  {
    ten: 'Tên thuốc ở cột đầu thắng hoạt chất ở cột sau',
    // Lỗi cũ: "natri" ở cột hoạt chất trùng đúng tên NATRI CLORID của thuốc khác.
    ocr: 'Usalukas 5 Natri montelukast 5mg Vien 28',
    drugs: [
      { name: 'NATRI CLORID 0,9% (dung dịch nhỏ mắt)', ing: 'Natri clorid 0,9%' },
      { name: 'USALUKAST 5 (viên nhai)', ing: 'Montelukast 5mg' },
      { name: 'USALUKAST 10 (viên nén bao phim)', ing: 'Montelukast 10mg' },
    ],
    mongDoi: { tuThem: ['USALUKAST 5 (viên nhai)'], moHo: 0 },
  },
  {
    ten: 'Thuốc phối hợp — đủ bằng chứng thì tự chọn',
    ocr: 'Amoxicillin acid clavulanic 500 125 Vien 20',
    drugs: [
      { name: 'Amoxicillin 500mg (viên nang)', ing: 'Amoxicillin 500mg' },
      { name: 'Amoxicillin + Acid clavulanic 500/125 (viên nén)', ing: 'Amoxicillin 500mg; Acid clavulanic 125mg' },
    ],
    mongDoi: { tuThem: ['Amoxicillin + Acid clavulanic 500/125 (viên nén)'], moHo: 0 },
  },
  {
    ten: 'Cùng danh mục đó nhưng dòng chỉ ghi tên đơn — PHẢI tiếp tục hỏi',
    // Hơn 1 bằng chứng là chưa đủ: dòng này có thể là thuốc đơn mà cũng có thể là thuốc
    // phối hợp bị cắt cụt cột. Không được đoán.
    ocr: 'Amoxicillin 500 Vien 20',
    drugs: [
      { name: 'Amoxicillin 500mg (viên nang)', ing: 'Amoxicillin 500mg' },
      { name: 'Amoxicillin + Acid clavulanic 500/125 (viên nén)', ing: 'Amoxicillin 500mg; Acid clavulanic 125mg' },
    ],
    mongDoi: { tuThem: [], moHo: 1 },
  },
  {
    ten: 'Diệp hạ châu KH — tên toàn âm tiết ngắn',
    // Không âm tiết nào đủ 5 ký tự (diep/ha/chau/kh), nên luật "một từ dài" không với tới.
    ocr: 'Diep ha chau KH | Diep ha chau | Vien | 20',
    drugs: [
      { name: 'Diệp hạ châu KH (viên nén bao phim)', ing: 'Cao khô diệp hạ châu đắng' },
      { name: 'Cefuroxim 500mg (viên nén)', ing: 'Cefuroxim 500mg' },
    ],
    mongDoi: { tuThem: ['Diệp hạ châu KH (viên nén bao phim)'], moHo: 0 },
  },
  {
    ten: 'Hai chế phẩm diệp hạ châu khác nhau — PHẢI tiếp tục hỏi',
    ocr: 'Diep ha chau | Diep ha chau | Vien | 20',
    drugs: [
      { name: 'Diệp hạ châu KH (viên nén bao phim)', ing: 'Cao khô diệp hạ châu đắng' },
      { name: 'Diệp hạ châu PV (viên nang cứng)', ing: 'Cao khô diệp hạ châu đắng' },
    ],
    mongDoi: { tuThem: [], moHo: 1 },
  },
  {
    ten: 'Cụm trong tên không được trúng chữ ở cột khác',
    // "ha chau" không có trên dòng; không được bịa ra khớp.
    ocr: 'Cefuroxim 500mg | Cefuroxim | Vien | 14',
    drugs: [
      { name: 'Diệp hạ châu KH (viên nén bao phim)', ing: 'Cao khô diệp hạ châu đắng' },
      { name: 'Cefuroxim 500mg (viên nén)', ing: 'Cefuroxim 500mg' },
    ],
    mongDoi: { tuThem: ['Cefuroxim 500mg (viên nén)'], moHo: 0 },
  },
  {
    ten: 'Dòng tiêu đề và chân phiếu không được sinh ra thuốc',
    ocr: ['Ten | Hoat chat | DVT | S.Luong | Don gia | Thanh tien',
          'BENH VIEN DA KHOA KHU VUC',
          'Nguoi lap bang Ngay 12 thang 05 nam 2026',
          'Bac si dieu tri Truong khoa Duoc',
          'Cong khoan muc chi phi'].join('\n'),
    drugs: [
      { name: 'Viên Dạ Dày CHOLAPAN OPC (viên nén bao phim)', ing: 'Cao đặc dược liệu' },
      { name: 'THUỐC HO NGƯỜI LỚN OPC (nhũ tương uống)', ing: 'Cao lỏng dược liệu' },
    ],
    mongDoi: { tuThem: [], moHo: 0 },
  },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(FILE);

  // Chữ đ là ký tự riêng (U+0111), NFD không tách được — phải thay tay, nếu không
  // "Đinh lăng" rút thành "inh lang" và từ bị cụt sẽ rơi dưới ngưỡng độ dài.
  const norm = await page.evaluate(() => ({
    dinhLang: rxNorm('Đinh lăng'),
    duong: rxNorm('bao đường'),
    dauDau: rxNorm('Đau đầu'),
  }));

  const ket = [];
  for (const c of CASES) {
    const got = await page.evaluate(([ocr, drugs]) => {
      UD.drugs = drugs; S.rxText = ocr; S.rxItems = [];
      const sc = rxScan();
      return { tuThem: sc.sure.map(x => x.drug.name), moHo: sc.amb.length,
               nhan: sc.amb.map(a => a.by) };
    }, [c.ocr, mk(c.drugs)]);
    const dat = JSON.stringify(got.tuThem) === JSON.stringify(c.mongDoi.tuThem)
      && got.moHo === c.mongDoi.moHo;
    ket.push({ ten: c.ten, dat, mongDoi: c.mongDoi, thucTe: { tuThem: got.tuThem, moHo: got.moHo } });
  }

  console.log('chuẩn hoá chữ đ:', JSON.stringify(norm));
  const dNoted = norm.dinhLang === 'dinh lang' && norm.duong === 'bao duong' && norm.dauDau === 'dau dau';
  console.log('  → ' + (dNoted ? 'ĐẠT' : 'HỎNG'));
  console.log();
  for (const r of ket) {
    console.log((r.dat ? '✓ ' : '✗ ') + r.ten);
    if (!r.dat) {
      console.log('    mong đợi:', JSON.stringify(r.mongDoi));
      console.log('    thực tế :', JSON.stringify(r.thucTe));
    }
  }
  const fail = ket.filter(r => !r.dat).length;
  console.log('\n' + (ket.length - fail) + '/' + ket.length + ' ca đạt · lỗi JS: ' + JSON.stringify(errors));
  await browser.close();
  process.exit(fail || !dNoted ? 1 : 0);
})();
