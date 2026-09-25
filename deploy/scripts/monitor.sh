#!/usr/bin/env bash
# Kiểm tra định kỳ từ host và gửi cảnh báo vận hành (GL-13, GL-15). Chạy bằng cron của host,
# từ bất kỳ thư mục nào (script tự về gốc repo). Xem docs/deploy.md mục 7.
#
#   deploy/scripts/monitor.sh              # health backup disk imports (mặc định, mỗi 5 phút)
#   deploy/scripts/monitor.sh invariants   # bất biến dữ liệu (mỗi ngày, nặng hơn)
#
# Kiểm tra:
#   health      readiness của API (/api/v1/health) gọi từ trong container; API chết hẳn thì
#               chính nó không tự báo được, nên cần kiểm từ ngoài.
#   backup      last-success.json của bản sao lưu cũ hơn MONITOR_BACKUP_MAX_AGE_HOURS (26).
#   disk        phân vùng chứa ./data dùng quá MONITOR_DISK_MAX_PCT (85%).
#   imports     job nhập hàng loạt ở trạng thái running quá MONITOR_IMPORT_STUCK_MINUTES (30).
#   invariants  apps/api/scripts/invariants.sql (nếu có): mã thoát khác 0 là có vi phạm, mỗi
#               dòng kết quả (psql -At) là một vi phạm.
# Mỗi kiểm tra lỗi gửi một cảnh báo (bị giới hạn theo OPS_ALERT_THROTTLE_SECONDS), hết lỗi thì
# gửi một thông báo phục hồi. Mọi kiểm tra đạt và có MONITOR_HEARTBEAT_URL thì ping URL đó.
# Cảnh báo chỉ mang tên kiểm tra, số vi phạm, mã thoát: không bao giờ gửi dữ liệu (dòng vi phạm,
# output lệnh) ra Telegram/webhook. Chi tiết ghi vào data/monitor-state/logs/<kiểm tra>.log.
# Mã thoát: 0 khi mọi kiểm tra đạt, 1 khi có kiểm tra lỗi.
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT" || exit 1
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}
compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

# Chỉ lấy các biến cần từ .env (định dạng env_file của compose, không source cả tệp như shell).
if [[ -f .env ]]; then
  while IFS= read -r line; do
    [[ $line =~ ^(OPS_ALERT_[A-Z_]+|MONITOR_[A-Z_]+)=(.*)$ ]] || continue
    value=${BASH_REMATCH[2]}
    value=${value%\"}
    value=${value#\"}
    [[ -n ${!BASH_REMATCH[1]:-} ]] || export "${BASH_REMATCH[1]}=$value"
  done <.env
fi
export OPS_ALERT_SOURCE=${OPS_ALERT_SOURCE:-kiotviet-lite}
export OPS_ALERT_STATE_DIR=${OPS_ALERT_STATE_DIR:-$ROOT/data/monitor-state}
mkdir -p "$OPS_ALERT_STATE_DIR"
# shellcheck source=lib/alert.sh
. "$ROOT/deploy/scripts/lib/alert.sh"

failed=0
LOG_DIR=$OPS_ALERT_STATE_DIR/logs
(umask 077 && mkdir -p "$LOG_DIR")

# $1 khóa, stdin là chi tiết: chỉ ghi nhật ký trên máy, không gửi đi. In đường dẫn nhật ký.
local_log() {
  local file=$LOG_DIR/$1.log
  { printf '=== %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"; cat; } >>"$file"
  chmod 600 "$file"
  printf '%s' "$file"
}

# $1 khóa, $2 mức, $3 tiêu đề, $4 nội dung khi lỗi. Gọi với $2=ok khi kiểm tra đạt.
report() {
  local key=$1 severity=$2 marker="$OPS_ALERT_STATE_DIR/failing.$1"
  if [[ $severity == ok ]]; then
    if [[ -f $marker ]]; then
      rm -f "$marker" "$OPS_ALERT_STATE_DIR/$key"
      OPS_ALERT_FORCE=1 ops_alert "$key" info "Đã phục hồi: $3" "Kiểm tra $key đạt trở lại."
    fi
    return 0
  fi
  failed=1
  touch "$marker"
  echo "[$severity] $key: $3" >&2
  ops_alert "$key" "$severity" "$3" "$4"
}

psql_in_db() {
  compose exec -T postgres sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' psql "$@"
}

check_health() {
  local out rc log
  out=$(compose exec -T api wget -qO- -T 5 http://127.0.0.1:3000/api/v1/health 2>&1)
  rc=$?
  if ((rc == 0)); then
    report monitor.health ok "API sẵn sàng"
  else
    log=$({ printf '%s\n' "$out"; compose ps 2>&1; } | local_log monitor.health)
    report monitor.health critical "API không sẵn sàng" \
      "Readiness /api/v1/health lỗi hoặc container api không chạy (mã thoát $rc). Chi tiết: $log"
  fi
}

check_backup() {
  local file=${MONITOR_BACKUP_STATUS_FILE:-$ROOT/data/backups/last-success.json}
  local max_hours=${MONITOR_BACKUP_MAX_AGE_HOURS:-26} age_hours
  if [[ ! -f $file ]]; then
    report monitor.backup error "Chưa có bản sao lưu đạt" "Không thấy $file. Kiểm tra service backup."
    return
  fi
  age_hours=$((($(date +%s) - $(stat -c %Y "$file" 2>/dev/null || stat -f %m "$file")) / 3600))
  if ((age_hours >= max_hours)); then
    report monitor.backup error "Bản sao lưu đạt gần nhất đã cũ ${age_hours} giờ" \
      "Ngưỡng ${max_hours} giờ. Xem $file và nhật ký service backup."
  else
    report monitor.backup ok "Bản sao lưu còn mới"
  fi
}

check_disk() {
  local max=${MONITOR_DISK_MAX_PCT:-85} used
  used=$(df -P "$ROOT/data" 2>/dev/null | awk 'NR == 2 { gsub("%", "", $5); print $5 }')
  if [[ -z $used ]]; then
    report monitor.disk warn "Không đọc được dung lượng đĩa" "df -P $ROOT/data không trả kết quả."
  elif ((used >= max)); then
    report monitor.disk warn "Đĩa đã dùng ${used}%" "Phân vùng chứa $ROOT/data vượt ngưỡng ${max}%. Sao lưu và ghi DB có thể hỏng khi đầy."
  else
    report monitor.disk ok "Dung lượng đĩa"
  fi
}

check_imports() {
  local minutes=${MONITOR_IMPORT_STUCK_MINUTES:-30} out log
  if ! out=$(psql_in_db -At -c "SELECT count(*) FROM bulk_import_jobs WHERE status = 'running' AND started_at < now() - interval '$minutes minutes'" 2>&1); then
    log=$(printf '%s\n' "$out" | local_log monitor.imports)
    report monitor.imports warn "Không kiểm được job nhập hàng loạt" "Chi tiết: $log"
  elif ((out > 0)); then
    report monitor.imports warn "$out job nhập chạy quá $minutes phút" \
      "Xem bảng bulk_import_jobs và log api (jobId) để biết job nào đang kẹt."
  else
    report monitor.imports ok "Job nhập hàng loạt"
  fi
}

check_invariants() {
  local file=$ROOT/apps/api/scripts/invariants.sql out rc log violations
  if [[ ! -f $file ]]; then
    echo "Bỏ qua bất biến: chưa có $file" >&2
    return
  fi
  out=$(psql_in_db -At -f - <"$file" 2>&1)
  rc=$?
  if ((rc == 0)); then
    report monitor.invariants ok "Bất biến dữ liệu"
  else
    # Dòng vi phạm có thể chứa dữ liệu khách hàng: chỉ đếm, nội dung nằm ở nhật ký trên máy.
    violations=$(printf '%s\n' "$out" | grep -c .)
    log=$(printf '%s\n' "$out" | local_log monitor.invariants)
    report monitor.invariants error "Bất biến dữ liệu bị lệch: $violations vi phạm" \
      "invariants.sql thoát mã $rc, $violations dòng kết quả. Chi tiết: $log"
  fi
}

checks=("$@")
[[ ${#checks[@]} -gt 0 ]] || checks=(health backup disk imports)
for check in "${checks[@]}"; do
  case $check in
    health | backup | disk | imports | invariants) "check_$check" ;;
    *) echo "Không biết kiểm tra '$check'" >&2; exit 64 ;;
  esac
done
# Dead man's switch: dịch vụ ngoài (healthchecks.io, Better Stack...) báo khi KHÔNG nhận được
# ping, tức là bắt được cả trường hợp host tắt hoặc cron ngừng chạy.
if ((failed == 0)) && [[ -n ${MONITOR_HEARTBEAT_URL:-} ]]; then
  printf 'url = "%s"\n' "$MONITOR_HEARTBEAT_URL" | curl -fsS -o /dev/null --max-time 10 -K - ||
    echo "Không ping được MONITOR_HEARTBEAT_URL" >&2
fi
exit "$failed"
