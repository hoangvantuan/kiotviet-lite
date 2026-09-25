#!/bin/bash
# Khôi phục một bản sao lưu do backup.sh tạo (GL-04). Xem runbook ở docs/deploy.md mục 6.
#
#   restore.sh <tệp .tar.age|.tar hoặc tên trên remote> [tùy chọn]
#     --identity FILE    khóa bí mật age (mặc định BACKUP_AGE_IDENTITY_FILE); chỉ mang vào lúc khôi phục
#     --target-db NAME   DB đích (mặc định kvl_restore_<mốc>, một DB MỚI, không đụng DB đang chạy)
#     --replace          cho phép xóa và tạo lại DB đích nếu đã tồn tại (dùng khi thay DB production,
#                        PHẢI dừng api trước)
#     --imports-dest DIR nơi bung tệp nhập (mặc định /backups/restore/<tên>/imports)
#     --verify-only      chỉ giải mã, kiểm checksum và khôi phục vào DB tạm rồi xóa (diễn tập)
# Tên không có sẵn trong /backups/archive mà có BACKUP_RCLONE_REMOTE thì tải về từ remote.
set -Eeuo pipefail
umask 077

BACKUP_ROOT=${BACKUP_ROOT:-/backups}
export PGHOST=${PGHOST:-postgres}
export PGPORT=${PGPORT:-5432}
export PGUSER=${PGUSER:-${POSTGRES_USER:?POSTGRES_USER chưa đặt}}
export PGPASSWORD=${PGPASSWORD:-${POSTGRES_PASSWORD:?POSTGRES_PASSWORD chưa đặt}}
export PGDATABASE=${PGDATABASE:-${POSTGRES_DB:?POSTGRES_DB chưa đặt}}

usage() { sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 64; }
[[ $# -ge 1 ]] || usage
SRC=$1
shift
IDENTITY=${BACKUP_AGE_IDENTITY_FILE:-}
TARGET_DB=""
REPLACE=false
IMPORTS_DEST=""
VERIFY_ONLY=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --identity) IDENTITY=$2; shift 2 ;;
    --target-db) TARGET_DB=$2; shift 2 ;;
    --replace) REPLACE=true; shift ;;
    --imports-dest) IMPORTS_DEST=$2; shift 2 ;;
    --verify-only) VERIFY_ONLY=true; shift ;;
    *) usage ;;
  esac
done

log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*"; }

if [[ ! -f $SRC && -f $BACKUP_ROOT/archive/$SRC ]]; then SRC=$BACKUP_ROOT/archive/$SRC; fi
if [[ ! -f $SRC && -n ${BACKUP_RCLONE_REMOTE:-} ]]; then
  mkdir -p "$BACKUP_ROOT/restore"
  log "Tải $SRC từ $BACKUP_RCLONE_REMOTE"
  rclone copyto "$BACKUP_RCLONE_REMOTE/$(basename "$SRC")" "$BACKUP_ROOT/restore/$(basename "$SRC")"
  SRC=$BACKUP_ROOT/restore/$(basename "$SRC")
fi
[[ -f $SRC ]] || { echo "Không tìm thấy bản sao lưu: $SRC" >&2; exit 66; }

NAME=$(basename "$SRC")
NAME=${NAME%.age}
NAME=${NAME%.tar}
WORK=$BACKUP_ROOT/.work/restore-$NAME-$$
temp_db=""
cleanup() {
  [[ -n $temp_db ]] && dropdb --if-exists "$temp_db" 2>/dev/null
  rm -rf "$WORK"
}
trap cleanup EXIT
mkdir -p "$WORK/pkg"

if [[ $SRC == *.age ]]; then
  [[ -n $IDENTITY && -f $IDENTITY ]] || { echo "Cần khóa bí mật age: --identity FILE" >&2; exit 64; }
  log "Giải mã $SRC"
  age -d -i "$IDENTITY" "$SRC" | tar -C "$WORK/pkg" -xf -
else
  tar -C "$WORK/pkg" -xf "$SRC"
fi
(cd "$WORK/pkg" && sha256sum -c --quiet SHA256SUMS)
log "Checksum khớp: $(tr '\n' ' ' <"$WORK/pkg/SHA256SUMS" | awk '{print $2, $4, $6, $8}')"

count_rows() {
  psql -X -q -At -v ON_ERROR_STOP=1 -d "$1" <<'SQL' | LC_ALL=C sort
SELECT format('SELECT %L || ''|'' || count(*) FROM %I.%I', n.nspname || '.' || c.relname, n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg\_toast%' AND n.nspname NOT LIKE 'pg\_temp%'
ORDER BY 1 \gexec
SQL
}

if [[ $VERIFY_ONLY == true ]]; then
  TARGET_DB=kvl_drill_$$
  temp_db=$TARGET_DB
elif [[ -z $TARGET_DB ]]; then
  TARGET_DB=kvl_restore_$(printf '%s' "${NAME#kvl-backup-}" | tr 'A-Z' 'a-z')
fi

exists=$(psql -X -At -d postgres -c "SELECT 1 FROM pg_database WHERE datname = '$TARGET_DB'")
if [[ $exists == 1 ]]; then
  [[ $REPLACE == true ]] || { echo "DB $TARGET_DB đã tồn tại; thêm --replace nếu thật sự muốn thay" >&2; exit 65; }
  log "Xóa DB $TARGET_DB (--replace)"
  dropdb --force "$TARGET_DB"
fi
createdb "$TARGET_DB"
log "Khôi phục vào DB $TARGET_DB"
pg_restore --no-owner --no-acl --exit-on-error -d "$TARGET_DB" "$WORK/pkg/db.dump"
count_rows "$TARGET_DB" >"$WORK/restored-counts.txt"
if ! diff -u "$WORK/pkg/row-counts.txt" "$WORK/restored-counts.txt"; then
  echo "Số dòng sau khôi phục không khớp manifest" >&2
  exit 1
fi
log "Số dòng khớp manifest ($(wc -l <"$WORK/restored-counts.txt") bảng)"

if [[ $VERIFY_ONLY == true ]]; then
  tar -tzf "$WORK/pkg/imports.tar.gz" >/dev/null
  log "Diễn tập đạt: $NAME giải mã, checksum, khôi phục và số dòng đều khớp"
  exit 0
fi

IMPORTS_DEST=${IMPORTS_DEST:-$BACKUP_ROOT/restore/$NAME/imports}
mkdir -p "$IMPORTS_DEST"
tar -C "$IMPORTS_DEST" --strip-components=1 -xzf "$WORK/pkg/imports.tar.gz"
cp "$WORK/pkg/manifest.json" "$(dirname "$IMPORTS_DEST")/manifest.json" 2>/dev/null || true
log "Tệp nhập bung ra $IMPORTS_DEST ($(find "$IMPORTS_DEST" -type f | wc -l) tệp)"
log "Khôi phục xong: DB $TARGET_DB"
