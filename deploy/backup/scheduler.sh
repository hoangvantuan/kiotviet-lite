#!/bin/bash
# Chạy backup.sh mỗi ngày một lần vào BACKUP_TIME (HH:MM, theo TZ). Lỗi của một lần sao lưu
# không làm dừng lịch: backup.sh tự gửi cảnh báo, lần sau vẫn chạy.
set -u
BACKUP_TIME=${BACKUP_TIME:-02:30}
if ! [[ $BACKUP_TIME =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]]; then
  echo "BACKUP_TIME không hợp lệ: '$BACKUP_TIME' (cần HH:MM)" >&2
  exit 64
fi
echo "Lịch sao lưu: mỗi ngày lúc $BACKUP_TIME (TZ=${TZ:-UTC})"
trap 'exit 0' TERM INT

last_run=""
if [[ ${BACKUP_ON_START:-false} == true ]]; then
  backup.sh || true
  last_run=$(date +%F)
fi
while true; do
  if [[ $(date +%H:%M) == "$BACKUP_TIME" && $(date +%F) != "$last_run" ]]; then
    last_run=$(date +%F)
    backup.sh || true
  fi
  sleep 20 &
  wait $!
done
