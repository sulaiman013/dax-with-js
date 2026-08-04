'use strict';
const { defineConfig } = require('@playwright/test');

/* Uses the installed Edge rather than downloading a Chromium build. */
module.exports = defineConfig({
  testDir: __dirname,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    channel: 'msedge',
    headless: true,
    /* Tall enough that the whole figure is on screen at once. elementFromPoint
       returns null below the fold, which reads as "foot is unclickable". */
    viewport: { width: 1200, height: 1300 },
    launchOptions: { args: ['--allow-file-access-from-files'] }
  }
});
