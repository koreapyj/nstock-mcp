// SPDX-FileCopyrightText: 2026 Yoonji Park <koreapyj@dcmys.kr>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync } from "node:fs";

// Load ./.env if present (real environment variables take precedence).
// Must be imported before any module that reads process.env at load time.
const file = process.env.DOTENV_PATH ?? ".env";
if (existsSync(file)) {
  try {
    process.loadEnvFile(file);
  } catch (e) {
    console.error(`[naver-stock-mcp] failed to load ${file}: ${(e as Error).message}`);
  }
}
