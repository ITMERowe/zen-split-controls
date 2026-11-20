// Run: node tests/match.test.js
// Tests the pure tab-matching helpers in split-menu.uc.js (the block between the <pure> markers).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(path.join(__dirname, "..", "split-menu.uc.js"), "utf8");
const block = src.slice(src.indexOf("// <pure>"), src.indexOf("// </pure>"));
assert.ok(block.includes("pickMatch"), "pure block not found");
const { sameUrl, pickMatch } = new Function(`${block}\nreturn { sameUrl, pickMatch };`)();

// Minimal stand-in for a Zen tab.
const tab = (url, { pinned = false, ws = "w1", attrs = [] } = {}) => ({
  pinned,
  linkedBrowser: { currentURI: { spec: url } },
  hasAttribute: n => attrs.includes(n),
  getAttribute: n => (n === "zen-workspace-id" ? ws : null),
});

// sameUrl: a trailing slash does not matter, the #fragment does.
assert.ok(sameUrl("https://x.com/", "https://x.com"));
assert.ok(sameUrl("https://a.com/p/", "https://a.com/p"));
assert.ok(!sameUrl("https://mail.example/#inbox", "https://mail.example/#sent"));
assert.ok(!sameUrl("https://a.com/one", "https://a.com/two"));
assert.ok(sameUrl("not a url", "not a url"));

// pickMatch
const origin = tab("https://origin.test/");
const regular = tab("https://same.test/page");
const pinned = tab("https://same.test/page", { pinned: true });
assert.equal(pickMatch([origin, pinned, regular], "https://same.test/page", origin, "w1"), regular, "prefers a regular tab");
assert.equal(pickMatch([origin, pinned], "https://same.test/page", origin, "w1"), pinned, "falls back to a pinned tab");
assert.equal(pickMatch([origin, regular], "https://other.test/", origin, "w1"), null, "no match");
assert.equal(pickMatch([origin], "https://origin.test/", origin, "w1"), null, "never the starting tab");
assert.equal(pickMatch([tab("https://same.test/page", { ws: "w2" })], "https://same.test/page", origin, "w1"), null, "other workspace");
assert.ok(pickMatch([tab("https://same.test/page", { ws: null, attrs: ["zen-essential"], pinned: true })], "https://same.test/page", origin, "w1"), "essential tabs match across workspaces");
assert.equal(pickMatch([tab("https://same.test/page", { attrs: ["zen-empty-tab"] })], "https://same.test/page", origin, "w1"), null, "empty placeholder tab");

console.log("ok: all tab-matching tests passed");
