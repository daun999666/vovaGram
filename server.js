const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");
const { Server } = require("socket.io");
const { spawn } = require("child_process");
const { cleanUsername, boundedInteger, sanitizeMessageBody, isValidUploadPath } = require("./src/shared/validation");

// Tiny .env loader so the project does not need an extra runtime dependency.
const envCandidates = process.pkg
  ? [path.join(path.dirname(process.execPath), ".env"), path.resolve(path.dirname(process.execPath), "..", ".env")]
  : [path.join(__dirname, ".env")];
const envFile = envCandidates.find(candidate => fs.existsSync(candidate));
if (envFile) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}

const PORT = Number(process.env.PORT || 8787);
const SECRET = process.env.JWT_SECRET || crypto.randomBytes(48).toString("hex");
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : process.pkg
    ? path.join(process.env.APPDATA || os.homedir(), "vovchikGram")
    : path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const uploadDir = path.join(dataDir, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const db = new Database(path.join(dataDir, "vovchikgram.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS auth_sessions (
 id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, user_agent TEXT DEFAULT '',
 ip_hint TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 expires_at TEXT NOT NULL, revoked_at TEXT DEFAULT '',
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS auth_rate_limits (
 bucket_key TEXT PRIMARY KEY, failures INTEGER NOT NULL DEFAULT 0,
 window_started INTEGER NOT NULL, blocked_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS account_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
 event TEXT NOT NULL, details TEXT NOT NULL DEFAULT '{}',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_account_events_user ON account_events(user_id,id DESC);
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT, number TEXT UNIQUE NOT NULL,
 username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
 display_name TEXT NOT NULL, bio TEXT DEFAULT '', avatar TEXT DEFAULT '',
 profile_bg TEXT DEFAULT '', theme TEXT DEFAULT 'blue', role TEXT DEFAULT 'user',
 banned INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS user_names (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
 username TEXT UNIQUE NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS chats (
 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT DEFAULT '',
 type TEXT DEFAULT 'group', owner_id INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS members (
 chat_id INTEGER NOT NULL, user_id INTEGER NOT NULL, role TEXT DEFAULT 'member',
 PRIMARY KEY(chat_id,user_id)
);
CREATE TABLE IF NOT EXISTS messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
 body TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS songs (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,title TEXT NOT NULL,file_url TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS chat_reads (chat_id INTEGER NOT NULL,user_id INTEGER NOT NULL,last_read_message_id INTEGER NOT NULL DEFAULT 0,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(chat_id,user_id));
CREATE TABLE IF NOT EXISTS chat_pins (chat_id INTEGER NOT NULL,message_id INTEGER NOT NULL,pinned_by INTEGER NOT NULL,pinned_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(chat_id,message_id));
CREATE TABLE IF NOT EXISTS saved_messages (user_id INTEGER NOT NULL,message_id INTEGER NOT NULL,saved_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,message_id));
CREATE TABLE IF NOT EXISTS chat_preferences (user_id INTEGER NOT NULL,chat_id INTEGER NOT NULL,archived INTEGER DEFAULT 0,starred INTEGER DEFAULT 0,muted INTEGER DEFAULT 0,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,chat_id));
CREATE TABLE IF NOT EXISTS message_edits (id INTEGER PRIMARY KEY AUTOINCREMENT,message_id INTEGER NOT NULL,edited_by INTEGER NOT NULL,body TEXT NOT NULL,edited_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS chat_drafts (user_id INTEGER NOT NULL,chat_id INTEGER NOT NULL,body TEXT NOT NULL DEFAULT '',updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,chat_id));
CREATE TABLE IF NOT EXISTS hidden_messages (user_id INTEGER NOT NULL,message_id INTEGER NOT NULL,hidden_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,message_id));
CREATE TABLE IF NOT EXISTS blocked_users (blocker_id INTEGER NOT NULL,blocked_id INTEGER NOT NULL,blocked_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(blocker_id,blocked_id));
CREATE TABLE IF NOT EXISTS chat_invites (token TEXT PRIMARY KEY,chat_id INTEGER NOT NULL,created_by INTEGER NOT NULL,expires_at TEXT,max_uses INTEGER DEFAULT 0,uses INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS chat_join_requests (
 id INTEGER PRIMARY KEY AUTOINCREMENT,chat_id INTEGER NOT NULL,user_id INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',requested_at TEXT DEFAULT CURRENT_TIMESTAMP,
 reviewed_at TEXT,reviewed_by INTEGER,UNIQUE(chat_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_join_requests_chat_status ON chat_join_requests(chat_id,status,requested_at);
CREATE TABLE IF NOT EXISTS scheduled_messages (id INTEGER PRIMARY KEY AUTOINCREMENT,chat_id INTEGER NOT NULL,user_id INTEGER NOT NULL,body TEXT NOT NULL DEFAULT '',attachments TEXT DEFAULT '[]',scheduled_at INTEGER NOT NULL,status TEXT DEFAULT 'pending',sent_message_id INTEGER,error TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TRIGGER IF NOT EXISTS cleanup_deleted_message_references
AFTER DELETE ON messages
BEGIN
  DELETE FROM chat_pins WHERE message_id=OLD.id;
  DELETE FROM saved_messages WHERE message_id=OLD.id;
  DELETE FROM message_edits WHERE message_id=OLD.id;
  DELETE FROM hidden_messages WHERE message_id=OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS cleanup_departed_member_chat_state
AFTER DELETE ON members
BEGIN
  DELETE FROM chat_reads WHERE chat_id=OLD.chat_id AND user_id=OLD.user_id;
  DELETE FROM chat_drafts WHERE chat_id=OLD.chat_id AND user_id=OLD.user_id;
  DELETE FROM chat_preferences WHERE chat_id=OLD.chat_id AND user_id=OLD.user_id;
  DELETE FROM chat_invites WHERE chat_id=OLD.chat_id AND created_by=OLD.user_id;
  UPDATE scheduled_messages SET status='cancelled',error='Автор покинул чат' WHERE chat_id=OLD.chat_id AND user_id=OLD.user_id AND status='pending';
  DELETE FROM hidden_messages
    WHERE user_id=OLD.user_id
      AND message_id IN (SELECT id FROM messages WHERE chat_id=OLD.chat_id);
END;
CREATE TRIGGER IF NOT EXISTS cleanup_deleted_chat_state
AFTER DELETE ON chats
BEGIN
  DELETE FROM chat_reads WHERE chat_id=OLD.id;
  DELETE FROM chat_pins WHERE chat_id=OLD.id;
  DELETE FROM chat_drafts WHERE chat_id=OLD.id;
  DELETE FROM chat_preferences WHERE chat_id=OLD.id;
  DELETE FROM chat_invites WHERE chat_id=OLD.id;
  DELETE FROM scheduled_messages WHERE chat_id=OLD.id;
END;
`);
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(x=>x.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
ensureColumn("chats","avatar","TEXT DEFAULT ''");
ensureColumn("chats","wallpaper","TEXT DEFAULT ''");
ensureColumn("chats","slow_mode_seconds","INTEGER DEFAULT 0");
ensureColumn("chats","username","TEXT");
ensureColumn("messages","sender_as_channel","INTEGER DEFAULT 0");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_username ON chats(username COLLATE NOCASE) WHERE username IS NOT NULL AND username<>''");
db.exec("CREATE TABLE IF NOT EXISTS channel_post_views (message_id INTEGER NOT NULL,user_id INTEGER NOT NULL,viewed_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(message_id,user_id))");
ensureColumn("messages","reply_to","INTEGER");
ensureColumn("messages","edited_at","TEXT");
ensureColumn("messages","reactions","TEXT DEFAULT '{}'");
ensureColumn("messages","attachments","TEXT DEFAULT '[]'");
ensureColumn("messages","forwarded_from_message_id","INTEGER");
ensureColumn("messages","forwarded_from_user_id","INTEGER");
ensureColumn("messages","forwarded_from_name","TEXT");
ensureColumn("messages","forwarded_from_chat_id","INTEGER");
ensureColumn("messages","forwarded_from_chat_title","TEXT");
ensureColumn("chat_preferences","pinned","INTEGER DEFAULT 0");
ensureColumn("chat_preferences","muted_until","INTEGER DEFAULT 0");

const q = (sql) => db.prepare(sql);
const getUser = q("SELECT id,number,username,display_name,bio,avatar,profile_bg,theme,role,banned,created_at FROM users WHERE id=?");
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_LOCK_MS = 15 * 60 * 1000;
const AUTH_MAX_FAILURES = 5;
function recordAccountEvent(userId,event,details={}) {
  if (!userId) return;
  q("INSERT INTO account_events(user_id,event,details) VALUES(?,?,?)")
    .run(userId,String(event).slice(0,64),JSON.stringify(details).slice(0,1000));
}
function throttleKey(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}
function throttleState(key,now=Date.now()) {
  return q("SELECT failures,window_started,blocked_until FROM auth_rate_limits WHERE bucket_key=?").get(key);
}
function isThrottled(key,now=Date.now()) {
  const row=throttleState(key,now);
  return !!row && Number(row.blocked_until)>now;
}
function registerThrottleFailure(key,{windowMs=AUTH_WINDOW_MS,lockMs=AUTH_LOCK_MS,maxFailures=AUTH_MAX_FAILURES}={},now=Date.now()) {
  const row=throttleState(key,now);
  const active=row && now-Number(row.window_started)<windowMs;
  const failures=(active?Number(row.failures):0)+1;
  const windowStarted=active?Number(row.window_started):now;
  const blockedUntil=failures>=maxFailures?now+lockMs:0;
  q("INSERT INTO auth_rate_limits(bucket_key,failures,window_started,blocked_until) VALUES(?,?,?,?) ON CONFLICT(bucket_key) DO UPDATE SET failures=excluded.failures,window_started=excluded.window_started,blocked_until=excluded.blocked_until")
    .run(key,failures,windowStarted,blockedUntil);
  return blockedUntil;
}
function clearThrottle(key) { q("DELETE FROM auth_rate_limits WHERE bucket_key=?").run(key); }
function requestLoginBuckets(username,req) {
  const ip=String(req.ip||req.socket?.remoteAddress||"unknown").slice(0,120);
  return [throttleKey("login-ip:"+ip),throttleKey("login-user:"+username+"|"+ip)];
}
const tokenFor = (u, req) => {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30*24*60*60*1000).toISOString();
  q("INSERT INTO auth_sessions(id,user_id,user_agent,ip_hint,expires_at) VALUES(?,?,?,?,?)")
    .run(id,u.id,String(req?.headers?.["user-agent"]||"").slice(0,240),String(req?.ip||"").slice(0,80),expiresAt);
  return jwt.sign({ id:u.id, sid:id }, SECRET, { expiresIn:"30d" });
};
function publicUser(u) {
  if (!u) return null;
  return { id:u.id, number:u.number, username:u.username, displayName:u.display_name,
    bio:u.bio, avatar:u.avatar, profileBg:u.profile_bg, theme:u.theme, role:u.role, verified:["owner","dev"].includes(u.role) };
}
function auth(req,res,next) {
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const payload = jwt.verify(token, SECRET);
    const user = getUser.get(payload.id);
    const session = payload.sid && q("SELECT id FROM auth_sessions WHERE id=? AND user_id=? AND revoked_at='' AND expires_at>?").get(payload.sid,user?.id||0,new Date().toISOString());
    if (!user || user.banned || !session) return res.status(401).json({error:"Сессия завершена. Войдите снова."});
    req.sessionId = payload.sid;
    req.user = user; next();
  } catch { res.status(401).json({error:"Войдите в аккаунт"}); }
}
function admin(req,res,next) {
  if (!["owner","dev"].includes(req.user.role)) return res.status(403).json({error:"Недостаточно прав"});
  next();
}
function uniqueNumber() {
  let n;
  do { n = "+888 " + String(100000 + crypto.randomInt(0,899999)).replace(/(\d{3})(\d{3})/,"$1 $2"); }
  while (q("SELECT id FROM users WHERE number=?").get(n));
  return n;
}
function bootstrap() {
  const seeds = [
    {username:"owner", role:"owner", password:process.env.OWNER_PASSWORD, number:"+888000888"},
    {username:"dev", role:"dev", password:process.env.DEV_PASSWORD}
  ];
  for (const s of seeds) {
    if (!s.password || q("SELECT id FROM users WHERE username=?").get(s.username)) continue;
    q("INSERT INTO users(number,username,password_hash,display_name,role) VALUES(?,?,?,?,?)")
      .run(s.number || uniqueNumber(), s.username, bcrypt.hashSync(s.password,10), s.username, s.role);
  }
}
bootstrap();

// Keep the reserved owner contact number stable across existing installations.
// If an older build assigned it to another account, move that account to a generated number first.
function migrateOwnerNumber() {
  const owner = q("SELECT id FROM users WHERE username='owner' AND role='owner'").get();
  if (!owner) return;
  const holder = q("SELECT id,role FROM users WHERE number IN (?,?) AND id<>? LIMIT 1")
    .get("+888000888", "+888 000 888", owner.id);
  if (holder) {
    // The number is reserved for the owner account. Preserve the other account,
    // but give it a fresh generated number before assigning the reserved one.
    if (holder.role === "owner") return;
    q("UPDATE users SET number=? WHERE id=?").run(uniqueNumber(), holder.id);
  }
  q("UPDATE users SET number=? WHERE id=?").run("+888000888", owner.id);
}
migrateOwnerNumber();

app.use(express.json({limit:"32mb"}));
app.use("/uploads", express.static(uploadDir, { fallthrough:false, dotfiles:"deny", index:false }));
// Serve the installed Material Web Components package as same-origin assets.
app.use("/vendor/material", express.static(path.join(__dirname,"node_modules","material","dist"), { fallthrough:false, dotfiles:"deny", index:false }));
app.use(express.static(path.join(__dirname,"public")));
app.get("/api/health", (req,res)=>res.json({ok:true, app:"vovchikGram", version:"2.0.0-dev.4"}));

app.post("/api/register", (req,res)=>{
  const registerKey=throttleKey("register-ip:"+String(req.ip||req.socket?.remoteAddress||"unknown").slice(0,120));
  if(isThrottled(registerKey)) return res.status(429).json({error:"Слишком много попыток регистрации. Попробуйте позже."});
  const username = cleanUsername(req.body.username);
  const password = String(req.body.password || "");
  const displayName = String(req.body.displayName || username).trim().slice(0,40);
  if (!/^[a-z0-9_]{3,24}$/.test(username)) return res.status(400).json({error:"Юзернейм: 3–24 символа, латиница, цифры и _"});
  if (password.length < 8) return res.status(400).json({error:"Пароль должен быть не короче 8 символов"});
  if (q("SELECT id FROM users WHERE username=? UNION SELECT user_id AS id FROM user_names WHERE username=?").get(username,username)) return res.status(409).json({error:"Юзернейм уже занят"});
  const registrationBlocked=registerThrottleFailure(registerKey,{windowMs:60*60*1000,lockMs:60*60*1000,maxFailures:6});
  if(registrationBlocked) return res.status(429).json({error:"Лимит регистраций с этого подключения исчерпан. Попробуйте позже."});
  try {
    const number = uniqueNumber();
    const info = q("INSERT INTO users(number,username,password_hash,display_name) VALUES(?,?,?,?)")
      .run(number,username,bcrypt.hashSync(password,10),displayName || username);
    const u = getUser.get(info.lastInsertRowid);
    recordAccountEvent(u.id,"account_registered");
    return res.json({token:tokenFor(u,req), user:publicUser(u)});
  } catch { return res.status(500).json({error:"Не удалось создать аккаунт"}); }
});
app.post("/api/login",(req,res)=>{
  const username = cleanUsername(req.body.username), password = String(req.body.password || "");
  const buckets=requestLoginBuckets(username,req);
  if(buckets.some(key=>isThrottled(key))) return res.status(429).json({error:"Слишком много неудачных попыток входа. Попробуйте через 15 минут."});
  const u = q("SELECT * FROM users WHERE username=? OR id IN (SELECT user_id FROM user_names WHERE username=?) LIMIT 1").get(username,username);
  if (!u || !bcrypt.compareSync(password,u.password_hash)) {
    const locks=buckets.map((key,index)=>registerThrottleFailure(key,{maxFailures:index===0?20:AUTH_MAX_FAILURES}));
    if(u) recordAccountEvent(u.id,"login_failed");
    if(locks.some(Boolean)) return res.status(429).json({error:"Слишком много неудачных попыток входа. Попробуйте через 15 минут."});
    return res.status(401).json({error:"Неверный юзернейм или пароль"});
  }
  if (u.banned) return res.status(403).json({error:"Аккаунт заблокирован"});
  clearThrottle(buckets[1]);
  recordAccountEvent(u.id,"login_succeeded");
  res.json({token:tokenFor(u,req),user:publicUser(u)});
});
app.get("/api/account/activity",auth,(req,res)=>{
  const events=q("SELECT id,event,details,created_at FROM account_events WHERE user_id=? ORDER BY id DESC LIMIT 50").all(req.user.id);
  res.json({events:events.map(event=>({...event,details:JSON.parse(event.details||"{}")}))});
});
app.post("/api/account/password",auth,(req,res)=>{
  const currentPassword=String(req.body.currentPassword||"");
  const newPassword=String(req.body.newPassword||"");
  if(newPassword.length<8||newPassword.length>128) return res.status(400).json({error:"Новый пароль должен содержать от 8 до 128 символов"});
  if(!bcrypt.compareSync(currentPassword,req.user.password_hash)) return res.status(403).json({error:"Текущий пароль указан неверно"});
  if(bcrypt.compareSync(newPassword,req.user.password_hash)) return res.status(400).json({error:"Новый пароль должен отличаться от текущего"});
  const hash=bcrypt.hashSync(newPassword,10);
  db.transaction(()=>{
    q("UPDATE users SET password_hash=? WHERE id=?").run(hash,req.user.id);
    q("UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND id<>? AND revoked_at=''").run(req.user.id,req.sessionId);
    recordAccountEvent(req.user.id,"password_changed");
  })();
  for(const socket of io.sockets.sockets.values())if(socket.user?.id===req.user.id&&socket.sessionId!==req.sessionId)socket.disconnect(true);
  res.json({ok:true,revokedOtherSessions:q("SELECT COUNT(*) AS count FROM auth_sessions WHERE user_id=? AND revoked_at<>''").get(req.user.id).count});
});
app.get("/api/sessions",auth,(req,res)=>{
  const sessions=q("SELECT id,user_agent,ip_hint,created_at,expires_at,revoked_at FROM auth_sessions WHERE user_id=? AND revoked_at='' AND expires_at>? ORDER BY created_at DESC").all(req.user.id,new Date().toISOString());
  res.json({sessions:sessions.map(s=>({...s,current:s.id===req.sessionId}))});
});
app.delete("/api/sessions/:id",auth,(req,res)=>{
  const id=String(req.params.id||"");
  const result=q("UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND revoked_at=''").run(id,req.user.id);
  if(!result.changes)return res.status(404).json({error:"Сессия не найдена или уже завершена"});
  recordAccountEvent(req.user.id,"session_revoked");
  for(const socket of io.sockets.sockets.values())if(socket.sessionId===id)socket.disconnect(true);
  res.json({ok:true});
});
app.post("/api/sessions/revoke-others",auth,(req,res)=>{
  const update=q("UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revoked_at='' AND id<>?").run(req.user.id,req.sessionId);
  if(update.changes)recordAccountEvent(req.user.id,"other_sessions_revoked",{count:update.changes});
  for(const socket of io.sockets.sockets.values())if(socket.user?.id===req.user.id&&socket.sessionId!==req.sessionId)socket.disconnect(true);
  res.json({ok:true,revoked:update.changes});
});
app.post("/api/logout",auth,(req,res)=>{
  q("UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND revoked_at=''").run(req.sessionId,req.user.id);
  recordAccountEvent(req.user.id,"logout");
  for(const socket of io.sockets.sockets.values())if(socket.sessionId===req.sessionId)socket.disconnect(true);
  res.json({ok:true});
});
app.get("/api/me",auth,(req,res)=>res.json({
  user:publicUser(req.user),
  usernames:q("SELECT username FROM user_names WHERE user_id=?").all(req.user.id).map(x=>x.username),
  needsOwnerSetup:!q("SELECT 1 FROM users WHERE role='owner' LIMIT 1").get()
}));
app.post("/api/claim-owner",auth,(req,res)=>{
  if(req.user.username!=="owner") return res.status(403).json({error:"Только аккаунт @owner может активировать панель владельца"});
  if(q("SELECT 1 FROM users WHERE role='owner' LIMIT 1").get()) return res.status(409).json({error:"Владелец уже настроен"});
  const configured=String(process.env.OWNER_PASSWORD||"");
  if(!configured || configured==="change-this-owner-password" || String(req.body.bootstrapPassword||"")!==configured)
    return res.status(403).json({error:"Ключ владельца не совпадает с OWNER_PASSWORD в файле .env"});
  const existingOwner=q("SELECT id FROM users WHERE role='owner' AND id<>? LIMIT 1").get(req.user.id);
  if(existingOwner) return res.status(409).json({error:"Владелец сервера уже назначен другому аккаунту"});
  const numberHolder=q("SELECT id,role FROM users WHERE number IN (?,?) AND id<>? LIMIT 1")
    .get("+888000888", "+888 000 888", req.user.id);
  if(numberHolder && numberHolder.role==="owner")
    return res.status(409).json({error:"Зарезервированный номер уже принадлежит другому владельцу"});
  const activateOwner=db.transaction(()=>{
    if(numberHolder) q("UPDATE users SET number=? WHERE id=?").run(uniqueNumber(),numberHolder.id);
    q("UPDATE users SET role='owner',number=? WHERE id=?").run("+888000888",req.user.id);
  });
  try { activateOwner(); } catch { return res.status(500).json({error:"Не удалось активировать владельца"}); }
  const updated=getUser.get(req.user.id);
  res.json({user:publicUser(updated),needsOwnerSetup:false});
});
app.patch("/api/profile",auth,(req,res)=>{
  const name=String(req.body.displayName??req.user.display_name).trim().slice(0,40)||req.user.display_name;
  const bio=String(req.body.bio??req.user.bio??"").slice(0,160);
  const bg=String(req.body.profileBg??req.user.profile_bg??"").slice(0,500);
  const theme=String(req.body.theme??req.user.theme??"blue").slice(0,24);
  const avatar=String(req.body.avatar??req.user.avatar??"").slice(0,200);
  q("UPDATE users SET display_name=?,bio=?,profile_bg=?,theme=?,avatar=? WHERE id=?").run(name,bio,bg,theme,avatar,req.user.id);
  res.json({user:publicUser(getUser.get(req.user.id))});
});
app.post("/api/usernames",auth,(req,res)=>{
  const username=cleanUsername(req.body.username);
  const count=q("SELECT COUNT(*) n FROM user_names WHERE user_id=?").get(req.user.id).n;
  if(count>=5) return res.status(400).json({error:"Можно добавить максимум 5 дополнительных юзернеймов"});
  if(!/^[a-z0-9_]{3,24}$/.test(username)) return res.status(400).json({error:"Юзернейм должен содержать от 3 до 24 символов: латиница, цифры и _"});
  if(q("SELECT id FROM users WHERE username=? UNION SELECT id FROM user_names WHERE username=?").get(username,username))
    return res.status(409).json({error:"Этот юзернейм уже занят"});
  q("INSERT INTO user_names(user_id,username) VALUES(?,?)").run(req.user.id,username);
  res.json({ok:true});
});
app.delete("/api/usernames/:name",auth,(req,res)=>{
  q("DELETE FROM user_names WHERE user_id=? AND username=?").run(req.user.id,cleanUsername(req.params.name));
  res.json({ok:true});
});
app.get("/api/users/:name",auth,(req,res)=>{
  const name=cleanUsername(req.params.name);
  const u=q("SELECT * FROM users WHERE username=?").get(name) ||
    q("SELECT users.* FROM users JOIN user_names ON users.id=user_names.user_id WHERE user_names.username=?").get(name);
  if(!u) return res.status(404).json({error:"Пользователь не найден"});
  res.json({user:publicUser(u)});
});
app.post("/api/dm",auth,(req,res)=>{
  const username=cleanUsername(req.body.username), target=q("SELECT * FROM users WHERE username=?").get(username) || q("SELECT users.* FROM users JOIN user_names ON users.id=user_names.user_id WHERE user_names.username=?").get(username);
  if(!target || target.banned) return res.status(404).json({error:"Пользователь не найден"});
  if(target.id===req.user.id) return res.status(400).json({error:"Нельзя открыть диалог с собой"});
  const blocked=q("SELECT 1 FROM blocked_users WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)").get(req.user.id,target.id,target.id,req.user.id);
  if(blocked) return res.status(403).json({error:"Личный диалог недоступен из-за блокировки"});
  const existing=q(`SELECT c.id FROM chats c JOIN members a ON a.chat_id=c.id AND a.user_id=? JOIN members b ON b.chat_id=c.id AND b.user_id=? WHERE c.type='direct' LIMIT 1`).get(req.user.id,target.id);
  if(existing) return res.json({chat:q("SELECT * FROM chats WHERE id=?").get(existing.id)});
  const info=q("INSERT INTO chats(title,description,type,owner_id,avatar) VALUES(?,?, 'direct',?,?)").run(target.display_name,"Личный диалог",req.user.id,target.avatar||"");
  q("INSERT INTO members(chat_id,user_id,role) VALUES(?,?,'owner')").run(info.lastInsertRowid,req.user.id);
  q("INSERT INTO members(chat_id,user_id,role) VALUES(?,?,'member')").run(info.lastInsertRowid,target.id);
  res.json({chat:q("SELECT * FROM chats WHERE id=?").get(info.lastInsertRowid)});
});
app.get("/api/blocks",auth,(req,res)=>{
  const users=q(`SELECT u.id,u.username,u.display_name,u.avatar,b.blocked_at
    FROM blocked_users b JOIN users u ON u.id=b.blocked_id
    WHERE b.blocker_id=? ORDER BY b.blocked_at DESC`).all(req.user.id);
  res.json({users});
});
app.post("/api/users/:id/block",auth,(req,res)=>{
  const targetId=Number(req.params.id);
  if(!Number.isSafeInteger(targetId)||targetId<1) return res.status(400).json({error:"Некорректный ID пользователя"});
  if(targetId===req.user.id) return res.status(400).json({error:"Нельзя заблокировать себя"});
  const target=getUser.get(targetId);
  if(!target||target.banned) return res.status(404).json({error:"Пользователь не найден"});
  q("INSERT OR IGNORE INTO blocked_users(blocker_id,blocked_id) VALUES(?,?)").run(req.user.id,targetId);
  res.json({ok:true,blocked:true});
});
app.delete("/api/users/:id/block",auth,(req,res)=>{
  const targetId=Number(req.params.id);
  q("DELETE FROM blocked_users WHERE blocker_id=? AND blocked_id=?").run(req.user.id,targetId);
  res.json({ok:true,blocked:false});
});
app.get("/api/chats",auth,(req,res)=>{
  const chats=q(`SELECT c.*,m.role AS my_role,
    (SELECT COUNT(*) FROM members cm WHERE cm.chat_id=c.id) AS member_count,
    (SELECT body FROM messages WHERE chat_id=c.id ORDER BY id DESC LIMIT 1) last_message,
    (SELECT created_at FROM messages WHERE chat_id=c.id ORDER BY id DESC LIMIT 1) last_time,
    (SELECT COUNT(*) FROM messages um LEFT JOIN chat_reads cr ON cr.chat_id=um.chat_id AND cr.user_id=?
      WHERE um.chat_id=c.id AND um.id>COALESCE(cr.last_read_message_id,0) AND um.user_id<>?
        AND NOT EXISTS(SELECT 1 FROM hidden_messages hm WHERE hm.user_id=? AND hm.message_id=um.id)) AS unread_count,
    (SELECT message_id FROM chat_pins WHERE chat_id=c.id ORDER BY pinned_at DESC,message_id DESC LIMIT 1) AS pinned_message_id,
    (SELECT m2.user_id FROM members m2 WHERE m2.chat_id=c.id AND m2.user_id<>? LIMIT 1) AS peer_user_id,
    COALESCE(cp.archived,0) AS is_archived,
    COALESCE(cp.starred,0) AS is_starred,
    CASE WHEN COALESCE(cp.muted,0)=1 AND (COALESCE(cp.muted_until,0)=0 OR cp.muted_until>CAST(strftime('%s','now') AS INTEGER)) THEN 1 ELSE 0 END AS is_muted,
    COALESCE(cp.muted_until,0) AS muted_until,
    COALESCE(cp.pinned,0) AS is_pinned
    FROM chats c JOIN members m ON m.chat_id=c.id
    LEFT JOIN chat_preferences cp ON cp.chat_id=c.id AND cp.user_id=m.user_id
    WHERE m.user_id=?
    ORDER BY COALESCE(cp.pinned,0) DESC,COALESCE(cp.starred,0) DESC,COALESCE(last_time,c.created_at) DESC`).all(req.user.id,req.user.id,req.user.id,req.user.id,req.user.id);
  const onlineIds=new Set([...onlineUsers.values()]);
  for(const chat of chats){
    if(chat.type==="direct") chat.peer_online=onlineIds.has(chat.peer_user_id);
    else chat.peer_online=false;
  }
  res.json({chats});
});
app.patch("/api/chats/:id/preferences",auth,(req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<1) return res.status(400).json({error:"Некорректный ID чата"});
  if(!q("SELECT 1 FROM members WHERE chat_id=? AND user_id=?").get(id,req.user.id))
    return res.status(403).json({error:"Нет доступа"});
  const current=q("SELECT archived,starred,muted,pinned,muted_until FROM chat_preferences WHERE user_id=? AND chat_id=?").get(req.user.id,id)||{archived:0,starred:0,muted:0,pinned:0,muted_until:0};
  const next={
    archived:req.body.archived===undefined?current.archived:(req.body.archived?1:0),
    starred:req.body.starred===undefined?current.starred:(req.body.starred?1:0),
    muted:req.body.muted===undefined?current.muted:(req.body.muted?1:0),
    pinned:req.body.pinned===undefined?(current.pinned||0):(req.body.pinned?1:0),
    muted_until:Number(current.muted_until)||0
  };
  if(req.body.muteMinutes!==undefined){
    const minutes=Number(req.body.muteMinutes);
    if(![-1,0,60,480,1440,10080].includes(minutes))
      return res.status(400).json({error:"Выберите допустимую длительность отключения уведомлений"});
    next.muted=minutes===0?0:1;
    next.muted_until=minutes===-1||minutes===0?0:Math.floor(Date.now()/1000)+minutes*60;
  } else if(req.body.muted!==undefined) {
    next.muted_until=0;
  }
  q(`INSERT INTO chat_preferences(user_id,chat_id,archived,starred,muted,pinned,muted_until)
    VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(user_id,chat_id) DO UPDATE SET
      archived=excluded.archived,starred=excluded.starred,muted=excluded.muted,pinned=excluded.pinned,
      muted_until=excluded.muted_until,updated_at=CURRENT_TIMESTAMP`)
    .run(req.user.id,id,next.archived,next.starred,next.muted,next.pinned,next.muted_until);
  res.json({ok:true,preferences:next});
});
app.post("/api/chats",auth,(req,res)=>{
  const title=String(req.body.title||"").trim().slice(0,60);
  const description=String(req.body.description||"").slice(0,250);
  const type=["group","channel"].includes(req.body.type)?req.body.type:"group";
  const channelUsername=String(req.body.username||"").trim().replace(/^@/,"").toLowerCase();
  if(!title) return res.status(400).json({error:"Укажите название"});
  if(type==="channel"&&channelUsername&&!/^[a-z0-9_]{5,32}$/.test(channelUsername)) return res.status(400).json({error:"Юзернейм канала: 5–32 символа, латиница, цифры и _"});
  if(type!=="channel"&&channelUsername) return res.status(400).json({error:"Юзернейм доступен только каналам"});
  if(channelUsername&&q("SELECT 1 FROM chats WHERE username=? COLLATE NOCASE").get(channelUsername)) return res.status(409).json({error:"Этот юзернейм канала уже занят"});
  const info=q("INSERT INTO chats(title,description,type,owner_id,avatar,wallpaper,username) VALUES(?,?,?,?,?,?,?)").run(title,description,type,req.user.id,String(req.body.avatar||"").slice(0,200),String(req.body.wallpaper||"").slice(0,200),channelUsername||null);
  q("INSERT INTO members(chat_id,user_id,role) VALUES(?,?,'owner')").run(info.lastInsertRowid,req.user.id);
  const usernames=Array.isArray(req.body.members)?req.body.members.slice(0,30):[];
  for(const raw of usernames){
    const u=q("SELECT id FROM users WHERE username=?").get(cleanUsername(raw));
    if(u) q("INSERT OR IGNORE INTO members(chat_id,user_id) VALUES(?,?)").run(info.lastInsertRowid,u.id);
  }
  const chat=q("SELECT * FROM chats WHERE id=?").get(info.lastInsertRowid);
  res.json({chat});
});
app.get("/api/channels/by-username/:username",auth,(req,res)=>{
  const username=String(req.params.username||"").replace(/^@/,"").toLowerCase();
  const channel=q("SELECT id,title,description,avatar,username,created_at FROM chats WHERE type='channel' AND username=? COLLATE NOCASE").get(username);
  if(!channel) return res.status(404).json({error:"Канал не найден"});
  const member=q("SELECT 1 FROM members WHERE chat_id=? AND user_id=?").get(channel.id,req.user.id);
  res.json({channel,isMember:!!member,memberCount:q("SELECT COUNT(*) n FROM members WHERE chat_id=?").get(channel.id).n});
});
app.get("/api/channels",auth,(req,res)=>{
  const search=String(req.query.q||"").trim().replace(/^@/,"").slice(0,64);
  const like="%"+search+"%";
  const channels=q(`SELECT c.id,c.title,c.description,c.avatar,c.username,c.created_at,
    (SELECT COUNT(*) FROM members m WHERE m.chat_id=c.id) AS member_count
    FROM chats c WHERE c.type='channel' AND c.username IS NOT NULL AND c.username<>'' 
      AND (?='' OR c.title LIKE ? ESCAPE '\\' OR c.username LIKE ? ESCAPE '\\')
    ORDER BY member_count DESC,c.id DESC LIMIT 50`).all(search,like,like);
  res.json({channels});
});
app.post("/api/channels/:id/subscribe",auth,(req,res)=>{
  const id=Number(req.params.id);
  const channel=q("SELECT id FROM chats WHERE id=? AND type='channel' AND username IS NOT NULL AND username<>''").get(id);
  if(!channel) return res.status(404).json({error:"Публичный канал не найден"});
  const added=q("INSERT OR IGNORE INTO members(chat_id,user_id,role) VALUES(?,?,'member')").run(id,req.user.id);
  if(added.changes) io.to("chat:"+id).emit("chat-member-joined",{chatId:id,userId:req.user.id});
  res.json({ok:true,subscribed:true,alreadySubscribed:!added.changes});
});
app.delete("/api/channels/:id/subscribe",auth,(req,res)=>{
  const id=Number(req.params.id);
  const channel=q("SELECT id,owner_id FROM chats WHERE id=? AND type='channel' AND username IS NOT NULL AND username<>''").get(id);
  if(!channel) return res.status(404).json({error:"Публичный канал не найден"});
  if(channel.owner_id===req.user.id) return res.status(403).json({error:"Владелец не может отписаться от собственного канала"});
  q("DELETE FROM members WHERE chat_id=? AND user_id=?").run(id,req.user.id);
  res.json({ok:true,subscribed:false});
});
app.get("/api/chats/:id/messages",auth,(req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<1) return res.status(400).json({error:"Некорректный ID чата"});
  if(!q("SELECT 1 FROM members WHERE chat_id=? AND user_id=?").get(id,req.user.id)) return res.status(403).json({error:"Нет доступа"});
  const before=boundedInteger(req.query.before,0,0,Number.MAX_SAFE_INTEGER);
  const limit=boundedInteger(req.query.limit,50,1,100);
  const select=`SELECT m.id,m.chat_id,m.user_id,m.body,m.attachments,m.created_at,m.reply_to,m.edited_at,m.reactions,
    m.forwarded_from_message_id,m.forwarded_from_user_id,m.forwarded_from_name,m.forwarded_from_chat_id,m.forwarded_from_chat_title,
    (SELECT COUNT(*) FROM messages fw WHERE fw.forwarded_from_message_id=m.id) AS forward_count,
    CASE WHEN m.sender_as_channel=1 THEN NULL ELSE u.username END AS username,
    CASE WHEN m.sender_as_channel=1 THEN c.title ELSE u.display_name END AS display_name,
    CASE WHEN m.sender_as_channel=1 THEN c.avatar ELSE u.avatar END AS avatar,
    CASE WHEN m.sender_as_channel=1 THEN NULL ELSE u.role END AS role,
    CASE WHEN m.sender_as_channel=1 THEN NULL ELSE (SELECT cm.role FROM members cm WHERE cm.chat_id=m.chat_id AND cm.user_id=m.user_id) END AS chat_role,
    CASE WHEN m.sender_as_channel=1 THEN 1 ELSE 0 END AS sender_is_channel,
    CASE WHEN m.user_id=? THEN 1 ELSE 0 END AS is_mine,
    (SELECT COUNT(*) FROM chat_reads cr WHERE cr.chat_id=m.chat_id AND cr.user_id<>m.user_id AND cr.last_read_message_id>=m.id) AS read_by_count,
    EXISTS(SELECT 1 FROM chat_pins cp WHERE cp.chat_id=m.chat_id AND cp.message_id=m.id) AS is_pinned
    FROM messages m JOIN users u ON u.id=m.user_id JOIN chats c ON c.id=m.chat_id WHERE m.chat_id=? AND NOT EXISTS(SELECT 1 FROM hidden_messages hm WHERE hm.user_id=? AND hm.message_id=m.id)`;
  const rows=before
    ? q(select+" AND m.id<? ORDER BY m.id DESC LIMIT ?").all(req.user.id,id,req.user.id,before,limit+1)
    : q(select+" ORDER BY m.id DESC LIMIT ?").all(req.user.id,id,req.user.id,limit+1);
  if(q("SELECT type FROM chats WHERE id=?").get(id)?.type==="channel"){
    const viewed=rows.filter(message=>message.user_id!==req.user.id).map(message=>message.id);
    const markView=q("INSERT OR IGNORE INTO channel_post_views(message_id,user_id) VALUES(?,?)");
    for(const messageId of viewed)markView.run(messageId,req.user.id);
    for(const message of rows)message.view_count=q("SELECT COUNT(*) AS n FROM channel_post_views WHERE message_id=?").get(message.id).n;
  }
  const hasMore=rows.length>limit;
  const messages=rows.slice(0,limit).reverse();
  res.json({messages,hasMore,nextCursor:messages[0]?.id||null});
});
app.get("/api/chats/:id/members",auth,(req,res)=>{
  const id=Number(req.params.id);
  if(!q("SELECT 1 FROM members WHERE chat_id=? AND user_id=?").get(id,req.user.id))
    return res.status(403).json({error:"Нет доступа"});
  const members=q(`SELECT u.id,u.username,u.display_name,u.avatar,u.role AS account_role,m.role AS chat_role
    FROM members m JOIN users u ON u.id=m.user_id
    WHERE m.chat_id=? ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,u.display_name COLLATE NOCASE`).all(id);
  res.json({members});
});
app.patch("/api/chats/:id/members/:userId",auth,(req,res)=>{
  const chatId=Number(req.params.id),targetId=Number(req.params.userId),role=String(req.body.role||"member");
  if(!["admin","member"].includes(role)) return res.status(400).json({error:"Недопустимая роль"});
  const actor=q("SELECT role FROM members WHERE chat_id=? AND user_id=?").get(chatId,req.user.id);
  if(!actor) return res.status(403).json({error:"Нет доступа"});
  const target=q("SELECT role FROM members WHERE chat_id=? AND user_id=?").get(chatId,targetId);
  if(!target) return res.status(404).json({error:"Участник не найден"});
  if(target.role==="owner") return res.status(403).json({error:"Нельзя изменить владельца"});
  const isRoot=["owner","dev"].includes(req.user.role);
  if(!isRoot&&actor.role!=="owner"&&actor.role!=="admin") return res.status(403).json({error:"Недостаточно прав"});
  if(!isRoot&&actor.role==="admin"&&(role==="admin"||target.role==="admin"))
    return res.status(403).json({error:"Администратор может управлять только обычными участниками"});
  if(actor.role==="admin"&&target.role==="admin"&&!isRoot) return res.status(403).json({error:"Нельзя изменить другого администратора"});
  q("UPDATE members SET role=? WHERE chat_id=? AND user_id=?").run(role,chatId,targetId);
  io.to("chat:"+chatId).emit("chat-members-updated",{chatId});
  res.json({ok:true,userId:targetId,role});
});
app.delete("/api/chats/:id/members/:userId",auth,(req,res)=>{
  const chatId=Number(req.params.id),targetId=Number(req.params.userId);
  const actor=q("SELECT role FROM members WHERE chat_id=? AND user_id=?").get(chatId,req.user.id);
  if(!actor) return res.status(403).json({error:"Нет доступа"});
  const target=q("SELECT role FROM members WHERE chat_id=? AND user_id=?").get(chatId,targetId);
  if(!target) return res.status(404).json({error:"Участник не найден"});
  if(target.role==="owner"||targetId===req.user.id) return res.status(403).json({error:"Владельца нельзя удалить; для выхода используй отдельное действие"});
  const isRoot=["owner","dev"].includes(req.user.role);
  if(!isRoot&&actor.role!=="owner"&&actor.role!=="admin") return res.status(403).json({error:"Недостаточно прав"});
  if(!isRoot&&actor.role==="admin"&&target.role!=="member") return res.status(403).json({error:"Администратор может удалить только обычного участника"});
  q("DELETE FROM members WHERE chat_id=? AND user_id=?").run(chatId,targetId);
  io.to("chat:"+chatId).emit("chat-member-removed",{chatId,userId:targetId});
  res.json({ok:true,userId:targetId});
});
app.post("/api/chats/:id/invites",auth,(req,res)=>{
  const chatId=Number(req.params.id);
  const actor=q("SELECT role FROM members WHERE chat_id=? AND user_id=?").get(chatId,req.user.id);
  if(!actor) return res.status(403).json({error:"Нет доступа"});
  if(!["owner","admin"].includes(actor.role)&&!["owner","dev"].includes(req.user.role))
    return res.status(403).json({error:"Создавать ссылки-приглашения могут владельцы и администраторы"});
  const expiresIn=Math.min(30*24*60*60,Math.max(0,Number(req.body.expiresInSeconds)||7*24*60*60));
  const maxUses=Math.min(500,Math.max(0,Number(req.body.maxUses)||0));
  const token=crypto.randomBytes(24).toString("hex");
  const expiresAt=expiresIn?new Date(Date.now()+expiresIn*1000).toISOString():null;
  q("INSERT INTO chat_invites(token,chat_id,created_by,expires_at,max_uses) VALUES(?,?,?,?,?)")
    .run(token,chatId,req.user.id,expiresAt,maxUses);
  res.json({invite:{token,chatId,expiresAt,maxUses,uses:0}});
});
app.delete("/api/chats/:id/invites/:token",auth,(req,res)=>{
  const chatId=Number(req.params.id),token=String(req.params.token||"");
  const actor=q("SELECT role FROM members WHERE chat_id=? AND user_id=?").get(chatId,req.user.id);
  if(!actor) return res.status(403).json({error:"Нет доступа"});
  if(!["owner","admin"].includes(actor.role)&&!["owner","dev"].includes(req.user.role))
    return res.status(403).json({error:"Недостаточно прав"});
  const removed=q("DELETE FROM chat_invites WHERE chat_id=? AND token=?").run(chatId,token);
  if(!removed.changes) return res.status(404).json({error:"Приглашение не найдено"});
  res.json({ok:true,revoked:true});
});
app.get("/api/invites/:token",(req,res)=>{
  const invite=q("SELECT * FROM chat_invites WHERE token=?").get(String(req.params.token||""));
  if(!invite) return res.status(404).json({error:"Приглашение не найдено"});
  const chat=q("SELECT id,title,description,type,avatar FROM chats WHERE id=?").get(invite.chat_id);
  if(!chat) return res.status(404).json({error:"Пространство больше не существует"});
  const expired=!!(invite.expires_at&&new Date(invite.expires_at).getTime()<Date.now());
  const exhausted=!!(invite.max_uses&&invite.uses>=invite.max_uses);
  res.json({chat,invite:{expiresAt:invite.expires_at,maxUses:invite.max_uses,uses:invite.uses,valid:!expired&&!exhausted}});
});
app.post("/api/invites/:token/join",auth,(req,res)=>{
  const token=String(req.params.token||"");
  const invite=q("SELECT * FROM chat_invites WHERE token=?").get(token);
  if(!invite) return res.status(404).json({error:"Приглашение не найдено"});
  if(invite.expires_at&&new Date(invite.expires_at).getTime()<Date.now()) return res.status(410).json({error:"Срок приглашения истёк"});
  if(invite.max_uses&&invite.uses>=invite.max_uses) return res.status(410).json({error:"Лимит использований приглашения исчерпан"});
  const chat=q("SELECT id,title,type FROM chats WHERE id=?").get(invite.chat_id);
  if(!chat) return res.status(404).json({error:"Пространство больше не существует"});
  if(q("SELECT 1 FROM members WHERE chat_id=? AND user_id=?").get(chat.id,req.user.id))
    return res.json({ok:true,chat,alreadyMember:true});
  const join=db.transaction(()=>{
    q("INSERT OR IGNORE INTO members(chat_id,user_id,role) VALUES(?,?,'member')").run(chat.id,req.user.id);
    q("UPDATE chat_invites SET uses=uses+1 WHERE token=?").run(token);
  });
  try{join()}catch{return res.status(500).json({error:"Не удалось вступить в пространство"})}
  io.to("chat:"+chat.id).emit("chat-member-joined",{chatId:chat.id,userId:req.user.id});
  res.json({ok:true,chat});
});
app.post("/api/chats/:id/join-requests",auth,(req,res)=>{
  const chatId=Number(req.params.id);
  if(!Number.isSafeInteger(chatId)||chatId<1) return res.status(400).json({error:"Некорректный ID чата"});
  const chat=q("SELECT id,type FROM chats WHERE id=?").get(chatId);
  if(!chat||chat.type==="direct") return res.status(404).json({error:"Пространство не найдено"});
  if(q("SELECT 1 FROM members WHERE chat_id=? AND user_id=?").get(chatId,req.user.id))
    return res.status(409).json({error:"Ты уже состоишь в этом пространстве"});
  const existing=q("SELECT id,status FROM chat_join_requests WHERE chat_id=? AND user_id=?").get(chatId,req.user.id);
  if(existing?.status==="pending") return res.json({ok:true,requestId:existing.id,pending:true});
  if(existing){
    q("UPDATE chat_join_requests SET status='pending',requested_at=CURRENT_TIMESTAMP,reviewed_at=NULL,reviewed_by=NULL WHERE id=?").run(existing.id);
    return res.json({ok:true,requestId:existing.id,pending:true});
  }
  const result=q("INSERT INTO chat_join_requests(chat_id,user_id) VALUES(?,?)").run(chatId,req.user.id);
  io.to("chat:"+chatId).emit("chat-join-request",{chatId,requestId:result.lastInsertRowid});
  res.json({ok:true,requestId:result.lastInsertRowid,pending:true});
});
app.get("/api/chats/:id/join-requests",auth,(req,res)=>{
  const chatId=Number(req.params.id);
  const actor=q("SELECT role FROM members WHERE chat_id=? AND user_id=?").get(chatId,req.user.id);
  if(!actor) return res.status(403).json({error:"Нет доступа"});
  if(!["owner","admin"].includes(actor.role)&&!["owner","dev"].includes(req.user.role))
    return res.status(403).json({error:"Недостаточно прав"});
  const requests=q(`SELECT r.id,r.requested_at,u.id AS user_id,u.username,u.display_name,u.avatar
    FROM chat_join_requests r JOIN users u ON u.id=r.user_id
    WHERE r.chat_id=? AND r.status='pending' ORDER BY r.requested_at,r.id`).all(chatId);
  res.json({requests});
});
app.patch("/api/chats/:id/join-requests/:requestId",auth,(req,res)=>{
  const chatId=Number(req.params.id),requestId=Number(req.params.requestId);
  const decision=String(req.body.decision||"");
  if(!Number.isSafeInteger(chatId)||chatId<1||!Number.isSafeInteger(requestId)||requestId<1)
    return res.status(400).json({error:"Некорректный ID"});
  if(!["approve","reject"].includes(decision)) return res.status(400).json({error:"Решение должно быть approve или reject"});
  const actor=q("SELECT role FROM members WHERE chat_id=? AND user_id=?").get(chatId,req.user.id);
  if(!actor) return res.status(403).json({error:"Нет доступа"});
  if(!["owner","admin"].includes(actor.role)&&!["owner","dev"].includes(req.user.role))
    return res.status(403).json({error:"Недостаточно прав"});
  const joinRequest=q("SELECT * FROM chat_join_requests WHERE id=? AND chat_id=?").get(requestId,chatId);
  if(!joinRequest||joinRequest.status!=="pending") return res.status(404).json({error:"Заявка уже обработана или не найдена"});
  const review=db.transaction(()=>{
    const changed=q("UPDATE chat_join_requests SET status=?,reviewed_at=CURRENT_TIMESTAMP,reviewed_by=? WHERE id=? AND status='pending'")
      .run(decision==="approve"?"approved":"rejected",req.user.id,requestId);
    if(!changed.changes) return false;
    if(decision==="approve") q("INSERT OR IGNORE INTO members(chat_id,user_id,role) VALUES(?,?,'member')").run(chatId,joinRequest.user_id);
    return true;
  });
  if(!review()) return res.status(409).json({error:"Заявка уже обработана"});
  if(decision==="approve") io.to("chat:"+chatId).emit("chat-member-joined",{chatId,userId:joinRequest.user_id});
  io.to("chat:"+chatId).emit("chat-join-request-reviewed",{chatId,requestId,decision});
  res.json({ok:true,decision,userId:joinRequest.user_id});
});
app.get("/api/chats/:id/draft",auth,(req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<1) return res.status(400).json({error:"Некорректный ID чата"});
  if(!q("SELECT 1 FROM members WHERE chat_id=? AND user_id=?").get(id,req.user.id)) return res.status(403).json({error:"Нет доступа"});
  const draft=q("SELECT body,updated_at FROM chat_drafts WHERE user_id=? AND chat_id=?").get(req.user.id,id);
  res.json({draft:draft||{body:"",updated_at:null}});
});
app.put("/api/chats/:id/draft",auth,(req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<1) return res.status(400).json({error:"Некорректный ID чата"});
  if(!q("SELECT 1 FROM members WHERE chat_id=? AND user_id=?").get(id,req.user.id)) return res.status(403).json({error:"Нет доступа"});
  const body=String(req.body.body||"").slice(0,4000);
  if(!body.trim()){
    q("DELETE FROM chat_drafts WHERE user_id=? AND chat_id=?").run(req.user.id,id);
    return res.json({ok:true,empty:true});
  }
  q(`INSERT INTO chat_drafts(user_id,chat_id,body) VALUES(?,?,?)
    ON CONFLICT(user_id,chat_id) DO UPDATE SET body=excluded.body,updated_at=CURRENT_TIMESTAMP`).run(req.user.id,id,body);
  res.json({ok:true,updated:true});
});
app.delete("/api/chats/:id/draft",auth,(req,res)=>{
  const id=Number(req.params.id);
  if(!q("SELECT 1 FROM members WHERE chat_id=? AND user_id=?").get(id,req.user.id)) return res.status(403).json({error:"Нет доступа"});
  q("DELETE FROM chat_drafts WHERE user_id=? AND chat_id=?").run(req.user.id,id);
  res.json({ok:true});
});
app.get("/api/chats/:id/export",auth,(req,res)=>{
  const chatId=Number(req.params.id);
  if(!Number.isSafeInteger(chatId)||chatId<1) return res.status(400).json({error:"Некорректный ID чата"});
  const chat=q("SELECT id,title,description,type,created_at FROM chats WHERE id=?").get(chatId);
  if(!chat||!q("SELECT 1 FROM members WHERE chat_id=? AND user_id=?").get(chatId,req.user.id))
    return res.status(403).json({error:"Нет доступа"});
  const messages=q(`SELECT m.id,m.body,m.attachments,m.created_at,m.reply_to,m.edited_at,m.reactions,
      m.forwarded_from_name,m.forwarded_from_chat_title,
      u.username,u.display_name
    FROM messages m JOIN users u ON u.id=m.user_id
    WHERE m.chat_id=? AND NOT EXISTS(
      SELECT 1 FROM hidden_messages hm WHERE hm.user_id=? AND hm.message_id=m.id
    )
    ORDER BY m.id ASC LIMIT 10000`).all(chatId,req.user.id);
  res.json({exportedAt:new Date().toISOString(),chat,messages});
});
app.post("/api/chats/:id/read",auth,(req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<1) return res.status(400).json({error:"Некорректный ID чата"});
  if(!q("SELECT 1 FROM members WHERE chat_id=? AND user_id=?").get(id,req.user.id)) return res.status(403).json({error:"Нет доступа"});
  const last=q("SELECT COALESCE(MAX(id),0) AS id FROM messages WHERE chat_id=?").get(id).id;
  q(`INSERT INTO chat_reads(chat_id,user_id,last_read_message_id) VALUES(?,?,?)
    ON CONFLICT(chat_id,user_id) DO UPDATE SET
    last_read_message_id=MAX(chat_reads.last_read_message_id,excluded.last_read_message_id),
    updated_at=CURRENT_TIMESTAMP`).run(id,req.user.id,last);
  io.to("chat:"+id).emit("chat-read",{chatId:id,userId:req.user.id,lastReadMessageId:last});
  res.json({ok:true,lastReadMessageId:last});
});
app.get("/api/chats/:id/pins",auth,(req,res)=>{
  const id=Number(req.params.id);
  if(!q("SELECT 1 FROM members WHERE chat_id=? AND user_id=?").get(id,req.user.id)) return res.status(403).json({error:"Нет доступа"});
  const pins=q(`SELECT m.id,m.chat_id,m.body,m.created_at,m.user_id,u.username,u.display_name,u.avatar,p.pinned_by,p.pinned_at
    FROM chat_pins p JOIN messages m ON m.id=p.message_id JOIN users u ON u.id=m.user_id
    WHERE p.chat_id=? ORDER BY p.pinned_at DESC,p.message_id DESC`).all(id);
  res.json({pins});
});
app.post("/api/chats/:id/pins/:messageId",auth,(req,res)=>{
  const chatId=Number(req.params.id),messageId=Number(req.params.messageId);
  const membership=q("SELECT role FROM members WHERE chat_id=? AND user_id=?").get(chatId,req.user.id);
  if(!membership) return res.status(403).json({error:"Нет доступа"});
  const chat=q("SELECT type FROM chats WHERE id=?").get(chatId);
  if(!chat) return res.status(404).json({error:"Чат не найден"});
  if(chat.type!=="direct"&&!["owner","admin"].includes(membership.role)&&!["owner","dev"].includes(req.user.role))
    return res.status(403).json({error:"Закреплять сообщения могут администраторы"});
  if(!q("SELECT 1 FROM messages WHERE id=? AND chat_id=?").get(messageId,chatId)) return res.status(404).json({error:"Сообщение не найдено"});
  q("INSERT OR IGNORE INTO chat_pins(chat_id,message_id,pinned_by) VALUES(?,?,?)").run(chatId,messageId,req.user.id);
  io.to("chat:"+chatId).emit("pins-updated",{chatId});
  res.json({ok:true,pinned:true});
});
app.delete("/api/chats/:id/pins/:messageId",auth,(req,res)=>{
  const chatId=Number(req.params.id),messageId=Number(req.params.messageId);
  const membership=q("SELECT role FROM members WHERE chat_id=? AND user_id=?").get(chatId,req.user.id);
  if(!membership) return res.status(403).json({error:"Нет доступа"});
  const chat=q("SELECT type FROM chats WHERE id=?").get(chatId);
  if(chat?.type!=="direct"&&!["owner","admin"].includes(membership.role)&&!["owner","dev"].includes(req.user.role))
    return res.status(403).json({error:"Откреплять сообщения могут администраторы"});
  q("DELETE FROM chat_pins WHERE chat_id=? AND message_id=?").run(chatId,messageId);
  io.to("chat:"+chatId).emit("pins-updated",{chatId});
  res.json({ok:true,pinned:false});
});
app.get("/api/saved",auth,(req,res)=>{
  const messages=q(`SELECT m.id,m.chat_id,m.body,m.attachments,m.created_at,m.reply_to,u.username,u.display_name,u.avatar,c.title AS chat_title,s.saved_at
    FROM saved_messages s JOIN messages m ON m.id=s.message_id JOIN users u ON u.id=m.user_id
    JOIN chats c ON c.id=m.chat_id WHERE s.user_id=?
      AND NOT EXISTS(SELECT 1 FROM hidden_messages hm WHERE hm.user_id=s.user_id AND hm.message_id=m.id)
    ORDER BY s.saved_at DESC LIMIT 500`).all(req.user.id);
  res.json({messages});
});
app.post("/api/messages/:id/save",auth,(req,res)=>{
  const id=Number(req.params.id),m=q("SELECT id,chat_id FROM messages WHERE id=?").get(id);
  if(!m) return res.status(404).json({error:"Сообщение не найдено"});
  if(!q("SELECT 1 FROM members WHERE chat_id=? AND user_id=?").get(m.chat_id,req.user.id)) return res.status(403).json({error:"Нет доступа"});
  q("INSERT OR IGNORE INTO saved_messages(user_id,message_id) VALUES(?,?)").run(req.user.id,id);
  res.json({ok:true,saved:true});
});
app.delete("/api/messages/:id/save",auth,(req,res)=>{
  q("DELETE FROM saved_messages WHERE user_id=? AND message_id=?").run(req.user.id,Number(req.params.id));
  res.json({ok:true,saved:false});
});
app.post("/api/chats/:id/messages",auth,(req,res)=>{
  const id=Number(req.params.id), body=sanitizeMessageBody(req.body.body,4000);
  const attachments=Array.isArray(req.body.attachments)?req.body.attachments.slice(0,8):[];
  const validAttachments=attachments.filter(a=>a&&typeof a.url==="string"&&isValidUploadPath(a.url,"attachment")).map(a=>({url:a.url,mime:String(a.mime||"").slice(0,80),name:String(a.name||"attachment").slice(0,120),size:Math.max(0,Math.min(25*1024*1024,Number(a.size)||0))}));
  if(!body&&!validAttachments.length) return res.status(400).json({error:"Добавь текст или изображение"});
  const membership=q("SELECT role FROM members WHERE chat_id=? AND user_id=?").get(id,req.user.id);
  if(!membership) return res.status(403).json({error:"Нет доступа"});
  const chat=q("SELECT type,slow_mode_seconds FROM chats WHERE id=?").get(id);
  const chatType=chat?.type;
  if(chatType==="direct"){
    const other=q("SELECT user_id FROM members WHERE chat_id=? AND user_id<>? LIMIT 1").get(id,req.user.id);
    if(other&&q("SELECT 1 FROM blocked_users WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)").get(req.user.id,other.user_id,other.user_id,req.user.id))
      return res.status(403).json({error:"Нельзя отправить сообщение: один из участников заблокировал другого"});
  }
  if(chatType==="channel" && !["owner","admin"].includes(membership.role) && !["owner","dev"].includes(req.user.role)) return res.status(403).json({error:"Публиковать в канале могут только администраторы"});
  const slowMode=Number(chat?.slow_mode_seconds)||0;
  if(chatType==="group"&&slowMode>0&&!["owner","admin"].includes(membership.role)&&!["owner","dev"].includes(req.user.role)){
    const previous=q("SELECT created_at FROM messages WHERE chat_id=? AND user_id=? ORDER BY id DESC LIMIT 1").get(id,req.user.id);
    if(previous){
      const elapsed=Math.floor((Date.now()-Date.parse(previous.created_at+"Z"))/1000);
      const retryAfter=Math.max(0,slowMode-(Number.isFinite(elapsed)?elapsed:slowMode));
      if(retryAfter>0) return res.status(429).json({error:"Медленный режим: подожди ещё "+retryAfter+" сек.",retryAfter});
    }
  }
  const sendAsChannel=!!req.body.sendAsChannel;
  if(sendAsChannel&&(chatType!=="channel"||!["owner","admin"].includes(membership.role))) return res.status(403).json({error:"Публиковать от лица канала могут только его владелец и администраторы"});
  const replyTo=Number(req.body.replyTo)||null;
  if(replyTo && !q("SELECT id FROM messages WHERE id=? AND chat_id=?").get(replyTo,id)) return res.status(400).json({error:"Сообщение для ответа не найдено"});
  const info=q("INSERT INTO messages(chat_id,user_id,body,reply_to,attachments,sender_as_channel) VALUES(?,?,?,?,?,?)").run(id,req.user.id,body,replyTo,JSON.stringify(validAttachments),sendAsChannel?1:0);
  const message=q(`SELECT m.id,m.chat_id,m.body,m.attachments,m.created_at,m.reply_to,m.edited_at,m.reactions,
    m.forwarded_from_message_id,m.forwarded_from_user_id,m.forwarded_from_name,m.forwarded_from_chat_id,m.forwarded_from_chat_title,
    (SELECT COUNT(*) FROM messages fw WHERE fw.forwarded_from_message_id=m.id) AS forward_count,
    CASE WHEN m.sender_as_channel=1 THEN NULL ELSE u.username END AS username,
    CASE WHEN m.sender_as_channel=1 THEN c.title ELSE u.display_name END AS display_name,
    CASE WHEN m.sender_as_channel=1 THEN c.avatar ELSE u.avatar END AS avatar,
    CASE WHEN m.sender_as_channel=1 THEN NULL ELSE u.role END AS role,
    CASE WHEN m.sender_as_channel=1 THEN NULL ELSE (SELECT cm.role FROM members cm WHERE cm.chat_id=m.chat_id AND cm.user_id=m.user_id) END AS chat_role,
    CASE WHEN m.sender_as_channel=1 THEN 1 ELSE 0 END AS sender_is_channel,
    CASE WHEN m.user_id=? THEN 1 ELSE 0 END AS is_mine
    FROM messages m JOIN users u ON u.id=m.user_id JOIN chats c ON c.id=m.chat_id WHERE m.id=?`).get(req.user.id,info.lastInsertRowid);
  io.to("chat:"+id).emit("message",message);
  res.json({message});
});

app.get("/api/chats/:id/scheduled",auth,(req,res)=>{
  const chatId=Number(req.params.id);
  if(!q("SELECT 1 FROM members WHERE chat_id=? AND user_id=?").get(chatId,req.user.id))
    return res.status(403).json({error:"Нет доступа"});
  const messages=q(`SELECT id,chat_id,body,attachments,scheduled_at,status,error,created_at
    FROM scheduled_messages WHERE chat_id=? AND user_id=? AND status IN ('pending','failed')
    ORDER BY scheduled_at ASC LIMIT 100`).all(chatId,req.user.id);
  res.json({messages});
});
app.post("/api/chats/:id/scheduled",auth,(req,res)=>{
  const chatId=Number(req.params.id),body=sanitizeMessageBody(req.body.body,4000);
  const rawAttachments=Array.isArray(req.body.attachments)?req.body.attachments.slice(0,8):[];
  const attachments=rawAttachments.filter(a=>a&&typeof a.url==="string"&&isValidUploadPath(a.url,"attachment"))
    .map(a=>({url:a.url,mime:String(a.mime||"").slice(0,80),name:String(a.name||"attachment").slice(0,120),size:Math.max(0,Math.min(25*1024*1024,Number(a.size)||0))}));
  if(!body&&!attachments.length) return res.status(400).json({error:"Добавь текст или изображение"});
  const scheduledAt=Date.parse(String(req.body.scheduledAt||""));
  if(!Number.isFinite(scheduledAt)||scheduledAt<Date.now()+1000||scheduledAt>Date.now()+30*24*60*60*1000)
    return res.status(400).json({error:"Выбери время от одной секунды до 30 дней вперёд"});
  const membership=q("SELECT role FROM members WHERE chat_id=? AND user_id=?").get(chatId,req.user.id);
  if(!membership) return res.status(403).json({error:"Нет доступа"});
  const chat=q("SELECT type FROM chats WHERE id=?").get(chatId);
  if(!chat) return res.status(404).json({error:"Чат не найден"});
  if(chat.type==="channel"&&!["owner","admin"].includes(membership.role)&&!["owner","dev"].includes(req.user.role))
    return res.status(403).json({error:"Публиковать в канале могут только администраторы"});
  if(chat.type==="direct"){
    const other=q("SELECT user_id FROM members WHERE chat_id=? AND user_id<>? LIMIT 1").get(chatId,req.user.id);
    if(other&&q("SELECT 1 FROM blocked_users WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)").get(req.user.id,other.user_id,other.user_id,req.user.id))
      return res.status(403).json({error:"Нельзя планировать сообщение: один из участников заблокировал другого"});
  }
  const info=q("INSERT INTO scheduled_messages(chat_id,user_id,body,attachments,scheduled_at) VALUES(?,?,?,?,?)")
    .run(chatId,req.user.id,body,JSON.stringify(attachments),Math.floor(scheduledAt/1000));
  res.json({scheduled:{id:info.lastInsertRowid,chat_id:chatId,body,attachments,scheduled_at:Math.floor(scheduledAt/1000),status:"pending"}});
});
app.delete("/api/scheduled/:id",auth,(req,res)=>{
  const id=Number(req.params.id),row=q("SELECT id,chat_id,status FROM scheduled_messages WHERE id=? AND user_id=?").get(id,req.user.id);
  if(!row) return res.status(404).json({error:"Отложенное сообщение не найдено"});
  if(row.status!=="pending") return res.status(409).json({error:"Это сообщение уже нельзя отменить"});
  q("UPDATE scheduled_messages SET status='cancelled' WHERE id=? AND user_id=? AND status='pending'").run(id,req.user.id);
  res.json({ok:true});
});
app.get("/api/search/messages",auth,(req,res)=>{
  const term=String(req.query.q||"").trim().slice(0,100);
  if(term.length<2) return res.json({messages:[]});
  const chatId=Number(req.query.chatId)||0;
  const before=boundedInteger(req.query.before,0,0,Number.MAX_SAFE_INTEGER);
  const limit=boundedInteger(req.query.limit,20,1,50);
  const pattern="%"+term+"%";
  const messages=q(`SELECT m.id,m.chat_id,m.body,m.created_at,m.reply_to,
      u.username,u.display_name,u.avatar,c.title AS chat_title,c.type AS chat_type
    FROM messages m
    JOIN members mine ON mine.chat_id=m.chat_id AND mine.user_id=?
    JOIN users u ON u.id=m.user_id
    JOIN chats c ON c.id=m.chat_id
    WHERE m.body LIKE ? COLLATE NOCASE
      AND NOT EXISTS(SELECT 1 FROM hidden_messages hm WHERE hm.user_id=? AND hm.message_id=m.id)
      AND (?=0 OR m.chat_id=?)
      AND (?=0 OR m.id<?)
    ORDER BY m.id DESC LIMIT ?`).all(req.user.id,pattern,req.user.id,chatId,chatId,before,before,limit);
  res.json({messages});
});
app.get("/api/search",auth,(req,res)=>{
  const term=String(req.query.q||"").trim().replace(/^@/,"").slice(0,40);
  if(term.length<2) return res.json({users:[],chats:[]});
  const like="%"+term.replace(/[\\%_]/g,"\\$&")+"%";
  const users=q(`SELECT id,username,display_name,avatar,bio,role FROM users WHERE banned=0 AND (username LIKE ? OR display_name LIKE ?) AND id<>? AND NOT EXISTS(SELECT 1 FROM blocked_users b WHERE (b.blocker_id=? AND b.blocked_id=users.id) OR (b.blocker_id=users.id AND b.blocked_id=?)) LIMIT 20`).all(like,like,req.user.id,req.user.id,req.user.id);
  const chats=q("SELECT id,title,description,type,avatar FROM chats WHERE id IN (SELECT chat_id FROM members WHERE user_id=?) AND title LIKE ? LIMIT 20").all(req.user.id,like);
  res.json({users,chats});
});
app.patch("/api/chats/:id",auth,(req,res)=>{
  const id=Number(req.params.id), member=q("SELECT role FROM members WHERE chat_id=? AND user_id=?").get(id,req.user.id);
  if(!member) return res.status(403).json({error:"Нет доступа"});
  if(!["owner","admin"].includes(member.role) && !["owner","dev"].includes(req.user.role)) return res.status(403).json({error:"Недостаточно прав"});
  const current=q("SELECT slow_mode_seconds,username,type FROM chats WHERE id=?").get(id);
  const slowModeSeconds=req.body.slowModeSeconds===undefined?Number(current?.slow_mode_seconds)||0:Number(req.body.slowModeSeconds);
  if(![0,5,10,30,60].includes(slowModeSeconds)) return res.status(400).json({error:"Недопустимое значение медленного режима"});
  let channelUsername=current?.username||"";
  if(current?.type==="channel"&&req.body.username!==undefined){
    channelUsername=String(req.body.username||"").trim().replace(/^@/,"").toLowerCase();
    if(channelUsername&&!/^[a-z0-9_]{5,32}$/.test(channelUsername)) return res.status(400).json({error:"Юзернейм канала: 5–32 символа, латиница, цифры и _"});
    if(channelUsername&&q("SELECT 1 FROM chats WHERE username=? COLLATE NOCASE AND id<>?").get(channelUsername,id)) return res.status(409).json({error:"Этот юзернейм канала уже занят"});
  }
  q("UPDATE chats SET title=?,description=?,avatar=?,wallpaper=?,slow_mode_seconds=?,username=? WHERE id=?")
    .run(String(req.body.title||"").trim().slice(0,60),String(req.body.description||"").slice(0,250),String(req.body.avatar||"").slice(0,200),String(req.body.wallpaper||"").slice(0,200),slowModeSeconds,channelUsername||null,id);
  res.json({chat:q("SELECT * FROM chats WHERE id=?").get(id)});
});
app.delete("/api/chats/:id",auth,(req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<1) return res.status(400).json({error:"Некорректный ID чата"});
  const chat=q("SELECT * FROM chats WHERE id=?").get(id);
  if(!chat) return res.status(404).json({error:"Чат не найден"});
  const member=q("SELECT role FROM members WHERE chat_id=? AND user_id=?").get(id,req.user.id);
  if(!member) return res.status(403).json({error:"Нет доступа к этому чату"});
  const isServerOwner=req.user.role==="owner";
  const canDelete=chat.owner_id===req.user.id || member.role==="owner" || isServerOwner;
  if(chat.type!=="direct" && !canDelete){
    q("DELETE FROM members WHERE chat_id=? AND user_id=?").run(id,req.user.id);
    io.to("chat:"+id).emit("chat-member-left",{id,userId:req.user.id});
    return res.json({ok:true,id,left:true});
  }
  if(chat.type==="direct"){
    q("DELETE FROM members WHERE chat_id=? AND user_id=?").run(id,req.user.id);
    const remaining=q("SELECT COUNT(*) AS n FROM members WHERE chat_id=?").get(id).n;
    if(remaining===0){q("DELETE FROM messages WHERE chat_id=?").run(id);q("DELETE FROM chats WHERE id=?").run(id)}
    io.to("chat:"+id).emit("chat-member-left",{id,userId:req.user.id});
    return res.json({ok:true,id,left:true});
  }
  const removeChat=db.transaction(()=>{
    q("DELETE FROM messages WHERE chat_id=?").run(id);
    q("DELETE FROM members WHERE chat_id=?").run(id);
    q("DELETE FROM chats WHERE id=?").run(id);
  });
  try { removeChat(); } catch { return res.status(500).json({error:"Не удалось удалить чат"}); }
  io.to("chat:"+id).emit("chat-deleted",{id});
  res.json({ok:true,id});
});

app.patch("/api/messages/:id",auth,(req,res)=>{
  const id=Number(req.params.id), m=q("SELECT * FROM messages WHERE id=?").get(id);
  if(!m) return res.status(404).json({error:"Сообщение не найдено"});
  if(m.user_id!==req.user.id && !["owner","dev"].includes(req.user.role)) return res.status(403).json({error:"Можно изменять только свои сообщения"});
  const body=sanitizeMessageBody(req.body.body,4000); if(!body) return res.status(400).json({error:"Пустое сообщение"});
  if(body!==m.body) q("INSERT INTO message_edits(message_id,edited_by,body) VALUES(?,?,?)").run(id,req.user.id,m.body);
  q("UPDATE messages SET body=?,edited_at=CURRENT_TIMESTAMP WHERE id=?").run(body,id);
  const updated=q(`SELECT m.id,m.chat_id,m.body,m.attachments,m.created_at,m.reply_to,m.edited_at,m.reactions,
    m.forwarded_from_message_id,m.forwarded_from_user_id,m.forwarded_from_name,m.forwarded_from_chat_id,m.forwarded_from_chat_title,
    (SELECT COUNT(*) FROM messages fw WHERE fw.forwarded_from_message_id=m.id) AS forward_count,
    u.username,u.display_name,u.avatar,u.role FROM messages m JOIN users u ON u.id=m.user_id WHERE m.id=?`).get(id);
  io.to("chat:"+m.chat_id).emit("message-updated",updated); res.json({message:updated});
});
app.get("/api/messages/:id/edits",auth,(req,res)=>{
  const id=Number(req.params.id),message=q("SELECT id,chat_id FROM messages WHERE id=?").get(id);
  if(!message) return res.status(404).json({error:"Сообщение не найдено"});
  if(!q("SELECT 1 FROM members WHERE chat_id=? AND user_id=?").get(message.chat_id,req.user.id))
    return res.status(403).json({error:"Нет доступа"});
  const edits=q("SELECT id,body,edited_at FROM message_edits WHERE message_id=? ORDER BY id DESC LIMIT 50").all(id);
  res.json({edits});
});
app.post("/api/messages/:id/forward",auth,(req,res)=>{
  const id=Number(req.params.id),targetChatId=Number(req.body.chatId);
  const source=q(`SELECT m.*,u.display_name,u.username,c.title AS chat_title
    FROM messages m JOIN users u ON u.id=m.user_id JOIN chats c ON c.id=m.chat_id WHERE m.id=?`).get(id);
  if(!source) return res.status(404).json({error:"Исходное сообщение не найдено"});
  if(!q("SELECT 1 FROM members WHERE chat_id=? AND user_id=?").get(source.chat_id,req.user.id))
    return res.status(403).json({error:"Нет доступа к исходному сообщению"});
  const targetMember=q("SELECT role FROM members WHERE chat_id=? AND user_id=?").get(targetChatId,req.user.id);
  if(!targetMember) return res.status(403).json({error:"Нет доступа к чату назначения"});
  const target=q("SELECT type FROM chats WHERE id=?").get(targetChatId);
  if(!target) return res.status(404).json({error:"Чат назначения не найден"});
  if(target.type==="channel"&&!["owner","admin"].includes(targetMember.role)&&!["owner","dev"].includes(req.user.role))
    return res.status(403).json({error:"Публиковать в канале могут только администраторы"});
  let attachments=[];
  try{attachments=JSON.parse(source.attachments||"[]")}catch{}
  const validAttachments=Array.isArray(attachments)?attachments.filter(a=>a&&typeof a.url==="string"&&isValidUploadPath(a.url,"attachment")).map(a=>({url:a.url,mime:String(a.mime||"").slice(0,80),name:String(a.name||"attachment").slice(0,120),size:Math.max(0,Math.min(25*1024*1024,Number(a.size)||0))})):[];
  const body=sanitizeMessageBody(source.body,4000);
  if(!body&&!validAttachments.length) return res.status(400).json({error:"Нечего пересылать"});
  const info=q(`INSERT INTO messages(chat_id,user_id,body,attachments,forwarded_from_message_id,forwarded_from_user_id,forwarded_from_name,forwarded_from_chat_id,forwarded_from_chat_title)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(targetChatId,req.user.id,body,JSON.stringify(validAttachments),source.id,source.user_id,source.display_name||source.username,source.chat_id,source.chat_title);
  const message=q(`SELECT m.id,m.chat_id,m.body,m.attachments,m.created_at,m.reply_to,m.edited_at,m.reactions,
    m.forwarded_from_message_id,m.forwarded_from_user_id,m.forwarded_from_name,m.forwarded_from_chat_id,m.forwarded_from_chat_title,
    (SELECT COUNT(*) FROM messages fw WHERE fw.forwarded_from_message_id=m.id) AS forward_count,
    u.username,u.display_name,u.avatar,u.role
    FROM messages m JOIN users u ON u.id=m.user_id WHERE m.id=?`).get(info.lastInsertRowid);
  io.to("chat:"+targetChatId).emit("message",message);
  res.json({message});
});
app.delete("/api/messages/:id",auth,(req,res)=>{
  const id=Number(req.params.id), m=q("SELECT * FROM messages WHERE id=?").get(id);
  if(!m) return res.status(404).json({error:"Сообщение не найдено"});
  if(m.user_id!==req.user.id && !["owner","dev"].includes(req.user.role)) return res.status(403).json({error:"Можно удалять только свои сообщения"});
  q("DELETE FROM messages WHERE id=?").run(id); io.to("chat:"+m.chat_id).emit("message-deleted",{id,chat_id:m.chat_id}); res.json({ok:true});
});
app.post("/api/messages/:id/hide",auth,(req,res)=>{
  const id=Number(req.params.id),message=q("SELECT id,chat_id FROM messages WHERE id=?").get(id);
  if(!message) return res.status(404).json({error:"Сообщение не найдено"});
  if(!q("SELECT 1 FROM members WHERE chat_id=? AND user_id=?").get(message.chat_id,req.user.id))
    return res.status(403).json({error:"Нет доступа"});
  q("INSERT OR IGNORE INTO hidden_messages(user_id,message_id) VALUES(?,?)").run(req.user.id,id);
  res.json({ok:true,hidden:true});
});
app.delete("/api/messages/:id/hide",auth,(req,res)=>{
  q("DELETE FROM hidden_messages WHERE user_id=? AND message_id=?").run(req.user.id,Number(req.params.id));
  res.json({ok:true,hidden:false});
});
app.get("/api/hidden-messages",auth,(req,res)=>{
  const rows=q(`SELECT m.id,m.chat_id,m.body,m.created_at,c.title AS chat_title
    FROM hidden_messages h JOIN messages m ON m.id=h.message_id JOIN chats c ON c.id=m.chat_id
    JOIN members mine ON mine.chat_id=m.chat_id AND mine.user_id=?
    WHERE h.user_id=? ORDER BY h.hidden_at DESC LIMIT 200`).all(req.user.id,req.user.id);
  res.json({messages:rows});
});
app.get("/api/messages/:id/readers",auth,(req,res)=>{
  const id=Number(req.params.id);
  const message=q("SELECT id,chat_id,user_id FROM messages WHERE id=?").get(id);
  if(!message||!q("SELECT 1 FROM members WHERE chat_id=? AND user_id=?").get(message.chat_id,req.user.id))
    return res.status(404).json({error:"Сообщение не найдено"});
  const readers=q(`SELECT u.id,u.username,u.display_name,u.avatar,cr.updated_at AS read_at
    FROM chat_reads cr
    JOIN users u ON u.id=cr.user_id
    JOIN members m ON m.chat_id=cr.chat_id AND m.user_id=cr.user_id
    WHERE cr.chat_id=? AND cr.user_id<>? AND cr.last_read_message_id>=?
    ORDER BY cr.updated_at DESC`).all(message.chat_id,message.user_id,id);
  res.json({readers});
});
app.get("/api/messages/:id/reactions",auth,(req,res)=>{
  const id=Number(req.params.id),message=q("SELECT chat_id,reactions FROM messages WHERE id=?").get(id);
  if(!message||!q("SELECT 1 FROM members WHERE chat_id=? AND user_id=?").get(message.chat_id,req.user.id))
    return res.status(404).json({error:"Сообщение не найдено"});
  const emoji=String(req.query.emoji||"").slice(0,12);
  if(!emoji) return res.status(400).json({error:"Эмодзи не указано"});
  let reactions={};try{reactions=JSON.parse(message.reactions||"{}")}catch{}
  const ids=Array.isArray(reactions[emoji])?reactions[emoji].filter(id=>Number.isSafeInteger(Number(id))).map(Number):[];
  if(!ids.length) return res.json({emoji,users:[]});
  const placeholders=ids.map(()=>"?").join(",");
  const users=q("SELECT id,username,display_name,avatar FROM users WHERE id IN ("+placeholders+")").all(...ids);
  const byId=new Map(users.map(user=>[user.id,user]));
  res.json({emoji,users:ids.map(userId=>byId.get(userId)).filter(Boolean)});
});
app.post("/api/messages/:id/reaction",auth,(req,res)=>{
  const id=Number(req.params.id), m=q("SELECT * FROM messages WHERE id=?").get(id);
  if(!m || !q("SELECT 1 FROM members WHERE chat_id=? AND user_id=?").get(m.chat_id,req.user.id)) return res.status(404).json({error:"Сообщение не найдено"});
  const emoji=String(req.body.emoji||"").slice(0,12); if(!emoji) return res.status(400).json({error:"Эмодзи не выбрано"});
  let reactions={}; try{reactions=JSON.parse(m.reactions||"{}")}catch{}
  reactions[emoji]=Array.isArray(reactions[emoji])?reactions[emoji]:[];
  reactions[emoji]=reactions[emoji].includes(req.user.id)?reactions[emoji].filter(x=>x!==req.user.id):[...reactions[emoji],req.user.id];
  if(!reactions[emoji].length) delete reactions[emoji];
  q("UPDATE messages SET reactions=? WHERE id=?").run(JSON.stringify(reactions),id);
  io.to("chat:"+m.chat_id).emit("reaction-updated",{id,reactions}); res.json({reactions});
});
app.post("/api/upload",auth,(req,res)=>{
  const data=String(req.body.data||""),kind=String(req.body.kind||"");
  const match=data.match(/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i);
  if(!match) return res.status(400).json({error:"Некорректный файл"});
  const mime=match[1].toLowerCase();
  const allowed=kind==="audio"
    ? /^audio\/(mpeg|ogg|wav|mp4|x-m4a|x-wav|aac|flac|webm)$/
    : kind==="image"
      ? /^image\/(png|jpeg|webp|gif)$/
      : kind==="file"
        ? /^(application\/(pdf|zip|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)|text\/plain|video\/(mp4|webm))$/
        : null;
  if(!allowed||!allowed.test(mime)) return res.status(415).json({error:"Этот формат файла не поддерживается"});
  const buffer=Buffer.from(match[2],"base64");
  const limit=kind==="audio"?15*1024*1024:kind==="image"?5*1024*1024:20*1024*1024;
  if(!buffer.length||buffer.length>limit) return res.status(413).json({error:kind==="audio"?"Аудио должно быть до 15 МБ":kind==="image"?"Изображение должно быть до 5 МБ":"Файл должен быть до 20 МБ"});
  const isZip=()=>buffer.length>=4&&buffer[0]===0x50&&buffer[1]===0x4b&&[0x03,0x05,0x07].includes(buffer[2])&&[0x04,0x06,0x08].includes(buffer[3]);
  const signatures={
    "image/png":()=>buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
    "image/jpeg":()=>buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff,
    "image/gif":()=>buffer.subarray(0,3).toString()==="GIF",
    "image/webp":()=>buffer.subarray(0,4).toString()==="RIFF"&&buffer.subarray(8,12).toString()==="WEBP",
    "audio/ogg":()=>buffer.subarray(0,4).toString()==="OggS",
    "audio/wav":()=>buffer.subarray(0,4).toString()==="RIFF"&&buffer.subarray(8,12).toString()==="WAVE",
    "audio/x-wav":()=>buffer.subarray(0,4).toString()==="RIFF"&&buffer.subarray(8,12).toString()==="WAVE",
    "audio/x-m4a":()=>buffer.subarray(4,8).toString()==="ftyp",
    "audio/flac":()=>buffer.subarray(0,4).toString()==="fLaC",
    "audio/mp4":()=>buffer.subarray(4,8).toString()==="ftyp",
    "audio/mpeg":()=>buffer.subarray(0,3).toString()==="ID3"||(buffer[0]===0xff&&(buffer[1]&0xe0)===0xe0),
    "audio/aac":()=>buffer[0]===0xff&&(buffer[1]&0xf6)===0xf0,
    "audio/webm":()=>buffer.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])),
    "application/pdf":()=>buffer.subarray(0,5).toString()==="%PDF-",
    "text/plain":()=>!buffer.includes(0)&&!buffer.toString("utf8").includes("\uFFFD"),
    "application/zip":isZip,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":isZip,
    "video/mp4":()=>buffer.length>=12&&buffer.subarray(4,8).toString()==="ftyp",
    "video/webm":()=>buffer.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))
  };
  if(!signatures[mime]||!signatures[mime]()) return res.status(415).json({error:"Содержимое файла не соответствует его формату"});
  const ext={
    "audio/mpeg":"mp3","audio/ogg":"ogg","audio/wav":"wav","audio/x-wav":"wav","audio/mp4":"m4a","audio/x-m4a":"m4a","audio/aac":"aac","audio/flac":"flac","audio/webm":"weba",
    "image/png":"png","image/jpeg":"jpg","image/webp":"webp","image/gif":"gif",
    "application/pdf":"pdf","text/plain":"txt","application/zip":"zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":"docx",
    "video/mp4":"mp4","video/webm":"webm"
  }[mime];
  const filename=crypto.randomBytes(18).toString("hex")+"."+ext;
  fs.writeFileSync(path.join(uploadDir,filename),buffer,{flag:"wx"});
  res.json({url:"/uploads/"+filename,mime,size:buffer.length});
});
app.get("/api/songs",auth,(req,res)=>res.json({songs:q("SELECT id,title,file_url,created_at FROM songs WHERE user_id=? ORDER BY id DESC").all(req.user.id)}));
app.post("/api/songs",auth,(req,res)=>{
  const title=String(req.body.title||"Трек").trim().slice(0,100), url=String(req.body.url||"");
  if(!/^\/uploads\/[a-f0-9]+\.(mp3|ogg|wav|m4a|aac|flac|weba)$/.test(url)) return res.status(400).json({error:"Сначала загрузи аудиофайл"});
  const info=q("INSERT INTO songs(user_id,title,file_url) VALUES(?,?,?)").run(req.user.id,title,url);
  res.json({song:q("SELECT id,title,file_url,created_at FROM songs WHERE id=?").get(info.lastInsertRowid)});
});
app.delete("/api/songs/:id",auth,(req,res)=>{q("DELETE FROM songs WHERE id=? AND user_id=?").run(Number(req.params.id),req.user.id);res.json({ok:true})});

app.post("/api/chats/:id/join",auth,(req,res)=>{
  const id=Number(req.params.id);
  if(!q("SELECT id FROM chats WHERE id=?").get(id)) return res.status(404).json({error:"Чат не найден"});
  q("INSERT OR IGNORE INTO members(chat_id,user_id) VALUES(?,?)").run(id,req.user.id);
  res.json({ok:true});
});
app.get("/api/admin/stats",auth,admin,(req,res)=>{
  res.json({users:q("SELECT COUNT(*) n FROM users").get().n,
    banned:q("SELECT COUNT(*) n FROM users WHERE banned=1").get().n,
    chats:q("SELECT COUNT(*) n FROM chats").get().n,
    messages:q("SELECT COUNT(*) n FROM messages").get().n,
    online:onlineUsers.size});
});
app.get("/api/admin/users",auth,admin,(req,res)=>{
  res.json({users:q("SELECT id,number,username,display_name,role,banned,created_at FROM users ORDER BY id DESC LIMIT 200").all()});
});
app.post("/api/admin/ban",auth,admin,(req,res)=>{
  const id=Number(req.body.userId), banned=req.body.banned?1:0;
  const target=getUser.get(id);
  if(!target) return res.status(404).json({error:"Пользователь не найден"});
  if(target.role==="owner" || (target.role==="dev" && req.user.role!=="owner")) return res.status(403).json({error:"Нельзя изменить статус этого аккаунта"});
  q("UPDATE users SET banned=? WHERE id=?").run(banned,id);
  if(banned) for(const [socketId,userId] of onlineUsers) if(userId===id) io.sockets.sockets.get(socketId)?.disconnect(true);
  res.json({ok:true});
});
app.delete("/api/admin/users/:id",auth,admin,(req,res)=>{
  const id=Number(req.params.id), target=getUser.get(id);
  if(!target) return res.status(404).json({error:"Пользователь не найден"});
  if(id===req.user.id || ["owner","dev"].includes(target.role))
    return res.status(403).json({error:"Нельзя удалить собственный или привилегированный аккаунт"});
  const owned=q("SELECT id FROM chats WHERE owner_id=?").all(id);
  const removeUser=db.transaction(()=>{
    for(const chat of owned){
      const successor=q("SELECT user_id FROM members WHERE chat_id=? AND user_id<>? ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, user_id LIMIT 1").get(chat.id,id);
      if(successor){
        q("UPDATE chats SET owner_id=? WHERE id=?").run(successor.user_id,chat.id);
        q("UPDATE members SET role='owner' WHERE chat_id=? AND user_id=?").run(chat.id,successor.user_id);
      } else {
        q("DELETE FROM messages WHERE chat_id=?").run(chat.id);
        q("DELETE FROM members WHERE chat_id=?").run(chat.id);
        q("DELETE FROM chats WHERE id=?").run(chat.id);
      }
    }
    q("DELETE FROM messages WHERE user_id=?").run(id);
    q("DELETE FROM members WHERE user_id=?").run(id);
    q("DELETE FROM user_names WHERE user_id=?").run(id);
    q("DELETE FROM songs WHERE user_id=?").run(id);
    q("DELETE FROM users WHERE id=?").run(id);
  });
  try { removeUser(); }
  catch { return res.status(500).json({error:"Не удалось удалить аккаунт"}); }
  for(const [socketId,userId] of onlineUsers) if(userId===id) io.sockets.sockets.get(socketId)?.disconnect(true);
  res.json({ok:true});
});
app.get("/download/vovchikgram-win.exe",(req,res)=>{
  const exe=path.join(__dirname,"dist","vovchikGram.exe");
  if(!fs.existsSync(exe)) return res.status(404).send("EXE ещё не собран. Выполните npm run build:win в папке проекта.");
  res.download(exe,"vovchikGram.exe");
});
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

const onlineUsers=new Map();
function sharedUserIds(userId){
  return q(`SELECT DISTINCT other.user_id AS user_id
    FROM members mine JOIN members other ON other.chat_id=mine.chat_id
    WHERE mine.user_id=? AND other.user_id<>?`).all(userId,userId).map(row=>row.user_id);
}
function emitPresenceToSharedUsers(userId,online){
  const peers=new Set(sharedUserIds(userId));
  for(const [socketId,connectedUserId] of onlineUsers){
    if(peers.has(connectedUserId)) io.to(socketId).emit("presence-update",{userId,online});
  }
}
io.use((socket,next)=>{
  try {
    const payload=jwt.verify(socket.handshake.auth?.token,SECRET);
    const u=getUser.get(payload.id);
    const session=payload.sid&&q("SELECT id FROM auth_sessions WHERE id=? AND user_id=? AND revoked_at='' AND expires_at>?").get(payload.sid,u?.id||0,new Date().toISOString());
    if(!u || u.banned || !session) return next(new Error("unauthorized"));
    socket.user=u; socket.sessionId=payload.sid; next();
  } catch { next(new Error("unauthorized")); }
});
io.on("connection",(socket)=>{
  const userId=socket.user.id;
  const alreadyOnline=[...onlineUsers.values()].includes(userId);
  onlineUsers.set(socket.id,userId);
  const visible=new Set(sharedUserIds(userId));
  const visibleOnline=[...new Set([...onlineUsers.values()].filter(id=>visible.has(id)))];
  socket.emit("presence-snapshot",{userIds:visibleOnline});
  if(!alreadyOnline) emitPresenceToSharedUsers(userId,true);
  socket.on("join-chat",(id)=>{
    id=Number(id);
    if(Number.isSafeInteger(id)&&id>0&&q("SELECT 1 FROM members WHERE chat_id=? AND user_id=?").get(id,userId)) socket.join("chat:"+id);
  });
  socket.on("typing",payload=>{
    const chatId=Number(payload?.chatId);
    if(!Number.isSafeInteger(chatId)||chatId<1) return;
    if(!q("SELECT 1 FROM members WHERE chat_id=? AND user_id=?").get(chatId,userId)) return;
    socket.to("chat:"+chatId).emit("typing",{chatId,userId,username:socket.user.username,displayName:socket.user.display_name,typing:!!payload.typing});
  });
  socket.on("disconnect",()=>{
    onlineUsers.delete(socket.id);
    if(![...onlineUsers.values()].includes(userId)) emitPresenceToSharedUsers(userId,false);
  });
});
function processScheduledMessages(){
  const now=Math.floor(Date.now()/1000);
  const due=q("SELECT * FROM scheduled_messages WHERE status='pending' AND scheduled_at<=? ORDER BY scheduled_at,id LIMIT 25").all(now);
  for(const row of due){
    try{
      const processOne=db.transaction(()=>{
        const claimed=q("UPDATE scheduled_messages SET status='sending' WHERE id=? AND status='pending'").run(row.id);
        if(!claimed.changes) return null;
        const membership=q("SELECT role FROM members WHERE chat_id=? AND user_id=?").get(row.chat_id,row.user_id);
        const chat=q("SELECT type FROM chats WHERE id=?").get(row.chat_id);
        if(!membership||!chat){
          q("UPDATE scheduled_messages SET status='failed',error='Нет доступа к чату' WHERE id=?").run(row.id);
          return null;
        }
        if(chat.type==="channel"&&!["owner","admin"].includes(membership.role)&&!q("SELECT role FROM users WHERE id=? AND role IN ('owner','dev')").get(row.user_id)){
          q("UPDATE scheduled_messages SET status='failed',error='Недостаточно прав для публикации' WHERE id=?").run(row.id);
          return null;
        }
        if(chat.type==="direct"){
          const other=q("SELECT user_id FROM members WHERE chat_id=? AND user_id<>? LIMIT 1").get(row.chat_id,row.user_id);
          if(other&&q("SELECT 1 FROM blocked_users WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)").get(row.user_id,other.user_id,other.user_id,row.user_id)){
            q("UPDATE scheduled_messages SET status='failed',error='Личный диалог недоступен из-за блокировки' WHERE id=?").run(row.id);
            return null;
          }
        }
        let attachments=[];
        try{attachments=JSON.parse(row.attachments||"[]")}catch{}
        const validAttachments=Array.isArray(attachments)?attachments.filter(a=>a&&typeof a.url==="string"&&isValidUploadPath(a.url,"attachment")):[];
        const info=q("INSERT INTO messages(chat_id,user_id,body,attachments) VALUES(?,?,?,?)")
          .run(row.chat_id,row.user_id,row.body,JSON.stringify(validAttachments));
        const message=q(`SELECT m.id,m.chat_id,m.body,m.attachments,m.created_at,m.reply_to,m.edited_at,m.reactions,
          m.forwarded_from_message_id,m.forwarded_from_user_id,m.forwarded_from_name,m.forwarded_from_chat_id,m.forwarded_from_chat_title,
          (SELECT COUNT(*) FROM messages fw WHERE fw.forwarded_from_message_id=m.id) AS forward_count,
          u.username,u.display_name,u.avatar,u.role
          FROM messages m JOIN users u ON u.id=m.user_id WHERE m.id=?`).get(info.lastInsertRowid);
        q("UPDATE scheduled_messages SET status='sent',sent_message_id=?,error=NULL WHERE id=?").run(message.id,row.id);
        return {chatId:row.chat_id,message};
      });
      const result=processOne();
      if(result) io.to("chat:"+result.chatId).emit("message",result.message);
    }catch(error){
      q("UPDATE scheduled_messages SET status='failed',error=? WHERE id=? AND status IN ('pending','sending')")
        .run(String(error.message||"Ошибка отправки").slice(0,250),row.id);
    }
  }
}
q("UPDATE scheduled_messages SET status='pending' WHERE status='sending'");
const scheduledDispatcher=setInterval(processScheduledMessages,1000);
scheduledDispatcher.unref?.();
server.listen(PORT,"0.0.0.0",()=>{
  console.log(`vovchikGram запущен: http://localhost:${PORT}`);
  console.log(`Локальная сеть: http://<IP-ВАШЕГО-ПК>:${PORT}`);
  if(process.pkg && process.env.NO_BROWSER!=="1"){
    if(process.platform==="win32"){
      const candidates=[
        path.join(process.env["ProgramFiles(x86)"]||"C:\\Program Files (x86)","Microsoft","Edge","Application","msedge.exe"),
        path.join(process.env.ProgramFiles||"C:\\Program Files","Microsoft","Edge","Application","msedge.exe"),
        path.join(process.env.LOCALAPPDATA||"","Microsoft","Edge","Application","msedge.exe"),
        ...String(process.env.PATH||"").split(path.delimiter).map(dir=>path.join(dir,"msedge.exe"))
      ];
      const edge=candidates.find(candidate=>fs.existsSync(candidate));
      if(edge){
        const child=spawn(edge,["--new-window","http://127.0.0.1:"+PORT],{detached:true,stdio:"ignore",windowsHide:true});
        child.unref();
      } else console.warn("Microsoft Edge (msedge.exe) not found. Open http://127.0.0.1:"+PORT+" manually.");
    } else {
      const opener=process.platform==="darwin"?"open":"xdg-open";
      const child=spawn(opener,["http://127.0.0.1:"+PORT],{detached:true,stdio:"ignore"});
      child.unref();
    }
  }
});
