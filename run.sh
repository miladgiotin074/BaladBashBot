#!/usr/bin/env bash
# بلد باش — نصب، ساخت و اجرای اپ روی سرور لینوکس.
#
#   git clone https://github.com/miladgiotin074/BaladBashBot.git
#   cd BaladBashBot
#   bash run.sh
#
# بار اول اگر .env نباشد، از روی .env.example ساخته می‌شود و اسکریپت می‌ایستد
# تا BOT_TOKEN و WEBAPP_URL را پر کنید. بعد دوباره همین دستور را بزنید.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js و npm لازم است (نسخهٔ 22.18 یا بالاتر)."
  exit 1
fi

node -e 'const [maj, min] = process.versions.node.split(".").map(Number); if (maj < 22 || (maj === 22 && min < 18)) { console.error("Node.js 22.18 یا بالاتر لازم است. نسخهٔ فعلی: " + process.version); process.exit(1); }'

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "فایل .env ساخته شد. BOT_TOKEN و WEBAPP_URL را داخل آن پر کنید، بعد دوباره bash run.sh را اجرا کنید."
  exit 1
fi

if ! grep -qE '^BOT_TOKEN=.+' .env; then
  echo "BOT_TOKEN در .env خالی است. توکن را از @BotFather بگیرید، در .env بگذارید و دوباره اجرا کنید."
  exit 1
fi

if ! grep -qE '^WEBAPP_URL=https://.+' .env; then
  echo "هشدار: WEBAPP_URL باید یک آدرس https عمومی باشد تا دکمه‌های مینی‌اپ در تلگرام کار کنند."
fi

echo "نصب وابستگی‌ها..."
npm ci --include=dev

echo "ساخت مینی‌اپ..."
npm run build

echo "سرور بالا می‌آید. برای توقف Ctrl+C بزنید."
exec npm start
