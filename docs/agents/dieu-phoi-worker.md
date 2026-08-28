# Quy trình điều phối worker đa tác tử (Orca + agy)

Tài liệu này ghi lại quy trình đã kiểm chứng khi dùng Orca orchestration điều phối worker `agy`
(Antigravity CLI) để hoàn thiện kiotviet-lite. Ghi để lần sau không phải dò lại từ đầu.

## 1. Ràng buộc thực tế đã phát hiện

| Vấn đề                                                                    | Biểu hiện                                                                | Cách xử lý                                                                                                             |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `agy` không nhận `--effort` với model Claude                              | Tự lùi về Gemini Flash, không báo lỗi rõ                                 | Bỏ `--effort` khi dùng model Claude                                                                                    |
| Orca `worker-start --agent antigravity --model`                           | Báo `Agent antigravity does not support launch-time model selection`     | Tạo terminal bằng `terminal create --command "agy --model <id> --dangerously-skip-permissions"`                        |
| `agy` hỏi tin cậy thư mục ở mỗi worktree mới                              | Orca đọc scrollback thấy prompt trust nên coi terminal bị chặn vĩnh viễn | Thêm đường dẫn worktree vào `trustedWorkspaces` trong `~/.gemini/antigravity-cli/settings.json` TRƯỚC khi tạo terminal |
| `dispatch --inject` và `worker-start` giao prompt không tin cậy cho `agy` | `agent_prompt_stalled`, capability bị thu hồi, `worker_done` bị từ chối  | Ghi đặc tả ra file rồi `terminal send` một dòng ngắn trỏ tới file                                                      |
| Prompt dài bị mất khi paste                                               | Prompt khoảng 900 byte không tới nơi, dưới 300 byte thì tới              | Luôn để nội dung dài trong file, gửi câu ngắn                                                                          |
| Prompt gửi ngay sau khi TUI khởi động đôi khi rơi mất                     | Màn hình trống dù `send ok=true`                                         | Kiểm tra lại sau ít giây, gửi lại nếu cần                                                                              |

## 2. Nút thắt tài nguyên (quan trọng nhất)

Bộ test tích hợp dựng PGlite trong bộ nhớ cho từng file nên rất ngốn CPU. Máy 12 lõi mà 3 worker cùng chạy
`pnpm test` sẽ đẩy load lên hơn 40, khiến mọi lượt test chậm tới mức không bao giờ kết thúc (đã ghi nhận một
lượt treo hơn 7 giờ, sau khi dừng và chạy lại đúng một lệnh thì chỉ mất 8 giây).

Quy tắc bắt buộc:

- Worker CHỈ chạy test phạm vi hẹp của mình: `pnpm vitest run --project api src/__tests__/<file>.test.ts`
- Worker vẫn chạy đủ `pnpm lint`, `pnpm -r typecheck`, `pnpm -r build` (đều nhẹ)
- CHỈ coordinator chạy `pnpm test` đầy đủ, mỗi lần một lượt, trên nhánh main sau khi merge
- Không bao giờ chạy hai lệnh test song song trong cùng một worker

## 3. Quy trình khởi một worker

```bash
# 1. Tạo worktree từ main hiện tại (KHÔNG để mặc định origin/main vì có thể thiếu commit chưa push)
orca worktree create --name <ten> --no-parent --repo id:<repo-id> --base-branch main --setup run --json

# 2. Pre-trust worktree cho agy (sửa trustedWorkspaces trong settings.json)

# 3. Tạo terminal agent với model mong muốn
orca terminal create --worktree "id:<full-worktree-id>" --title <ten> \
  --command "agy --model gemini-3.7-flash-high --dangerously-skip-permissions" --json

# 4. Chờ sẵn sàng
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 120000 --json

# 5. Ghi đặc tả ra /tmp/spec-<ten>.md rồi gửi một dòng ngắn
orca terminal send --terminal <handle> --text "Doc file /tmp/spec-<ten>.md roi thuc hien day du theo do." --enter --json
```

## 4. Theo dõi worker

Vì lifecycle `worker_done` của Orca không dùng được với `agy`, coordinator theo dõi bằng commit trong branch
cộng trạng thái màn hình. Một worker được coi là CÒN CHẠY khi màn hình chứa bất kỳ dấu hiệu nào:
`esc to cancel`, `task(s)`, `subagent(s)`, `Working...`, `Generating...`, `Loading...`, `running`.
Thiếu dấu hiệu nào cũng dẫn tới báo "đã xong" sai.

## 5. Nguyên tắc review trước khi merge

Mỗi nhánh phải qua review của coordinator, không merge thẳng. Những lỗi đã bắt được nhờ bước này:

- Grace period JWT chỉ là công tắc bật/tắt, không có thời hạn thật
- Hoàn tiền làm tròn xuống hai lần khiến khách trả hết hàng không nhận đủ tiền
- Thêm phân trang báo cáo tồn kho làm xuất CSV rớt còn 20 dòng và giao diện mất dữ liệu
- Bộ lọc ngày dùng `new Date('YYYY-MM-DD')` bị hiểu là UTC, lệch 7 giờ
- Job CI đặt sai tên biến secret khiến API không khởi động được

Sau mỗi lần merge, coordinator chạy `pnpm test` đầy đủ trên main để chắc các nhánh không phá nhau.
