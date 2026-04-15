require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'jsjunshao-admin-secret-2026';
const STATIC_DIR = process.env.STATIC_DIR || '/var/www/jsjunshao';

// Middleware
app.use(cors({ origin: ['https://jsjunshao.lizheng.info', 'http://localhost:3000'] }));
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files — serve the public website before API routes
app.use(express.static(STATIC_DIR));

// Database setup
const DB_FILE = process.env.DB_PATH || path.join(__dirname, 'data', 'jsjunshao.db');
const db = new Database(DB_FILE);

// Initialize database tables
db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS lawyers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    title TEXT,
    role TEXT DEFAULT 'associate',
    bio TEXT,
    tags TEXT DEFAULT '[]',
    photo_url TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS practice_areas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS insights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    summary TEXT,
    content TEXT,
    author TEXT,
    category TEXT DEFAULT '公司法',
    published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_key TEXT UNIQUE NOT NULL,
    title TEXT,
    content TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Create default admin if not exists
const adminExists = db.prepare('SELECT id FROM admins WHERE username = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('Jsjunshao2026!', 10);
  db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run('admin', hash);
  console.log('Default admin created: admin / Jsjunshao2026!');
}

// Auth middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未授权，请先登录' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token无效或已过期' });
  }
}

// ================== AUTH ==================

const loginLimiter = rateLimit({
  windowMs: 5*60*1000, max: 5, standardHeaders: true, legacyHeaders: false,
  message: JSON.stringify({error:'登录尝试过于频繁，请15分钟后再试'})
});

app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '请提供用户名和密码' });
  }
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username: admin.username });
});

app.post('/api/auth/logout', authMiddleware, (req, res) => {
  res.json({ message: '已登出' });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ username: req.admin.username });
});

// ================== IMAGE UPLOAD ==================
const IMAGE_UPLOAD_DIR = process.env.IMAGE_UPLOAD_DIR || '/var/www/jsjunshao/images/lawyers';
if (!fs.existsSync(IMAGE_UPLOAD_DIR)) {
  fs.mkdirSync(IMAGE_UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGE_UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, randomUUID() + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedMimes.includes(file.mimetype) && allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('只允许上传 JPG/PNG/GIF/WEBP 格式图片'), false);
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 2 * 1024 * 1024 } });

app.post('/api/upload/image', authMiddleware, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: '图片大小不能超过 2MB' });
      return res.status(400).json({ error: err.message || '上传失败' });
    }
    if (!req.file) return res.status(400).json({ error: '未选择图片，请上传 JPG/PNG/GIF/WEBP 格式图片' });
    const imagePath = '/images/lawyers/' + req.file.filename;
    res.json({ url: imagePath, filename: req.file.filename });
  });
});

// ================== LAWYERS ==================

app.get('/api/lawyers', authMiddleware, (req, res) => {
  const lawyers = db.prepare('SELECT * FROM lawyers ORDER BY sort_order ASC, id ASC').all();
  lawyers.forEach(l => { l.tags = JSON.parse(l.tags || '[]'); });
  res.json(lawyers);
});

app.post('/api/lawyers', authMiddleware, (req, res) => {
  const { name, title, role, bio, tags, photo_url, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: '律师姓名不能为空' });
  const result = db.prepare(`
    INSERT INTO lawyers (name, title, role, bio, tags, photo_url, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name, title || '', role || 'associate', bio || '', JSON.stringify(tags || []), photo_url || '', sort_order || 0);
  const lawyer = db.prepare('SELECT * FROM lawyers WHERE id = ?').get(result.lastInsertRowid);
  lawyer.tags = JSON.parse(lawyer.tags || '[]');
  res.json(lawyer);
});

app.put('/api/lawyers/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const body = req.body;
  const existing = db.prepare('SELECT * FROM lawyers WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '律师不存在' });
  const name = body.name !== undefined ? body.name : existing.name;
  const title = body.title !== undefined ? body.title : existing.title;
  const role = body.role !== undefined ? body.role : existing.role;
  const bio = body.bio !== undefined ? body.bio : existing.bio;
  const tags = body.tags !== undefined ? body.tags : JSON.parse(existing.tags || '[]');
  const photo_url = body.photo_url !== undefined ? body.photo_url : existing.photo_url;
  const sort_order = body.sort_order !== undefined ? body.sort_order : existing.sort_order;
  db.prepare(`
    UPDATE lawyers SET name=?, title=?, role=?, bio=?, tags=?, photo_url=?, sort_order=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(name, title, role, bio, JSON.stringify(tags), photo_url, sort_order, id);
  const lawyer = db.prepare('SELECT * FROM lawyers WHERE id = ?').get(id);
  lawyer.tags = JSON.parse(lawyer.tags || '[]');
  res.json(lawyer);
});

app.delete('/api/lawyers/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT id FROM lawyers WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '律师不存在' });
  db.prepare('DELETE FROM lawyers WHERE id = ?').run(id);
  res.json({ message: '删除成功' });
});

// ================== PRACTICE AREAS ==================

app.get('/api/practice-areas', authMiddleware, (req, res) => {
  const areas = db.prepare('SELECT * FROM practice_areas ORDER BY sort_order ASC, id ASC').all();
  res.json(areas);
});

app.post('/api/practice-areas', authMiddleware, (req, res) => {
  const { name, icon, description, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: '领域名称不能为空' });
  const result = db.prepare('INSERT INTO practice_areas (name, icon, description, sort_order) VALUES (?, ?, ?, ?)').run(name, icon || '', description || '', sort_order || 0);
  res.json(db.prepare('SELECT * FROM practice_areas WHERE id = ?').get(result.lastInsertRowid));
});

app.put('/api/practice-areas/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { name, icon, description, sort_order } = req.body;
  const existing = db.prepare('SELECT id FROM practice_areas WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '专业领域不存在' });
  db.prepare('UPDATE practice_areas SET name=?, icon=?, description=?, sort_order=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(name, icon || '', description || '', sort_order || 0, id);
  res.json(db.prepare('SELECT * FROM practice_areas WHERE id = ?').get(id));
});

app.delete('/api/practice-areas/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT id FROM practice_areas WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '专业领域不存在' });
  db.prepare('DELETE FROM practice_areas WHERE id = ?').run(id);
  res.json({ message: '删除成功' });
});

// ================== INSIGHTS ==================

app.get('/api/insights', authMiddleware, (req, res) => {
  const insights = db.prepare('SELECT * FROM insights ORDER BY published_at DESC, id DESC').all();
  res.json(insights);
});

app.post('/api/insights', authMiddleware, (req, res) => {
  const { title, summary, content, author, category, published_at } = req.body;
  if (!title) return res.status(400).json({ error: '标题不能为空' });
  const result = db.prepare('INSERT INTO insights (title, summary, content, author, category, published_at) VALUES (?, ?, ?, ?, ?, ?)').run(title, summary || '', content || '', author || '', category || '公司法', published_at || new Date().toISOString().split('T')[0]);
  res.json(db.prepare('SELECT * FROM insights WHERE id = ?').get(result.lastInsertRowid));
});

app.put('/api/insights/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { title, summary, content, author, category, published_at } = req.body;
  const existing = db.prepare('SELECT id FROM insights WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '研究成果不存在' });
  db.prepare('UPDATE insights SET title=?, summary=?, content=?, author=?, category=?, published_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(title, summary || '', content || '', author || '', category || '公司法', published_at || '', id);
  res.json(db.prepare('SELECT * FROM insights WHERE id = ?').get(id));
});

app.delete('/api/insights/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT id FROM insights WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '研究成果不存在' });
  db.prepare('DELETE FROM insights WHERE id = ?').run(id);
  res.json({ message: '删除成功' });
});

// ================== PAGES ==================

app.get('/api/pages/:key', authMiddleware, (req, res) => {
  const { key } = req.params;
  let page = db.prepare('SELECT * FROM pages WHERE page_key = ?').get(key);
  if (!page) {
    // Create default entry
    db.prepare('INSERT INTO pages (page_key, title, content) VALUES (?, ?, ?)').run(key, '', '');
    page = db.prepare('SELECT * FROM pages WHERE page_key = ?').get(key);
  }
  res.json(page);
});

app.put('/api/pages/:key', authMiddleware, (req, res) => {
  const { key } = req.params;
  const { title, content } = req.body;
  const existing = db.prepare('SELECT id FROM pages WHERE page_key = ?').get(key);
  if (existing) {
    db.prepare('UPDATE pages SET title=?, content=?, updated_at=CURRENT_TIMESTAMP WHERE page_key=?').run(title || '', content || '', key);
  } else {
    db.prepare('INSERT INTO pages (page_key, title, content) VALUES (?, ?, ?)').run(key, title || '', content || '');
  }
  res.json(db.prepare('SELECT * FROM pages WHERE page_key = ?').get(key));
});

// ================== EXPORT ==================

app.get('/api/export', authMiddleware, (req, res) => {
  const lawyers = db.prepare('SELECT * FROM lawyers ORDER BY sort_order ASC, id ASC').all();
  const practiceAreas = db.prepare('SELECT * FROM practice_areas ORDER BY sort_order ASC, id ASC').all();
  const insights = db.prepare('SELECT * FROM insights ORDER BY published_at DESC, id DESC').all();
  const pages = db.prepare('SELECT * FROM pages').all();
  
  lawyers.forEach(l => { l.tags = JSON.parse(l.tags || '[]'); });
  
  res.json({ lawyers, practiceAreas, insights, pages, exportedAt: new Date().toISOString() });
});

// Static admin files
app.use('/admin', express.static('/app/admin-static'));

app.get('/admin', (req, res) => res.redirect('/admin/index.html'));
app.get('/admin/login.html', (req, res) => res.sendFile(path.join('/app/admin-static', 'login.html')));
app.get('/admin/:page', (req, res) => {
  const filePath = path.join('/app/admin-static', req.params.page);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('页面不存在');
  }
});

// Serve API docs for health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));


// ================== PUBLIC LAWYERS (no auth) ==================

function lawyerDetailUrl(lawyer) {
  const pinyinMap = {
    '李正武':'li-zheng-wu','蔡安明':'cai-an-ming','冯伟':'feng-wei',
    '高磊':'gao-lei','李伟根':'li-wei-gen','王小虹':'wang-xiao-hong',
    '成文芳':'cheng-wen-fang','蒋旭':'jiang-xu','商运东':'shang-yun-dong',
    '卜波':'bo-bo-bu-bo','冉文春子':'ran-wen-chun-zi','周晓妤':'zhou-xiao-yu',
    '王志康':'wang-zhi-kang','唐凌云':'tang-ling-yun','邓丽萍':'deng-li-ping',
    '陈静':'chen-jing','胡彬':'hu-bin','王雯漪':'wang-wen-yi',
    '王维灵':'wang-wei-ling','郭凡洁':'guo-fan-jie','王蕾':'wang-lei'
  };
  const py = pinyinMap[lawyer.name] || lawyer.name;
  if (lawyer.role === '创始合伙人' || lawyer.role === '高级合伙人') {
    return '/a/gao-ji-he-huo-ren-' + py;
  }
  return '/a/he-huo-ren-' + py;
}

// XSS protection helper
function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

app.get('/api/public/lawyers', (req, res) => {
  const lawyers = db.prepare('SELECT id, name, title, role, bio, tags, photo_url, sort_order FROM lawyers ORDER BY sort_order ASC, id ASC').all();
  lawyers.forEach(l => {
    l.tags = JSON.parse(l.tags || '[]');
    l.detail_url = lawyerDetailUrl(l);
  });
  res.json(lawyers);
});

// Dynamic lawyer detail page
app.get('/a/:slug', (req, res) => {
  const { slug } = req.params;
  const cleanSlug = slug.replace(/\.html$/, '');  // strip .html
  // Convert slug back to name
  const slugToName = {
    'gao-ji-he-huo-ren-li-zheng-wu':'李正武','gao-ji-he-huo-ren-cai-an-ming':'蔡安明','gao-ji-he-huo-ren-feng-wei':'冯伟',
    'gao-ji-he-huo-ren-gao-lei':'高磊','li-wei-gen':'李伟根','wang-xiao-hong':'王小虹',
    'cheng-wen-fang':'成文芳','jiang-xu':'蒋旭','shang-yun-dong':'商运东',
    'bo-bo-bu-bo':'卜波','ran-wen-chun-zi':'冉文春子','zhou-xiao-yu':'周晓妤',
    'wang-zhi-kang':'王志康','tang-ling-yun':'唐凌云','deng-li-ping':'邓丽萍',
    'chen-jing':'陈静','hu-bin':'胡彬','wang-wen-yi':'王雯漪',
    'wang-wei-ling':'王维灵','guo-fan-jie':'郭凡洁','wang-lei':'王蕾'
  };
  const name = slugToName[cleanSlug] || slugToName[slug];
  if (!name) return res.status(404).send('Not Found');
  
  const lawyer = db.prepare('SELECT * FROM lawyers WHERE name = ?').get(name);
  if (!lawyer) return res.status(404).send('Not Found');
  
  lawyer.tags = JSON.parse(lawyer.tags || '[]');
  
  const roleClass = (lawyer.role === '创始合伙人' || lawyer.role === '高级合伙人' || lawyer.role === 'partner') ? 'partner' : 'associate';
  const roleLabel = lawyer.role || '律师';
  const photo = lawyer.photo_url || '/images/lawyers/default.jpg';
  
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${lawyer.name} - 江苏君劭律师事务所</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Noto Sans SC',sans-serif;background:#f5f6f8;color:#222;line-height:1.7}
.topbar{background:#1B3A5C;color:#fff;padding:0 40px;height:56px;display:flex;align-items:center;justify-content:space-between}
.topbar a{color:rgba(255,255,255, .8);text-decoration:none;font-size:13px}
.topbar a:hover{color:#fff}
.container{max-width:960px;margin:40px auto;padding:0 20px}
.card{background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.06);overflow:hidden}
.header{display:flex;gap:36px;padding:40px;align-items:flex-start}
.photo{width:200px;height:260px;object-fit:cover;border-radius:10px;flex-shrink:0;background:#e9ecef}
.info{flex:1}
.name{font-size:28px;font-weight:700;color:#1B3A5C;margin-bottom:8px}
.role{display:inline-block;background:${roleClass === 'partner' ? '#C9A84C' : '#6c757d'};color:${roleClass === 'partner' ? '#1B3A5C' : '#fff'};padding:4px 14px;border-radius:20px;font-size:13px;margin-bottom:16px}
.section{padding:32px 40px;border-top:1px solid #f0f0f0}
.section h2{font-size:16px;color:#1B3A5C;font-weight:600;margin-bottom:16px;border-left:4px solid #C9A84C;padding-left:12px}
.section p{font-size:15px;color:#444;line-height:1.9;white-space:pre-wrap}
.back{display:inline-flex;align-items:center;gap:6px;margin:32px 0 0 40px;color:#006994;text-decoration:none;font-size:14px}
footer{text-align:center;padding:32px;color:#aaa;font-size:13px;margin-top:40px}
@media(max-width:640px){.header{flex-direction:column}.photo{width:160px;height:200px}}
</style>
</head>
<body>
<nav class="topbar">
<div style="font-size:16px;font-weight:700">江苏<span style="color:#C9A84C">君劭</span>律师事务所</div>
<a href="/">返回首页</a>
</nav>
<div class="container">
<div class="card">
<div class="header">
<img class="photo" src="${photo}" alt="${lawyer.name}" onerror="this.src='/images/lawyers/default.jpg'">
<div class="info">
<h1 class="name">${lawyer.name}</h1>
<span class="role">${roleLabel}</span>
${lawyer.title ? '<div style="margin-top:8px;color:#666;font-size:14px">' + lawyer.title + '</div>' : ''}
</div>
</div>
${lawyer.bio ? '<div class="section"><h2>个人简介</h2><p>' + escapeHtml(lawyer.bio) + '</p></div>' : ''}
</div>
<a class="back" href="/c/lvshifengcai">← 返回律师团队</a>
</div>
<footer>© 2024 江苏君劭律师事务所 · 电话：025-85336806 · 地址：南京市鼓楼区南通路118号三号楼六楼</footer>
</body>
</html>`;
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// Lawyer team listing page
app.get('/c/lvshifengcai', (req, res) => {
  const lawyers = db.prepare('SELECT id, name, title, role, bio, photo_url, sort_order FROM lawyers ORDER BY sort_order ASC, id ASC').all();
  lawyers.forEach(l => {
    l.bio = (l.bio||'').substring(0,80);
    l.tags = JSON.parse(l.tags||'[]');
  });

  const roleClass = (r) => (r==='创始合伙人'||r==='高级合伙人'||r==='高级合伙人'||r==='partner')?'partner':'associate';
  const roleLabel = (r) => r||'律师';

  const cards = lawyers.map(l => {
    const slug = lawyerDetailUrl(l).replace('/a/','').replace('.html','');
    const photo = l.photo_url||'/images/lawyers/default.jpg';
    return '<div class="lawyer-card '+roleClass(l.role)+'"><a href="/a/'+slug+'"><img src="'+photo+'" alt="'+l.name+'"><div class="info"><h3>'+l.name+'</h3><span class="role">'+roleLabel(l.role)+'</span>'+(l.title?'<p>'+l.title+'</p>':'')+'</div></a></div>';
  }).join('');

  const css = fs.readFileSync(path.join(STATIC_DIR, 'style.css'),'utf8');
  const topbar = '<nav class="topbar" style="background:#1B3A5C;color:#fff;padding:0 40px;height:56px;display:flex;align-items:center;justify-content:space-between"><div style="font-size:16px;font-weight:700">江苏<span style="color:#C9A84C">君劭</span>律师事务所</div><a href="/" style="color:rgba(255,255,255,.8);text-decoration:none;font-size:13px">返回首页</a></nav>';
  const footer = '<footer style="text-align:center;padding:32px;color:#aaa;font-size:13px;margin-top:40px">© 2024 江苏君劭律师事务所 · 电话：025-85336806 · 地址：南京市鼓楼区南通路118号三号楼六楼</footer>';
  const html = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>律师团队 - 江苏君劭律师事务所</title><style>'+css+'</style></head><body>'+topbar+'<main class="container"><h1>律师团队</h1><div class="lawyer-grid">'+cards+'</div></main>'+footer+'</body></html>';
  res.setHeader('Content-Type','text/html;charset=utf-8');
  res.send(html);
});

app.get('/api/public/lawyers', (req, res) => {
  const lawyers = db.prepare('SELECT id, name, title, role, bio, tags, photo_url, sort_order FROM lawyers ORDER BY sort_order ASC, id ASC').all();
  lawyers.forEach(l => {
    l.tags = JSON.parse(l.tags || '[]');
    l.detail_url = lawyerDetailUrl(l);
  });
  res.json(lawyers);
});


// ================== PUBLIC INSIGHTS (no auth) ==================

app.get('/api/public/insights', (req, res) => {
  const insights = db.prepare('SELECT id, title, summary, content, author, category, published_at FROM insights ORDER BY published_at DESC, id DESC').all();
  res.json(insights);
});

app.get('/api/public/insights/:id', (req, res) => {
  const { id } = req.params;
  const insight = db.prepare('SELECT id, title, summary, content, author, category, published_at FROM insights WHERE id = ?').get(id);
  if (!insight) return res.status(404).json({ error: '文章不存在' });
  res.json(insight);
});

// ================== PUBLIC PRACTICE AREAS (no auth) ==================
app.get('/api/public/practice-areas', (req, res) => {
  const areas = db.prepare('SELECT id, name, icon, description, sort_order FROM practice_areas ORDER BY sort_order ASC, id ASC').all();
  res.json(areas);
});

// ================== PUBLIC PAGE CONTENT (no auth) ==================
app.get('/api/public/page/:key', (req, res) => {
  const { key } = req.params;
  const page = db.prepare('SELECT title, content FROM pages WHERE page_key = ?').get(key);
  if (!page) return res.status(404).json({ error: '页面不存在' });
  // If content is valid JSON, parse it for convenience
  try {
    const parsed = JSON.parse(page.content);
    res.json({ title: page.title, ...parsed });
  } catch {
    res.json({ title: page.title, content: page.content });
  }
});

// Ensure default contact page exists
const contactPage = db.prepare('SELECT id FROM pages WHERE page_key = ?').get('contact');
if (!contactPage) {
  const defaultContact = {
    address: '江苏省南京市鼓楼区中山北路88号\n建伟大厦18层',
    phone: '025-85336806',
    fax: '025-88888889',
    email: '1390279645@qq.com',
    email2: 'recruit@junshao.com',
    hours_weekday: '周一至周五：9:00 - 18:00',
    hours_saturday: '周六：9:00 - 12:00（预约）',
    hours_sunday: '周日：休息',
    traffic: '地铁1号线·鼓楼站4B出口\n步行约5分钟'
  };
  db.prepare('INSERT INTO pages (page_key, title, content) VALUES (?, ?, ?)').run('contact', '联系我们', JSON.stringify(defaultContact));
  console.log('Default contact page created');
}

// ================== PUBLIC STATS (no auth) ==================
app.get('/api/public/stats', (req, res) => {
  const lawyersCount = db.prepare('SELECT COUNT(*) as count FROM lawyers').get().count;
  const partnersCount = db.prepare("SELECT COUNT(*) as count FROM lawyers WHERE role = 'partner'").get().count;
  const associatesCount = db.prepare("SELECT COUNT(*) as count FROM lawyers WHERE role = 'associate'").get().count;
  const insightsCount = db.prepare('SELECT COUNT(*) as count FROM insights').get().count;
  const practiceAreasCount = db.prepare('SELECT COUNT(*) as count FROM practice_areas').get().count;
  res.json({
    lawyers_count: lawyersCount,
    partners_count: partnersCount,
    associates_count: associatesCount,
    insights_count: insightsCount,
    practice_areas_count: practiceAreasCount
  });
});

// ================== CONTACT FORM SUBMISSIONS ==================

db.exec(`CREATE TABLE IF NOT EXISTS contact_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT DEFAULT '',
  matter TEXT DEFAULT '',
  content TEXT DEFAULT '',
  ip TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

app.post('/api/public/contact', (req, res) => {
  const { name, phone, email, matter, content } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '姓名不能为空' });
  if (!phone || !phone.trim()) return res.status(400).json({ error: '手机号不能为空' });
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  try {
    db.prepare(`INSERT INTO contact_submissions (name, phone, email, matter, content, ip) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(name.trim(), phone.trim(), email.trim() || '', matter || '', content.trim() || '', ip);
    console.log(`[Contact] New submission from ${name} (${phone}) - ${matter}`);
    res.json({ success: true, message: '提交成功，我们的律师将在24小时内与您联系' });
  } catch (e) {
    console.error('Contact submission error:', e);
    res.status(500).json({ error: '提交失败，请稍后重试' });
  }
});

app.listen(PORT, () => {
  console.log(`jsjunshao-admin API running on http://127.0.0.1:${PORT}`);
  console.log('Admin panel: http://127.0.0.1:' + PORT + '/admin/');
});
