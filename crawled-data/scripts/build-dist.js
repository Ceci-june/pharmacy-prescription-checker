// Gom thư mục phát hành: chép vào USB hay gửi cho đồng nghiệp là chạy được ngay.
//
//   otc-viewer.html               — toàn bộ ứng dụng, nháy đúp là chạy
//   du-lieu-tra-cuu-duoc.json     — file trống, để dùng chung phần tự sửa giữa các trình duyệt
//   HUONG-DAN.txt                 — cho người dùng cuối, không phải cho người lập trình
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

// File dữ liệu dùng chung, tạo sẵn để người dùng khỏi phải tự tạo: chỉ việc bấm nút rồi
// trỏ vào nó.
//
// File này TRỐNG, và như vậy là đúng: Danh mục nạp sẵn nằm trong otc-viewer.html rồi
// (xem userseed.json + build-viewer.js), mở file html là thấy ngay. File dùng chung chỉ
// còn lo phần người dùng tự sửa về sau.
//
// `savedAt: 0` là dấu "chưa ai ghi gì". Nhờ nó mà máy đã nhập sẵn Danh mục khi nối vào
// sẽ ĐẨY dữ liệu lên file, chứ không bị file rỗng ghi đè mất.
fs.writeFileSync(dst('du-lieu-tra-cuu-duoc.json'), JSON.stringify(
  { drugs: [], circulars: [], inters: [], seeded: [], codes: {}, savedAt: 0 }, null, 1));

const GUIDE = `TRA CỨU DƯỢC — HƯỚNG DẪN SỬ DỤNG
===================================================================

MỞ CHƯƠNG TRÌNH

  Nháy đúp vào file  otc-viewer.html

  Nó mở bằng trình duyệt có sẵn (Chrome, Edge, Safari, Cốc Cốc...).
  Không cần cài gì, không cần mạng. Rút dây mạng vẫn chạy đủ, kể cả
  phần đọc tên thuốc từ ảnh đơn.


DỮ LIỆU NẰM Ở ĐÂU

  Có HAI loại, nằm hai chỗ khác nhau:

  1. DỮ LIỆU CÓ SẴN — nằm NGAY TRONG file otc-viewer.html
     Danh mục thuốc, mã ICD-10, YHCT, PL3, danh mục bệnh OTC, ngân
     hàng câu hỏi. Đó là lý do file nặng khoảng 15 MB.

     => MỞ FILE LÊN LÀ CÓ NGAY, không phải nhập gì, không phải nối
        file nào trước. Chép file đi đâu, phần này đi theo đó.

  2. PHẦN BẠN TỰ SỬA VỀ SAU — KHÔNG nằm trong file
     Thuốc bạn thêm, dòng bạn sửa hoặc xoá, Thông tư, Tương tác.
     Trình duyệt giữ riêng trên máy đó, bên ngoài file.

  Mỗi trình duyệt giữ một kho riêng, không nhìn thấy nhau. Thuốc bạn
  TỰ THÊM bằng Chrome thì mở bằng Edge sẽ không thấy. Đây là cách
  trình duyệt hoạt động, không phải lỗi.
  (Phần có sẵn thì trình duyệt nào cũng thấy đủ.)

  => Muốn các trình duyệt thấy chung, xem mục ngay dưới đây.


DÙNG CHUNG DỮ LIỆU GIỮA CÁC TRÌNH DUYỆT / CÁC MÁY

  Trong thư mục này đã có sẵn file:

       du-lieu-tra-cuu-duoc.json

  File này để trống, và như vậy là đúng: Danh mục đã nằm sẵn trong
  otc-viewer.html rồi. File này chỉ dùng để các trình duyệt / các máy
  thấy chung PHẦN BẠN TỰ SỬA.

  Cách dùng, làm y như nhau ở MỌI trình duyệt và MỌI máy:

     1. Bấm nút  🔗 Dùng chung dữ liệu  trên thanh tiêu đề
     2. Chọn "OK = MỞ FILE ĐÃ CÓ"
     3. Trỏ vào du-lieu-tra-cuu-duoc.json nằm cạnh file otc-viewer.html

  Xong. Từ đó mọi thay đổi tự ghi vào file, và trình duyệt nào trỏ vào
  đúng file đó cũng thấy chung những thay đổi ấy.

  Làm một lần cho mỗi trình duyệt. Chrome làm một lần, Edge làm một lần.

  Muốn dùng chung giữa NHIỀU MÁY thì để cả thư mục này trong OneDrive
  hoặc Google Drive, rồi mỗi máy trỏ vào file trong đó.

  Yên tâm: nếu bạn đã nhập thêm thuốc trước khi nối file, dữ liệu KHÔNG
  mất. File trống sẽ nhận dữ liệu từ máy bạn chứ không xoá đi.

  Khi nút hiện màu VÀNG "Bấm để nối lại file dữ liệu":
     Bình thường. Mở lại trang thì trình duyệt hỏi lại cho chắc.
     Bấm một cái là xong, dữ liệu không mất đi đâu.

  Lưu ý: Chrome, Edge, Cốc Cốc dùng được chức năng này.
         Safari và Firefox chưa hỗ trợ — hai trình duyệt đó vẫn phải
         dùng Xuất/Nạp Excel như bên dưới.

  Sửa cùng lúc ở hai nơi thì bên nào BẤM LƯU SAU sẽ thắng. Nên tránh
  mở sửa song song hai chỗ cùng một lúc.


VẪN NÊN XUẤT EXCEL ĐỂ SAO LƯU

  Nút "Xuất Excel" trong tab Danh mục tạo một bản sao thật, mở được
  bằng Excel, không phụ thuộc trình duyệt hay file dùng chung.
  Mất dữ liệu thì bấm "Nạp từ Excel" để lấy lại.

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
