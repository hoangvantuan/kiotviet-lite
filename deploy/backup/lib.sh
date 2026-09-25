# shellcheck shell=bash
# Hàm dùng chung cho backup.sh và restore.sh (source, không chạy trực tiếp).
# Được test ở packages/notifications/src/__tests__/backup-lib-shell.test.ts.

# Đọc danh sách tên tệp (mới nhất trước) từ stdin, in các tên cần xóa theo quy tắc ông-cha-con:
# giữ bản mới nhất của mỗi ngày trong KEEP_DAYS ngày gần nhất có sao lưu, của mỗi tuần ISO trong
# KEEP_WEEKS tuần, của mỗi tháng trong KEEP_MONTHS tháng. Tên không đúng mẫu
# <PREFIX>YYYYMMDDTHHMMSSZ.tar[.age] bị bỏ qua (không bao giờ bị xóa).
# Viết bằng awk (tự tính tuần ISO) để chạy như nhau trên busybox, GNU và macOS.
retention_victims() {
  awk -v prefix="${PREFIX:?}" -v keep_d="${KEEP_DAYS:?}" -v keep_w="${KEEP_WEEKS:?}" \
    -v keep_m="${KEEP_MONTHS:?}" '
    function civil_days(y, m, d,   era, yoe, doy, doe) {
      y -= (m <= 2)
      era = int(y / 400)
      yoe = y - era * 400
      doy = int((153 * (m > 2 ? m - 3 : m + 9) + 2) / 5) + d - 1
      doe = yoe * 365 + int(yoe / 4) - int(yoe / 100) + doy
      return era * 146097 + doe - 719468
    }
    function iso_week(y, m, d,   n, wd, th, iy) {
      n = civil_days(y, m, d)
      wd = (n + 3) % 7          # 1970-01-01 là thứ Năm; 0 = thứ Hai
      th = n - wd + 3           # thứ Năm của tuần này quyết định năm ISO
      iy = y
      if (th < civil_days(iy, 1, 1)) iy--
      else if (th >= civil_days(iy + 1, 1, 1)) iy++
      return sprintf("%04d-W%02d", iy, int((th - civil_days(iy, 1, 1)) / 7) + 1)
    }
    {
      name = $0
      if (index(name, prefix) != 1) next
      rest = substr(name, length(prefix) + 1)
      if (rest !~ /^[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z\.tar(\.age)?$/) next
      day = substr(rest, 1, 8)
      month = substr(rest, 1, 6)
      week = iso_week(substr(rest, 1, 4) + 0, substr(rest, 5, 2) + 0, substr(rest, 7, 2) + 0)
      keep = 0
      if (!(day in seen_d)) { seen_d[day] = 1; if (++nd <= keep_d) keep = 1 }
      if (!(week in seen_w)) { seen_w[week] = 1; if (++nw <= keep_w) keep = 1 }
      if (!(month in seen_m)) { seen_m[month] = 1; if (++nm <= keep_m) keep = 1 }
      if (!keep) print name
    }'
}

# In "schema.bảng|số dòng" cho mọi bảng thường, sắp xếp ổn định. $1 là DB, $2 (tùy chọn) là
# snapshot đã export để đếm đúng trong snapshot của bản dump.
count_rows() {
  psql -X -q -At -v ON_ERROR_STOP=1 -v snapshot="${2:-}" -d "$1" <<'SQL' | LC_ALL=C sort
SELECT :'snapshot' <> '' AS has_snapshot \gset
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
\if :has_snapshot
SET TRANSACTION SNAPSHOT :'snapshot';
\endif
SELECT format('SELECT %L || ''|'' || count(*) FROM %I.%I', n.nspname || '.' || c.relname, n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg\_toast%' AND n.nspname NOT LIKE 'pg\_temp%'
ORDER BY 1 \gexec
COMMIT;
SQL
}

# Tên DB hợp lệ cho các thao tác của script: chữ thường, số, gạch dưới, tối đa 40 ký tự
# (chừa chỗ cho hậu tố _old_<mốc> trong giới hạn 63 ký tự của Postgres).
valid_db_name() {
  [[ $1 =~ ^[a-z_][a-z0-9_]{0,39}$ ]]
}
