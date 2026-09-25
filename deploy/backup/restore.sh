#!/bin/bash
# Khôi phục một bản sao lưu do backup.sh tạo (GL-04). Xem runbook ở docs/deploy.md mục 6.
#
#   restore.sh <tệp .tar.age|.tar hoặc tên trên remote> [tùy chọn]
#     --identity FILE      khóa bí mật age (mặc định BACKUP_AGE_IDENTITY_FILE); chỉ mang vào lúc khôi phục
#     --target-db NAME     DB đích (mặc định kvl_restore_<mốc>, một DB MỚI, không đụng DB đang chạy)
#     --replace            DB đích đã tồn tại thì thay: khôi phục vào DB tạm, kiểm số dòng, rồi đổi
#                          tên DB cũ thành <NAME>_old_<mốc> và DB tạm thành NAME (không xóa gì)
#     --force-disconnect   cùng --replace: ngắt các kết nối còn lại tới DB đích (mặc định từ chối)
#     --imports-dest DIR   nơi bung tệp nhập (mặc định /backups/restore/<tên>/imports)
#     --verify-only        chỉ giải mã, kiểm checksum, khôi phục vào DB tạm rồi xóa (diễn tập)
# Tên không có sẵn trong /backups/archive mà có BACKUP_RCLONE_REMOTE thì tải về từ remote.
set -Eeuo pipefail
umask 077

BACKUP_ROOT=${BACKUP_ROOT:-/backups}
export PGHOST=${PGHOST:-postgres}
export PGPORT=${PGPORT:-5432}
export PGUSER=${PGUSER:-${POSTGRES_USER:?POSTGRES_USER chưa đặt}}
export PGPASSWORD=${PGPASSWORD:-${POSTGRES_PASSWORD:?POSTGRES_PASSWORD chưa đặt}}
export PGDATABASE=${PGDATABASE:-${POSTGRES_DB:?POSTGRES_DB chưa đặt}}

# shellcheck source=lib.sh
. "${KVL_BACKUP_LIB:-/usr/local/lib/kvl/backup-lib.sh}"

usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 64; }
[[ $# -ge 1 ]] || usage
SRC=$1
shift
IDENTITY=${BACKUP_AGE_IDENTITY_FILE:-}
TARGET_DB=""
REPLACE=false
FORCE_DISCONNECT=false
IMPORTS_DEST=""
VERIFY_ONLY=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --identity) IDENTITY=$2; shift 2 ;;
    --target-db) TARGET_DB=$2; shift 2 ;;
    --replace) REPLACE=true; shift ;;
    --force-disconnect) FORCE_DISCONNECT=true; shift ;;
    --imports-dest) IMPORTS_DEST=$2; shift 2 ;;
    --verify-only) VERIFY_ONLY=true; shift ;;
    *) usage ;;
  esac
done

log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*"; }
# Tên DB luôn đi qua psql -v (:'var' / :"var"), không ghép vào chuỗi SQL.
psql_admin() { psql -X -q -At -v ON_ERROR_STOP=1 -d postgres "$@"; }
db_exists() { [[ $(psql_admin -v db="$1" <<<"SELECT count(*) FROM pg_database WHERE datname = :'db';") == 1 ]]; }
# Từ chối (mã 65) khi còn kết nối khác tới DB đích mà không có --force-disconnect.
refuse_if_connected() {
  local others
  others=$(psql_admin -v db="$TARGET_DB" <<<"SELECT count(*) FROM pg_stat_activity WHERE datname = :'db' AND pid <> pg_backend_pid();")
  if ((others > 0)) && [[ $FORCE_DISCONNECT != true ]]; then
    echo "Còn $others kết nối tới $TARGET_DB (api, backup, psql...). Dừng chúng rồi chạy lại," >&2
    echo "hoặc thêm --force-disconnect để ngắt. DB đích chưa bị đụng tới." >&2
    exit 65
  fi
}

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
MARK=$(printf '%s' "${NAME#kvl-backup-}" | tr 'A-Z' 'a-z')
if [[ $VERIFY_ONLY == true ]]; then
  TARGET_DB=""
elif [[ -z $TARGET_DB ]]; then
  TARGET_DB=kvl_restore_$MARK
fi
if [[ -n $TARGET_DB ]]; then
  valid_db_name "$TARGET_DB" || { echo "Tên DB không hợp lệ: '$TARGET_DB' (chữ thường, số, _; tối đa 40 ký tự)" >&2; exit 64; }
  if db_exists "$TARGET_DB" && [[ $REPLACE != true ]]; then
    echo "DB $TARGET_DB đã tồn tại; thêm --replace nếu thật sự muốn thay" >&2
    exit 65
  fi
  # Kiểm sớm để khỏi giải mã, khôi phục xong mới từ chối; kiểm lại ngay trước khi đổi tên.
  if db_exists "$TARGET_DB"; then refuse_if_connected; fi
fi

# Luôn khôi phục vào DB tạm trước; chỉ đổi tên sang đích khi đã kiểm đạt.
# pid trong container luôn là 1: thêm hậu tố ngẫu nhiên để hai lần khôi phục không trùng tên.
TEMP_DB=kvl_restoring_$(od -An -N4 -tx4 /dev/urandom | tr -d ' ')
WORK=$BACKUP_ROOT/.work/restore-$NAME-$$
temp_db=""
cleanup() {
  # Luôn xóa bản giải mã, kể cả khi dropdb lỗi.
  if [[ -n $temp_db ]]; then dropdb --if-exists "$temp_db" 2>/dev/null || true; fi
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

createdb "$TEMP_DB"
temp_db=$TEMP_DB
log "Khôi phục vào DB tạm $TEMP_DB"
pg_restore --no-owner --no-acl --exit-on-error -d "$TEMP_DB" "$WORK/pkg/db.dump"
count_rows "$TEMP_DB" >"$WORK/restored-counts.txt"
if ! diff -u "$WORK/pkg/row-counts.txt" "$WORK/restored-counts.txt"; then
  echo "Số dòng sau khôi phục không khớp manifest; DB đích không bị đụng tới" >&2
  exit 1
fi
log "Số dòng khớp manifest ($(wc -l <"$WORK/restored-counts.txt") bảng)"

if [[ $VERIFY_ONLY == true ]]; then
  tar -tzf "$WORK/pkg/imports.tar.gz" >/dev/null
  log "Diễn tập đạt: $NAME giải mã, checksum, khôi phục và số dòng đều khớp"
  exit 0
fi

if db_exists "$TARGET_DB"; then
  OLD_DB=${TARGET_DB}_old_$(date -u +%Y%m%d%H%M%S)
  refuse_if_connected
  log "Đổi tên $TARGET_DB thành $OLD_DB, $TEMP_DB thành $TARGET_DB"
  # Chặn kết nối mới, ngắt kết nối cũ (chỉ khi được phép), rồi đổi tên cả hai trong một
  # transaction: hoặc cả hai cùng đổi, hoặc DB đích giữ nguyên.
  if ! psql_admin -v db="$TARGET_DB" -v old="$OLD_DB" -v tmp="$TEMP_DB" -v force="$FORCE_DISCONNECT" <<'SQL'; then
ALTER DATABASE :"db" WITH ALLOW_CONNECTIONS false;
\if :force
SELECT count(pg_terminate_backend(pid)) AS terminated FROM pg_stat_activity
  WHERE datname = :'db' AND pid <> pg_backend_pid() \gset
\endif
BEGIN;
ALTER DATABASE :"db" RENAME TO :"old";
ALTER DATABASE :"tmp" RENAME TO :"db";
COMMIT;
ALTER DATABASE :"db" WITH ALLOW_CONNECTIONS true;
SQL
    # Không đổi tên được (vừa có kết nối mới chen vào...): trả DB đích về như cũ.
    psql_admin -v db="$TARGET_DB" <<<'ALTER DATABASE :"db" WITH ALLOW_CONNECTIONS true;' || true
    echo "Không đổi tên được; $TARGET_DB giữ nguyên, DB tạm bị xóa" >&2
    exit 1
  fi
  log "DB cũ giữ lại tên $OLD_DB (không nhận kết nối). Xóa khi đã chắc chắn: dropdb $OLD_DB"
else
  psql_admin -v db="$TARGET_DB" -v tmp="$TEMP_DB" <<<'ALTER DATABASE :"tmp" RENAME TO :"db";'
fi
temp_db=""

IMPORTS_DEST=${IMPORTS_DEST:-$BACKUP_ROOT/restore/$NAME/imports}
mkdir -p "$IMPORTS_DEST"
tar -C "$IMPORTS_DEST" --strip-components=1 -xzf "$WORK/pkg/imports.tar.gz"
cp "$WORK/pkg/manifest.json" "$(dirname "$IMPORTS_DEST")/manifest.json" 2>/dev/null || true
log "Tệp nhập bung ra $IMPORTS_DEST ($(find "$IMPORTS_DEST" -type f | wc -l) tệp)"
log "Khôi phục xong: DB $TARGET_DB"
