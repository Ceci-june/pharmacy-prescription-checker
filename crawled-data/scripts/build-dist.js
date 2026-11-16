// Gom thư mục phát hành: chép vào USB hay gửi cho đồng nghiệp là chạy được ngay.
//
// otc-viewer.html đã tự chứa mọi thứ (dữ liệu, SheetJS, bộ OCR đều nhúng sẵn), nên về
// lý thuyết chỉ cần mỗi nó. Thư mục này thêm hai cái mở nhanh và một tờ hướng dẫn:
//
//   otc-viewer.html        — toàn bộ ứng dụng, mở bằng trình duyệt nào cũng được
//   OTC Tool.app           — macOS: mở trong cửa sổ riêng, không thanh địa chỉ
//   OTC-Tool-Windows.bat   — Windows: y hệt, bằng Edge hoặc Chrome
//   HUONG-DAN.txt          — dành cho người dùng cuối, không phải cho người lập trình
//
// Hai file mở nhanh đều tìm otc-viewer.html NGAY CẠNH chúng, nên cả bốn phải nằm cùng
// một thư mục và không được đổi tên file html.
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2];                      // thư mục dự án
const OUT = process.argv[3];                       // thư mục phát hành cần tạo
if (!ROOT || !OUT) {
  console.error('dùng: node build-dist.js <thư-mục-dự-án> <thư-mục-phát-hành>');
  process.exit(1);
}

const HTML = 'otc-viewer.html';
const src = p => path.join(ROOT, p);
const dst = p => path.join(OUT, p);

if (!fs.existsSync(src(HTML))) {
  throw new Error(`chưa có ${HTML} — chạy build-viewer.js trước`);
}

// Dọn sạch rồi dựng lại, để file cũ của lần trước không sót lại trong bản gửi đi.
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

fs.copyFileSync(src(HTML), dst(HTML));
// cpSync giữ nguyên quyền thực thi của OTC Tool.app/Contents/MacOS/otc-tool —
// mất bit đó thì macOS báo "ứng dụng bị hỏng" chứ không nói là thiếu quyền.
for (const name of ['OTC Tool.app', 'OTC-Tool-Windows.bat']) {
  if (fs.existsSync(src(name))) fs.cpSync(src(name), dst(name), { recursive: true });
  else console.warn(`  (bỏ qua ${name} — không có trong thư mục dự án)`);
}

const GUIDE = `TRA CỨU DƯỢC — HƯỚNG DẪN SỬ DỤNG
===================================================================

MỞ CHƯƠNG TRÌNH

  Windows   nháy đúp  OTC-Tool-Windows.bat
  macOS     nháy đúp  OTC Tool.app

  Không mở được bằng hai cách trên thì nháy đúp thẳng vào otc-viewer.html,
  nó sẽ mở bằng trình duyệt mặc định. Dùng được như nhau, chỉ khác là có
  thêm thanh địa chỉ của trình duyệt.


KHÔNG CẦN CÀI ĐẶT, KHÔNG CẦN MẠNG

  Toàn bộ dữ liệu nằm sẵn trong file otc-viewer.html. Chương trình chạy
  hoàn toàn trên máy bạn, không gửi gì ra ngoài, rút mạng vẫn chạy bình
  thường. Kể cả phần đọc tên thuốc từ ảnh đơn cũng chạy ngay trên máy.


ĐỪNG ĐỔI TÊN FILE

  Hai file mở nhanh đi tìm đúng cái tên "otc-viewer.html" nằm cùng thư
  mục. Đổi tên nó, hoặc tách nó ra thư mục khác, là chúng báo không tìm
  thấy. Muốn chép đi nơi khác thì chép CẢ THƯ MỤC này.


DỮ LIỆU BẠN TỰ NHẬP ĐƯỢC LƯU Ở ĐÂU

  Danh mục thuốc, Thông tư, Tương tác và các mã bạn sửa được trình duyệt
  lưu lại trên CHÍNH MÁY ĐÓ. Mở lại lần sau vẫn còn.

  Nhưng phải biết ba điều này:

  1. Chép thư mục sang máy khác thì KHÔNG mang dữ liệu theo. Chỉ có file
     chương trình đi theo, phần bạn nhập thì không.
  2. Xoá lịch sử duyệt web / "Clear browsing data" có thể xoá luôn phần
     bạn đã nhập.
  3. Mỗi trình duyệt giữ một bản riêng. Nhập bằng Chrome thì mở bằng Edge
     sẽ không thấy.

  => Nhập xong, bấm "Xuất Excel" để giữ một bản sao thật. Sang máy mới thì
     bấm "Nạp từ Excel". Đây là cách duy nhất chắc chắn không mất.


VÀI ĐIỀU NÊN BIẾT

  - Phần đọc ảnh đơn thuốc chỉ dùng để NHẬN TÊN thuốc. Hàm lượng, số
    lượng, liều dùng thì phải tự đọc trên ảnh - máy đọc số hay sai.
  - Dòng nào khớp nhiều thuốc mà không có thuốc nào rõ hơn hẳn, chương
    trình sẽ hỏi bạn chọn chứ không tự quyết.
  - Thông tin tra cứu chỉ để tham khảo, không thay cho phán đoán chuyên
    môn của dược sĩ.
`;
fs.writeFileSync(dst('HUONG-DAN.txt'), GUIDE);

const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
  const p = path.join(d, e.name);
  return e.isDirectory() ? walk(p) : [p];
});
const files = walk(OUT);
const bytes = files.reduce((n, f) => n + fs.statSync(f).size, 0);

console.log(`${path.basename(OUT)}/ — ${files.length} file · ${(bytes / 1024 / 1024).toFixed(2)} MB`);
for (const name of fs.readdirSync(OUT).sort()) {
  const p = dst(name);
  const st = fs.statSync(p);
  const size = st.isDirectory()
    ? walk(p).reduce((n, f) => n + fs.statSync(f).size, 0) : st.size;
  console.log(`  ${name.padEnd(24)} ${(size / 1024 / 1024).toFixed(2)} MB`);
}
