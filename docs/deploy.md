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

## 4. Log

| Loại           | Vị trí                          | Rotation                                      |
| -------------- | ------------------------------- | --------------------------------------------- |
| App log (JSON) | `./data/logs/api/app.*.log`     | pino-roll: theo ngày, 100MB/file, giữ 30 file |
| Log container  | `docker compose logs <service>` | json-file: 10MB/file, giữ 3 file              |

```bash
# Theo dõi file log api mới nhất (pino-roll đặt tên app.<số>.log)
tail -f "data/logs/api/$(ls -t data/logs/api | head -1)"
docker compose -f docker-compose.prod.yml logs -f api
```

## 5. Backup

- Tự động: service `backup` chạy pg_dump theo lịch `@daily`, lưu vào `./data/backups/`.
- Retention: 7 bản ngày, 4 bản tuần, 6 bản tháng (đổi trong `.env`).
- Data sống của Postgres nằm ở `./data/postgres/`.

Backup thủ công ngay lập tức:

```bash
docker compose -f docker-compose.prod.yml exec backup /backup.sh
ls data/backups/daily/
```

## 6. Restore

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

## 7. Sự cố thường gặp

| Triệu chứng          | Kiểm tra                                                                          |
| -------------------- | --------------------------------------------------------------------------------- |
| api không lên        | `docker compose logs migrate` (migration lỗi sẽ chặn api)                         |
| 502 từ nginx         | api chưa healthy: `docker compose ps`, `docker compose logs api`                  |
| Đăng nhập lỗi cookie | `COOKIE_SECURE=true` cần truy cập qua HTTPS (Cloudflare Tunnel)                   |
| Hết đĩa              | Kiểm tra `du -sh data/*`. Log và backup đều có retention, data Postgres thì không |
