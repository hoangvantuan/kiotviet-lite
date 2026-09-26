/**
 * POS-07: mã BIN NAPAS của các ngân hàng phổ biến, để chủ cửa hàng chọn nhanh khi khai báo tài
 * khoản nhận tiền và để POS hiện tên ngân hàng dưới mã QR. Ngân hàng khác vẫn nhập tay BIN.
 */
export const COMMON_BANK_BINS: ReadonlyArray<{ bin: string; name: string }> = [
  { bin: '970436', name: 'Vietcombank' },
  { bin: '970415', name: 'VietinBank' },
  { bin: '970418', name: 'BIDV' },
  { bin: '970405', name: 'Agribank' },
  { bin: '970407', name: 'Techcombank' },
  { bin: '970422', name: 'MB Bank' },
  { bin: '970416', name: 'ACB' },
  { bin: '970432', name: 'VPBank' },
  { bin: '970423', name: 'TPBank' },
  { bin: '970403', name: 'Sacombank' },
  { bin: '970441', name: 'VIB' },
  { bin: '970443', name: 'SHB' },
  { bin: '970437', name: 'HDBank' },
  { bin: '970448', name: 'OCB' },
  { bin: '970426', name: 'MSB' },
  { bin: '970440', name: 'SeABank' },
  { bin: '970431', name: 'Eximbank' },
  { bin: '970449', name: 'LPBank' },
]

export function bankShortName(bin: string): string {
  return COMMON_BANK_BINS.find((b) => b.bin === bin)?.name ?? `Ngân hàng ${bin}`
}
