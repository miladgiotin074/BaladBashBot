#!/usr/bin/env bash
# بلد باش — نصب پیش‌نیازها، ساخت و اجرای اپ روی سرور لینوکس.
#
#   git clone https://github.com/miladgiotin074/BaladBashBot.git
#   cd BaladBashBot
#   bash run.sh
#
# اگر Node.js 22.18 یا جدیدتر نباشد، اسکریپت آن را نصب می‌کند.
# بار اول .env را می‌سازد؛ BOT_TOKEN و WEBAPP_URL را پر کنید و دوباره اجرا کنید.
set -euo pipefail
cd "$(dirname "$0")"

export PATH="/usr/local/bin:${HOME}/.local/bin:${PATH}"

log() {
  printf '%s\n' "$*"
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

if [[ "$(uname -s)" != "Linux" ]]; then
  log "این اسکریپت برای سرور لینوکس است."
  exit 1
fi

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

mkdir -p data

if [[ ! -f .env ]]; then
  cp .env.example .env
  log "فایل .env ساخته شد."
fi

log "نصب وابستگی‌های پروژه..."
npm ci --include=dev

log "ساخت مینی‌اپ..."
npm run build

if ! grep -qE '^BOT_TOKEN=.+' .env; then
  log "همهٔ پیش‌نیازها آماده‌اند. توکن را از @BotFather در BOT_TOKEN داخل .env بگذارید و دوباره bash run.sh را اجرا کنید."
  exit 1
fi

if ! grep -qE '^WEBAPP_URL=https://.+' .env; then
  log "هشدار: WEBAPP_URL باید یک آدرس https عمومی باشد تا دکمه‌های مینی‌اپ در تلگرام کار کنند."
fi

log "سرور بالا می‌آید. برای توقف Ctrl+C بزنید."
exec npm start
