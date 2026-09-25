# Image sao lưu (GL-04): pg_dump/pg_restore cùng bản major với Postgres production,
# age để mã hóa bằng khóa công khai, rclone để đẩy ra ngoài máy.
# Build context là gốc repo: docker build -f deploy/backup/Dockerfile .
FROM postgres:17-alpine
RUN apk add --no-cache bash age rclone curl openssl tzdata coreutils
COPY deploy/scripts/lib/alert.sh /usr/local/lib/kvl/alert.sh
COPY deploy/backup/lib.sh /usr/local/lib/kvl/backup-lib.sh
COPY deploy/backup/backup.sh deploy/backup/restore.sh deploy/backup/scheduler.sh /usr/local/bin/
RUN chmod 755 /usr/local/bin/backup.sh /usr/local/bin/restore.sh /usr/local/bin/scheduler.sh
# Không cần HOME thật; rclone và age ghi cache tạm vào đây.
ENV HOME=/tmp
# Cấu hình rclone đọc từ biến RCLONE_CONFIG_<TÊN>_* trong .env; tệp rỗng để khỏi báo thiếu.
RUN mkdir -p /etc/rclone && touch /etc/rclone/rclone.conf
ENV RCLONE_CONFIG=/etc/rclone/rclone.conf
ENTRYPOINT []
CMD ["scheduler.sh"]
