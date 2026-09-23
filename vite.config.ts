import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: '/crypto-lab-air-stream/',
  test: {
    include: ['src/**/*.test.ts'],
  },
})