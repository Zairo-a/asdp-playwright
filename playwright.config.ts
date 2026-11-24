import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config();

// Test yang mengubah data hanya jalan kalau ALLOW_WRITE=1
const bolehUbahData = process.env.ALLOW_WRITE === '1';
const abaikanUbah = bolehUbahData ? [] : ['**/*-ubah.spec.ts'];

export default defineConfig({
  testDir: './tests',
  workers: 1,
  retries: 1,
  timeout: 120_000,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['./rekap-reporter.ts'],
    ['./laporan-reporter.ts'],
  ],
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'api',
      testIgnore: [...abaikanUbah, 'ui/**'],
      use: {
        baseURL: 'https://dev.api.asdp.garudakreasi.com/api/',
      },
    },
    {
      name: 'ui',
      testMatch: 'ui/**/*.spec.ts',
      testIgnore: abaikanUbah,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'https://dev.core-next.asdp.garudakreasi.com',
        storageState: 'auth.json',
        timezoneId: 'Asia/Jakarta',
        viewport: { width: 1366, height: 768 },
        screenshot: 'only-on-failure',
      },
    },
  ],
}); 