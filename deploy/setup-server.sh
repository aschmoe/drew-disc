#!/usr/bin/env bash
# One-time server setup for Drew Disc. Run as root on the server:
#
#   bash setup-server.sh <domain> ["<deploy public key>"]
#
# It creates (or reuses) the limited `deploy` user, gives it /srv/drew-disc, adds an nginx site
# for <domain> next to the existing ones and gets an HTTPS certificate with Certbot. Static site
# only for now; the backend (port 3101) is added in milestone 4. Safe to re-run; the key is only
# needed the first time. Adapted from aschmoe/sequim-games.
set -euo pipefail

DOMAIN=${1:?usage: setup-server.sh <domain> ["<deploy public key>"]}
PUBKEY=${2:-}
APP=/srv/drew-disc
SITE=/etc/nginx/sites-available/drew-disc

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
}
NGINX
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
nginx -t && systemctl reload nginx

echo
echo "Done. Add these GitHub repo secrets (Settings > Secrets and variables > Actions):"
echo "  DEPLOY_HOST        = $DOMAIN"
echo "  DEPLOY_KNOWN_HOSTS = $DOMAIN $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"
echo "  DEPLOY_SSH_KEY     = the PRIVATE half of the deploy key"
