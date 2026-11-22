"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  cleanUsername,
  boundedInteger,
  sanitizeMessageBody,
  isValidUploadPath
} = require("../src/shared/validation");

test("cleanUsername normalizes case, whitespace and a leading @", () => {
  assert.equal(cleanUsername("  @BaUn_01  "), "baun_01");
  assert.equal(cleanUsername(null), "");
});

test("boundedInteger clamps safe integers and falls back for invalid input", () => {
  assert.equal(boundedInteger("25", 50, 1, 100), 25);
  assert.equal(boundedInteger("0", 50, 1, 100), 1);
  assert.equal(boundedInteger("900", 50, 1, 100), 100);
  assert.equal(boundedInteger("nope", 50, 1, 100), 50);
  assert.equal(boundedInteger("1.5", 50, 1, 100), 50);
});

test("sanitizeMessageBody trims and caps message length", () => {
  assert.equal(sanitizeMessageBody("  hello  "), "hello");
  assert.equal(sanitizeMessageBody("abcdef", 4), "abcd");
  assert.equal(sanitizeMessageBody(null), "");
});

test("upload URL validation rejects external URLs and traversal paths", () => {
  assert.equal(isValidUploadPath("/uploads/abcdef0123.jpg", "image"), true);
  assert.equal(isValidUploadPath("/uploads/abcdef0123.mp3", "audio"), true);
  assert.equal(isValidUploadPath("https://example.com/track.mp3", "audio"), false);
  assert.equal(isValidUploadPath("/uploads/../../secret.png", "image"), false);
  assert.equal(isValidUploadPath("/uploads/abcdef.exe", "image"), false);
});
