import { expect, type Page, test as base } from '@playwright/test'

import { SEED_USERS, type SeedUser } from '../helpers/test-data'

/**
 * Trợ giúp đăng nhập qua giao diện người dùng
 */
export async function loginViaUI(page: Page, phone: string, pass: string) {
  await page.goto('/login')
  const phoneInput = page.locator('#phone')
  await expect(phoneInput).toBeVisible({ timeout: 10000 })
  await phoneInput.fill(phone)

  const passwordInput = page.locator('#password')
  await passwordInput.fill(pass)

  const submitBtn = page.getByRole('button', { name: /Đăng nhập|Dang nhap/i })
  if (await submitBtn.isEnabled().catch(() => false)) {
    await submitBtn.click()
  } else {
    await passwordInput.press('Enter')
  }
}

/**
 * Đăng nhập nhanh theo vai trò người dùng seed
 */
export async function loginAsRole(page: Page, role: 'owner' | 'manager' | 'staff') {
  const user = SEED_USERS[role]
  await loginViaUI(page, user.phone, user.password)
  await expect(
    page.getByText(new RegExp(`Xin chào, ${user.name}|${user.name}`, 'i')).first(),
  ).toBeVisible({ timeout: 15000 })
}

export type AuthFixtures = {
  loginAs: (role: 'owner' | 'manager' | 'staff') => Promise<SeedUser>
  authenticatedPage: Page
}

export const test = base.extend<AuthFixtures>({
  loginAs: async ({ page }, use) => {
    await use(async (role: 'owner' | 'manager' | 'staff') => {
      const user = SEED_USERS[role]
      await loginAsRole(page, role)
      return user
    })
  },
  authenticatedPage: async ({ page }, use) => {
    await loginAsRole(page, 'owner')
    await use(page)
  },
})

export { expect }
