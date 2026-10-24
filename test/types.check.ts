import { defineConfig } from '@playwright/test';

import type { LayoutGuardTestOptions } from '../src/index.js';

// Not a test: this file only has to compile. It is how a project sets the options of the guard for
// all its tests, in playwright.config.ts (the README shows the same lines).
export default defineConfig<LayoutGuardTestOptions>({
  use: {
    layoutGuard: { pageHeight: 'any', animations: 'allow', ignore: ['.ad-slot'] },
  },
});
