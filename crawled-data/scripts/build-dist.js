// Gom thư mục phát hành: chép vào USB hay gửi cho đồng nghiệp là chạy được ngay.
//
//   otc-viewer.html   — toàn bộ ứng dụng, nháy đúp là chạy
//   HUONG-DAN.txt     — dành cho người dùng cuối, không phải cho người lập trình
//
// Chỉ hai file. otc-viewer.html đã tự chứa mọi thứ — dữ liệu tra cứu, thư viện Excel,
// bộ đọc chữ từ ảnh đều nhúng thẳng vào trong, nên không cần file kèm nào khác và
// không cần mạng.
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

const GUIDE = `TRA CỨU DƯỢC — HƯỚNG DẪN SỬ DỤNG
===================================================================

MỞ CHƯƠNG TRÌNH

  Nháy đúp vào file  otc-viewer.html

  Nó mở bằng trình duyệt có sẵn (Chrome, Edge, Safari, Cốc Cốc...).
  Không cần cài gì, không cần mạng. Rút dây mạng vẫn chạy đủ, kể cả
  phần đọc tên thuốc từ ảnh đơn.


DỮ LIỆU NẰM Ở ĐÂU — ĐỌC KỸ PHẦN NÀY

  Có HAI loại dữ liệu, nằm hai chỗ khác nhau:

  1. DỮ LIỆU TRA CỨU — nằm NGAY TRONG file otc-viewer.html
     Mã ICD-10, YHCT, PL3, danh mục bệnh OTC, ngân hàng câu hỏi.
     Đó là lý do file nặng gần 14 MB. Chép file đi đâu, dữ liệu này
     đi theo đó. Máy mới, trình duyệt mới vẫn đầy đủ.

  2. PHẦN BẠN TỰ NHẬP — KHÔNG nằm trong file
     Danh mục thuốc, Thông tư, Tương tác, các mã bạn sửa hoặc thêm.
     Trình duyệt giữ riêng trên máy đó, bên ngoài file.

  Nói cách khác: file là chương trình, không phải nơi chứa phần bạn gõ.


  => PHẦN BẠN TỰ NHẬP CÒN HAY MẤT:

     Đổi tên file, chuyển sang thư mục khác,
     chép sang ổ D, để lên Desktop             -> CÒN
     (cùng máy, cùng trình duyệt)

     Mở bằng trình duyệt khác trên cùng máy
     (nhập bằng Chrome, mở bằng Edge)          -> KHÔNG THẤY

     Chép file sang máy khác                   -> MẤT
     Xoá lịch sử duyệt web / Clear browsing
     data / dọn máy bằng CCleaner              -> MẤT
     Mở bằng chế độ ẩn danh                    -> KHÔNG LƯU


GIỮ AN TOÀN PHẦN BẠN NHẬP

  Nhập xong thì bấm "Xuất Excel" và cất file đó lại.
  Máy mới, hoặc lỡ mất dữ liệu, thì bấm "Nạp từ Excel".

  Đây là cách DUY NHẤT chắc chắn. Đừng trông vào trình duyệt nhớ giùm.
  Nên xuất lại mỗi lần nhập thêm kha khá.


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
