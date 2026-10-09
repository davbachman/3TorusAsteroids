import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  workers: 1,
  use: {
    viewport: {width:1280,height:720},
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'],
    },
    trace: 'retain-on-failure',
  },
  projects: [
    {name:'chromium', testIgnore:'preview.spec.ts', use:{baseURL:'http://127.0.0.1:5180'}},
    {name:'preview', testMatch:'preview.spec.ts', use:{baseURL:'http://127.0.0.1:4180/3TorusAsteroids/'}},
  ],
  webServer: [
    {command:'npm run dev -- --port 5180 --strictPort', url:'http://127.0.0.1:5180',reuseExistingServer:!process.env.CI},
    {command:'npm run preview -- --port 4180 --strictPort',url:'http://127.0.0.1:4180/3TorusAsteroids/',reuseExistingServer:!process.env.CI},
  ],
});
