'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const js = fs.readFileSync(path.join(__dirname, '../public/extra-features.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/extra-features.css'), 'utf8');

test('extra settings expose timezone, animation and palette preferences', () => {
  for (const key of ['timezone', 'animation', 'palette']) {
    assert.match(js, new RegExp('data-pref="' + key + '"'));
  }
  assert.match(js, /function applyTimezone\(\)/);
  assert.match(css, /data-extraPalette="violet"/);
  assert.match(css, /data-extraAnimation="subtle"/);
});

test('theme import validates schema and supported values before applying', () => {
  assert.match(js, /v\?\.schema!==1/);
  assert.match(js, /const allowed=\{palette:/);
  assert.match(js, /v\.theme\.bubbleWidth<45/);
  assert.match(js, /Файл темы не прошёл проверку/);
});

test('theme export and category reset controls are wired', () => {
  assert.match(js, /data-extra-theme-export/);
  assert.match(js, /data-extra-theme-import/);
  assert.match(js, /data-extra-reset-category/);
  assert.match(js, /function exportTheme\(\)/);
  assert.match(js, /function importTheme\(file\)/);
});

test('keyboard navigation and accessible focus targets are present', () => {
  assert.match(js, /\['ArrowLeft','ArrowRight','Home','End'\]/);
  assert.match(css, /\.vg-extra-panel :focus-visible/);
  assert.match(css, /min-height:38px/);
});
