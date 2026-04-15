# 江苏君劭律师事务所官网

[![GitHub](https://img.shields.io/badge/GitHub-jsjunshao--web-blue?style=flat-square&logo=github)](https://github.com/recall0131/jsjunshao-web)

律师介绍、律所动态、专业领域、在线咨询

## 技术栈

- **前端**: 原生 HTML/CSS/JS（无框架，SEO友好）
- **后端**: Node.js + Express 5
- **数据库**: SQLite（`better-sqlite3`）
- **Web 服务器**: Nginx（反向代理 + 静态文件）
- **部署**: Systemd 管理进程

## 项目结构

```
jsjunshao-web/
├── frontend/public/       # 前端静态文件（HTML/CSS/JS/图片）
├── backend/
│   ├── src/
│   │   ├── server.js     # Express 主服务
│   │   └── routes/        # 路由（已内联在 server.js）
│   ├── public/
│   │   └── admin/         # 管理后台页面
│   ├── data/
│   │   └── jsjunshao.db   # SQLite 数据库
│   └── package.json
├── nginx/
│   └── jsjunshao.conf     # Nginx 配置
├── deploy/
│   └── jsjunshao-web.service  # Systemd 服务文件
├── scripts/
│   ├── start.sh           # 启动脚本
│   └── init-db.sql        # 数据库初始化（参考）
└── .env.example           # 环境变量示例
```

## 本地开发

### 环境要求

- Node.js 18+
- SQLite3
- Nginx（可选，用于生产预览）

### 启动步骤

```bash
# 1. 克隆仓库
git clone https://github.com/recall0131/jsjunshao-web.git
cd jsjunshao-web

# 2. 安装后端依赖
cd backend && npm install

# 3. 配置环境变量
cp ../.env.example .env
# 编辑 .env，填入实际值

# 4. 启动开发服务器
npm run dev
# 服务运行于 http://localhost:3000
```

### 管理后台

访问 `/admin/` 或 `http://localhost:3000/admin/`

- 默认账号: `admin`
- 默认密码: `Jsjunshao2026!`（请在生产环境修改）

## 部署到生产环境（dejavu）

```bash
# 1. SSH 到服务器
ssh root@dejavu

# 2. 拉取最新代码
cd /var/www/jsjunshao-web
git pull origin main

# 3. 安装依赖
cd backend && npm install --production

# 4. 重启服务
systemctl restart jsjunshao-web
systemctl status jsjunshao-web

# 5. 验证
curl http://127.0.0.1:3000/api/health
```

## 数据库

SQLite 数据库文件: `backend/data/jsjunshao.db`

**表结构:**

| 表名 | 说明 |
|------|------|
| `lawyers` | 律师信息 |
| `practice_areas` | 专业领域 |
| `insights` | 研究成果/文章 |
| `pages` | 页面内容（关于、隐私政策等） |
| `contact_submissions` | 联系表单提交记录 |

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/public/lawyers` | 律师列表 |
| GET | `/api/public/lawyers/:id` | 律师详情 |
| GET | `/api/public/practice-areas` | 专业领域列表 |
| GET | `/api/public/insights` | 研究成果列表 |
| POST | `/api/public/contact` | 提交咨询表单 |
| GET | `/api/public/page/:key` | 页面内容 |

完整 API 文档: `/api/` (admin only)

## 许可证

私有项目 © 2026 江苏君劭律师事务所
