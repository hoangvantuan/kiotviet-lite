/**
 * Dữ liệu mẫu (Test Data) phục vụ kiểm thử E2E
 * Các thông tin này đồng bộ trực tiếp với bộ dữ liệu khởi tạo (seed) trong `apps/api/src/db/seed.ts`.
 */

export interface SeedUser {
  phone: string
  password: string
  pin: string
  name: string
  role: 'owner' | 'manager' | 'staff'
}

export const SEED_USERS: Record<'owner' | 'manager' | 'staff', SeedUser> = {
  owner: {
    phone: '0901000001',
    password: 'matkhau123',
    pin: '111111',
    name: 'Nguyễn Văn An',
    role: 'owner',
  },
  manager: {
    phone: '0901000002',
    password: 'matkhau123',
    pin: '222222',
    name: 'Trần Thị Bình',
    role: 'manager',
  },
  staff: {
    phone: '0901000003',
    password: 'matkhau123',
    pin: '333333',
    name: 'Lê Minh Cường',
    role: 'staff',
  },
}

export const SAMPLE_STORE = {
  name: 'KiotViet Demo Store',
  address: '123 Nguyễn Huệ, Q.1, TP.HCM',
  phone: '02812345678',
}

export const SAMPLE_PRODUCTS = {
  simple: {
    sku: 'RC001',
    name: 'Cà rốt',
    price: 25000,
    cost: 18000,
    unit: 'Kg',
  },
  variant: {
    sku: 'CC001-330',
    name: 'Coca-Cola (330ml)',
    price: 10000,
    cost: 7000,
    unit: 'Lon',
  },
  unitConversion: {
    sku: 'SV001',
    name: 'Sữa tươi Vinamilk',
    price: 7000,
    cost: 4500,
    unit: 'Hộp',
  },
}
