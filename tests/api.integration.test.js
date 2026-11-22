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
  const guest = await request(baseUrl, null, "/api/register", {
    method: "POST",
    body: JSON.stringify({ username: "v2guest" + suffix, password: "test-password-123", displayName: "V2 Guest" })
  });
  assert.equal(guest.status, 200, JSON.stringify(guest.body));
  const ownerToken = a.body.token, memberToken = b.body.token, guestToken = guest.body.token;
  const secondLogin = await request(baseUrl, null, "/api/login", {
    method: "POST", body: JSON.stringify({ username: "v2owner" + suffix, password: "test-password-123" })
  });
  assert.equal(secondLogin.status, 200);
  const sessionList = await request(baseUrl, ownerToken, "/api/sessions");
  assert.equal(sessionList.status, 200);
  assert.equal(sessionList.body.sessions.length, 2);
  assert.equal(sessionList.body.sessions.filter(x => x.current).length, 1);
  const secondPayload = JSON.parse(Buffer.from(secondLogin.body.token.split(".")[1], "base64url").toString());
  const secondSessions = await request(baseUrl, ownerToken, "/api/sessions");
  const secondSessionId = secondPayload.sid;
  const revoked = await request(baseUrl, ownerToken, "/api/sessions/" + secondSessionId, { method: "DELETE" });
  assert.equal(revoked.status, 200);
  const revokedCheck = await request(baseUrl, secondLogin.body.token, "/api/me");
  assert.equal(revokedCheck.status, 401);
  const currentStillWorks = await request(baseUrl, ownerToken, "/api/me");
  assert.equal(currentStillWorks.status, 200);

  const thirdLogin = await request(baseUrl, null, "/api/login", {
    method: "POST", body: JSON.stringify({ username: "v2owner" + suffix, password: "test-password-123" })
  });
  assert.equal(thirdLogin.status, 200);
  const thirdSessionId = JSON.parse(Buffer.from(thirdLogin.body.token.split(".")[1], "base64url").toString()).sid;
  const memberSessions = await request(baseUrl, memberToken, "/api/sessions");
  assert.equal(memberSessions.status, 200);
  assert.equal(memberSessions.body.sessions.length, 1);
  assert.equal(memberSessions.body.sessions.some(x => x.id === thirdSessionId), false);
  const crossAccountRevoke = await request(baseUrl, memberToken, "/api/sessions/" + thirdSessionId, { method: "DELETE" });
  assert.equal(crossAccountRevoke.status, 404);

  const revokeOthers = await request(baseUrl, ownerToken, "/api/sessions/revoke-others", { method: "POST", body: "{}" });
  assert.equal(revokeOthers.status, 200);
  assert.equal(revokeOthers.body.revoked, 1);
  const thirdSessionCheck = await request(baseUrl, thirdLogin.body.token, "/api/me");
  assert.equal(thirdSessionCheck.status, 401);
  const sessionsAfterRevokeOthers = await request(baseUrl, ownerToken, "/api/sessions");
  assert.equal(sessionsAfterRevokeOthers.body.sessions.length, 1);
  assert.equal(sessionsAfterRevokeOthers.body.sessions[0].current, true);

  const logoutLogin = await request(baseUrl, null, "/api/login", {
    method: "POST", body: JSON.stringify({ username: "v2owner" + suffix, password: "test-password-123" })
  });
  assert.equal(logoutLogin.status, 200);
  const logoutResult = await request(baseUrl, logoutLogin.body.token, "/api/logout", { method: "POST", body: "{}" });
  assert.equal(logoutResult.status, 200);
  const loggedOutCheck = await request(baseUrl, logoutLogin.body.token, "/api/me");
  assert.equal(loggedOutCheck.status, 401);
  const ownerSessionStillWorks = await request(baseUrl, ownerToken, "/api/me");
  assert.equal(ownerSessionStillWorks.status, 200);

  const direct = await request(baseUrl, ownerToken, "/api/dm", {
    method: "POST", body: JSON.stringify({ username: "v2member" + suffix })
  });
  assert.equal(direct.status, 200);
  const blocked = await request(baseUrl, ownerToken, `/api/users/${b.body.user.id}/block`, {
    method: "POST", body: "{}"
  });
  assert.equal(blocked.status, 200);
  const blockedList = await request(baseUrl, ownerToken, "/api/blocks");
  assert.equal(blockedList.body.users.some(x => x.id === b.body.user.id), true);
  const deniedNewDm = await request(baseUrl, ownerToken, "/api/dm", {
    method: "POST", body: JSON.stringify({ username: "v2member" + suffix })
  });
  assert.equal(deniedNewDm.status, 403);
  const deniedDirectMessage = await request(baseUrl, memberToken, `/api/chats/${direct.body.chat.id}/messages`, {
    method: "POST", body: JSON.stringify({ body: "blocked message" })
  });
  assert.equal(deniedDirectMessage.status, 403);
  const blockedSearch = await request(baseUrl, ownerToken, "/api/search?q=v2member" + suffix);
  assert.equal(blockedSearch.body.users.some(x => x.id === b.body.user.id), false);
  const unblocked = await request(baseUrl, ownerToken, `/api/users/${b.body.user.id}/block`, {
    method: "DELETE", body: "{}"
  });
  assert.equal(unblocked.status, 200);
  const dmAfterUnblock = await request(baseUrl, ownerToken, "/api/dm", {
    method: "POST", body: JSON.stringify({ username: "v2member" + suffix })
  });
  assert.equal(dmAfterUnblock.status, 200);

  const created = await request(baseUrl, ownerToken, "/api/chats", {
    method: "POST",
    body: JSON.stringify({ title: "v2 integration", type: "group", members: ["v2member" + suffix] })
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const chatId = created.body.chat.id;

  const initialMembers = await request(baseUrl, ownerToken, `/api/chats/${chatId}/members`);
  assert.equal(initialMembers.status, 200);
  assert.equal(initialMembers.body.members.length, 2);
  const memberPromoted = await request(baseUrl, ownerToken, `/api/chats/${chatId}/members/${b.body.user.id}`, {
    method: "PATCH", body: JSON.stringify({ role: "admin" })
  });
  assert.equal(memberPromoted.status, 200);
  const adminCannotPromoteSelf = await request(baseUrl, memberToken, `/api/chats/${chatId}/members/${b.body.user.id}`, {
    method: "PATCH", body: JSON.stringify({ role: "member" })
  });
  assert.equal(adminCannotPromoteSelf.status, 403);

  const inviteCreated = await request(baseUrl, ownerToken, `/api/chats/${chatId}/invites`, {
    method: "POST", body: JSON.stringify({ expiresInSeconds: 3600, maxUses: 1 })
  });
  assert.equal(inviteCreated.status, 200);
  const inviteToken = inviteCreated.body.invite.token;
  const invitePreview = await request(baseUrl, null, `/api/invites/${inviteToken}`);
  assert.equal(invitePreview.status, 200);
  assert.equal(invitePreview.body.invite.valid, true);
  const inviteJoin = await request(baseUrl, guestToken, `/api/invites/${inviteToken}/join`, {
    method: "POST", body: "{}"
  });
  assert.equal(inviteJoin.status, 200);
  const exhaustedPreview = await request(baseUrl, null, `/api/invites/${inviteToken}`);
  assert.equal(exhaustedPreview.body.invite.valid, false);
  const secondJoin = await request(baseUrl, guestToken, `/api/invites/${inviteToken}/join`, {
    method: "POST", body: "{}"
  });
  assert.equal(secondJoin.status, 410);

  const adminCannotPromoteGuest = await request(baseUrl, memberToken, `/api/chats/${chatId}/members/${guest.body.user.id}`, {
    method: "PATCH", body: JSON.stringify({ role: "admin" })
  });
  assert.equal(adminCannotPromoteGuest.status, 403);
  const adminCanRemoveGuest = await request(baseUrl, memberToken, `/api/chats/${chatId}/members/${guest.body.user.id}`, {
    method: "DELETE", body: "{}"
  });
  assert.equal(adminCanRemoveGuest.status, 200);
  const ownerDemotesAdmin = await request(baseUrl, ownerToken, `/api/chats/${chatId}/members/${b.body.user.id}`, {
    method: "PATCH", body: JSON.stringify({ role: "member" })
  });
  assert.equal(ownerDemotesAdmin.status, 200);

  const draftSaved = await request(baseUrl, ownerToken, `/api/chats/${chatId}/draft`, {
    method: "PUT", body: JSON.stringify({ body: "draft that must survive switching chats" })
  });
  assert.equal(draftSaved.status, 200);
  const draftRead = await request(baseUrl, ownerToken, `/api/chats/${chatId}/draft`);
  assert.equal(draftRead.body.draft.body, "draft that must survive switching chats");
  const draftCleared = await request(baseUrl, ownerToken, `/api/chats/${chatId}/draft`, { method: "DELETE" });
  assert.equal(draftCleared.status, 200);
  const emptyDraft = await request(baseUrl, ownerToken, `/api/chats/${chatId}/draft`);
  assert.equal(emptyDraft.body.draft.body, "");

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

  const reactionAdded = await request(baseUrl, memberToken, `/api/messages/${second.body.message.id}/reaction`, {
    method: "POST", body: JSON.stringify({ emoji: "🔥" })
  });
  assert.equal(reactionAdded.status, 200);
  const reactionUsers = await request(baseUrl, ownerToken, `/api/messages/${second.body.message.id}/reactions?emoji=%F0%9F%94%A5`);
  assert.equal(reactionUsers.status, 200);
  assert.equal(reactionUsers.body.users.length, 1);
  assert.equal(reactionUsers.body.users[0].username, "v2member" + suffix);

  const latest = await request(baseUrl, ownerToken, `/api/chats/${chatId}/messages?limit=2`);
  assert.equal(latest.status, 200);
  assert.deepEqual(latest.body.messages.map(x => x.body), ["second message", "third message"]);
  assert.equal(latest.body.hasMore, true);
  const older = await request(baseUrl, ownerToken, `/api/chats/${chatId}/messages?before=${latest.body.messages[0].id}&limit=2`);
  assert.equal(older.status, 200);
  assert.deepEqual(older.body.messages.map(x => x.body), ["first message"]);
  assert.equal(older.body.hasMore, false);

  const pdfBuffer = Buffer.from("%PDF-1.4\\n% vovchikGram test\\n%%EOF\\n");
  const pdfUpload = await request(baseUrl, ownerToken, "/api/upload", {
    method: "POST",
    body: JSON.stringify({ kind: "file", data: "data:application/pdf;base64," + pdfBuffer.toString("base64") })
  });
  assert.equal(pdfUpload.status, 200, JSON.stringify(pdfUpload.body));
  const invalidPdf = await request(baseUrl, ownerToken, "/api/upload", {
    method: "POST",
    body: JSON.stringify({ kind: "file", data: "data:application/pdf;base64," + Buffer.from("not a PDF").toString("base64") })
  });
  assert.equal(invalidPdf.status, 415);

  const videoBuffer = Buffer.alloc(16);
  videoBuffer.write("ftyp", 4, "ascii");
  const videoUpload = await request(baseUrl, ownerToken, "/api/upload", {
    method: "POST",
    body: JSON.stringify({ kind: "file", data: "data:video/mp4;base64," + videoBuffer.toString("base64") })
  });
  assert.equal(videoUpload.status, 200, JSON.stringify(videoUpload.body));

  const withFiles = await request(baseUrl, ownerToken, `/api/chats/${chatId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      body: "PDF and video attachments",
      attachments: [
        { url: pdfUpload.body.url, mime: "application/pdf", name: "test.pdf", size: pdfBuffer.length },
        { url: videoUpload.body.url, mime: "video/mp4", name: "test.mp4", size: videoBuffer.length }
      ]
    })
  });
  assert.equal(withFiles.status, 200, JSON.stringify(withFiles.body));
  const attachmentHistory = await request(baseUrl, ownerToken, `/api/chats/${chatId}/messages?limit=100`);
  const storedAttachments = JSON.parse(attachmentHistory.body.messages.find(x => x.id === withFiles.body.message.id).attachments);
  assert.equal(storedAttachments.length, 2);
  assert.equal(storedAttachments[0].name, "test.pdf");
  assert.equal(storedAttachments[1].mime, "video/mp4");

  const scheduledAt = new Date(Date.now() + 1800).toISOString();
  const scheduled = await request(baseUrl, ownerToken, `/api/chats/${chatId}/scheduled`, {
    method: "POST", body: JSON.stringify({ body: "scheduled delivery integration", scheduledAt })
  });
  assert.equal(scheduled.status, 200, JSON.stringify(scheduled.body));
  const pendingScheduled = await request(baseUrl, ownerToken, `/api/chats/${chatId}/scheduled`);
  assert.equal(pendingScheduled.body.messages.some(x => x.id === scheduled.body.scheduled.id), true);

  const scheduledCancel = await request(baseUrl, ownerToken, `/api/chats/${chatId}/scheduled`, {
    method: "POST", body: JSON.stringify({ body: "this should be cancelled", scheduledAt: new Date(Date.now() + 60000).toISOString() })
  });
  assert.equal(scheduledCancel.status, 200);
  const cancelled = await request(baseUrl, ownerToken, `/api/scheduled/${scheduledCancel.body.scheduled.id}`, { method: "DELETE" });
  assert.equal(cancelled.status, 200);

  let scheduledDelivered=false;
  const deliveryDeadline=Date.now()+10000;
  while(Date.now()<deliveryDeadline&&!scheduledDelivered){
    const history=await request(baseUrl, ownerToken, `/api/chats/${chatId}/messages?limit=100`);
    scheduledDelivered=history.body.messages.some(x=>x.body==="scheduled delivery integration");
    if(!scheduledDelivered) await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.equal(scheduledDelivered,true,"scheduled message was not delivered by the server dispatcher");


  const unreadBefore = await request(baseUrl, ownerToken, "/api/chats");
  assert.equal(unreadBefore.body.chats.find(x => x.id === chatId).unread_count, 2);

  const memberRead = await request(baseUrl, memberToken, `/api/chats/${chatId}/read`, {
    method: "POST", body: "{}"
  });
  assert.equal(memberRead.status, 200);
  const readers = await request(baseUrl, ownerToken, `/api/messages/${first.body.message.id}/readers`);
  assert.equal(readers.status, 200);
  assert.equal(readers.body.readers.length, 1);
  assert.equal(readers.body.readers[0].username, "v2member" + suffix);

  const hidden = await request(baseUrl, ownerToken, `/api/messages/${third.body.message.id}/hide`, { method: "POST", body: "{}" });
  assert.equal(hidden.status, 200);
  const ownerVisibleHistory = await request(baseUrl, ownerToken, `/api/chats/${chatId}/messages`);
  assert.equal(ownerVisibleHistory.body.messages.some(x => x.id === third.body.message.id), false);
  const memberVisibleHistory = await request(baseUrl, memberToken, `/api/chats/${chatId}/messages`);
  assert.equal(memberVisibleHistory.body.messages.some(x => x.id === third.body.message.id), true);
  const hiddenList = await request(baseUrl, ownerToken, "/api/hidden-messages");
  assert.equal(hiddenList.body.messages.length, 1);
  const unreadAfterHide = await request(baseUrl, ownerToken, "/api/chats");
  assert.equal(unreadAfterHide.body.chats.find(x => x.id === chatId).unread_count, 1);
  const chatExport = await request(baseUrl, ownerToken, `/api/chats/${chatId}/export`);
  assert.equal(chatExport.status, 200);
  assert.equal(chatExport.body.messages.some(x => x.id === third.body.message.id), false);
  assert.equal(chatExport.body.messages.some(x => x.id === first.body.message.id), true);
  const restored = await request(baseUrl, ownerToken, `/api/messages/${third.body.message.id}/hide`, { method: "DELETE" });
  assert.equal(restored.status, 200);
  const ownerVisibleAgain = await request(baseUrl, ownerToken, `/api/chats/${chatId}/messages`);
  assert.equal(ownerVisibleAgain.body.messages.some(x => x.id === third.body.message.id), true);

  const edited = await request(baseUrl, ownerToken, `/api/messages/${first.body.message.id}`, {
    method: "PATCH", body: JSON.stringify({ body: "first message edited" })
  });
  assert.equal(edited.status, 200);
  const editHistory = await request(baseUrl, ownerToken, `/api/messages/${first.body.message.id}/edits`);
  assert.equal(editHistory.status, 200);
  assert.equal(editHistory.body.edits.length, 1);
  assert.equal(editHistory.body.edits[0].body, "first message");

  const searched = await request(baseUrl, ownerToken, "/api/search/messages?q=first%20message%20edited");
  assert.equal(searched.status, 200);
  assert.equal(searched.body.messages.length, 1);
  assert.equal(searched.body.messages[0].id, first.body.message.id);

  const targetChat = await request(baseUrl, ownerToken, "/api/chats", {
    method: "POST", body: JSON.stringify({ title: "v2 forward target", type: "group" })
  });
  assert.equal(targetChat.status, 200);
  const forwarded = await request(baseUrl, ownerToken, `/api/messages/${second.body.message.id}/forward`, {
    method: "POST", body: JSON.stringify({ chatId: targetChat.body.chat.id })
  });
  assert.equal(forwarded.status, 200);
  assert.equal(forwarded.body.message.forwarded_from_name, "V2 Member");
  const forwardedHistory = await request(baseUrl, ownerToken, `/api/chats/${targetChat.body.chat.id}/messages`);
  assert.equal(forwardedHistory.body.messages[0].body, "second message");
  assert.equal(forwardedHistory.body.messages[0].forwarded_from_name, "V2 Member");

  const starred = await request(baseUrl, ownerToken, `/api/chats/${chatId}/preferences`, {
    method: "PATCH", body: JSON.stringify({ starred: true, archived: true, muted: true, pinned: true })
  });
  assert.equal(starred.status, 200);
  assert.deepEqual(starred.body.preferences, { archived: 1, starred: 1, muted: 1, pinned: 1 });
  const withPreferences = await request(baseUrl, ownerToken, "/api/chats");
  const preferredChat = withPreferences.body.chats.find(x => x.id === chatId);
  assert.equal(preferredChat.is_starred, 1);
  assert.equal(preferredChat.is_archived, 1);
  assert.equal(preferredChat.is_muted, 1);
  assert.equal(preferredChat.is_pinned, 1);

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
  const privateSearch = await request(baseUrl, outsider.body.token, "/api/search/messages?q=second%20message");
  assert.equal(privateSearch.status, 200);
  assert.equal(privateSearch.body.messages.length, 0);
  const privateReactionUsers = await request(baseUrl, outsider.body.token, `/api/messages/${second.body.message.id}/reactions?emoji=%F0%9F%94%A5`);
  assert.equal(privateReactionUsers.status, 404);
  const privateReaders = await request(baseUrl, outsider.body.token, `/api/messages/${first.body.message.id}/readers`);
  assert.equal(privateReaders.status, 404);
  const deniedDraft = await request(baseUrl, outsider.body.token, `/api/chats/${chatId}/draft`);
  assert.equal(deniedDraft.status, 403);
  const deniedSchedule = await request(baseUrl, outsider.body.token, `/api/chats/${chatId}/scheduled`, {
    method: "POST", body: JSON.stringify({ body: "intruder", scheduledAt: new Date(Date.now() + 60000).toISOString() })
  });
  assert.equal(deniedSchedule.status, 403);
  const deniedExport = await request(baseUrl, outsider.body.token, `/api/chats/${chatId}/export`);
  assert.equal(deniedExport.status, 403);
  const deniedHide = await request(baseUrl, outsider.body.token, `/api/messages/${third.body.message.id}/hide`, {
    method: "POST", body: "{}"
  });
  assert.equal(deniedHide.status, 403);

  const activityBefore = await request(baseUrl, ownerToken, "/api/account/activity");
  assert.equal(activityBefore.status, 200);
  assert.ok(activityBefore.body.events.some(event => event.event === "login_succeeded"));
  const wrongCurrentPassword = await request(baseUrl, ownerToken, "/api/account/password", {
    method: "POST", body: JSON.stringify({ currentPassword: "wrong-password", newPassword: "new-test-password-456" })
  });
  assert.equal(wrongCurrentPassword.status, 403);
  const prePasswordChangeLogin = await request(baseUrl, null, "/api/login", {
    method: "POST", body: JSON.stringify({ username: "v2owner" + suffix, password: "test-password-123" })
  });
  assert.equal(prePasswordChangeLogin.status, 200);
  const passwordChanged = await request(baseUrl, ownerToken, "/api/account/password", {
    method: "POST", body: JSON.stringify({ currentPassword: "test-password-123", newPassword: "new-test-password-456" })
  });
  assert.equal(passwordChanged.status, 200);
  const revokedAfterPasswordChange = await request(baseUrl, prePasswordChangeLogin.body.token, "/api/me");
  assert.equal(revokedAfterPasswordChange.status, 401);
  const oldPasswordLogin = await request(baseUrl, null, "/api/login", {
    method: "POST", body: JSON.stringify({ username: "v2owner" + suffix, password: "test-password-123" })
  });
  assert.equal(oldPasswordLogin.status, 401);
  const newPasswordLogin = await request(baseUrl, null, "/api/login", {
    method: "POST", body: JSON.stringify({ username: "v2owner" + suffix, password: "new-test-password-456" })
  });
  assert.equal(newPasswordLogin.status, 200);
  const activityAfter = await request(baseUrl, ownerToken, "/api/account/activity");
  assert.ok(activityAfter.body.events.some(event => event.event === "password_changed"));

  const limited = await request(baseUrl, null, "/api/register", {
    method: "POST", body: JSON.stringify({ username: "v2limited" + suffix, password: "test-password-123" })
  });
  assert.equal(limited.status, 200);
  const sixthRegistration = await request(baseUrl, null, "/api/register", {
    method: "POST", body: JSON.stringify({ username: "v2sixth" + suffix, password: "test-password-123" })
  });
  assert.equal(sixthRegistration.status, 429);
  for (let attempt=0; attempt<4; attempt++) {
    const failed = await request(baseUrl, null, "/api/login", {
      method: "POST", body: JSON.stringify({ username: "v2limited" + suffix, password: "wrong-password" })
    });
    assert.equal(failed.status, 401);
  }
  const locked = await request(baseUrl, null, "/api/login", {
    method: "POST", body: JSON.stringify({ username: "v2limited" + suffix, password: "wrong-password" })
  });
  assert.equal(locked.status, 429);
  const blockedCorrectPassword = await request(baseUrl, null, "/api/login", {
    method: "POST", body: JSON.stringify({ username: "v2limited" + suffix, password: "test-password-123" })
  });
  assert.equal(blockedCorrectPassword.status, 429);
});
