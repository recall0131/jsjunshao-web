#!/bin/bash
# JSJUNSHAO 部署脚本（Docker 版，适用于 GLIBC 不兼容的宿主机的 Node 部署）
#
# 用法: bash start.sh
#   首次: 会构建镜像
#   已有镜像: 直接重启容器

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"

echo "=== JSJUNSHAO 部署脚本 ==="

# 构建镜像（当源码变动时）
echo "[1/3] 构建 Docker 镜像..."
docker build -t jsjunshao-web "$BACKEND_DIR"

# 停止旧容器
echo "[2/3] 重启容器..."
docker stop jsjunshao-web 2>/dev/null || true
docker rm jsjunshao-web 2>/dev/null || true

# 启动容器
docker run -d \
  --name jsjunshao-web \
  -p 3000:3000 \
  -v "$BACKEND_DIR/data:/app/data" \
  -v "$SCRIPT_DIR/frontend/public:/app/public:ro" \
  -v "$BACKEND_DIR/public:/app/admin-static:ro" \
  -e PORT=3000 \
  -e NODE_ENV=production \
  -e DB_PATH=/app/data/jsjunshao.db \
  -e STATIC_DIR=/app/public \
  -e IMAGE_UPLOAD_DIR=/app/data/images \
  -e JWT_SECRET=jsjunshao-admin-secret-2026 \
  --restart unless-stopped \
  jsjunshao-web

echo "[3/3] 等待启动..."
sleep 3
docker logs jsjunshao-web 2>&1 | tail -3

echo ""
echo "=== 完成 ==="
echo "公网:   https://jsjunshao.lizheng.info"
echo "管理后台: https://jsjunshao.lizheng.info/admin/"
