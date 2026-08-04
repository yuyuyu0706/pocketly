const config = {
  reporter: [['list']],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:8000/',
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  use: {
    baseURL: 'http://127.0.0.1:8000/',
    headless: true,
    launchOptions: {
      executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    },
  },
};

module.exports = config;
