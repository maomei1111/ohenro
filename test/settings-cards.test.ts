import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const PUBLIC_DIR = path.join(__dirname, '..', 'src', 'public');

// 実際のindex.htmlを読み込み(内蔵scriptは実行しない)、goshuin.jsだけをグローバルで評価して
// decorateSettingsCards()を呼ぶ。設定画面に新しいセクションを足しても、カードの見出しが
// ずれないことを確認する。
function loadSettings() {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  const src = fs.readFileSync(path.join(PUBLIC_DIR, 'js', 'goshuin.js'), 'utf8');
  dom.window.eval(src);
  (dom.window as any).decorateSettingsCards();
  return dom.window.document;
}

describe('decorateSettingsCards', () => {
  let doc: Document;
  beforeEach(() => {
    doc = loadSettings();
  });

  const titleKeysIn = (el: Element) =>
    [...el.querySelectorAll('.settings-section-title')].map((t) => t.getAttribute('data-i18n'));

  it('puts the language title and select in the language card', () => {
    const card = doc.querySelector('#langSelect')!.closest('.settings-reference-card')!;
    expect(titleKeysIn(card)).toEqual(['settings_language_section']);
  });

  it('puts the location title in the location card', () => {
    const card = doc.querySelector('#locationToggle')!.closest('.settings-reference-card')!;
    expect(titleKeysIn(card)).toEqual(['settings_location_section']);
  });

  it('puts the theme title (not the entitlement title) in the theme card', () => {
    const card = doc.querySelector('#themeSelect')!.closest('.settings-reference-card')!;
    expect(titleKeysIn(card)).toEqual(['settings_theme_section']);
  });

  it('leaves the entitlement section title outside any card', () => {
    const title = doc.querySelector('.settings-section-title[data-i18n="settings_entitlement_section"]')!;
    expect(title.closest('.settings-reference-card')).toBeNull();
  });

  it('is idempotent (a second call does not decorate again)', () => {
    const before = doc.querySelectorAll('.settings-reference-card').length;
    (doc.defaultView as any).decorateSettingsCards();
    expect(doc.querySelectorAll('.settings-reference-card').length).toBe(before);
  });
});
