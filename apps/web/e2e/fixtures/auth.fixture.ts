import { expect, type Page, test as base } from '@playwright/test'

import { SEED_USERS, type SeedUser } from '../helpers/test-data'

/**
 * Trợ giúp đăng nhập qua giao diện người dùng
 */
export async function loginViaUI(page: Page, phone: string, pass: string) {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeVisible()

  await page.locator('#phone').fill(phone)
  await page.locator('#password').fill(pass)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
}

/**
 * Đăng nhập nhanh theo vai trò người dùng seed
 */
export async function loginAsRole(page: Page, role: 'owner' | 'manager' | 'staff') {
  const user = SEED_USERS[role]
  await loginViaUI(page, user.phone, user.password)
  await page.waitForURL('**/')
  await expect(page.getByText(`Xin chào, ${user.name}`)).toBeVisible({ timeout: 10000 })
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
