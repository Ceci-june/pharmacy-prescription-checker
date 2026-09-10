# Nhiệm vụ: bóc dữ liệu từ tờ hướng dẫn sử dụng thuốc (ảnh scan) → JSONL

## Bối cảnh
`pages/` chứa ảnh scan tờ HDSD của 191 thuốc Việt Nam. Tên ảnh: `NNN-P.jpg`
(`NNN` = số thứ tự thuốc, có đệm 0; `P` = số trang). `pages/_index.txt` map `NNN|Tên file gốc`.

Ảnh **không có text** — phải dùng tool Read để **tự đọc ảnh bằng mắt**. Tuyệt đối không dùng
OCR (tesseract): đã thử, nó đọc sai hàm lượng và liều dùng.

## Việc phải làm
Với **mỗi** thuốc trong khoảng được giao: đọc **hết tất cả các trang** của thuốc đó, rồi ghi
**một dòng JSON** (JSONL — một object trên một dòng, không xuống dòng giữa object) vào file
part được chỉ định.

## 8 khoá bắt buộc, đúng tên
| Khoá | Nội dung |
|---|---|
| `n` | số thứ tự thuốc (số nguyên, khớp `NNN`) |
| `name` | Tên thuốc + dạng bào chế trong ngoặc. Nếu tờ HDSD có dấu Rx / "Thuốc kê đơn" thì thêm ` — thuốc kê đơn` |
| `ing` | Hoạt chất **kèm hàm lượng và đơn vị**, ví dụ `Ambroxol 30 mg/5 ml (dưới dạng Ambroxol HCl)` |
| `cls` | Nhóm dược lý. Thường ở mục "CÁC ĐẶC TÍNH DƯỢC LÝ → Dược lực học → Nhóm dược lý", kèm `Mã ATC`. Ghi dạng `Thuốc long đờm — ATC R05CB06` |
| `ind` | Chỉ định |
| `ci` | Chống chỉ định |
| `dose` | Liều dùng **và** độ tuổi, gộp chung. Kèm cả "Cách dùng" nếu có |
| `caut` | Thận trọng **và** tương tác, gộp chung: cảnh báo & thận trọng, cảnh báo tá dược, phụ nữ có thai / cho con bú, lái xe & vận hành máy móc, tương tác thuốc, tương kỵ |

## Quy tắc bắt buộc — dữ liệu dược, sai là có hậu quả thật
1. **Giữ nguyên văn** tờ HDSD. Không tóm tắt, không diễn giải lại, không thêm kiến thức ngoài tờ.
2. **Không suy diễn.** Mục nào tờ HDSD không có thì để **chuỗi rỗng** `""`. Đặc biệt `cls`:
   nhiều tờ 1 trang không có mục dược lý → để rỗng, **không** tự gán nhóm.
3. **Số liệu phải chính xác tuyệt đối**: hàm lượng, mg, ml, mg/kg, số lần/ngày, tuổi, liều tối đa.
   Tờ HDSD hay dùng dấu chấm dẫn (`Acetylcystein.......200mg`) — đọc kỹ con số ở cuối.
   Nếu một con số bị nhòe/không đọc được, ghi `(không đọc rõ)` ngay tại chỗ đó thay vì đoán.
4. Danh sách nhiều mục thì mỗi mục một dòng, bắt đầu bằng `- `, phân cách bằng `\n` trong JSON.
5. Trong `caut`, mở đầu mỗi phần bằng nhãn: `Cảnh báo và thận trọng:` / `Cảnh báo tá dược:` /
   `Phụ nữ có thai:` / `Cho con bú:` / `Lái xe / vận hành máy móc:` / `Tương tác:` / `Tương kỵ:`
6. **Không** đưa vào: quy cách đóng gói, bảo quản, hạn dùng, tiêu chuẩn, tên/địa chỉ nhà sản xuất,
   tác dụng không mong muốn (ADR), quá liều, dược động học chi tiết.
7. Tờ dạng Vidipha có 2 phần ("cho người bệnh" và "cho cán bộ y tế") nội dung trùng nhau —
   lấy bản đầy đủ hơn, không ghi lặp hai lần.

## Đầu ra
Ghi bằng Bash, dùng heredoc trích dẫn để không bị shell diễn giải:
```
cat >> <ĐƯỜNG_DẪN_PART> <<'EOF'
{"n":8,"name":"...","ing":"...","cls":"...","ind":"...","ci":"...","dose":"...","caut":"..."}
EOF
```
Ghi **từng thuốc một, ngay sau khi đọc xong thuốc đó** — không gom tới cuối mới ghi.

Sau mỗi lần ghi, kiểm JSON hợp lệ:
`node -e 'require("fs").readFileSync("<PART>","utf8").split("\n").filter(Boolean).forEach(l=>JSON.parse(l));console.log("JSON ok")'`

## Hai dòng mẫu chuẩn
Xem `MAU.jsonl` — đọc file đó trước khi bắt đầu để bám đúng văn phong và độ chi tiết.

## Báo cáo cuối
Trả về đúng: số thuốc đã ghi, danh sách `n` đã làm, và `n` nào bỏ sót kèm lý do.
