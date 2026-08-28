/**
 * Biểu thức chính quy (regular expression) dùng chung cho toàn bộ hệ thống.
 */

/**
 * Regex kiểm tra số điện thoại tổng quát (khách hàng, nhà cung cấp, đối tác).
 * Cho phép dấu + ở đầu và các chữ số tiếp theo.
 */
export const PHONE_REGEX = /^\+?[0-9]+$/

/**
 * Regex kiểm tra số điện thoại di động Việt Nam chuẩn (10 số, bắt đầu bằng 03, 05, 07, 08, 09).
 * Dùng cho đăng nhập, đăng ký tài khoản nhân viên / chủ cửa hàng.
 */
export const VN_PHONE_REGEX = /^0(3|5|7|8|9)\d{8}$/

/**
 * Regex kiểm tra mã số thuế (chữ cái, chữ số, dấu gạch nối).
 */
export const TAX_ID_REGEX = /^[A-Za-z0-9-]+$/

/**
 * Regex kiểm tra tên hợp lệ (chữ cái mọi ngôn ngữ có dấu, chữ số, khoảng trắng, các ký tự phân cách cơ bản).
 */
export const NAME_REGEX = /^[\p{L}\p{N}\s\-_&()'./,]+$/u
