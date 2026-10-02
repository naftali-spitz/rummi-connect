#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/rummi}"
APP_USER="${APP_USER:-rummi}"
SOURCE_DIR="${1:-$(pwd)}"

if ! command -v node >/dev/null; then
  echo "Node.js 22+ is required. Install Node.js first." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node.js 22+ is required; found $(node -v)." >&2
  exit 1
fi

if ! id "$APP_USER" >/dev/null 2>&1; then
  sudo useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

sudo mkdir -p "$APP_DIR" "$APP_DIR/data"
sudo systemctl stop rummi 2>/dev/null || true
sudo rsync -a --delete --exclude node_modules --exclude data/ "$SOURCE_DIR/" "$APP_DIR/"
sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR"

cd "$APP_DIR"
sudo -u "$APP_USER" npm install
sudo -u "$APP_USER" npm run build

sudo cp "$APP_DIR/deploy/rummi.service" /etc/systemd/system/rummi.service
sudo systemctl daemon-reload
sudo systemctl enable --now rummi

IP="$(hostname -I | awk '{print $1}')"
echo "Rummi installed. Open http://${IP:-SERVER-IP}:3000"
echo "Status: sudo systemctl status rummi"
