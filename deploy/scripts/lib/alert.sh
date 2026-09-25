#!/bin/sh
# Gửi cảnh báo vận hành qua Telegram và/hoặc webhook, cùng định dạng với
# packages/notifications/src/ops-alert.ts (API). Dùng cho backup và monitor.sh.
#
#   . deploy/scripts/lib/alert.sh
#   ops_alert <key> <info|warn|error|critical> "<tiêu đề>" "<nội dung>"
#
# Biến môi trường (giống API): OPS_ALERT_ENABLED, OPS_ALERT_SOURCE,
# OPS_ALERT_TELEGRAM_BOT_TOKEN, OPS_ALERT_TELEGRAM_CHAT_ID, OPS_ALERT_WEBHOOK_URL,
# OPS_ALERT_WEBHOOK_SECRET, OPS_ALERT_THROTTLE_SECONDS (mặc định 900),
# OPS_ALERT_STATE_DIR (nơi nhớ lần gửi cuối theo khóa; để trống thì không throttle).
# Không bao giờ làm script gọi nó thất bại: lỗi gửi chỉ in ra stderr.

ops_alert_json_escape() {
  # Chuỗi JSON: thoát \ " tab CR, bỏ ký tự điều khiển khác, xuống dòng thành \n. Dùng sed cho
  # phần thay thế vì cách awk hiểu "\\" trong gsub khác nhau giữa busybox, mawk và BSD awk.
  _tab=$(printf '\t')
  _cr=$(printf '\r')
  printf '%s' "$1" | tr -d '\000-\010\013\014\016-\037' |
    sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e "s/$_tab/\\\\t/g" -e "s/$_cr/\\\\r/g" |
    awk '{ printf "%s%s", (NR > 1 ? "\\n" : ""), $0 }'
}

# HMAC-SHA256(khóa $1, dữ liệu stdin) dạng hex theo RFC 2104, chỉ dùng `openssl dgst` không
# khóa: khóa đi qua builtin printf và stdin của od, không bao giờ nằm trên dòng lệnh của tiến
# trình nào (openssl -hmac <khóa> sẽ lộ khóa qua ps, /proc/<pid>/cmdline).
ops_alert_hmac_sha256() {
  _k=$(printf '%s' "$1" | od -An -v -tx1 | tr -d ' \n')
  # Khóa dài hơn một khối (64 byte) thì dùng băm của nó.
  if [ "${#_k}" -gt 128 ]; then
    _k=$(printf '%s' "$1" | openssl dgst -sha256 -hex | sed 's/^.*= //')
  fi
  _ipad=""
  _opad=""
  _i=0
  while [ "$_i" -lt 64 ]; do
    if [ -n "$_k" ]; then
      _b=${_k%"${_k#??}"}
      _k=${_k#??}
    else
      _b=00
    fi
    _ipad="$_ipad\\$(printf '%03o' $((0x$_b ^ 0x36)))"
    _opad="$_opad\\$(printf '%03o' $((0x$_b ^ 0x5c)))"
    _i=$((_i + 1))
  done
  # shellcheck disable=SC2059 # định dạng là chuỗi thoát bát phân tự sinh ở trên
  {
    printf "$_opad"
    { printf "$_ipad"; cat; } | openssl dgst -sha256 -binary
  } | openssl dgst -sha256 -hex | sed 's/^.*= //'
}

ops_alert_post() {
  # $1 url, $2 body, các tham số còn lại là header "Tên: giá trị". URL qua stdin (curl -K)
  # để bot token không lộ trong danh sách tiến trình.
  _url=$1
  _body=$2
  shift 2
  _cfg="url = \"$_url\""
  for _h in "$@"; do _cfg="$_cfg
header = \"$_h\""; done
  printf '%s\n' "$_cfg" | curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
    -X POST --data-binary "$_body" -K - 2>/dev/null
}

ops_alert() {
  _key=$1
  _severity=$2
  _title=$3
  _text_body=$4
  [ "$(printf '%s' "${OPS_ALERT_ENABLED:-}" | tr 'A-Z' 'a-z')" = "false" ] && return 0
  _tg=""
  if [ -n "${OPS_ALERT_TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${OPS_ALERT_TELEGRAM_CHAT_ID:-}" ]; then _tg=1; fi
  _wh=""
  case "${OPS_ALERT_WEBHOOK_URL:-}" in https://*) _wh=1 ;; esac
  if [ -z "$_tg" ] && [ -z "$_wh" ]; then
    echo "ops_alert: chưa cấu hình đích cảnh báo, bỏ qua: [$_severity] $_title" >&2
    return 0
  fi

  _now=$(date +%s)
  _state=""
  if [ -n "${OPS_ALERT_STATE_DIR:-}" ]; then
    mkdir -p "$OPS_ALERT_STATE_DIR" 2>/dev/null
    _state="$OPS_ALERT_STATE_DIR/$(printf '%s' "$_key" | tr -c 'A-Za-z0-9._-' '_')"
    if [ -f "$_state" ] && [ "${OPS_ALERT_FORCE:-}" != "1" ]; then
      _last=$(cat "$_state" 2>/dev/null || echo 0)
      if [ $((_now - _last)) -lt "${OPS_ALERT_THROTTLE_SECONDS:-900}" ]; then return 0; fi
    fi
  fi

  _source=${OPS_ALERT_SOURCE:-kiotviet-lite}
  _badge=$(printf '%s' "$_severity" | tr 'a-z' 'A-Z')
  _at=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
  _text="[$_badge] $_source: $_title
$_text_body

$_at"
  _ok=""

  if [ -n "$_tg" ]; then
    _api=${OPS_ALERT_TELEGRAM_API:-https://api.telegram.org}
    _payload="{\"chat_id\":\"$(ops_alert_json_escape "$OPS_ALERT_TELEGRAM_CHAT_ID")\",\"text\":\"$(ops_alert_json_escape "$_text")\",\"disable_web_page_preview\":true}"
    _code=$(ops_alert_post "$_api/bot$OPS_ALERT_TELEGRAM_BOT_TOKEN/sendMessage" "$_payload" \
      "Content-Type: application/json")
    case "$_code" in 2??) _ok=1 ;; *) echo "ops_alert: Telegram lỗi HTTP ${_code:-000}" >&2 ;; esac
  fi

  if [ -n "$_wh" ]; then
    _payload="{\"source\":\"$(ops_alert_json_escape "$_source")\",\"key\":\"$(ops_alert_json_escape "$_key")\",\"severity\":\"$_severity\",\"title\":\"$(ops_alert_json_escape "$_title")\",\"body\":\"$(ops_alert_json_escape "$_text_body")\",\"text\":\"$(ops_alert_json_escape "$_text")\",\"occurredAt\":\"$_at\"}"
    _nonce=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen 2>/dev/null || echo "$_now-$$")
    set -- "Content-Type: application/json" "X-KVL-Timestamp: $_at" "X-KVL-Nonce: $_nonce"
    if [ -n "${OPS_ALERT_WEBHOOK_SECRET:-}" ]; then
      _sig=$(printf '%s' "$_at.$_nonce.$_payload" | ops_alert_hmac_sha256 "$OPS_ALERT_WEBHOOK_SECRET")
      set -- "$@" "X-KVL-Signature: $_sig"
    fi
    _code=$(ops_alert_post "$OPS_ALERT_WEBHOOK_URL" "$_payload" "$@")
    case "$_code" in 2??) _ok=1 ;; *) echo "ops_alert: webhook lỗi HTTP ${_code:-000}" >&2 ;; esac
  fi

  # Gửi hỏng hết thì không ghi mốc throttle, lần chạy sau thử lại.
  if [ -n "$_ok" ] && [ -n "$_state" ]; then echo "$_now" >"$_state"; fi
  return 0
}

# Chạy trực tiếp: sh alert.sh <key> <severity> <title> <body>
case "${0##*/}" in
  alert.sh) [ $# -ge 4 ] && ops_alert "$@" ;;
esac
