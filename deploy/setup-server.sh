#!/usr/bin/env bash
# One-time server setup for Drew Disc. Run as root on the server:
#
#   API_PORT=<free local port> bash setup-server.sh <domain> ["<deploy public key>"]
#
# It creates (or reuses) a limited `deploy` user, gives it /srv/drew-disc, adds an nginx site for
# <domain>, gets an HTTPS certificate with Certbot, and runs the scoreboard API in a locked-down
# container that only nginx can reach. Safe to re-run; the key is only needed the first time, and
# the port is remembered after the first run (in /etc/drew-disc/api-port), so it stays out of this
# public repo.
set -euo pipefail

DOMAIN=${1:?usage: API_PORT=<port> setup-server.sh <domain> ["<deploy public key>"]}
PUBKEY=${2:-}
APP=/srv/drew-disc
SITE=/etc/nginx/sites-available/drew-disc
API_SNIPPET=/etc/nginx/snippets/drew-disc-api.conf
CONF=/etc/drew-disc
COMPOSE=$CONF/compose.yml

# The scoreboard's local port: from API_PORT, else what an earlier run chose.
API_PORT=${API_PORT:-$(cat "$CONF/api-port" 2>/dev/null || true)}
case "$API_PORT" in
  ''|*[!0-9]*) echo "Pick a free local port for the scoreboard and run: API_PORT=<port> bash $0 $DOMAIN" >&2; exit 1 ;;
esac
if ! grep -qx "$API_PORT" "$CONF/api-port" 2>/dev/null && ss -ltnH "( sport = :$API_PORT )" | grep -q .; then
  echo "Port $API_PORT is already in use; pick another." >&2; exit 1
fi

if [ -n "$PUBKEY" ]; then
  case "$PUBKEY" in ssh-ed25519\ *|ssh-rsa\ *) ;; *) echo "That does not look like a public key (expected ssh-ed25519 ...)" >&2; exit 1 ;; esac
elif [ ! -s /home/deploy/.ssh/authorized_keys ]; then
  echo "First run needs the deploy public key as the second argument." >&2; exit 1
fi

# 1. Deploy user, allowed in by deploy keys only
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
install -d -o deploy -g deploy -m 700 /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
[ -z "$PUBKEY" ] || grep -qF "$PUBKEY" /home/deploy/.ssh/authorized_keys || echo "restrict $PUBKEY" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys
command -v rsync >/dev/null || apt-get install -y rsync

# 2. Release folders. `current` is a symlink to the live release.
install -d -o deploy -g deploy -m 755 "$APP" "$APP/releases"
if [ ! -e "$APP/current" ]; then
  install -d -o deploy -g deploy -m 755 "$APP/releases/initial"
  echo '<!doctype html><title>Drew Disc</title><p>Coming soon.</p>' > "$APP/releases/initial/index.html"
  chown deploy:deploy "$APP/releases/initial/index.html"
  ln -sfn releases/initial "$APP/current" && chown -h deploy:deploy "$APP/current"
fi

# Scoreboard code (written by deploys) and its database (written by the container, which runs as
# deploy's uid).
install -d -o deploy -g deploy -m 755 "$APP/api" "$APP/api/app" "$APP/api/data"
touch "$APP/api/restart" && chown deploy:deploy "$APP/api/restart"

# 3. nginx site (left alone if it already exists, so Certbot's edits survive a re-run)
if [ ! -e "$SITE" ]; then
  cat > "$SITE" <<NGINX
server {
  listen 80;
  listen [::]:80;
  server_name $DOMAIN;

  root $APP/current;
  index index.html;

  # Hashed build assets never change, so cache them hard.
  location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files \$uri =404;
  }

  # Everything else: always revalidate, so a deploy shows up on the next load.
  # Unknown paths fall back to index.html (room links like /r/ABCD later).
  location / {
    try_files \$uri \$uri/ /index.html;
    add_header Cache-Control "no-cache";
  }

  include $API_SNIPPET;
}
NGINX
fi
cat > "$API_SNIPPET" <<NGINX
# Drew Disc scoreboard (container on localhost)
location /api/ {
  proxy_pass http://127.0.0.1:$API_PORT;
  proxy_set_header Host \$host;
  proxy_set_header X-Real-IP \$remote_addr;
  client_max_body_size 4k;
}
NGINX
# Sites made before the scoreboard existed: add the include under each server block that serves
# the game (its `root` line). Certbot's port-80 redirect block has no root, so it is left alone.
if ! grep -q "drew-disc-api.conf" "$SITE"; then
  if grep -q "root $APP/current;" "$SITE"; then
    sed -i "s|^\( *\)root $APP/current;|&\n\1include $API_SNIPPET;|" "$SITE"
  else
    echo "!! Could not find where to add the API in $SITE. Add this line inside the 443 server block: include $API_SNIPPET;"
  fi
fi
ln -sfn "$SITE" /etc/nginx/sites-enabled/drew-disc
nginx -t
systemctl reload nginx

# 4. HTTPS (needs the DNS record for $DOMAIN pointing at this server)
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  echo "HTTPS certificate for $DOMAIN already exists (Certbot renews it on its own)."
elif getent hosts "$DOMAIN" >/dev/null; then
  certbot --nginx -d "$DOMAIN" --redirect
else
  echo "!! $DOMAIN does not resolve yet. Add the DNS A record, then run: certbot --nginx -d $DOMAIN --redirect"
fi
# 5. Scoreboard container. These files stay root-owned: a deploy can change the API's code, which
#    runs unprivileged inside the container, but not how the container is run.
DEPLOY_UID=$(id -u deploy); DEPLOY_GID=$(id -g deploy); DOCKER=$(command -v docker)
install -d -m 755 "$CONF"
echo "$API_PORT" > "$CONF/api-port"
cat > "$COMPOSE" <<YAML
services:
  api:
    image: node:24-alpine
    container_name: drew-disc-api
    restart: unless-stopped
    user: "$DEPLOY_UID:$DEPLOY_GID"
    working_dir: /app
    command: ["node", "--disable-warning=ExperimentalWarning", "server.mjs"]
    environment:
      DB_PATH: /data/scores.db
      PORT: "$API_PORT"
    volumes:
      - $APP/api/app:/app:ro
      - $APP/api/data:/data
    ports:
      - "127.0.0.1:$API_PORT:$API_PORT"
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    mem_limit: 128m
    logging:
      driver: json-file
      options: { max-size: "1m", max-file: "3" }
YAML
# A deploy writes $APP/api/restart; systemd notices and (re)starts the container as root.
cat > /etc/systemd/system/drew-disc-api-restart.service <<UNIT
[Unit]
Description=Restart the Drew Disc scoreboard after a deploy
[Service]
Type=oneshot
ExecStart=$DOCKER compose -f $COMPOSE -p drew-disc up -d
ExecStart=$DOCKER restart drew-disc-api
UNIT
cat > /etc/systemd/system/drew-disc-api-restart.path <<UNIT
[Unit]
Description=Watch for Drew Disc scoreboard deploys
[Path]
PathChanged=$APP/api/restart
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now drew-disc-api-restart.path
if [ -f "$APP/api/app/server.mjs" ]; then
  $DOCKER compose -f "$COMPOSE" -p drew-disc up -d
else
  echo "Scoreboard code is not on the server yet; it starts on the next deploy."
fi
nginx -t && systemctl reload nginx

echo
echo "Done. Add these GitHub repo secrets (Settings > Secrets and variables > Actions):"
echo "  DEPLOY_HOST        = $DOMAIN"
echo "  DEPLOY_KNOWN_HOSTS = $DOMAIN $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"
echo "  DEPLOY_SSH_KEY     = the PRIVATE half of the deploy key"
