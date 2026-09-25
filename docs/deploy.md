# Runbook deploy production

Stack chạy bằng Docker Compose: postgres, init-permissions và migrate (one-shot), api, web (nginx)
và backup. Ngoài compose có `deploy/scripts/monitor.sh` chạy bằng cron của host (mục 7).
Thiết kế chi tiết: [spec](superpowers/specs/2026-06-12-docker-compose-production-design.md).

## 1. Chuẩn bị lần đầu

```bash
git clone <repo> && cd kiotviet-lite
cp .env.production.example .env
# Sửa .env: mật khẩu Postgres, JWT secrets, ALLOWED_ORIGINS, WEB_PORT,
# khóa công khai sao lưu và đích ngoài máy (mục 6), kênh cảnh báo (mục 7)
```

Yêu cầu trên server: Docker + Docker Compose plugin; `bash`, `curl`, `openssl` cho script giám sát.
Không cần Node hay pnpm. `.env` chứa secret, không commit.

JWT secret phải sinh ngẫu nhiên (`openssl rand -base64 48`, hai giá trị khác nhau). API production
từ chối khởi động nếu secret còn là giá trị mẫu (`change-me-*`), là chuỗi lặp, hoặc hai secret trùng
nhau; `NOTIFICATION_CONFIG_KEY` khi có đặt cũng bị kiểm như vậy.

## 2. Khởi động / cập nhật

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Thứ tự tự động: postgres healthy và init-permissions xong → migrate chạy xong → api start →
api healthy → web start. `init-permissions` chown `./data/imports`, `./data/logs/api`,
`./data/backups` cho uid 1000 vì api và backup không chạy bằng root.

Build web cho production phải đặt `VITE_API_URL=` (chuỗi rỗng, tức cùng origin; `apps/web/Dockerfile` đã đặt sẵn) vì CSP của nginx chỉ cho `connect-src 'self'`. Không đặt biến thì code rơi về `http://localhost:3000`, đặt URL khác origin thì request API bị CSP chặn.

Kiểm tra nhanh:

```bash
docker compose -f docker-compose.prod.yml ps
curl -i http://localhost:8080/api/v1/health       # readiness: 200 khi DB tới được và đủ migration
curl -i http://localhost:8080/api/v1/health/live  # liveness: 200 khi tiến trình còn phục vụ
```

`/api/v1/health` trả 503 kèm `checks.db` (`ok`/`down`) và `checks.migrations`
(`ok`/`pending`/`shutting_down`); healthcheck của container api dùng endpoint này.

Tắt và cập nhật: khi nhận SIGTERM, API ngừng nhận job nhập mới, chờ request đang xử lý và job
đang chạy tối đa 15 giây, quá hạn thì dừng job ở ranh giới dòng (giao dịch rollback, job quay lại
hàng đợi và chạy lại từ đầu sau khi API lên), đóng pool DB rồi thoát; tổng tối đa 30 giây
(`stop_grace_period: 45s`).

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

Cảnh báo tự động xem mục 7. Log API có mục tiêu 30 ngày nhưng giới hạn dung lượng có thể rút
ngắn thời gian thực tế khi lưu lượng tăng.

## 5. Lưu trữ tệp nhập Excel

- API lưu tệp gốc tại `./data/imports/` trên host, gắn vào `/app/imports` trong container. Compose đặt `BULK_IMPORT_DIR=/app/imports`; thư mục phải ghi được, nếu thiếu hoặc không an toàn API production từ chối khởi động.
- Tệp `.xlsx` tối đa 8 MiB và 12.000 dòng dữ liệu. Nginx cho phép body 20 MiB; bước xem trước không ghi dữ liệu. Chỉ chủ cửa hàng được nhập, tối đa 6 yêu cầu tải lên mỗi phút cho một tài khoản.
- API tắt êm (deploy, `docker compose stop`): công việc đang chạy quá hạn chờ được đưa lại hàng đợi và chạy lại từ đầu khi API lên. API chết đột ngột (kill -9, mất điện): công việc đang chạy được đánh dấu hỏng khi khởi động lại, người dùng tải lại tệp. Công việc còn chờ tiếp tục chạy. Bản ghi nghiệp vụ và nhật ký nhập được ghi nguyên khối hoặc không ghi gì.
- Công việc và tệp gốc tự xóa sau 30 ngày. Service `backup` sao lưu cả `./data/imports/` cùng bản dump DB (mục 6).

## 6. Sao lưu và khôi phục

### 6.1 Cách hoạt động

Service `backup` (image `deploy/backup/Dockerfile`, chạy bằng uid 1000) chạy `backup.sh` mỗi ngày
lúc `BACKUP_TIME` (mặc định 02:30 theo `TZ`). Service chỉ chờ postgres, không chờ migrate: migration
lỗi thì sao lưu vẫn chạy. Mỗi lần giữ khóa `flock` trên `./data/backups/.lock` (lần chạy tay trùng
lịch thì thoát mã 75), dọn thư mục `.work` và các DB `kvl_verify_*` còn sót từ lần bị kill, rồi:

1. `pg_dump -Fc` trong một snapshot đã export; số dòng từng bảng được đếm trong cùng snapshot.
2. Đóng gói `./data/imports/` (tệp nhập gốc).
3. **Tự kiểm**: `pg_restore --list`, khôi phục thử vào DB tạm `kvl_verify_*` trên cùng Postgres,
   so số dòng từng bảng với bản gốc rồi xóa DB tạm; kiểm tar tệp nhập; ghi `SHA256SUMS`.
   `BACKUP_VERIFY=list` bỏ bước khôi phục thử (khi DB quá lớn so với đĩa trống).
4. Gói thành một tệp `kvl-backup-<UTC>.tar.age`, mã hóa bằng age với khóa **công khai**
   `BACKUP_AGE_RECIPIENTS`. Server không giữ khóa bí mật nên không giải mã được bản của chính nó.
5. Xoay vòng trong `./data/backups/archive/`: giữ bản mới nhất của `BACKUP_KEEP_DAYS` ngày,
   `BACKUP_KEEP_WEEKS` tuần, `BACKUP_KEEP_MONTHS` tháng gần nhất (mặc định 7/4/6).
6. Đẩy ra ngoài máy bằng rclone tới `BACKUP_RCLONE_REMOTE`, kiểm bằng `rclone check`, xoay vòng
   remote cùng quy tắc (tắt bằng `BACKUP_REMOTE_PRUNE=false`).
7. Ghi `./data/backups/last-success.json`; `monitor.sh` báo khi tệp này cũ hơn 26 giờ.

Bước nào lỗi thì gửi cảnh báo `backup.failed` chỉ gồm tên bước và mã thoát (không kèm log, vì log
có thể chứa dữ liệu); log đầy đủ ở `./data/backups/logs/`. Khi dừng, compose chờ tối đa 5 phút
(`stop_grace_period`) cho lần sao lưu đang chạy. Thiếu khóa công khai thì vẫn sao lưu nhưng không mã hóa, không đẩy đi và
cảnh báo mỗi lần; thiếu remote thì cảnh báo mỗi lần. Data sống của Postgres nằm ở `./data/postgres/`.

### 6.2 Cài đặt lần đầu

Khóa age tạo trên máy quản trị, **không** trên server:

```bash
age-keygen -o kvl-backup.key   # hoặc: docker run --rm <image backup> age-keygen
# Dòng "# public key: age1..." là khóa công khai, đặt vào .env:
#   BACKUP_AGE_RECIPIENTS=age1...
# kvl-backup.key là khóa bí mật: cất ở trình quản lý mật khẩu và một bản giấy/USB, ít nhất
# 2 người giữ. Mất khóa này là mất mọi bản sao lưu. Có thể thêm khóa thứ hai (dấu phẩy).
```

Đích ngoài máy: tạo bucket (Cloudflare R2, Backblaze B2, S3...) và khóa truy cập chỉ cho bucket
đó, điền các biến `RCLONE_CONFIG_OFFSITE_*` và `BACKUP_RCLONE_REMOTE` theo mẫu trong
`.env.production.example`. Nên bật versioning hoặc object lock cho bucket; khi đó đặt
`BACKUP_REMOTE_PRUNE=false`, dùng quy tắc vòng đời của bucket để xóa bản cũ và cấp khóa chỉ có
quyền ghi, để server bị chiếm cũng không xóa được bản sao lưu.

Chạy thử ngay sau khi cấu hình và xem log:

```bash
docker compose -f docker-compose.prod.yml up -d --build backup
docker compose -f docker-compose.prod.yml exec backup backup.sh
cat data/backups/last-success.json   # "encrypted":true, "offsite":"ok"
```

Nâng cấp từ bản dùng `prodrigestivill/postgres-backup-local`: các bản cũ `.sql.gz` trong
`data/backups/{daily,weekly,monthly,last}` không bị xóa tự động; giữ đến khi có đủ bản mới rồi
xóa tay. Khôi phục bản cũ: `zcat <tệp>.sql.gz | docker compose ... exec -T postgres psql ...`.

### 6.3 Diễn tập khôi phục (mỗi quý, trên máy khác)

`backup.sh` đã khôi phục thử mỗi đêm trước khi mã hóa; diễn tập kiểm phần còn lại: khóa bí mật
còn dùng được, bản ngoài máy tải về và giải mã được. Làm trên máy quản trị có Docker:

```bash
git clone <repo> && cd kiotviet-lite
docker build -f deploy/backup/Dockerfile -t kvl-backup .
mkdir drill && cd drill
rclone copy offsite:kiotviet-backups/prod/kvl-backup-<UTC>.tar.age .   # hoặc tải từ giao diện bucket
cp ~/secure/kvl-backup.key .
docker network create kvl-drill
docker run -d --name kvl-drill-pg --network kvl-drill -e POSTGRES_PASSWORD=drill postgres:17-alpine
sleep 5
docker run --rm --network kvl-drill -v "$PWD:/backups" \
  -e PGHOST=kvl-drill-pg -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=postgres \
  kvl-backup restore.sh /backups/kvl-backup-<UTC>.tar.age --identity /backups/kvl-backup.key --verify-only
# Kỳ vọng dòng cuối: "Diễn tập đạt: ... giải mã, checksum, khôi phục và số dòng đều khớp"
docker rm -f kvl-drill-pg && docker network rm kvl-drill && cd .. && rm -rf drill
```

### 6.4 Khôi phục thật

`restore.sh` giải mã, kiểm `SHA256SUMS`, luôn khôi phục vào DB tạm `kvl_restoring_<pid>` rồi so số
dòng từng bảng với manifest, bung tệp nhập ra `data/backups/restore/<tên>/imports`. Mặc định DB tạm
được đổi tên thành DB **mới** `kvl_restore_<mốc>`. Với `--target-db <tên> --replace`, DB đích không
bị xóa: sau khi số dòng khớp, DB đích đổi tên thành `<tên>_old_<UTC>` (không nhận kết nối) và DB tạm
đổi tên thành `<tên>`, cả hai trong một transaction. Số dòng lệch hay lỗi giữa chừng thì DB đích giữ
nguyên, DB tạm bị xóa. Còn kết nối tới DB đích (api, psql...) thì script từ chối; chỉ thêm
`--force-disconnect` khi chắc chắn muốn ngắt chúng. Tên DB chỉ gồm chữ thường, số, `_` (tối đa 40).

```bash
# 1. Dừng ghi: api (và web để người dùng thấy bảo trì)
docker compose -f docker-compose.prod.yml stop web api

# 2. Đưa khóa bí mật lên server TẠM THỜI, chỉ uid 1000 đọc được
sudo install -m 600 -o 1000 -g 1000 ~/kvl-backup.key data/backups/kvl-backup.key

# 3. Khôi phục (tên tệp trong data/backups/archive, hoặc tên trên remote: tự tải về).
#    Log in tên DB cũ, ví dụ "DB cũ giữ lại tên kiotviet_old_20260925021500".
docker compose -f docker-compose.prod.yml stop backup
docker compose -f docker-compose.prod.yml run --rm --no-deps backup bash -c \
  'restore.sh kvl-backup-<UTC>.tar.age --identity /backups/kvl-backup.key \
     --target-db "$POSTGRES_DB" --replace'

# 4. Xóa khóa bí mật khỏi server ngay
sudo shred -u data/backups/kvl-backup.key

# 5. Trả tệp nhập về chỗ cũ, rồi xóa bản bung ra (tệp nhập chứa dữ liệu khách hàng)
sudo cp -a data/backups/restore/kvl-backup-<UTC>/imports/. data/imports/
sudo chown -R 1000:1000 data/imports
sudo rm -rf data/backups/restore/kvl-backup-<UTC>

# 6. Chạy lại (migrate chạy bù nếu bản sao lưu cũ hơn mã hiện tại)
docker compose -f docker-compose.prod.yml up -d
curl -i http://localhost:8080/api/v1/health

# 7. Khi đã chắc DB khôi phục đúng (vài ngày sau), xóa DB cũ để lấy lại đĩa
docker compose -f docker-compose.prod.yml exec postgres sh -c \
  'dropdb -U "$POSTGRES_USER" <tên DB cũ ở bước 3>'
```

Cần quay về DB cũ: dừng api, đổi tên ngược lại bằng `ALTER DATABASE ... RENAME TO ...` và bật
`ALTER DATABASE <tên cũ> WITH ALLOW_CONNECTIONS true`.

Server mới hoàn toàn: clone repo, đặt lại `.env` (cùng secret JWT để phiên cũ còn hợp lệ, hoặc
secret mới để buộc đăng nhập lại), `docker compose ... up -d postgres init-permissions`, rồi làm
từ bước 2. Bản sao lưu chỉ gồm DB và tệp nhập; `.env` và khóa age phải được giữ riêng.

## 7. Giám sát và cảnh báo

Kênh cảnh báo cấu hình bằng biến `OPS_ALERT_*` trong `.env` (Telegram và/hoặc webhook https có
ký HMAC `X-KVL-Signature`, kiểm bằng `verifyWebhookSignature` của `@kiotviet-lite/notifications`).
Cùng một cảnh báo không lặp lại trong `OPS_ALERT_THROTTLE_SECONDS`; khi hết lỗi có tin phục hồi.
`OPS_ALERT_ENABLED=false` tắt toàn bộ.

| Nguồn                    | Cảnh báo                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| API                      | readiness lỗi 3 lần liên tiếp (kiểm mỗi phút), số phản hồi 5xx trong 5 phút vượt `OPS_ALERT_5XX_THRESHOLD`                                 |
| Service `backup`         | sao lưu hoặc tự kiểm lỗi, bản sao lưu không mã hóa, chưa có đích ngoài máy                                                                 |
| `monitor.sh` (cron host) | API không sẵn sàng hoặc container chết, bản sao lưu đạt gần nhất quá 26 giờ, đĩa quá 85%, job nhập chạy quá 30 phút, bất biến dữ liệu lệch |
| Uptime monitor bên ngoài | cả host, Docker hoặc Cloudflare Tunnel ngừng (không gì trên máy tự báo được)                                                               |

Cron của root trên host (`sudo crontab -e`, vì script cần quyền Docker và đọc `data/backups` chỉ uid 1000 truy cập được; sửa đường dẫn repo):

```cron
*/5 * * * * cd /srv/kiotviet-lite && deploy/scripts/monitor.sh 2>&1 | logger -t kvl-monitor
15 4 * * *  cd /srv/kiotviet-lite && deploy/scripts/monitor.sh invariants 2>&1 | logger -t kvl-monitor
```

Kiểm tra bất biến chạy `apps/api/scripts/invariants.sql` nếu tệp có trong repo: mã thoát khác 0
là có vi phạm, mỗi dòng kết quả (`psql -At`) là một vi phạm; chưa có tệp thì bỏ qua. Cảnh báo chỉ
gồm tên kiểm tra, số vi phạm và mã thoát, không bao giờ kèm dòng dữ liệu hay output lệnh; chi tiết
ghi ở `data/monitor-state/logs/<kiểm tra>.log` (chỉ root đọc được). Xem kết quả: `journalctl -t kvl-monitor`.

Uptime monitor bên ngoài (UptimeRobot, Better Stack, Healthchecks...):

- Kiểm HTTP `https://your-domain.example.com/api/v1/health` mỗi 1 đến 5 phút, kỳ vọng mã 200 và
  chuỗi `"status":"ok"`; gửi cảnh báo qua email/SMS/ứng dụng tới ít nhất 2 người. Endpoint không
  trả thông tin nhạy cảm.
- Nên thêm một check kiểu heartbeat (dead man's switch) và đặt URL ping vào `MONITOR_HEARTBEAT_URL`:
  `monitor.sh` ping sau mỗi lần mọi kiểm tra đạt, dịch vụ ngoài báo khi quá hạn không nhận được
  ping (host tắt, cron ngừng, kiểm tra lỗi kéo dài).

## 8. Sự cố thường gặp

| Triệu chứng              | Kiểm tra                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| api không lên            | `docker compose logs migrate` (migration lỗi sẽ chặn api)                                           |
| 502 từ nginx             | api chưa healthy: `docker compose ps`, `docker compose logs api`                                    |
| Đăng nhập lỗi cookie     | `COOKIE_SECURE=true` cần truy cập qua HTTPS (Cloudflare Tunnel)                                     |
| Hết đĩa                  | Kiểm tra `du -sh data/*`. Log và backup đều có retention, data Postgres thì không                   |
| api không ghi được tệp   | `docker compose logs init-permissions`; thư mục `data/imports`, `data/logs/api` phải thuộc uid 1000 |
| Cảnh báo `backup.failed` | `ls -t data/backups/logs/ \| head -1` rồi xem log; chạy lại `docker compose exec backup backup.sh`  |
