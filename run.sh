#!/usr/bin/env bash
# بلد باش — نصب پیش‌نیازها، ساخت و اجرای اپ روی سرور لینوکس.
#
#   git clone https://github.com/miladgiotin074/BaladBashBot.git
#   cd BaladBashBot
#   bash run.sh
#
# اگر Node.js 22.18 یا جدیدتر نباشد، اسکریپت آن را نصب می‌کند.
# توکن، دامنه و بقیهٔ تنظیمات را می‌پرسد، برای دامنه گواهی SSL می‌گیرد
# و اپ را به‌صورت سرویس systemd اجرا می‌کند تا با بستن ترمینال قطع نشود.
# رکورد A دامنه باید به آی‌پی این سرور اشاره کند.
# برای تغییر تنظیمات بعدی: bash run.sh --config
set -euo pipefail
cd "$(dirname "$0")"

export PATH="/usr/local/bin:${HOME}/.local/bin:${PATH}"

RECONFIG=false
if [[ "${1:-}" == "--config" ]]; then
  RECONFIG=true
fi

log() {
  printf '%s\n' "$*"
}

note() {
  printf '%s\n' "$*" >&2
}

env_get() {
  local key="$1" line
  [[ -f .env ]] || return 0
  line=$(grep -E "^${key}=" .env | tail -n 1 || true)
  [[ -n "$line" ]] || return 0
  line=${line#"${key}="}
  line=${line%$'\r'}
  if [[ ${line:0:1} == '"' && ${line: -1} == '"' ]]; then
    line=${line:1:${#line}-2}
    line=${line//\\\"/\"}
    line=${line//\\\\/\\}
  elif [[ ${line:0:1} == "'" && ${line: -1} == "'" ]]; then
    line=${line:1:${#line}-2}
  fi
  printf '%s' "$line"
}

env_quote() {
  local value="$1"
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\n'/}
  value=${value//$'\r'/}
  printf '"%s"' "$value"
}

valid_domain() {
  local host="$1"
  [[ "$host" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$ ]] \
    && [[ "$host" =~ \.[A-Za-z]{2,}$ ]]
}

trim() {
  local value="$1"
  value=${value#"${value%%[![:space:]]*}"}
  value=${value%"${value##*[![:space:]]}"}
  printf '%s' "$value"
}

ask_line() {
  local label="$1" default="${2:-}" value
  if [[ -n "$default" ]]; then
    read -r -p "${label} [${default}]: " value
  else
    read -r -p "${label}: " value
  fi
  value=$(trim "${value:-$default}")
  if [[ "$value" == "-" ]]; then
    value=""
  fi
  printf '%s' "$value"
}

ask_bool() {
  local label="$1" default="${2:-false}" hint="y/N" value
  [[ "$default" == "true" ]] && hint="Y/n"
  read -r -p "${label} [${hint}]: " value
  value=$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')
  case "$(trim "$value")" in
    y | yes | true | 1 | بله) printf 'true' ;;
    n | no | false | 0 | خیر) printf 'false' ;;
    *) printf '%s' "$default" ;;
  esac
}

config_is_ready() {
  local token url
  token=$(env_get BOT_TOKEN)
  url=$(env_get WEBAPP_URL)
  [[ -n "$token" && "$url" == https://* ]]
}

configure_env() {
  local token url port admins miniapp stars proxy delay hours dbpath apiroot

  if [[ "$RECONFIG" != true ]] && config_is_ready; then
    log "تنظیمات .env موجود است. برای تغییر: bash run.sh --config"
    return 0
  fi

  if [[ ! -t 0 ]]; then
    log "توکن و دامنه داخل .env نیست و این اجرا ترمینال تعاملی ندارد."
    exit 1
  fi

  note ""
  note "تنظیمات ربات را وارد کنید. Enter مقدار داخل براکت را نگه می‌دارد و - مقدار اختیاری را پاک می‌کند."
  note "رکورد A دامنه باید از قبل به آی‌پی این سرور اشاره کند. گواهی SSL خودکار گرفته می‌شود."
  note ""

  token=$(env_get BOT_TOKEN)
  while true; do
    token=$(ask_line "توکن ربات از @BotFather" "$token")
    if [[ ${#token} -ge 30 && "$token" =~ ^[0-9]+:[A-Za-z0-9_-]+$ ]]; then
      break
    fi
    note "توکن نامعتبر است. نمونه: 123456789:AA... از @BotFather"
    token=""
  done

  url=$(env_get WEBAPP_URL)
  url=${url#https://}
  url=${url#http://}
  while true; do
    url=$(ask_line "دامنهٔ عمومی مینی‌اپ (مثال bot.example.com)" "$url")
    url=${url#https://}
    url=${url#http://}
    url=${url%/}
    if valid_domain "$url"; then
      url="https://${url}"
      break
    fi
    note "یک دامنهٔ واقعی وارد کنید، مثلاً bot.example.com. آی‌پی قبول نمی‌شود؛ SSL روی پورت ۴۴۳ گرفته می‌شود."
    url=""
  done

  port=$(env_get PORT)
  port=${port:-3000}
  while true; do
    port=$(ask_line "پورت داخلی سرور" "$port")
    if [[ "$port" =~ ^[0-9]+$ ]] && ((10#$port >= 1 && 10#$port <= 65535)); then
      break
    fi
    note "پورت باید عددی بین ۱ و ۶۵۵۳۵ باشد."
    port="3000"
  done

  admins=$(env_get ADMIN_IDS)
  while true; do
    admins=$(ask_line "شناسهٔ عددی ادمین‌ها، با ویرگول (اختیاری)" "$admins")
    admins=${admins// /}
    if [[ -z "$admins" || "$admins" =~ ^[0-9]+(,[0-9]+)*$ ]]; then
      break
    fi
    note "فقط عدد تلگرام، و اگر چند نفر هستند با ویرگول جدا کنید."
    admins=""
  done

  local email
  email=$(env_get LETSENCRYPT_EMAIL)
  while true; do
    email=$(ask_line "ایمیل برای گواهی SSL (Enter بدون ایمیل)" "$email")
    if [[ -z "$email" || "$email" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; then
      break
    fi
    note "ایمیل نامعتبر است."
    email=""
  done

  miniapp=$(ask_bool "Main Mini App در BotFather فعال است؟" "$(env_get MAIN_MINIAPP)")
  [[ -z "$miniapp" ]] && miniapp=false
  stars=$(ask_bool "فروش سکه با ستارهٔ تلگرام فعال باشد؟" "$(env_get STARS_SHOP)")
  [[ -z "$stars" ]] && stars=false
  proxy=$(env_get PROXY_URL)
  while true; do
    proxy=$(ask_line "پروکسی تلگرام، اگر لازم است (مثال socks5://127.0.0.1:1080)" "$proxy")
    if [[ -z "$proxy" || "$proxy" =~ ^(https?|socks5?)://[^[:space:]]+$ ]]; then
      break
    fi
    note "پروکسی نامعتبر است. خالی بگذارید یا آدرسی مثل socks5://127.0.0.1:1080 وارد کنید."
    proxy=""
  done

  delay=$(env_get BOT_JOIN_DELAY_SEC)
  delay=${delay:-20}
  hours=$(env_get TURN_TIMEOUT_HOURS)
  hours=${hours:-24}
  dbpath=$(env_get DB_PATH)
  dbpath=${dbpath:-./data/baladbash.db}
  apiroot=$(env_get TELEGRAM_API_ROOT)

  local tmp
  tmp=$(mktemp)
  cat > "$tmp" <<EOF
# تنظیمات ربات «بلد باش» — ساخته‌شده با run.sh
BOT_TOKEN=$(env_quote "$token")
WEBAPP_URL=$(env_quote "$url")
LETSENCRYPT_EMAIL=$(env_quote "$email")
PORT=$(env_quote "$port")
ADMIN_IDS=$(env_quote "$admins")
MAIN_MINIAPP=$(env_quote "$miniapp")
STARS_SHOP=$(env_quote "$stars")
BOT_JOIN_DELAY_SEC=$(env_quote "$delay")
TURN_TIMEOUT_HOURS=$(env_quote "$hours")
DB_PATH=$(env_quote "$dbpath")
PROXY_URL=$(env_quote "$proxy")
TELEGRAM_API_ROOT=$(env_quote "$apiroot")
DEV_AUTH="false"
EOF
  mv "$tmp" .env
  chmod 600 .env
  log "تنظیمات در .env ذخیره شد. آدرس مینی‌اپ: ${url}"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

as_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  elif need_cmd sudo; then
    sudo "$@"
  else
    return 1
  fi
}

node_is_ready() {
  need_cmd node && need_cmd npm || return 1
  node -e 'const [maj, min] = process.versions.node.split(".").map(Number); process.exit(maj > 22 || (maj === 22 && min >= 18) ? 0 : 1)'
}

install_os_packages() {
  if need_cmd curl && need_cmd tar && need_cmd xz; then
    return 0
  fi

  log "نصب ابزارهای پایه (curl، tar، xz)..."
  if need_cmd apt-get; then
    as_root env DEBIAN_FRONTEND=noninteractive apt-get update -y
    as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl xz-utils tar
  elif need_cmd dnf; then
    as_root dnf install -y ca-certificates curl xz tar
  elif need_cmd yum; then
    as_root yum install -y ca-certificates curl xz tar
  elif need_cmd apk; then
    as_root apk add --no-cache ca-certificates curl xz tar gcompat libstdc++
  elif need_cmd pacman; then
    as_root pacman -Sy --noconfirm ca-certificates curl xz tar
  elif need_cmd zypper; then
    as_root zypper --non-interactive install ca-certificates curl xz tar
  else
    log "مدیر بسته پیدا نشد. curl، tar و xz را نصب کنید و دوباره اجرا کنید."
    exit 1
  fi
}

persist_user_path() {
  local line='export PATH="$HOME/.local/bin:$PATH" # baladbash node'
  local rc
  for rc in "${HOME}/.bashrc" "${HOME}/.profile"; do
    if [[ -f "$rc" ]] && grep -q 'baladbash node' "$rc"; then
      return 0
    fi
  done
  printf '\n%s\n' "$line" >> "${HOME}/.bashrc"
  log "Node داخل ${HOME}/.local نصب شد. برای شل‌های بعدی مسیر به ~/.bashrc اضافه شد."
}

install_node() {
  local arch sums tarball version tmp
  case "$(uname -m)" in
    x86_64 | amd64) arch="x64" ;;
    aarch64 | arm64) arch="arm64" ;;
    armv7l) arch="armv7l" ;;
    ppc64le) arch="ppc64le" ;;
    s390x) arch="s390x" ;;
    *)
      log "معماری $(uname -m) پشتیبانی نمی‌شود."
      exit 1
      ;;
  esac

  sums="$(mktemp)"
  tmp="$(mktemp -d)"

  log "دانلود Node.js 22..."
  curl -fsSL "https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt" -o "$sums"
  tarball="$(awk -v arch="$arch" '$2 ~ ("linux-" arch ".tar.xz$") { print $2; exit }' "$sums")"
  if [[ -z "$tarball" ]]; then
    log "بستهٔ لینوکس Node.js برای معماری ${arch} پیدا نشد."
    exit 1
  fi
  version="${tarball#node-v}"
  version="${version%%-*}"
  curl -fsSL "https://nodejs.org/dist/v${version}/${tarball}" -o "${tmp}/${tarball}"

  if need_cmd sha256sum; then
    (
      cd "$tmp"
      grep " ${tarball}$" "$sums" | sha256sum -c -
    )
  fi

  log "نصب Node.js ${version}..."
  if [[ "$(id -u)" -eq 0 ]]; then
    tar -xJf "${tmp}/${tarball}" -C /usr/local --strip-components=1
  elif need_cmd sudo && sudo tar -xJf "${tmp}/${tarball}" -C /usr/local --strip-components=1; then
    :
  else
    mkdir -p "${HOME}/.local"
    tar -xJf "${tmp}/${tarball}" -C "${HOME}/.local" --strip-components=1
    persist_user_path
  fi

  rm -rf "$sums" "$tmp"
  hash -r || true
  export PATH="/usr/local/bin:${HOME}/.local/bin:${PATH}"
}

webapp_domain() {
  local host
  host=$(env_get WEBAPP_URL)
  host=${host#https://}
  host=${host#http://}
  host=${host%%/*}
  host=${host%:443}
  if ! valid_domain "$host"; then
    note "برای SSL یک دامنهٔ معتبر لازم است. با bash run.sh --config دامنه را اصلاح کنید."
    return 1
  fi
  printf '%s' "$host"
}

setup_https() {
  local domain port public_ip dns_ips email conf listen6
  domain=$(webapp_domain) || exit 1
  port=$(env_get PORT)
  port=${port:-3000}

  if [[ "$(id -u)" -ne 0 ]] && ! need_cmd sudo; then
    log "برای گرفتن SSL اسکریپت را با root یا sudo اجرا کنید."
    exit 1
  fi

  if ! need_cmd curl; then
    install_os_packages
  fi

  log "بررسی اینکه ${domain} به این سرور اشاره کند..."
  public_ip=$(curl -4 -fsSL --max-time 15 https://api.ipify.org || true)
  public_ip=$(trim "$public_ip")
  dns_ips=$(getent ahostsv4 "$domain" 2>/dev/null | awk '{print $1}' | sort -u || true)
  if [[ -z "$dns_ips" ]]; then
    log "دامنهٔ ${domain} هنوز به هیچ آی‌پی‌ای اشاره نمی‌کند."
    [[ -n "$public_ip" ]] && log "رکورد A را به آی‌پی ${public_ip} بدهید و دوباره bash run.sh را اجرا کنید."
    exit 1
  fi
  if [[ -n "$public_ip" ]] && ! printf '%s\n' "$dns_ips" | grep -qx "$public_ip"; then
    log "رکورد A دامنهٔ ${domain} به این سرور اشاره نمی‌کند."
    log "آی‌پی سرور: ${public_ip}"
    log "آی‌پی دامنه: $(printf '%s' "$dns_ips" | tr '\n' ' ')"
    log "رکورد را اصلاح کنید. اگر Cloudflare روشن است، پروکسی را خاموش کنید تا دامنه مستقیم به این سرور برسد."
    exit 1
  fi

  if ! need_cmd nginx || ! need_cmd certbot || ! certbot plugins 2>/dev/null | grep -q nginx; then
    log "نصب Nginx و Certbot..."
    if need_cmd apt-get; then
      as_root env DEBIAN_FRONTEND=noninteractive apt-get update -y
      as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y nginx certbot python3-certbot-nginx
    elif need_cmd dnf; then
      as_root dnf install -y nginx certbot python3-certbot-nginx
    elif need_cmd yum; then
      as_root yum install -y epel-release || true
      as_root yum install -y nginx certbot python3-certbot-nginx
    else
      log "نصب خودکار SSL روی این توزیع پشتیبانی نمی‌شود. apt یا dnf لازم است."
      exit 1
    fi
    hash -r || true
  fi

  if need_cmd ufw && as_root ufw status 2>/dev/null | grep -q "Status: active"; then
    as_root ufw allow 80/tcp
    as_root ufw allow 443/tcp
  fi

  listen6=""
  if [[ -f /proc/net/if_inet6 ]]; then
    listen6=$'\n    listen [::]:80;'
  fi

  if [[ -d /etc/nginx/sites-available ]]; then
    conf=/etc/nginx/sites-available/baladbash
  else
    as_root mkdir -p /etc/nginx/conf.d
    conf=/etc/nginx/conf.d/baladbash.conf
  fi

  log "تنظیم Nginx برای ${domain}..."
  as_root tee "$conf" >/dev/null <<EOF
server {
    listen 80;${listen6}
    server_name ${domain};

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

  if [[ -d /etc/nginx/sites-enabled ]]; then
    as_root ln -sfn "$conf" /etc/nginx/sites-enabled/baladbash
    as_root rm -f /etc/nginx/sites-enabled/default
  fi

  as_root nginx -t
  if need_cmd systemctl; then
    as_root systemctl enable nginx
    if as_root systemctl is-active --quiet nginx; then
      as_root systemctl reload nginx
    else
      as_root systemctl restart nginx
    fi
  else
    as_root nginx -s reload 2>/dev/null || as_root nginx
  fi

  log "گرفتن گواهی SSL از Let's Encrypt. پورت‌های ۸۰ و ۴۴۳ باید از اینترنت باز باشند..."
  email=$(env_get LETSENCRYPT_EMAIL)
  if [[ -n "$email" ]]; then
    as_root certbot --nginx -d "$domain" --non-interactive --agree-tos --redirect --keep-until-expiring -m "$email" --no-eff-email
  else
    as_root certbot --nginx -d "$domain" --non-interactive --agree-tos --redirect --keep-until-expiring --register-unsafely-without-email
  fi

  if need_cmd systemctl; then
    as_root systemctl enable --now certbot.timer >/dev/null 2>&1 || true
    as_root systemctl reload nginx
  fi

  if [[ ! -f "/etc/letsencrypt/live/${domain}/fullchain.pem" ]]; then
    log "گواهی SSL ساخته نشد."
    exit 1
  fi
  log "SSL آماده است: https://${domain}"
}

install_service() {
  local app_dir node_bin unit port pids pid
  app_dir=$(pwd)
  node_bin=$(command -v node)
  unit=/etc/systemd/system/baladbash.service
  port=$(env_get PORT)
  port=${port:-3000}

  if ! need_cmd systemctl; then
    log "systemd روی این سرور پیدا نشد. سرویس ساخته نمی‌شود."
    exit 1
  fi

  if need_cmd ss; then
    local service_pid
    service_pid=$(systemctl show -p MainPID --value baladbash 2>/dev/null || true)
    pids=$(ss -ltnp "sport = :${port}" 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | sort -u || true)
    if [[ -n "$pids" ]]; then
      log "پورت ${port} اشغال است. فرایند قبلی بسته می‌شود تا سرویس جای آن را بگیرد."
      for pid in $pids; do
        if [[ "$pid" == "0" || "$pid" == "$service_pid" ]]; then
          continue
        fi
        if [[ -r "/proc/${pid}/cmdline" ]] && tr '\0' ' ' < "/proc/${pid}/cmdline" | grep -q nginx; then
          continue
        fi
        kill "$pid" 2>/dev/null || as_root kill "$pid" 2>/dev/null || true
      done
      sleep 1
    fi
  fi

  log "ساخت سرویس baladbash..."
  as_root tee "$unit" >/dev/null <<EOF
[Unit]
Description=Balad Bash Telegram bot
After=network-online.target nginx.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${app_dir}
ExecStart="${node_bin}" server/index.ts
Environment=HOST=127.0.0.1
Restart=on-failure
RestartSec=5
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
EOF

  as_root systemctl daemon-reload
  as_root systemctl enable baladbash
  as_root systemctl restart baladbash
  sleep 2

  if ! as_root systemctl is-active --quiet baladbash; then
    log "سرویس بالا نیامد. آخرین لاگ:"
    as_root journalctl -u baladbash -n 40 --no-pager || true
    exit 1
  fi

  log "سرویس baladbash فعال است و با بستن ترمینال قطع نمی‌شود."
  log "آدرس عمومی: $(env_get WEBAPP_URL)"
  log "وضعیت: systemctl status baladbash"
  log "لاگ: journalctl -u baladbash -f"
}

if [[ "$(uname -s)" != "Linux" ]]; then
  log "این اسکریپت برای سرور لینوکس است."
  exit 1
fi

configure_env

if node_is_ready; then
  log "Node.js $(node -v) از قبل آماده است."
else
  install_os_packages
  install_node
fi

if ! node_is_ready; then
  log "Node.js 22.18 یا بالاتر نصب نشد. نسخهٔ فعلی: $(node -v 2>/dev/null || echo 'نصب نیست')"
  exit 1
fi

setup_https
mkdir -p data

log "نصب وابستگی‌های پروژه..."
npm ci --include=dev

log "ساخت مینی‌اپ..."
npm run build

install_service
