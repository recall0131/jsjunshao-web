#!/bin/bash
# jsjunshao-web 启动脚本
# 用法: ./scripts/start.sh

set -e

# 项目根目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend/public"

# 加载环境变量
if [ -f "$PROJECT_ROOT/.env" ]; then
  export $(grep -v '^#' "$PROJECT_ROOT/.env" | xargs)
fi

# 默认值
export PORT="${PORT:-3000}"
export STATIC_DIR="${FRONTEND_DIR}"
export DB_PATH="${DB_PATH:-$BACKEND_DIR/data/jsjunshao.db}"
export IMAGE_UPLOAD_DIR="${IMAGE_UPLOAD_DIR:-$FRONTEND_DIR/images/lawyers}"
export JWT_SECRET="${JWT_SECRET:-jsjunshao-admin-secret-2026}"

echo "=========================================="
echo "江苏君劭律师事务所 - 启动配置"
echo "=========================================="
echo "PORT: $PORT"
echo "STATIC_DIR: $STATIC_DIR"
echo "DB_PATH: $DB_PATH"
echo "IMAGE_UPLOAD_DIR: $IMAGE_UPLOAD_DIR"
echo "=========================================="

# 确保图片目录存在
mkdir -p "$IMAGE_UPLOAD_DIR"

# 检查数据库
if [ ! -f "$DB_PATH" ]; then
  echo "错误: 数据库文件不存在: $DB_PATH"
  exit 1
fi

# 启动服务
cd "$BACKEND_DIR"
exec node src/server.js

# ==================== Docker 部署命令 ====================
# 在 dejavu 上运行（Node.js GLIBC 兼容性问题，需用 Docker）：
#
#   docker run -d \\
#     --name jsjunshao-web \\
#     -p 3000:3000 \\
#     -v /var/www/jsjunshao-web/backend/data:/app/data \\
#     -e PORT=3000 \\
#     -e NODE_ENV=production \\
#     -e DB_PATH=/app/data/jsjunshao.db \\
#     -e STATIC_DIR=/app/public \\
#     -e IMAGE_UPLOAD_DIR=/app/public/images/lawyers \\
#     -e JWT_SECRET=jsjunshao-admin-secret-2026 \\
#     --restart unless-stopped \\
#     jsjunshao-web
#
# 首次部署需要先构建镜像:
#   docker build -t jsjunshao-web /var/www/jsjunshao-web/backend/
