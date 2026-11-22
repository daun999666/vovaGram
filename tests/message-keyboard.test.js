"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getMessageKeyAction } = require("../public/message-keyboard.js");

test("message keyboard: Enter sends when enabled", () => {
  assert.equal(getMessageKeyAction({ key: "Enter" }, true), "send");
});

test("message keyboard: Shift+Enter always inserts a newline", () => {
  assert.equal(getMessageKeyAction({ key: "Enter", shiftKey: true }, true), null);
  assert.equal(getMessageKeyAction({ key: "Enter", shiftKey: true }, false), null);
});

test("message keyboard: disabled Enter sends with Ctrl or Meta", () => {
  assert.equal(getMessageKeyAction({ key: "Enter" }, false), null);
  assert.equal(getMessageKeyAction({ key: "Enter", ctrlKey: true }, false), "send");
  assert.equal(getMessageKeyAction({ key: "Enter", metaKey: true }, false), "send");
});

test("message keyboard: composition and other keys are never submitted", () => {
  assert.equal(getMessageKeyAction({ key: "Enter", isComposing: true }, true), null);
  assert.equal(getMessageKeyAction({ key: "a" }, true), null);
  assert.equal(getMessageKeyAction({ key: "Enter", altKey: true }, true), null);
});
