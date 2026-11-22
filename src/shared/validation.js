"use strict";

/**
 * Shared request validation helpers used by the HTTP API.
 * Kept independent from Express/SQLite so behavior can be unit-tested.
 */
function cleanUsername(value) {
  return String(value ?? "").trim().replace(/^@/, "").toLowerCase();
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function sanitizeMessageBody(value, maxLength = 4000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

const UPLOAD_PATHS = {
  image: /^\/uploads\/[a-f0-9]+\.(png|jpg|webp|gif)$/,
  audio: /^\/uploads\/[a-f0-9]+\.(mp3|ogg|wav|m4a|aac|flac|weba)$/,
  file: /^\/uploads\/[a-f0-9]+\.(pdf|txt|zip|docx|mp4|webm)$/,
  attachment: /^\/uploads\/[a-f0-9]+\.(png|jpg|webp|gif|mp3|ogg|wav|m4a|aac|flac|weba|pdf|txt|zip|docx|mp4|webm)$/
};

function isValidUploadPath(value, kind = "image") {
  const path = String(value ?? "");
  return !!UPLOAD_PATHS[kind] && UPLOAD_PATHS[kind].test(path);
}

module.exports = { cleanUsername, boundedInteger, sanitizeMessageBody, isValidUploadPath };
