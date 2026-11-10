import { createServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const categories = ['助眠', '能量', '关系', '减压', '专注'];
const maxAudioSize = 25 * 1024 * 1024;
const dataDir = process.env.FLOWDO_DATA_DIR || join(import.meta.dirname, '.local');
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(join(dataDir, 'meditations.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  mime TEXT NOT NULL,
  audio BLOB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_at INTEGER NOT NULL
) STRICT`);
const columns = 'id, title, category, status, created_at AS createdAt';
const listAll = db.prepare(`SELECT ${columns} FROM tracks ORDER BY created_at DESC, id`);
const listPublished = db.prepare("SELECT id, title, category FROM tracks WHERE status='published' ORDER BY created_at DESC, id");
const insert = db.prepare('INSERT INTO tracks (id,title,category,mime,audio,created_at) VALUES (?,?,?,?,?,?)');
const changeStatus = db.prepare('UPDATE tracks SET status=? WHERE id=?');
const mediaInfo = db.prepare('SELECT mime, length(audio) AS size, status FROM tracks WHERE id=?');
const mediaBytes = db.prepare('SELECT substr(audio, ?, ?) AS audio FROM tracks WHERE id=?');

const adminCode = randomBytes(18).toString('base64url');
let sessionToken;
let loginFailures = 0;
let loginRetryAt = 0;
let origin;
const demoDir = join(import.meta.dirname, '..');
const staticFiles = new Map([
  ['/dir-1.html', [join(demoDir, 'dir-1.html'), 'text/html; charset=utf-8']],
  ['/assets/meditation-bowl-demo.wav', [join(demoDir, 'assets/meditation-bowl-demo.wav'), 'audio/wav']],
  ...['flowdo-logo-ink.svg','flowdo-logo-white.svg'].map(name =>
    ['/assets/' + name, [join(demoDir, 'assets', name), 'image/svg+xml']]),
  ['/admin', [join(import.meta.dirname, 'index.html'), 'text/html; charset=utf-8']],
  ['/console.js', [join(import.meta.dirname, 'console.js'), 'text/javascript; charset=utf-8']],
  ['/admin.js', [join(import.meta.dirname, 'admin.js'), 'text/javascript; charset=utf-8']],
  ['/admin.css', [join(import.meta.dirname, 'admin.css'), 'text/css; charset=utf-8']],
]);

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit) {
  if (Number(req.headers['content-length']) > limit) {
    throw new RequestError(413, '文件或请求内容超过大小限制。');
  }
  const parts = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limit) throw new RequestError(413, '文件或请求内容超过大小限制。');
    parts.push(chunk);
  }
  return Buffer.concat(parts, size);
}

async function readJson(req) {
  const body = await readBody(req, 2048);
  try {
    return JSON.parse(body.toString());
  } catch {
    throw new RequestError(400, '请求内容无效。');
  }
}

function decodeHeader(value) {
  try {
    return decodeURIComponent(value || '').trim();
  } catch {
    throw new RequestError(400, '音频名称或分类无效。');
  }
}

function audioType(body) {
  const tag = body.toString('ascii', 0, 4);
  if (tag === 'RIFF' && body.toString('ascii', 8, 12) === 'WAVE') return 'audio/wav';
  if (body.length > 12 && body.toString('ascii', 4, 8) === 'ftyp') return 'audio/mp4';
  if (body.length > 10 && (tag.startsWith('ID3') || (body[0] === 255 && (body[1] & 224) === 224))) return 'audio/mpeg';
  return null;
}

function isAdmin(req) {
  return sessionToken && req.headers.cookie?.split(';').some(cookie =>
    cookie.trim() === 'flowdo_meditation_admin=' + sessionToken);
}

function serveAudio(req, res, id, admin) {
  const track = mediaInfo.get(id);
  if (!track || (!admin && track.status !== 'published')) {
    throw new RequestError(404, '音频不存在或已下架。');
  }
  const headers = { 'Content-Type': track.mime, 'Accept-Ranges': 'bytes' };
  let start = 0;
  let end = track.size - 1;
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match?.[1]) {
      start = Number(match[1]);
      if (match[2]) end = Math.min(end, Number(match[2]));
    } else if (match?.[2]) {
      start = Math.max(0, track.size - Number(match[2]));
    }
    if (!match || (!match[1] && !match[2]) || start > end) {
      res.writeHead(416, { ...headers, 'Content-Range': 'bytes */' + track.size });
      res.end();
      return;
    }
    headers['Content-Range'] = `bytes ${start}-${end}/${track.size}`;
  }
  const length = end - start + 1;
  res.writeHead(range ? 206 : 200, { ...headers, 'Content-Length': length });
  res.end(req.method === 'HEAD' ? undefined : mediaBytes.get(start + 1, length, id).audio);
}

async function handle(req, res) {
  const { method } = req;
  if (req.headers.host !== new URL(origin).host) throw new RequestError(403, '访问地址无效。');
  const { pathname: path } = new URL(req.url, origin);
  if (method === 'GET' && (path === '/' || path === '/admin/')) {
    res.writeHead(302, { Location: path === '/' ? '/dir-1.html' : '/admin' });
    res.end();
    return;
  }
  if (method === 'GET' && staticFiles.has(path)) {
    const [file, contentType] = staticFiles.get(path);
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
    return;
  }
  const prefix = '/api/meditation';
  if (!path.startsWith(prefix + '/')) throw new RequestError(404, '页面不存在。');
  const route = path.slice(prefix.length);
  if (method === 'GET' && route === '/tracks') return json(res, 200, listPublished.all());
  const mediaRoute = /^(\/admin)?\/audio\/([a-f0-9-]{36})$/.exec(route);
  if (mediaRoute && !mediaRoute[1] && (method === 'GET' || method === 'HEAD')) {
    return serveAudio(req, res, mediaRoute[2], false);
  }
  if (!route.startsWith('/admin/')) throw new RequestError(404, '操作不存在。');
  if (method !== 'GET' && method !== 'HEAD' && req.headers.origin !== origin) {
    throw new RequestError(403, '请从本机管理页面操作。');
  }
  if (method === 'POST' && route === '/admin/login') {
    if (Date.now() < loginRetryAt) throw new RequestError(429, '尝试次数过多，请一分钟后重试。');
    const { code } = (await readJson(req)) || {};
    const supplied = Buffer.from(typeof code === 'string' ? code.trim() : '');
    const expected = Buffer.from(adminCode);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      if (++loginFailures >= 5) {
        loginRetryAt = Date.now() + 60_000;
        loginFailures = 0;
      }
      throw new RequestError(401, '管理密码不正确，请查看启动窗口。');
    }
    loginFailures = 0;
    sessionToken = randomBytes(32).toString('base64url');
    res.setHeader('Set-Cookie', 'flowdo_meditation_admin=' + sessionToken + '; Path=/api/meditation/admin; HttpOnly; SameSite=Strict');
    return json(res, 200, { ok: true });
  }
  if (!isAdmin(req)) throw new RequestError(401, '请先登录。');
  if (method === 'POST' && route === '/admin/logout') {
    sessionToken = undefined;
    res.setHeader('Set-Cookie', 'flowdo_meditation_admin=; Path=/api/meditation/admin; Max-Age=0; HttpOnly; SameSite=Strict');
    return json(res, 200, { ok: true });
  }
  if (mediaRoute && (method === 'GET' || method === 'HEAD')) return serveAudio(req, res, mediaRoute[2], true);
  if (method === 'GET' && route === '/admin/tracks') return json(res, 200, listAll.all());
  if (method === 'POST' && route === '/admin/tracks') {
    const title = decodeHeader(req.headers['x-track-title']);
    const category = decodeHeader(req.headers['x-track-category']);
    if (!title || title.length > 80 || !categories.includes(category)) {
      throw new RequestError(400, '请输入 1 到 80 个字符的名称并选择分类。');
    }
    const body = await readBody(req, maxAudioSize);
    const mime = audioType(body);
    if (!mime) throw new RequestError(415, '请选择有效的 MP3、M4A 或 WAV 音频。');
    const id = randomUUID();
    insert.run(id, title, category, mime, body, Date.now());
    return json(res, 201, { id });
  }
  const statusRoute = /^\/admin\/tracks\/([a-f0-9-]{36})$/.exec(route);
  if (method === 'PATCH' && statusRoute) {
    const { status } = (await readJson(req)) || {};
    if (!['published', 'archived'].includes(status)) throw new RequestError(400, '发布状态无效。');
    if (!changeStatus.run(status, statusRoute[1]).changes) throw new RequestError(404, '找不到该音频。');
    return json(res, 200, { ok: true });
  }
  throw new RequestError(404, '操作不存在。');
}

const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  try {
    await handle(req, res);
  } catch (error) {
    if (res.headersSent) return res.destroy();
    if (error instanceof RequestError) return json(res, error.status, { message: error.message });
    console.error(error);
    json(res, 500, { message: '暂时无法完成操作，请重试。' });
  }
});
server.listen(Number(process.env.FLOWDO_PORT || 8765), '127.0.0.1', () => {
  origin = 'http://127.0.0.1:' + server.address().port;
  console.log('地址 ' + origin);
  console.log('后台 ' + origin + '/admin');
  console.log('手账 ' + origin + '/dir-1.html#meditation');
  console.log('管理密码 ' + adminCode);
});
