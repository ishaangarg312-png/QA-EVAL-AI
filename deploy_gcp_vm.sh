#!/bin/bash
# ==============================================================================
# Universal AI Agent QA Platform - Google Cloud e2-micro Auto-Deploy Script
# Run this script with root/sudo on your fresh Ubuntu 22.04 or 24.04 e2-micro VM.
# ==============================================================================

set -e

echo "🚀 Starting deployment of Universal AI Agent QA Platform on Google Cloud..."

# 1. Enable 2GB Swap Memory (Crucial for 1GB RAM e2-micro VM stability)
if [ ! -f /swapfile ]; then
    echo "📦 Configuring 2GB Swap Memory..."
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' | tee -a /etc/fstab
    echo "✅ Swap memory enabled."
else
    echo "ℹ️ Swapfile already exists."
fi

# 2. System updates and required packages
echo "📦 Installing system dependencies (Python, Nginx, Git, Curl)..."
apt-get update -y
apt-get install -y python3 python3-pip python3-venv nginx git curl ufw

# 3. Create platform directory
APP_DIR="/opt/eval-ai-platform"
echo "📁 Setting up application directory at $APP_DIR..."
mkdir -p $APP_DIR

# 4. Copy project files into /opt/eval-ai-platform if running from repo folder
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
if [ "$SCRIPT_DIR" != "$APP_DIR" ]; then
    echo "📋 Copying files to $APP_DIR..."
    cp -r $SCRIPT_DIR/* $APP_DIR/
    cp -n $SCRIPT_DIR/.env.local $APP_DIR/.env.local 2>/dev/null || true
fi

# 5. Create Python Virtual Environment
echo "🐍 Creating Python 3 virtual environment..."
if [ ! -d "$APP_DIR/venv" ]; then
    python3 -m venv $APP_DIR/venv
fi

echo "📦 Installing Python dependencies from requirements.txt..."
$APP_DIR/venv/bin/pip install --upgrade pip
$APP_DIR/venv/bin/pip install --no-cache-dir -r $APP_DIR/backend/requirements.txt

# 6. Ensure default environment file exists
if [ ! -f "$APP_DIR/.env.local" ]; then
    echo "⚙️ Creating default .env.local..."
    cat <<EOT > $APP_DIR/.env.local
DATABASE_URL="sqlite+aiosqlite:///./qa_platform.db"
SECRET_KEY="$(openssl rand -hex 32)"
GOOGLE_CLIENT_ID=""
EOT
fi

# 7. Configure and start systemd service
echo "⚙️ Installing systemd background service..."
cp $APP_DIR/eval-ai.service /etc/systemd/system/eval-ai.service
systemctl daemon-reload
systemctl enable eval-ai
systemctl restart eval-ai

# 8. Configure Nginx Web Server
echo "🌐 Configuring Nginx Reverse Proxy..."
cp $APP_DIR/nginx.conf /etc/nginx/sites-available/default
nginx -t
systemctl restart nginx

# 9. Configure Firewall
echo "🛡️ Configuring Firewall rules (Ports 80, 443, 22)..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
echo "y" | ufw enable || true

# 10. Fetch Public IP
PUBLIC_IP=$(curl -s -4 ifconfig.me || curl -s -4 icanhazip.com || echo "YOUR_VM_IP")

echo "=============================================================================="
echo "🎉 DEPLOYMENT COMPLETE!"
echo ""
echo "🌐 Your Platform is LIVE at: http://$PUBLIC_IP"
echo "🩺 Health Check:              http://$PUBLIC_IP/health"
echo "📑 API Documentation:        http://$PUBLIC_IP/docs"
echo ""
echo "System Status:"
systemctl is-active --quiet eval-ai && echo "  - Python Backend Service: ✅ ACTIVE" || echo "  - Python Backend Service: ❌ ERROR"
systemctl is-active --quiet nginx && echo "  - Nginx Reverse Proxy:    ✅ ACTIVE" || echo "  - Nginx Reverse Proxy:    ❌ ERROR"
echo "=============================================================================="
