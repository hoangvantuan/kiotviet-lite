#!/bin/bash
# Sao lưu đầy đủ một lần (GL-04). Chạy trong container `backup` (xem docker-compose.prod.yml):
#   docker compose -f docker-compose.prod.yml exec backup backup.sh
#
# Các bước:
#   1. Mở một giao dịch REPEATABLE READ và export snapshot; pg_dump và phép đếm dòng từng bảng
#      cùng đọc snapshot đó, nên số dòng dùng để tự kiểm khớp chính xác với nội dung bản dump.
#   2. Đóng gói thư mục tệp nhập (BACKUP_IMPORTS_DIR, mặc định /data/imports).
#   3. Tự kiểm: pg_restore --list, khôi phục thử vào DB tạm rồi so số dòng từng bảng
#      (BACKUP_VERIFY=list chỉ kiểm mục lục, dùng khi DB quá lớn), kiểm tar tệp nhập, SHA256SUMS.
#   4. Gói thành một tệp và mã hóa bằng age với khóa công khai (BACKUP_AGE_RECIPIENTS).
#      Máy chủ chỉ giữ khóa công khai, không giải mã được bản sao lưu của chính nó.
#   5. Xoay vòng cục bộ theo BACKUP_KEEP_DAYS/WEEKS/MONTHS.
#   6. Đẩy ra ngoài máy bằng rclone (BACKUP_RCLONE_REMOTE), kiểm lại bằng rclone check,
#      xoay vòng phía remote cùng quy tắc (tắt bằng BACKUP_REMOTE_PRUNE=false).
#   7. Ghi last-success.json (monitor.sh dựa vào đây để báo bản sao lưu quá cũ).
# Bước nào lỗi thì thoát mã khác 0 và gửi cảnh báo `backup.failed` (deploy/scripts/lib/alert.sh).
set -Eeuo pipefail
umask 077

BACKUP_ROOT=${BACKUP_ROOT:-/backups}
ARCHIVE_DIR=$BACKUP_ROOT/archive
IMPORTS_DIR=${BACKUP_IMPORTS_DIR:-/data/imports}
KEEP_DAYS=${BACKUP_KEEP_DAYS:-7}
KEEP_WEEKS=${BACKUP_KEEP_WEEKS:-4}
KEEP_MONTHS=${BACKUP_KEEP_MONTHS:-6}
VERIFY=${BACKUP_VERIFY:-restore}
REMOTE=${BACKUP_RCLONE_REMOTE:-}
PREFIX=kvl-backup-

export PGHOST=${PGHOST:-postgres}
export PGPORT=${PGPORT:-5432}
export PGUSER=${PGUSER:-${POSTGRES_USER:?POSTGRES_USER chưa đặt}}
export PGPASSWORD=${PGPASSWORD:-${POSTGRES_PASSWORD:?POSTGRES_PASSWORD chưa đặt}}
export PGDATABASE=${PGDATABASE:-${POSTGRES_DB:?POSTGRES_DB chưa đặt}}
export OPS_ALERT_STATE_DIR=${OPS_ALERT_STATE_DIR:-$BACKUP_ROOT/.alert-state}

# shellcheck source=../scripts/lib/alert.sh
. "${KVL_ALERT_LIB:-/usr/local/lib/kvl/alert.sh}"

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
NAME=$PREFIX$STAMP
WORK=$BACKUP_ROOT/.work/$NAME
LOG_DIR=$BACKUP_ROOT/logs
LOG=$LOG_DIR/$NAME.log
VERIFY_DB=kvl_verify_${STAMP,,}
STEP=init
exporter_pid=""
verify_db_created=""

mkdir -p "$ARCHIVE_DIR" "$WORK" "$LOG_DIR" "$OPS_ALERT_STATE_DIR"
exec > >(tee -a "$LOG") 2>&1

log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*"; }

cleanup() {
  if [[ -n $exporter_pid ]]; then
    exec 3>&- 2>/dev/null || true
    kill "$exporter_pid" 2>/dev/null || true
    wait "$exporter_pid" 2>/dev/null || true
  fi
  if [[ -n $verify_db_created ]]; then
    dropdb --if-exists "$VERIFY_DB" 2>/dev/null || log "CẢNH BÁO: không xóa được DB tạm $VERIFY_DB"
  fi
  rm -rf "$WORK"
}

on_error() {
  local rc=$1
  trap - ERR
  log "LỖI ở bước '$STEP' (mã $rc)"
  touch "$OPS_ALERT_STATE_DIR/backup-last-failed"
  ops_alert backup.failed error "Sao lưu thất bại ở bước $STEP" \
    "Bản $NAME, mã thoát $rc. Nhật ký: $LOG
$(tail -n 15 "$LOG" 2>/dev/null | cut -c1-300)"
  exit "$rc"
}
trap 'on_error $?' ERR
trap cleanup EXIT

# In "schema.bảng|số dòng" cho mọi bảng thường, sắp xếp ổn định. $1 là DB, $2 (tùy chọn) snapshot.
count_rows() {
  psql -X -q -At -v ON_ERROR_STOP=1 -d "$1" <<SQL | LC_ALL=C sort
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
${2:+SET TRANSACTION SNAPSHOT '$2';}
SELECT format('SELECT %L || ''|'' || count(*) FROM %I.%I', n.nspname || '.' || c.relname, n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg\_toast%' AND n.nspname NOT LIKE 'pg\_temp%'
ORDER BY 1 \gexec
COMMIT;
SQL
}

# Đọc danh sách tên (mới nhất trước) từ stdin, in các tên cần xóa theo quy tắc ông-cha-con:
# giữ bản mới nhất của mỗi ngày trong KEEP_DAYS ngày gần nhất có sao lưu, mỗi tuần ISO trong
# KEEP_WEEKS tuần, mỗi tháng trong KEEP_MONTHS tháng.
retention_victims() {
  local -A seen_d=() seen_w=() seen_m=()
  local nd=0 nw=0 nm=0 name d w m keep
  while read -r name; do
    [[ $name =~ ^${PREFIX}([0-9]{8})T[0-9]{6}Z\.tar(\.age)?$ ]] || continue
    d=${BASH_REMATCH[1]}
    m=${d:0:6}
    w=$(date -u -d "${d:0:4}-${d:4:2}-${d:6:2}" +%G%V)
    keep=0
    if [[ -z ${seen_d[$d]:-} ]]; then
      seen_d[$d]=1
      nd=$((nd + 1))
      ((nd <= KEEP_DAYS)) && keep=1
    fi
    if [[ -z ${seen_w[$w]:-} ]]; then
      seen_w[$w]=1
      nw=$((nw + 1))
      ((nw <= KEEP_WEEKS)) && keep=1
    fi
    if [[ -z ${seen_m[$m]:-} ]]; then
      seen_m[$m]=1
      nm=$((nm + 1))
      ((nm <= KEEP_MONTHS)) && keep=1
    fi
    ((keep == 1)) || printf '%s\n' "$name"
  done
}

((KEEP_DAYS >= 1)) || { echo "BACKUP_KEEP_DAYS phải >= 1" >&2; exit 64; }
log "Bắt đầu sao lưu $NAME (DB $PGDATABASE trên $PGHOST:$PGPORT)"

STEP=snapshot
mkfifo "$WORK/ctl"
psql -X -q -At -v ON_ERROR_STOP=1 <"$WORK/ctl" >"$WORK/exporter.log" 2>&1 &
exporter_pid=$!
exec 3>"$WORK/ctl"
printf '%s\n' 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' \
  "SELECT pg_export_snapshot() \\g $WORK/snapshot" >&3
for _ in $(seq 1 150); do
  [[ -s $WORK/snapshot ]] && break
  kill -0 "$exporter_pid" 2>/dev/null || { cat "$WORK/exporter.log"; false; }
  sleep 0.2
done
SNAPSHOT=$(tr -d '[:space:]' <"$WORK/snapshot")
[[ -n $SNAPSHOT ]]
log "Snapshot $SNAPSHOT"

STEP=pg_dump
mkdir -p "$WORK/pkg"
pg_dump -Fc -Z 6 --snapshot="$SNAPSHOT" -f "$WORK/pkg/db.dump"
count_rows "$PGDATABASE" "$SNAPSHOT" >"$WORK/pkg/row-counts.txt"
printf 'COMMIT;\n' >&3
exec 3>&-
wait "$exporter_pid"
exporter_pid=""
log "pg_dump xong: $(du -h "$WORK/pkg/db.dump" | cut -f1), $(wc -l <"$WORK/pkg/row-counts.txt") bảng"
if [[ ! -s $WORK/pkg/row-counts.txt ]]; then
  log "DB $PGDATABASE không có bảng nào (sai tên DB hoặc chưa chạy migration)"
  false
fi

STEP=imports
if [[ -d $IMPORTS_DIR ]]; then
  tar -C "$(dirname "$IMPORTS_DIR")" -czf "$WORK/pkg/imports.tar.gz" "$(basename "$IMPORTS_DIR")"
  log "Tệp nhập: $(find "$IMPORTS_DIR" -type f | wc -l) tệp"
else
  log "CẢNH BÁO: không thấy $IMPORTS_DIR, đóng gói thư mục rỗng"
  mkdir -p "$WORK/empty/imports"
  tar -C "$WORK/empty" -czf "$WORK/pkg/imports.tar.gz" imports
fi

STEP=verify
pg_restore --list "$WORK/pkg/db.dump" >"$WORK/db.list"
tar -tzf "$WORK/pkg/imports.tar.gz" >/dev/null
if [[ $VERIFY == restore ]]; then
  createdb "$VERIFY_DB"
  verify_db_created=1
  pg_restore --no-owner --no-acl --exit-on-error -d "$VERIFY_DB" "$WORK/pkg/db.dump"
  count_rows "$VERIFY_DB" >"$WORK/verify-counts.txt"
  if ! diff -u "$WORK/pkg/row-counts.txt" "$WORK/verify-counts.txt"; then
    log "Số dòng sau khi khôi phục thử không khớp bản gốc"
    false
  fi
  dropdb "$VERIFY_DB"
  verify_db_created=""
  log "Tự kiểm: khôi phục thử vào $VERIFY_DB, số dòng $(wc -l <"$WORK/verify-counts.txt") bảng khớp"
else
  log "Tự kiểm: BACKUP_VERIFY=$VERIFY, chỉ kiểm mục lục ($(grep -c ' TABLE DATA ' "$WORK/db.list") bảng có dữ liệu)"
fi

STEP=manifest
{
  printf '{\n  "name": "%s",\n  "createdAt": "%s",\n  "database": "%s",\n' \
    "$NAME" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$PGDATABASE"
  printf '  "pgDump": "%s",\n  "verify": "%s",\n  "tables": {\n' "$(pg_dump --version)" "$VERIFY"
  awk -F'|' '{ printf "%s    \"%s\": %s", (NR > 1 ? ",\n" : ""), $1, $2 } END { print "" }' \
    "$WORK/pkg/row-counts.txt"
  printf '  }\n}\n'
} >"$WORK/pkg/manifest.json"
(cd "$WORK/pkg" && sha256sum db.dump imports.tar.gz row-counts.txt manifest.json >SHA256SUMS)

STEP=encrypt
# Nhiều khóa cách nhau bằng dấu phẩy (khóa ssh có dấu cách nên không tách theo dấu cách).
recipients=$(printf '%s' "${BACKUP_AGE_RECIPIENTS:-}" | tr ',' '\n' | sed 's/^ *//; s/ *$//; /^$/d')
if [[ -n ${BACKUP_AGE_RECIPIENTS_FILE:-} ]]; then
  recipients=$(printf '%s\n%s' "$recipients" "$(grep -v '^#' "$BACKUP_AGE_RECIPIENTS_FILE")" | sed '/^$/d')
fi
if [[ -n $recipients ]]; then
  printf '%s\n' "$recipients" >"$WORK/recipients"
  OUT=$ARCHIVE_DIR/$NAME.tar.age
  tar -C "$WORK/pkg" -cf - . | age -R "$WORK/recipients" -o "$OUT.partial"
  encrypted=true
else
  OUT=$ARCHIVE_DIR/$NAME.tar
  tar -C "$WORK/pkg" -cf "$OUT.partial" .
  encrypted=false
  log "CẢNH BÁO: chưa đặt BACKUP_AGE_RECIPIENTS, bản sao lưu KHÔNG mã hóa và KHÔNG được đẩy ra ngoài máy"
  ops_alert backup.unencrypted warn "Sao lưu không được mã hóa" \
    "Chưa đặt BACKUP_AGE_RECIPIENTS: $NAME chỉ nằm trên máy chủ, chưa mã hóa, không có bản ngoài máy."
fi
mv "$OUT.partial" "$OUT"
chmod 600 "$OUT"
SHA=$(sha256sum "$OUT" | cut -d' ' -f1)
log "Đã ghi $OUT ($(du -h "$OUT" | cut -f1))"

STEP=rotate_local
# ls -1r: tên chứa mốc UTC nên thứ tự chữ cũng là thứ tự thời gian.
for victim in $(ls -1r "$ARCHIVE_DIR" | retention_victims); do
  rm -f "${ARCHIVE_DIR:?}/$victim"
  log "Xoay vòng: xóa $victim"
done
find "$LOG_DIR" -name "$PREFIX*.log" -mtime +60 -delete

offsite=skipped
if [[ -n $REMOTE && $encrypted == true ]]; then
  STEP=offsite_upload
  rclone copyto "$OUT" "$REMOTE/$(basename "$OUT")" --retries 3 --low-level-retries 10
  STEP=offsite_check
  rclone check "$ARCHIVE_DIR" "$REMOTE" --one-way --include "$(basename "$OUT")"
  # BACKUP_REMOTE_PRUNE=false: không xóa gì trên remote, để quy tắc vòng đời/khóa đối tượng
  # của bucket lo; khi đó khóa rclone chỉ cần quyền ghi, máy chủ bị chiếm cũng không xóa được.
  if [[ ${BACKUP_REMOTE_PRUNE:-true} != false ]]; then
    STEP=rotate_remote
    for victim in $(rclone lsf "$REMOTE" --files-only --include "$PREFIX*" | LC_ALL=C sort -r | retention_victims); do
      rclone deletefile "$REMOTE/$victim"
      log "Xoay vòng remote: xóa $victim"
    done
  fi
  offsite=ok
  log "Đã đẩy ra ngoài máy: $REMOTE"
elif [[ -n $REMOTE ]]; then
  log "Bỏ qua đẩy ra ngoài máy vì bản sao lưu chưa mã hóa"
else
  log "CẢNH BÁO: chưa đặt BACKUP_RCLONE_REMOTE, bản sao lưu chỉ nằm trên máy chủ"
  ops_alert backup.no_offsite warn "Sao lưu chưa có bản ngoài máy" \
    "Chưa đặt BACKUP_RCLONE_REMOTE: hỏng đĩa hoặc mất máy chủ là mất luôn bản sao lưu."
fi

STEP=finish
printf '{"name":"%s","file":"%s","sha256":"%s","bytes":%s,"encrypted":%s,"verify":"%s","offsite":"%s","finishedAt":"%s"}\n' \
  "$NAME" "$(basename "$OUT")" "$SHA" "$(stat -c %s "$OUT")" "$encrypted" "$VERIFY" "$offsite" \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$BACKUP_ROOT/last-success.json.partial"
mv "$BACKUP_ROOT/last-success.json.partial" "$BACKUP_ROOT/last-success.json"
if [[ -f $OPS_ALERT_STATE_DIR/backup-last-failed ]]; then
  rm -f "$OPS_ALERT_STATE_DIR/backup-last-failed" "$OPS_ALERT_STATE_DIR/backup.failed"
  OPS_ALERT_FORCE=1 ops_alert backup.recovered info "Sao lưu đã chạy lại bình thường" "Bản $NAME đạt tự kiểm."
fi
log "Sao lưu đạt: $NAME (tự kiểm $VERIFY, ngoài máy $offsite)"
