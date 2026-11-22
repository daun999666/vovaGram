"use strict";

function getMessageKeyAction(event, sendOnEnter = true) {
  if (!event || event.key !== "Enter" || event.isComposing) return null;
  if (event.shiftKey || event.altKey) return null;
  if (sendOnEnter && !event.ctrlKey && !event.metaKey) return "send";
  if (!sendOnEnter && (event.ctrlKey || event.metaKey)) return "send";
  return null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getMessageKeyAction };
}
if (typeof window !== "undefined") {
  window.VGMessageKeyboard = { getMessageKeyAction };
}
