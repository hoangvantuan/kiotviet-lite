# Báo cáo kết quả công việc: t3-pha3-auth

- **Task ID**: `task_f1e8d957182c`
- **Branch**: `hoangvantuan/t3-pha3-auth`
- **Người thực hiện**: Worker t3-pha3-auth
- **Ngày hoàn thành**: 2026-08-28

---

## 1. Danh sách thay đổi và file:dòng đã sửa

### 1. H10: Race condition trong Refresh Token Rotation (Tranh chấp phiên đăng nhập)

- **File**: `apps/api/src/services/auth.service.ts:190-256`
- **Gốc rễ đã xử lý**:
  - Trước đây: Kiểm tra trạng thái `revokedAt` thông qua câu lệnh `SELECT` riêng biệt trước khi `UPDATE` và `INSERT`. Khi hai yêu cầu refresh gửi cùng một token diễn ra đồng thời, cả hai đều đọc được `revokedAt = null`, dẫn đến việc cả hai cùng cấp phát token mới (sinh ra 2 phiên hợp lệ từ 1 token duy nhất).
  - Khắc phục tận gốc: Sử dụng cập nhật nguyên tử (atomic update) ở tầng cơ sở dữ liệu:
    `UPDATE refresh_tokens SET revoked_at = now(), replaced_by_token_hash = next_hash WHERE id = existing_id AND revoked_at IS NULL RETURNING id`
  - Nếu kết quả trả về rỗng (`affected = 0`): token đã bị thu hồi bởi yêu cầu đồng thời khác hoặc đã qua sử dụng trước đó (dấu hiệu tấn công phát lại - replay attack). Hệ thống lập tức thu hồi toàn bộ họ token (token family) của người dùng đó (`WHERE user_id = sub AND revoked_at IS NULL`), ghi log lỗi bảo mật và trả về mã lỗi 401 `UNAUTHORIZED` kèm mã chi tiết `reason: 'reuse'`.
  - Chỉ khi cập nhật nguyên tử thành công thì mới tiến hành chèn bản ghi token mới vào cơ sở dữ liệu.

### 2. M19: Grace period cho xác thực JWT (iss/aud)

- **File cấu hình môi trường**: `apps/api/src/lib/env.ts:74-76`
  - Bổ sung cấu hình `jwtGracePeriodDays` đọc từ biến môi trường `JWT_GRACE_PERIOD_DAYS` (mặc định là `0`).
- **File xử lý JWT**: `apps/api/src/lib/jwt.ts:56-118`
  - **Gốc rễ đã xử lý**: Việc bắt buộc các trường `iss` (issuer) và `aud` (audience) một cách tuyệt đối khiến toàn bộ token cũ được cấp trước thời điểm deploy bị từ chối với lỗi 401, làm gián đoạn phiên làm việc của người dùng.
  - Khắc phục tận gốc: Triển khai cơ chế xác thực có thời gian ân hạn (`verifyWithGrace`). Khi xác thực chuẩn thất bại do thiếu hoặc sai `iss`/`aud`, nếu `JWT_GRACE_PERIOD_DAYS > 0`, hàm sẽ tự động giải mã thử lại không bắt buộc `iss`/`aud`. Nếu hợp lệ, hệ thống ghi log cảnh báo (`logger.warn`) để quản trị viên theo dõi và vẫn chấp nhận phiên. Khi thời gian ân hạn kết thúc (cấu hình về `0`), các token thiếu `iss`/`aud` sẽ bị từ chối 401 như bình thường.

### 3. Tối ưu cấu hình kiểm thử (Vitest Workspace)

- **File**: `vitest.workspace.ts:28-75`
  - Bổ sung cấu hình thời gian chờ (`PGLITE_TIMEOUTS = 90_000`), `fileParallelism: false` và `maxForks: 1` cho project `api` cũng như áp dụng timeout cho `notifications` để đảm bảo bộ kiểm thử tích hợp sử dụng cơ sở dữ liệu PGlite WASM trong bộ nhớ chạy ổn định, không bị nghẽn tài nguyên CPU.

---

## 2. Kiểm thử tự động đã bổ sung

- **File kiểm thử mới**: `apps/api/src/__tests__/auth-h10-m19.integration.test.ts` (7 ca kiểm thử tích hợp chuyên biệt):
  1. `H10`: Hai yêu cầu refresh đồng thời cùng một token: chính xác một yêu cầu thành công, một yêu cầu nhận 401 với mã lỗi `reuse`.
  2. `H10`: Sau khi xảy ra tranh chấp đồng thời (race condition), toàn bộ token family của người dùng bị thu hồi.
  3. `H10`: Quy trình refresh tuần tự hoạt động bình thường, token cũ bị thu hồi khi có token mới.
  4. `H10`: Token đã dùng rồi khi được gửi lại sẽ kích hoạt phát hiện tái sử dụng và thu hồi toàn bộ token family.
  5. `M19`: Khi bật grace period (`JWT_GRACE_PERIOD_DAYS = 7`), token cũ thiếu `iss`/`aud` vẫn refresh thành công.
  6. `M19`: Khi tắt grace period (`JWT_GRACE_PERIOD_DAYS = 0`), token cũ thiếu `iss`/`aud` bị từ chối 401.
  7. `M19`: Token mới có đầy đủ `iss`/`aud` luôn hoạt động bình thường trong mọi trường hợp.
- **File kiểm thử hiện hữu**: `apps/api/src/__tests__/auth.integration.test.ts` (9 ca kiểm thử tích hợp) tiếp tục pass 100%.

---

## 3. Kết quả 4 lệnh xác minh

| Lệnh xác minh       | Kết quả                                            | Ghi chú                                                          |
| ------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| `pnpm lint`         | **THÀNH CÔNG (0 lỗi)**                             | 0 error, 6 warnings (từ các file UI không liên quan)             |
| `pnpm -r typecheck` | **THÀNH CÔNG**                                     | 4/4 packages (shared, web, notifications, api) không có lỗi kiểu |
| `pnpm test`         | **THÀNH CÔNG (89/89 test files, 1314/1314 tests)** | Toàn bộ các bộ kiểm thử đều xanh 100%                            |
| `pnpm -r build`     | **THÀNH CÔNG**                                     | Đóng gói production thành công cho toàn bộ ứng dụng              |

---

## 4. Việc còn lại và rủi ro còn tồn

- **Việc còn lại**: Không còn việc tồn đọng trong phạm vi task t3-pha3-auth.
- **Rủi ro và lưu ý vận hành**:
  - Khi triển khai lên môi trường thực tế cần đặt biến môi trường `JWT_GRACE_PERIOD_DAYS` (ví dụ: `7`) trong tuần đầu tiên nếu muốn duy trì phiên đăng nhập của người dùng từ trước đợt nâng cấp, sau đó hạ về `0` để khóa chặt tính năng kiểm tra `iss`/`aud`.
  - Giữ nguyên branch hiện tại, không tự ý merge vào `main` hay push remote theo đúng quy định điều phối.
