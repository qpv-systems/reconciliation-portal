// Translate presentation strings only. Uploaded values and raw events stay intact.
const pairs = `
Dấu phân cách CSV|CSV delimiter
Trang tính Excel|Excel sheet
Xây dựng với|Built with
CHI TIẾT ĐỐI SOÁT|RESULT INSPECTOR
TRÌNH SỬA DỮ LIỆU MẪU|SAMPLE DATA EDITOR
Excel sheet nguồn trái|Left Excel sheet
Excel sheet nguồn phải|Right Excel sheet
Không gian đối soát · QPV Systems|Reconciliation workspace · QPV Systems
Tài liệu ↗|Documentation ↗
ĐỐI SOÁT DỮ LIỆU, ĐƠN GIẢN HƠN|DATA RECONCILIATION, MADE SIMPLE
Đối soát với Core Reconcile|Powered by Core Reconcile
Các bước đối soát|Reconciliation steps
Dữ liệu đầu vào|Data sources
Tải file hoặc dùng mẫu|Upload files or use a sample
Quy tắc đối soát|Reconciliation rules
Ghép cột, chọn dung sai|Map columns, set tolerances
Kết quả & báo cáo|Results & reports
Kiểm tra và xuất dữ liệu|Inspect and export data
CSV delimiter|CSV delimiter
Hai nguồn dữ liệu.|Two data sources.
Một bức tranh rõ ràng.|One clear picture.
Thử đối soát với dữ liệu của bạn. Chọn cột, đặt quy tắc,|Reconcile your own data. Choose columns, define rules,
và hiểu chính xác vì sao mỗi dòng khớp hoặc sai lệch.|and understand exactly why each row matches or differs.
Số tiền chính xác · Truy vết từng dòng|Precise amounts · Trace every row
Playground · tối đa 3 MB mỗi file|Playground · up to 3 MB per file
Chưa có file? Thử bộ dữ liệu mẫu ↓|No files yet? Explore sample data ↓
Chọn hai nguồn dữ liệu|Choose your data sources
Hai nguồn có thể dùng tên cột khác nhau. CSV UTF-8 hoặc Excel .xlsx.|Sources can use different column names. UTF-8 CSV or Excel .xlsx.
Xóa phiên làm việc|Clear workspace
Nguồn trái|Left source
Nguồn phải|Right source
Chọn file hoặc kéo thả vào đây|Choose a file or drop it here
Dữ liệu hệ thống, sổ cái, hoặc bất kỳ nguồn nào|System records, ledgers, or any other source
Dữ liệu đối tác, ngân hàng, hoặc nguồn thứ hai|Partner records, bank data, or a second source
Dấu phẩy (,)|Comma (,)
Dấu chấm phẩy (;)|Semicolon (;)
Dấu \u007c|Pipe
Dòng tiêu đề Excel|Excel header row
Chưa có dữ liệu. Preview sẽ xuất hiện sau khi upload.|No data yet. A preview appears after upload.
Tôi xác nhận nguồn trái đã đầy đủ cho kỳ đối soát|I confirm the left source is complete for this period
Tôi xác nhận nguồn phải đã đầy đủ cho kỳ đối soát|I confirm the right source is complete for this period
Đọc hết file không đồng nghĩa với kỳ dữ liệu đã đầy đủ. Nếu chưa xác nhận, dòng chưa tìm thấy ở nguồn đối diện sẽ cần kiểm tra lại.|Reading the entire file does not confirm that the period is complete. Without confirmation, missing rows require a recheck.
Thư viện dữ liệu mẫu|Sample library
6 domain · tải file · sửa trên UI|6 use cases · download files · edit sample data
Dùng bộ mẫu này|Use this sample
Sửa dữ liệu mẫu trước khi đối soát|Edit sample data before reconciliation
Sửa dữ liệu mẫu|Edit sample data
Định nghĩa quy tắc đối soát|Define reconciliation rules
Chọn định danh ổn định để matching, rồi chọn các giá trị cần so sánh.|Choose stable identifiers to match rows, then choose values to compare.
Chờ hai nguồn|Waiting for both sources
Mỗi lần chạy có run ID riêng. Input, rule version và output được giữ để truy vết trong phiên.|Each run has a unique ID. Inputs, rule versions, and outputs are retained for traceability during your session.
Khóa matching|Matching keys
Chuỗi định danh chính xác · có thể ghép nhiều cột|Exact identifiers · combine multiple columns
+ Thêm thành phần|+ Add key
Cột nguồn trái|Left column
Cột nguồn phải|Right column
Không tự ghép theo số tiền hoặc thời gian. Thiếu khóa matching sẽ làm batch thất bại để bạn sửa dữ liệu.|Rows are not matched by amount or time. Missing matching keys cause the batch to fail so you can correct your data.
Field so sánh|Comparison fields
+ Thêm field|+ Add field
Ý nghĩa / tên rule|Meaning / rule name
Kiểu so sánh|Comparison type
Dung sai tuyệt đối|Absolute tolerance
Thiếu giá trị|Missing values
Decimal dùng chuỗi số, ví dụ|Decimals use numeric strings, for example
; không tự bỏ dấu phân cách hàng nghìn, đổi tiền tệ hay quy đổi trạng thái. Dung sai được tính theo đơn vị giá trị đầu vào.|; thousands separators, currencies, and statuses are not converted automatically. Tolerance uses the input unit.
Upload hai nguồn để bắt đầu|Upload both sources to get started
Chọn mẫu bên trên để thử nhanh toàn bộ quy trình.|Choose a sample above to explore the entire workflow.
Hủy xử lý|Cancel processing
Chạy đối soát|Run reconciliation
Đang chuẩn bị dữ liệu…|Preparing data…
Kết quả có thể kiểm chứng|Results you can verify
Kết quả và báo cáo xuất hiện sau khi batch hoàn tất.|Results and reports appear when the batch completes.
Chưa chạy|Not started
Tổng kết quả|Total results
Số entry, không phải tổng dòng input|Result entries, rather than input rows
Cặp dòng đủ điều kiện khớp|Row pairs that meet the matching rules
Không khớp|Unmatched
Gồm sai lệch, chờ và thủ công|Includes differences, pending, and review
Chờ kiểm tra lại|Pending recheck
Chưa đủ dữ liệu hoặc xác nhận|Awaiting data or completeness confirmation
Kiểm tra thủ công|Manual review
Trùng khóa hoặc giá trị không hợp lệ|Duplicate keys or invalid values
Một entry có thể có nhiều trạng thái. “Chờ” và “Thủ công” có thể giao nhau và đã nằm trong “Không khớp”.|An entry may have multiple statuses. Pending and manual review may overlap and are included in unmatched results.
Lọc trạng thái|Filter by status
Tất cả kết quả|All results
Tất cả không khớp|All unmatched
Sai lệch số tiền|Amount mismatch
Sai lệch phí|Fee mismatch
Khác trạng thái gốc|Original status mismatch
Khác tiền tệ|Currency mismatch
Khác loại|Type mismatch
Khác giá trị|Value mismatch
Thiếu ở trái|Missing on the left
Thiếu ở phải|Missing on the right
Khớp|Matched
Số tiền|Amount
Phí|Fee
Trạng thái gốc|Original status
Tiền tệ|Currency
Loại|Type
Giá trị|Value
Thủ công|Review
Chờ|Pending
Xuất bộ lọc:|Export filtered results:
Khóa dữ liệu|Data key
Kết quả|Result
Chi tiết sai lệch|Difference details
Mọi dòng đều có một câu chuyện|Every row tells a story
Chạy đối soát để xem dòng nào khớp, khác nhau ở đâu|Run reconciliation to see which rows match, where they differ,
và dòng nào cần bạn kiểm tra thêm.|and which rows need your attention.
Chưa có kết quả|No results yet
← Trước|← Previous
Sau →|Next →
Output thực tế từ package|Actual package output
là một kết quả đối soát;|is a reconciliation result;
kết thúc luồng và chứa thống kê. Complete không có nghĩa mọi dòng đều khớp. Preview dưới đây tối đa 3 entry; NDJSON chứa toàn bộ event của bộ lọc.|ends the stream and contains statistics. Completion does not mean all rows match. This preview shows up to 3 entries; NDJSON includes every filtered event.
Chưa có output.|No output yet.
Nhật ký xử lý|Processing activity
Chưa có lần chạy nào.|No runs yet.
Dữ liệu được gửi tới server này · phiên hết hạn sau 30 phút không hoạt động|Data is sent to this server · sessions expire after 30 minutes of inactivity
Chi tiết một entry|Entry details
Các ô luôn được giữ dưới dạng chuỗi. Thử đổi số tiền, xóa khóa, đổi trạng thái hoặc thêm một khóa trùng để xem cách core phản hồi.|Cells are preserved as strings. Change an amount, remove a key, edit a status, or add a duplicate key to explore the results.
+ Thêm dòng|+ Add row
Upload hai nguồn|Upload both sources
Upload & đối soát →|Upload & reconcile →
Tìm khóa, giá trị hoặc lỗi…|Search keys, values, or issues…
Tìm kết quả|Search results
Đóng chi tiết|Close details
Đóng trình sửa|Close editor
Ví dụ: commission-2026-10|Example: commission-2026-10
Liên kết|Links
Quy tắc sẵn sàng cho hai nguồn|Rules ready for both sources
thành phần khóa|key components
field so sánh|comparison fields
giữ nguyên dữ liệu gốc|original data preserved
Chưa có file|No file selected
Preview tối đa 5 dòng, chưa phải tổng số bản ghi.|Preview shows up to 5 rows, not the total record count.
Chọn cột…|Choose a column…
Khóa trái|Left key
Khóa phải|Right key
Xóa thành phần khóa|Remove key component
Ý nghĩa field|Field meaning
Tên rule|Rule name
Field trái|Left field
Field phải|Right field
Kiểu field|Field type
Dung sai field|Field tolerance
Thiếu giá trị field|Missing field value
Xóa field|Remove field
Exact · chính xác|Exact · text
Decimal · số|Decimal · number
Bỏ qua so sánh|Skip comparison
Sẵn sàng khám phá kết quả|Ready to explore your results
Chạy đối soát để xem dòng nào khớp và khác nhau ở đâu.|Run reconciliation to see which rows match and where they differ.
File vượt giới hạn|File exceeds the limit of
MB mỗi file.|MB per file.
Đang upload|Uploading
Upload thành công. Chọn cột và xác nhận tính đầy đủ trước khi chạy.|Upload complete. Choose columns and confirm completeness before running.
Hai bộ dữ liệu đã được upload. Bạn có thể tiếp tục chỉnh các field đối soát.|Both sources are uploaded. You can continue editing comparison fields.
Đang staging|Staging data
Đang matching|Matching rows
Hoàn tất|Complete
Thất bại|Failed
Đã hủy|Cancelled
Đang đọc & sắp xếp nguồn|Reading & sorting the
trên đĩa|source on disk
Đang đối soát & lưu kết quả|Reconciling & saving results
Đối soát hoàn tất|Reconciliation complete
giây|seconds
chưa có complete event|no complete event yet
Đang xử lý…|Processing…
Batch chưa hoàn tất.|Batch has not completed.
Đã đối soát:|Reconciled:
cặp khớp và|matched pairs and
entry không khớp. Nhấn một dòng để xem dữ liệu và lỗi.|unmatched entries. Select a row to inspect data and issues.
Chưa tìm thấy|Not found
Các field được chọn đều khớp|All selected fields match
Xem ↗|View ↗
Không có kết quả phù hợp|No matching results
Thử đổi bộ lọc hoặc từ khóa tìm kiếm.|Try another filter or search term.
entry phù hợp|matching entries
Các trạng thái trên thuộc kết quả đối soát, không thay đổi trạng thái giao dịch gốc.|These statuses describe reconciliation results and do not change the original transaction status.
Chênh lệch trái − phải:|Difference, left − right:
Xóa dòng|Remove row
cột|column
dòng|rows
Dòng|Row
trái|left
phải|right
Trái|Left
Phải|Right
mẫu tối đa 100|samples support up to 100
mỗi nguồn|per source
Trình sửa mẫu hỗ trợ tối đa 100 dòng mỗi nguồn.|The sample editor supports up to 100 rows per source.
Đã yêu cầu hủy. Đợi worker dừng và đóng các cursor.|Cancellation requested. Waiting for processing to stop.
Đã xóa file và kết quả của phiên.|Session files and results cleared.
Tối đa|Up to
Đã khôi phục file, quy tắc và kết quả gần nhất của phiên.|Restored the latest session files, rules, and results.
Đã khôi phục các file đã upload. Kiểm tra quy tắc và tính đầy đủ trước khi chạy.|Uploaded files restored. Check rules and completeness before running.
Không kết nối được server:|Unable to connect to the server:
Server không trả được kết quả. Kiểm tra log và kết nối.|The server returned no result. Check logs and connectivity.
Khóa:|Keys:
So sánh:|Compare:
Ngân hàng|Banking
Tiền · phí · trạng thái|Amounts · fees · statuses
Payment và refund là các sự kiện riêng có cùng định danh ở hai nguồn. Bao gồm khóa trùng và số tiền thiếu.|Payments and refunds are separate events with shared identifiers in both sources. Includes duplicate keys and missing amounts.
Hoa hồng|Commissions
Thu nhập · điều chỉnh|Earnings · adjustments
Đối chiếu commission với payout bằng cột định danh và tên field khác nhau.|Compare commissions with payouts using different identifier columns and field names.
Đơn hàng|Orders
Tổng đơn · vận chuyển|Totals · shipping
Đối chiếu order nội bộ và reference của nền tảng bán hàng. Không tự quy đổi trạng thái.|Compare internal orders with platform references. Statuses are not converted automatically.
Tồn kho|Inventory
SKU + kho · số lượng|SKU + warehouse · quantities
Khóa ghép SKU và kho, so sánh số lượng và lượng giữ chỗ. Không matching chỉ theo SKU.|Combine SKU and warehouse keys to compare quantities and reservations. Matching does not use SKU alone.
Hóa đơn|Invoices
Giá trị · thuế · thanh toán|Amounts · tax · payments
So sánh giá trị hóa đơn và thuế đã được tính sẵn; package không tự tính thuế hoặc netting.|Compare invoice amounts and precalculated taxes; the package does not calculate taxes or netting.
Bảng lương|Payroll
Nhân viên + kỳ · khấu trừ|Employee + period · deductions
Khóa ghép nhân viên và kỳ lương; so sánh gross salary và khấu trừ theo dữ liệu gốc.|Combine employee and pay period keys to compare gross salary and deductions using original data.
`;
const entries = pairs
  .trim()
  .split('\n')
  .map((line) => {
    const split = line.lastIndexOf('|');
    return [line.slice(0, split), line.slice(split + 1)];
  })
  .sort((a, b) => b[0].length - a[0].length);
const translations = new Map(entries);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pattern = new RegExp(entries.map(([key]) => escapeRegex(key)).join('|'), 'g');
let language = 'en';
try {
  language = localStorage.getItem('reconcile-language') === 'vi' ? 'vi' : 'en';
} catch {}
export const locale = () => (language === 'vi' ? 'vi-VN' : 'en-US');
export const t = (value) =>
  language === 'vi'
    ? String(value)
    : String(value).replace(pattern, (key) => translations.get(key));
export const ui = (parts, ...values) =>
  parts.reduce((result, part, index) => result + t(part) + (values[index] ?? ''), '');

const staticContent = [];
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
while (walker.nextNode()) {
  const node = walker.currentNode;
  if (!node.parentElement.closest('script, style, #language-select')) {
    const original = node.textContent.replace(/\s+/g, ' ');
    staticContent.push(() => {
      if (node.isConnected) node.textContent = t(original);
    });
  }
}
for (const element of document.querySelectorAll('[placeholder], [aria-label]')) {
  for (const attribute of ['placeholder', 'aria-label']) {
    if (!element.hasAttribute(attribute)) continue;
    const original = element.getAttribute(attribute);
    staticContent.push(() => element.setAttribute(attribute, t(original)));
  }
}
function applyLanguage() {
  document.documentElement.lang = language;
  document.getElementById('language-select').value = language;
  staticContent.forEach((update) => update());
}
document.getElementById('language-select').addEventListener('change', (event) => {
  language = event.target.value === 'en' ? 'en' : 'vi';
  try {
    localStorage.setItem('reconcile-language', language);
  } catch {}
  applyLanguage();
  document.dispatchEvent(new Event('languagechange'));
});
applyLanguage();
