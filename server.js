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
CREATE TRIGGER IF NOT EXISTS cleanup_deleted_message_references
AFTER DELETE ON messages
BEGIN
  DELETE FROM chat_pins WHERE message_id=OLD.id;
  DELETE FROM saved_messages WHERE message_id=OLD.id;
END;
`);
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(x=>x.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
ensureColumn("chats","avatar","TEXT DEFAULT ''");
ensureColumn("chats","wallpaper","TEXT DEFAULT ''");
ensureColumn("messages","reply_to","INTEGER");
ensureColumn("messages","edited_at","TEXT");
ensureColumn("messages","reactions","TEXT DEFAULT '{}'");
ensureColumn("messages","attachments","TEXT DEFAULT '[]'");

const q = (sql) => db.prepare(sql);
const getUser = q("SELECT id,number,username,display_name,bio,avatar,profile_bg,theme,role,banned,created_at FROM users WHERE id=?");
const tokenFor = (u) => jwt.sign({ id: u.id }, SECRET, { expiresIn: "30d" });
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
    if (!user || user.banned) return res.status(401).json({error:"Аккаунт недоступен"});
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

app.use(express.json({limit:"22mb"}));
app.use("/uploads", express.static(uploadDir, { fallthrough:false, dotfiles:"deny", index:false }));
// Serve the installed Material Web Components package as same-origin assets.
app.use("/vendor/material", express.static(path.join(__dirname,"node_modules","material","dist"), { fallthrough:false, dotfiles:"deny", index:false }));
app.use(express.static(path.join(__dirname,"public")));
app.get("/api/health", (req,res)=>res.json({ok:true, app:"vovchikGram", version:"2.0.0-dev"}));

app.post("/api/register", (req,res)=>{
  const username = cleanUsername(req.body.username);
  const password = String(req.body.password || "");
  const displayName = String(req.body.displayName || username).trim().slice(0,40);
  if (!/^[a-z0-9_]{3,24}$/.test(username)) return res.status(400).json({error:"Юзернейм: 3–24 символа, латиница, цифры и _"});
  if (password.length < 8) return res.status(400).json({error:"Пароль должен быть не короче 8 символов"});
  if (q("SELECT id FROM users WHERE username=? UNION SELECT user_id AS id FROM user_names WHERE username=?").get(username,username)) return res.status(409).json({error:"Юзернейм уже занят"});
  try {
    const number = uniqueNumber();
    const info = q("INSERT INTO users(number,username,password_hash,display_name) VALUES(?,?,?,?)")
      .run(number,username,bcrypt.hashSync(password,10),displayName || username);
    const u = getUser.get(info.lastInsertRowid);
    return res.json({token:tokenFor(u), user:publicUser(u)});
  } catch { return res.status(500).json({error:"Не удалось создать аккаунт"}); }
});
app.post("/api/login",(req,res)=>{
  const username = cleanUsername(req.body.username), password = String(req.body.password || "");
  const u = q("SELECT * FROM users WHERE username=? OR id IN (SELECT user_id FROM user_names WHERE username=?) LIMIT 1").get(username,username);
  if (!u || !bcrypt.compareSync(password,u.password_hash)) return res.status(401).json({error:"Неверный юзернейм или пароль"});
  if (u.banned) return res.status(403).json({error:"Аккаунт заблокирован"});
  res.json({token:tokenFor(u),user:publicUser(u)});
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
  const existing=q(`SELECT c.id FROM chats c JOIN members a ON a.chat_id=c.id AND a.user_id=? JOIN members b ON b.chat_id=c.id AND b.user_id=? WHERE c.type='direct' LIMIT 1`).get(req.user.id,target.id);
  if(existing) return res.json({chat:q("SELECT * FROM chats WHERE id=?").get(existing.id)});
  const info=q("INSERT INTO chats(title,description,type,owner_id,avatar) VALUES(?,?, 'direct',?,?)").run(target.display_name,"Личный диалог",req.user.id,target.avatar||"");
  q("INSERT INTO members(chat_id,user_id,role) VALUES(?,?,'owner')").run(info.lastInsertRowid,req.user.id);
  q("INSERT INTO members(chat_id,user_id,role) VALUES(?,?,'member')").run(info.lastInsertRowid,target.id);
  res.json({chat:q("SELECT * FROM chats WHERE id=?").get(info.lastInsertRowid)});
});
app.get("/api/chats",auth,(req,res)=>{
  const chats=q(`SELECT c.*,m.role AS my_role,
    (SELECT body FROM messages WHERE chat_id=c.id ORDER BY id DESC LIMIT 1) last_message,
    (SELECT created_at FROM messages WHERE chat_id=c.id ORDER BY id DESC LIMIT 1) last_time,
    (SELECT COUNT(*) FROM messages um LEFT JOIN chat_reads cr ON cr.chat_id=um.chat_id AND cr.user_id=?
      WHERE um.chat_id=c.id AND um.id>COALESCE(cr.last_read_message_id,0) AND um.user_id<>?) AS unread_count,
    (SELECT message_id FROM chat_pins WHERE chat_id=c.id ORDER BY pinned_at DESC,message_id DESC LIMIT 1) AS pinned_message_id,
    (SELECT m2.user_id FROM members m2 WHERE m2.chat_id=c.id AND m2.user_id<>? LIMIT 1) AS peer_user_id,
    COALESCE(cp.archived,0) AS is_archived,
    COALESCE(cp.starred,0) AS is_starred,
    COALESCE(cp.muted,0) AS is_muted
    FROM chats c JOIN members m ON m.chat_id=c.id
    LEFT JOIN chat_preferences cp ON cp.chat_id=c.id AND cp.user_id=m.user_id
    WHERE m.user_id=?
    ORDER BY COALESCE(cp.starred,0) DESC,COALESCE(last_time,c.created_at) DESC`).all(req.user.id,req.user.id,req.user.id,req.user.id);
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
  const current=q("SELECT archived,starred,muted FROM chat_preferences WHERE user_id=? AND chat_id=?").get(req.user.id,id)||{archived:0,starred:0,muted:0};
  const next={
    archived:req.body.archived===undefined?current.archived:(req.body.archived?1:0),
    starred:req.body.starred===undefined?current.starred:(req.body.starred?1:0),
    muted:req.body.muted===undefined?current.muted:(req.body.muted?1:0)
  };
  q(`INSERT INTO chat_preferences(user_id,chat_id,archived,starred,muted)
    VALUES(?,?,?,?,?)
    ON CONFLICT(user_id,chat_id) DO UPDATE SET
      archived=excluded.archived,starred=excluded.starred,muted=excluded.muted,updated_at=CURRENT_TIMESTAMP`)
    .run(req.user.id,id,next.archived,next.starred,next.muted);
  res.json({ok:true,preferences:next});
});
app.post("/api/chats",auth,(req,res)=>{
  const title=String(req.body.title||"").trim().slice(0,60);
  const description=String(req.body.description||"").slice(0,250);
  const type=["group","channel"].includes(req.body.type)?req.body.type:"group";
  if(!title) return res.status(400).json({error:"Укажите название"});
  const info=q("INSERT INTO chats(title,description,type,owner_id,avatar,wallpaper) VALUES(?,?,?,?,?,?)").run(title,description,type,req.user.id,String(req.body.avatar||"").slice(0,200),String(req.body.wallpaper||"").slice(0,200));
  q("INSERT INTO members(chat_id,user_id,role) VALUES(?,?,'owner')").run(info.lastInsertRowid,req.user.id);
  const usernames=Array.isArray(req.body.members)?req.body.members.slice(0,30):[];
  for(const raw of usernames){
    const u=q("SELECT id FROM users WHERE username=?").get(cleanUsername(raw));
    if(u) q("INSERT OR IGNORE INTO members(chat_id,user_id) VALUES(?,?)").run(info.lastInsertRowid,u.id);
  }
  const chat=q("SELECT * FROM chats WHERE id=?").get(info.lastInsertRowid);
  res.json({chat});
});
app.get("/api/chats/:id/messages",auth,(req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<1) return res.status(400).json({error:"Некорректный ID чата"});
  if(!q("SELECT 1 FROM members WHERE chat_id=? AND user_id=?").get(id,req.user.id)) return res.status(403).json({error:"Нет доступа"});
  const before=boundedInteger(req.query.before,0,0,Number.MAX_SAFE_INTEGER);
  const limit=boundedInteger(req.query.limit,50,1,100);
  const select=`SELECT m.id,m.chat_id,m.body,m.attachments,m.created_at,m.reply_to,m.edited_at,m.reactions,
    u.username,u.display_name,u.avatar,u.role,
    (SELECT COUNT(*) FROM chat_reads cr WHERE cr.chat_id=m.chat_id AND cr.user_id<>m.user_id AND cr.last_read_message_id>=m.id) AS read_by_count,
    EXISTS(SELECT 1 FROM chat_pins cp WHERE cp.chat_id=m.chat_id AND cp.message_id=m.id) AS is_pinned
    FROM messages m JOIN users u ON u.id=m.user_id WHERE m.chat_id=?`;
  const rows=before
    ? q(select+" AND m.id<? ORDER BY m.id DESC LIMIT ?").all(id,before,limit+1)
    : q(select+" ORDER BY m.id DESC LIMIT ?").all(id,limit+1);
  const hasMore=rows.length>limit;
  const messages=rows.slice(0,limit).reverse();
  res.json({messages,hasMore,nextCursor:messages[0]?.id||null});
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
    JOIN chats c ON c.id=m.chat_id WHERE s.user_id=? ORDER BY s.saved_at DESC LIMIT 500`).all(req.user.id);
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
  const validAttachments=attachments.filter(a=>a&&typeof a.url==="string"&&isValidUploadPath(a.url,"image")).map(a=>({url:a.url,mime:String(a.mime||"").slice(0,80),name:String(a.name||"image").slice(0,120)}));
  if(!body&&!validAttachments.length) return res.status(400).json({error:"Добавь текст или изображение"});
  const membership=q("SELECT role FROM members WHERE chat_id=? AND user_id=?").get(id,req.user.id);
  if(!membership) return res.status(403).json({error:"Нет доступа"});
  const chatType=q("SELECT type FROM chats WHERE id=?").get(id)?.type;
  if(chatType==="channel" && !["owner","admin"].includes(membership.role) && !["owner","dev"].includes(req.user.role)) return res.status(403).json({error:"Публиковать в канале могут только администраторы"});
  const replyTo=Number(req.body.replyTo)||null;
  if(replyTo && !q("SELECT id FROM messages WHERE id=? AND chat_id=?").get(replyTo,id)) return res.status(400).json({error:"Сообщение для ответа не найдено"});
  const info=q("INSERT INTO messages(chat_id,user_id,body,reply_to,attachments) VALUES(?,?,?,?,?)").run(id,req.user.id,body,replyTo,JSON.stringify(validAttachments));
  const message=q(`SELECT m.id,m.chat_id,m.body,m.attachments,m.created_at,m.reply_to,m.edited_at,m.reactions,u.username,u.display_name,u.avatar,u.role
    FROM messages m JOIN users u ON u.id=m.user_id WHERE m.id=?`).get(info.lastInsertRowid);
  io.to("chat:"+id).emit("message",message);
  res.json({message});
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
      AND (?=0 OR m.chat_id=?)
      AND (?=0 OR m.id<?)
    ORDER BY m.id DESC LIMIT ?`).all(req.user.id,pattern,chatId,chatId,before,before,limit);
  res.json({messages});
});
app.get("/api/search",auth,(req,res)=>{");
  const messages=q(`SELECT m.id,m.chat_id,m.body,m.created_at,m.reply_to,
      u.username,u.display_name,u.avatar,c.title AS chat_title,c.type AS chat_type
    FROM messages m
    JOIN members mine ON mine.chat_id=m.chat_id AND mine.user_id=?
    JOIN users u ON u.id=m.user_id
    JOIN chats c ON c.id=m.chat_id
    WHERE m.body LIKE ? ESCAPE '\\'
      AND (?=0 OR m.chat_id=?)
      AND (?=0 OR m.id<?)
    ORDER BY m.id DESC LIMIT ?`).all(req.user.id,"%"+escaped+"%",chatId,chatId,before,before,limit);
  res.json({messages});
});
app.get("/api/search",auth,(req,res)=>{
  const term=String(req.query.q||"").trim().replace(/^@/,"").slice(0,40);
  if(term.length<2) return res.json({users:[],chats:[]});
  const like="%"+term.replace(/[\\%_]/g,"\\$&")+"%";
  const users=q("SELECT id,username,display_name,avatar,bio,role FROM users WHERE banned=0 AND (username LIKE ? OR display_name LIKE ?) LIMIT 20").all(like,like);
  const chats=q("SELECT id,title,description,type,avatar FROM chats WHERE id IN (SELECT chat_id FROM members WHERE user_id=?) AND title LIKE ? LIMIT 20").all(req.user.id,like);
  res.json({users,chats});
});
app.patch("/api/chats/:id",auth,(req,res)=>{
  const id=Number(req.params.id), member=q("SELECT role FROM members WHERE chat_id=? AND user_id=?").get(id,req.user.id);
  if(!member) return res.status(403).json({error:"Нет доступа"});
  if(!["owner","admin"].includes(member.role) && !["owner","dev"].includes(req.user.role)) return res.status(403).json({error:"Недостаточно прав"});
  q("UPDATE chats SET title=?,description=?,avatar=?,wallpaper=? WHERE id=?").run(String(req.body.title||"").trim().slice(0,60),String(req.body.description||"").slice(0,250),String(req.body.avatar||"").slice(0,200),String(req.body.wallpaper||"").slice(0,200),id);
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
  q("UPDATE messages SET body=?,edited_at=CURRENT_TIMESTAMP WHERE id=?").run(body,id);
  const updated=q("SELECT m.id,m.chat_id,m.body,m.attachments,m.created_at,m.reply_to,m.edited_at,m.reactions,u.username,u.display_name,u.avatar,u.role FROM messages m JOIN users u ON u.id=m.user_id WHERE m.id=?").get(id);
  io.to("chat:"+m.chat_id).emit("message-updated",updated); res.json({message:updated});
});
app.delete("/api/messages/:id",auth,(req,res)=>{
  const id=Number(req.params.id), m=q("SELECT * FROM messages WHERE id=?").get(id);
  if(!m) return res.status(404).json({error:"Сообщение не найдено"});
  if(m.user_id!==req.user.id && !["owner","dev"].includes(req.user.role)) return res.status(403).json({error:"Можно удалять только свои сообщения"});
  q("DELETE FROM messages WHERE id=?").run(id); io.to("chat:"+m.chat_id).emit("message-deleted",{id,chat_id:m.chat_id}); res.json({ok:true});
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
  const data=String(req.body.data||""), kind=String(req.body.kind||"");
  const match=data.match(/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i);
  if(!match) return res.status(400).json({error:"Некорректный файл"});
  const mime=match[1].toLowerCase(), allowed=kind==="audio"?/^audio\/(mpeg|ogg|wav|mp4|aac|flac|webm)$/:kind==="image"?/^image\/(png|jpeg|webp|gif)$/:null;
  if(!allowed || !allowed.test(mime)) return res.status(415).json({error:"Этот формат файла не поддерживается"});
  const buffer=Buffer.from(match[2],"base64"), limit=kind==="audio"?15*1024*1024:5*1024*1024;
  if(!buffer.length || buffer.length>limit) return res.status(413).json({error:kind==="audio"?"Аудио должно быть до 15 МБ":"Изображение должно быть до 5 МБ"});
  const signatures={"image/png":()=>buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),"image/jpeg":()=>buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff,"image/gif":()=>buffer.subarray(0,3).toString()==="GIF","image/webp":()=>buffer.subarray(0,4).toString()==="RIFF"&&buffer.subarray(8,12).toString()==="WEBP","audio/ogg":()=>buffer.subarray(0,4).toString()==="OggS","audio/wav":()=>buffer.subarray(0,4).toString()==="RIFF","audio/flac":()=>buffer.subarray(0,4).toString()==="fLaC","audio/mp4":()=>buffer.subarray(4,8).toString()==="ftyp","audio/mpeg":()=>buffer.subarray(0,3).toString()==="ID3"||(buffer[0]===0xff&&(buffer[1]&0xe0)===0xe0),"audio/aac":()=>buffer[0]===0xff&&(buffer[1]&0xf6)===0xf0,"audio/webm":()=>buffer.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))};
  if(!signatures[mime] || !signatures[mime]()) return res.status(415).json({error:"Содержимое файла не соответствует его формату"});
  const ext=({"audio/mpeg":"mp3","audio/ogg":"ogg","audio/wav":"wav","audio/mp4":"m4a","audio/aac":"aac","audio/flac":"flac","audio/webm":"weba","image/png":"png","image/jpeg":"jpg","image/webp":"webp","image/gif":"gif"})[mime];
  const filename=crypto.randomBytes(18).toString("hex")+"."+ext; fs.writeFileSync(path.join(uploadDir,filename),buffer,{flag:"wx"});
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
    if(!u || u.banned) return next(new Error("unauthorized"));
    socket.user=u; next();
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
