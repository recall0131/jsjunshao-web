FROM node:18-slim

WORKDIR /app

# Install build tools for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    gcc \
    libc6-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install all dependencies (including native modules)
RUN npm install

# Copy application (db file excluded via .dockerignore, see below)
COPY src/ ./src/
COPY public/ ./public/

# Create directories
RUN mkdir -p /app/data /app/public/images/lawyers

# Environment defaults (overridable at runtime)
ENV PORT=3000
ENV NODE_ENV=production
ENV DB_PATH=/app/data/jsjunshao.db
ENV STATIC_DIR=/app/public
ENV IMAGE_UPLOAD_DIR=/app/public/images/lawyers

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

CMD ["node", "src/server.js"]
