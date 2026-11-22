"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "server.js");

async function reservePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => socket.once("error", reject).listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("Test server exited before becoming ready");
    try {
      const response = await fetch(baseUrl + "/api/health");
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error("Timed out waiting for test server");
}

async function request(baseUrl, token, route, options = {}) {
  const response = await fetch(baseUrl + route, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

test("API integration: paging, unread/read markers, saved messages and pins", async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vg-v2-api-"));
  const port = await reservePort();
  const baseUrl = "http://127.0.0.1:" + port;
  const child = spawn(process.execPath, [serverPath], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      JWT_SECRET: "v2-test-secret-not-for-production"
    },
    stdio: "ignore"
  });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 2000);
        child.once("exit", () => { clearTimeout(timer); resolve(); });
      });
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  await waitForServer(baseUrl, child);
  const suffix = String(process.pid).slice(-5);
  const a = await request(baseUrl, null, "/api/register", {
    method: "POST",
    body: JSON.stringify({ username: "v2owner" + suffix, password: "test-password-123", displayName: "V2 Owner" })
  });
  const b = await request(baseUrl, null, "/api/register", {
    method: "POST",
    body: JSON.stringify({ username: "v2member" + suffix, password: "test-password-123", displayName: "V2 Member" })
  });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(b.status, 200, JSON.stringify(b.body));
  const ownerToken = a.body.token, memberToken = b.body.token;

  const created = await request(baseUrl, ownerToken, "/api/chats", {
    method: "POST",
    body: JSON.stringify({ title: "v2 integration", type: "group", members: ["v2member" + suffix] })
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const chatId = created.body.chat.id;

  const first = await request(baseUrl, ownerToken, `/api/chats/${chatId}/messages`, {
    method: "POST", body: JSON.stringify({ body: "first message" })
  });
  const second = await request(baseUrl, memberToken, `/api/chats/${chatId}/messages`, {
    method: "POST", body: JSON.stringify({ body: "second message" })
  });
  const third = await request(baseUrl, memberToken, `/api/chats/${chatId}/messages`, {
    method: "POST", body: JSON.stringify({ body: "third message" })
  });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(third.status, 200);

  const latest = await request(baseUrl, ownerToken, `/api/chats/${chatId}/messages?limit=2`);
  assert.equal(latest.status, 200);
  assert.deepEqual(latest.body.messages.map(x => x.body), ["second message", "third message"]);
  assert.equal(latest.body.hasMore, true);
  const older = await request(baseUrl, ownerToken, `/api/chats/${chatId}/messages?before=${latest.body.messages[0].id}&limit=2`);
  assert.equal(older.status, 200);
  assert.deepEqual(older.body.messages.map(x => x.body), ["first message"]);
  assert.equal(older.body.hasMore, false);

  const unreadBefore = await request(baseUrl, ownerToken, "/api/chats");
  assert.equal(unreadBefore.body.chats.find(x => x.id === chatId).unread_count, 2);

  const saved = await request(baseUrl, ownerToken, `/api/messages/${second.body.message.id}/save`, { method: "POST", body: "{}" });
  assert.equal(saved.status, 200);
  const savedList = await request(baseUrl, ownerToken, "/api/saved");
  assert.equal(savedList.status, 200);
  assert.equal(savedList.body.messages.length, 1);

  const pin = await request(baseUrl, ownerToken, `/api/chats/${chatId}/pins/${second.body.message.id}`, { method: "POST", body: "{}" });
  assert.equal(pin.status, 200);
  const pins = await request(baseUrl, ownerToken, `/api/chats/${chatId}/pins`);
  assert.equal(pins.body.pins.length, 1);
  assert.equal(pins.body.pins[0].id, second.body.message.id);

  const marked = await request(baseUrl, ownerToken, `/api/chats/${chatId}/read`, { method: "POST", body: "{}" });
  assert.equal(marked.status, 200);
  const unreadAfter = await request(baseUrl, ownerToken, "/api/chats");
  assert.equal(unreadAfter.body.chats.find(x => x.id === chatId).unread_count, 0);
  assert.ok(Number(second.body.message.id) <= Number(marked.body.lastReadMessageId));

  const outsider = await request(baseUrl, null, "/api/register", {
    method: "POST",
    body: JSON.stringify({ username: "v2outside" + suffix, password: "test-password-123", displayName: "Outside" })
  });
  assert.equal(outsider.status, 200);
  const denied = await request(baseUrl, outsider.body.token, `/api/chats/${chatId}/messages`);
  assert.equal(denied.status, 403);
});
