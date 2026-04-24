# Desired Emotional Response

## Mục tiêu cảm xúc chính

| Cảm xúc                | Khi nào                                             | Thiết kế hỗ trợ                                 |
| ---------------------- | --------------------------------------------------- | ----------------------------------------------- |
| **Tự tin & kiểm soát** | Nhân viên bán hàng không cần hỏi chủ về giá         | Nguồn giá hiển thị rõ cạnh mỗi dòng SP          |
| **Nhẹ nhõm**           | Chủ cửa hàng biết chính xác lãi lỗ, ai nợ bao nhiêu | Dashboard tổng quan, số liệu real-time          |
| **Hiệu quả**           | Hoàn thành đơn hàng nhanh hơn sổ tay                | Animation nhanh, feedback tức thì               |
| **An toàn**            | Bán hàng offline, dữ liệu không mất                 | Trạng thái sync rõ ràng, icon offline nhẹ nhàng |


## Bản đồ cảm xúc theo hành trình

```
Phát hiện app → Tò mò, hơi nghi ngờ
     ↓
Setup 5 phút → Bất ngờ ("Nhanh thật!")
     ↓
Bán đơn đầu tiên → Hào hứng + Tự tin
     ↓
Giá tự áp đúng → Tin tưởng ("Nó thông minh")
     ↓
Offline vẫn OK → An tâm
     ↓
Xem báo cáo cuối ngày → Nhẹ nhõm, kiểm soát
     ↓
Quay lại ngày mai → Quen thuộc, hiệu quả
```

## Vi cảm xúc cần chú ý

- **Tự tin > Bối rối** — nhân viên mới phải tự tin bán hàng sau 30 phút training. Giao diện phải tự giải thích
- **Tin tưởng > Nghi ngờ** — giá hiển thị phải rõ nguồn, nợ phải khớp, tồn kho phải chính xác
- **Thành tựu > Nản chí** — mỗi đơn xong có feedback tích cực nhẹ (animation check), không để user thấy "thêm 1 đơn nữa phải làm"
- **Bình tĩnh > Hoang mang** — khi offline, khi sync conflict, khi nợ vượt hạn mức — hệ thống xử lý nhẹ nhàng, không la lối

## Nguyên tắc thiết kế cảm xúc

1. **Feedback tức thì** — mọi thao tác đều có phản hồi trong < 100ms (haptic, visual, sound)
2. **Lỗi không đáng sợ** — error messages dùng ngôn ngữ bình thường, gợi ý cách sửa, không dùng mã lỗi
3. **Trạng thái luôn rõ** — user luôn biết: đang online/offline, đơn đã sync chưa, giá từ đâu
4. **Thành tích nhỏ** — cuối ngày dashboard hiện "Hôm nay bạn đã xử lý 47 đơn hàng" — tạo cảm giác productive

---
