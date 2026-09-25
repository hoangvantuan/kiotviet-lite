# Runbook deploy production

Stack chạy bằng Docker Compose: postgres + migrate (one-shot) + api + web (nginx) + backup.
Thiết kế chi tiết: [spec](superpowers/specs/2026-06-12-docker-compose-production-design.md).

## 1. Chuẩn bị lần đầu

```bash
git clone <repo> && cd kiotviet-lite
cp .env.production.example .env
# Sửa .env: mật khẩu Postgres, JWT secrets, ALLOWED_ORIGINS, WEB_PORT
```

Yêu cầu trên server: Docker + Docker Compose plugin. Không cần Node hay pnpm.

JWT secret phải sinh ngẫu nhiên (`openssl rand -base64 48`, hai giá trị khác nhau). API production
từ chối khởi động nếu secret còn là giá trị mẫu (`change-me-*`), là chuỗi lặp, hoặc hai secret trùng
nhau; `NOTIFICATION_CONFIG_KEY` khi có đặt cũng bị kiểm như vậy.

## 2. Khởi động / cập nhật

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Thứ tự tự động: postgres healthy → migrate chạy xong → api start → web start.

Kiểm tra nhanh:

```bash
docker compose -f docker-compose.prod.yml ps
curl http://localhost:8080/api/v1/health
```

### Kiểm tra sau migration 0047 (sổ công nợ R3)

Migration `0047_debt_ledger_backfill` đưa dữ liệu công nợ cũ về sổ công nợ duy nhất
([ADR-0007](adr/0007-so-cong-no-khach-duy-nhat.md)). Công nợ khách (`customers.current_debt`)
giữ nguyên; migration chỉ sửa khoản nợ: chuyển phần `paid` không có phiếu thu sang giảm trừ,
tạo khoản "Điều chỉnh tăng nợ" cho phần công nợ lớn hơn tổng khoản nợ, và giảm trừ FIFO khi
tổng khoản nợ lớn hơn công nợ. Mỗi khách bị điều chỉnh có một dòng nhật ký thao tác
"Điền ngược sổ công nợ R3" (`audit_logs.action = 'debt_ledger.backfilled'`) ghi số trước và sau.

Liệt kê các khách đã được điều chỉnh (chỉ đọc, chạy lại bao nhiêu lần cũng được):

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  < apps/api/scripts/debt-ledger-backfill-report.sql
```

Không có dòng nào nghĩa là dữ liệu cũ đã khớp sẵn. Nên đối chiếu danh sách với chủ cửa hàng,
nhất là các khoản nợ có ghi chú "Điều chỉnh điền ngược".

## 3. Cloudflare Tunnel

cloudflared chạy trên host, trỏ vào nginx:

```yaml
# config.yml của cloudflared
ingress:
  - hostname: your-domain.example.com
    service: http://localhost:8080
  - service: http_status:404
```

Nginx chỉ bind `127.0.0.1` nên không truy cập được từ internet trực tiếp.

IP client (dùng cho giới hạn đăng nhập và audit): nginx lấy IP thật từ `CF-Connecting-IP` (chỉ
khi kết nối tới từ địa chỉ nội bộ, tức cloudflared), rồi GHI ĐÈ `X-Forwarded-For` bằng IP đó.
API đặt `TRUSTED_PROXY_HOPS=1` trong compose nên chỉ tin đúng một địa chỉ do nginx ghi. Chạy API
không qua nginx thì bỏ biến này (mặc định 0), API dùng địa chỉ socket và bỏ qua mọi header IP.
Đăng nhập còn bị giới hạn 10 lần sai / 15 phút / số điện thoại, bất kể IP.

## 4. Log và điều tra sự cố

| Loại                                                   | Vị trí                                                     | Giữ log                                                                                                                                                                                                |
| ------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API JSON (nguồn tra cứu chính)                         | `./data/logs/api/app.*.log`                                | Xoay hằng ngày hoặc khi đạt 100 MB/file; xóa file quá 30 ngày khi API khởi động và mỗi ngày. Tối đa 300 file cũ + file hiện tại (~30 GB). Nếu vượt giới hạn file trước 30 ngày, log cũ sẽ mất sớm hơn. |
| Container (Postgres, migrate, API stdout, web, backup) | `docker compose -f docker-compose.prod.yml logs <service>` | Docker json-file: 10 MB/file, tối đa 30 file/service; giới hạn theo dung lượng, **không đảm bảo 30 ngày**, nhất là container `migrate` có thể được tạo lại khi deploy.                                 |

```bash
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs --since 24h backup
# Xem file API hiện hành:
tail -f "data/logs/api/$(ls -t data/logs/api | head -1)"
```

Log API có `requestId` (trả về trong header `X-Request-Id`), `storeId`/`actorId` sau khi xác thực,
`route`, `status`, `durationMs`; các thao tác ghi `clientId`, `jobId`, `eventId` và trạng thái.
Không ghi URL thô hay request/response body: đăng nhập trả token, đơn ngoại tuyến có PIN lồng
trong dữ liệu, tệp nhập là nhị phân; mask chung dễ bỏ sót trường mới và phải sao chép body/response.
Thay vào đó ghi trường chẩn đoán được chọn sau khi xử lý (mã lỗi, đường dẫn field validation,
ID và trạng thái); tra cứu bản ghi nghiệp vụ có phân quyền bằng ID. Log nghiệp vụ trong DB không
thay thế log kỹ thuật. Kênh thông báo console/file chỉ ghi metadata sự kiện, không ghi nội dung.
Lỗi từ trình duyệt được gửi lên `POST /api/v1/client-diagnostics` với loại lỗi, ID và mã lỗi tối
thiểu; khi mất mạng/chưa đăng nhập, trình duyệt xếp tối đa 50 mục để gửi sau. Console trình duyệt
chỉ tồn tại trong phiên đang mở, không phải nguồn tra cứu lâu dài.

```bash
# Cần jq trên host. Đổi mã ID từ phản hồi lỗi hoặc màn hình đồng bộ.
RID=<request-id>
jq -c --arg id "$RID" 'select(.requestId == $id or .relatedRequestId == $id)' data/logs/api/app.*.log
ID=<client-id-or-job-id-or-event-id>
jq -c --arg id "$ID" 'select(.clientId == $id or .jobId == $id or .eventId == $id)' data/logs/api/app.*.log
```

Điều tra đơn ngoại tuyến: tra `clientId` ở máy bán → log `sync push order failed` hoặc
`client diagnostic` → `requestId`/`relatedRequestId` → trạng thái đơn và nhật ký nghiệp vụ.
Nhập liệu hàng loạt: tra `jobId` và trạng thái `running/completed/failed` trong log, đối chiếu
trạng thái công việc ở API. Thông báo: tra `eventId`, `channelId`, `status`, `attempts` và
`errorCode`; nội dung sự kiện không được ghi vào log chẩn đoán.

**Giới hạn trước go-live:** chưa có hộp thư sự cố hoặc giám sát/cảnh báo bên ngoài. API/host
ngừng chạy và backup lỗi không tự báo cho người vận hành; cần kiểm tra `docker compose ps`,
`docker compose logs backup` và dung lượng `du -sh data/logs data/backups` thủ công. Log API
có mục tiêu 30 ngày nhưng giới hạn dung lượng có thể rút ngắn thời gian thực tế khi lưu lượng tăng.

## 5. Lưu trữ tệp nhập Excel

- API lưu tệp gốc tại `./data/imports/` trên host, gắn vào `/app/imports` trong container. Compose đặt `BULK_IMPORT_DIR=/app/imports`; thư mục phải ghi được, nếu thiếu hoặc không an toàn API production từ chối khởi động.
- Tệp `.xlsx` tối đa 8 MiB và 12.000 dòng dữ liệu. Nginx cho phép body 20 MiB; bước xem trước không ghi dữ liệu. Chỉ chủ cửa hàng được nhập, tối đa 6 yêu cầu tải lên mỗi phút cho một tài khoản.
- Công việc đang chạy khi API khởi động lại được đánh dấu hỏng; công việc còn chờ tiếp tục chạy. Bản ghi nghiệp vụ và nhật ký nhập được ghi nguyên khối hoặc không ghi gì.
- Công việc và tệp gốc tự xóa sau 30 ngày. Service `backup` chỉ sao lưu PostgreSQL, **không** sao lưu `./data/imports/`; muốn khôi phục cả lịch sử tải tệp thì sao lưu thư mục này đồng bộ với bản dump DB.

## 6. Backup

- Tự động: service `backup` chạy pg_dump theo lịch `@daily`, lưu vào `./data/backups/`.
- Retention: 7 bản ngày, 4 bản tuần, 6 bản tháng (đổi trong `.env`).
- Data sống của Postgres nằm ở `./data/postgres/`.

Backup thủ công ngay lập tức:

```bash
docker compose -f docker-compose.prod.yml exec backup /backup.sh
ls data/backups/daily/
```

## 7. Restore

Restore file dump vào database (dừng api trước để tránh ghi đè dở dang):

```bash
docker compose -f docker-compose.prod.yml stop api

# Tạo lại DB rỗng rồi nạp dump (thay tên file thật)
# DROP và CREATE phải là 2 lệnh -c riêng: DROP DATABASE không chạy trong transaction
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS ${POSTGRES_DB};" \
  -c "CREATE DATABASE ${POSTGRES_DB};"

zcat data/backups/daily/kiotviet_lite-YYYYMMDD-HHMMSS.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

docker compose -f docker-compose.prod.yml start api
```

Nên diễn tập restore vào DB tạm trước khi cần thật.

## 8. Sự cố thường gặp

| Triệu chứng          | Kiểm tra                                                                          |
| -------------------- | --------------------------------------------------------------------------------- |
| api không lên        | `docker compose logs migrate` (migration lỗi sẽ chặn api)                         |
| 502 từ nginx         | api chưa healthy: `docker compose ps`, `docker compose logs api`                  |
| Đăng nhập lỗi cookie | `COOKIE_SECURE=true` cần truy cập qua HTTPS (Cloudflare Tunnel)                   |
| Hết đĩa              | Kiểm tra `du -sh data/*`. Log và backup đều có retention, data Postgres thì không |
