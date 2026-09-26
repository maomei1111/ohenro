import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const PUBLIC_DIR = path.join(__dirname, '..', 'src', 'public');
const JS_DIR = path.join(PUBLIC_DIR, 'js');
const read = (f: string) => fs.readFileSync(path.join(JS_DIR, f), 'utf8');

// 実際に配信しているdate-utils.js / i18n.js / settings.jsをjsdomに読み込み、
// バス案内の文言に出る時刻(hhmm)が、0埋めなしのGTFS時刻("7:27:00")でも
// "7:27:"のように崩れないことを確認する回帰テスト。
describe('bus note time display (hhmm in settings.js)', () => {
  let win: any;

  beforeAll(() => {
    // settings.jsは読み込み時にindex.htmlのDOM要素を参照するため、実際のindex.html(内蔵scriptは実行しない)を使う
    const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
    const dom = new JSDOM(html, { runScripts: 'outside-only' });
    win = dom.window;
    win.eval(read('date-utils.js'));
    win.eval(read('i18n.js'));
    // app-core.jsが行っているOhenroAppからの取り出しのうち、hhmmとt()に必要な分だけ再現する
    win.eval(`
      var { createTranslator, formatGtfsTime } = window.OhenroApp;
      var currentLang = 'ja';
      var t = createTranslator(() => currentLang);
    `);
    win.eval(read('settings.js'));
  });

  it('formats a zero-padded time without seconds', () => {
    expect(win.hhmm('10:17:00')).toBe('10:17');
  });

  it('formats an un-padded morning time without a trailing colon', () => {
    expect(win.hhmm('7:27:00')).toBe('07:27');
  });

  it('renders the direct-bus note with clean times for a morning bus', () => {
    const note = win.t('bus_direct', '徳島バス', '常楽寺前', win.hhmm('7:27:00'), '一の宮札所前', win.hhmm('7:33:00'));
    expect(note).toContain('07:27');
    expect(note).toContain('07:33');
    expect(note).not.toMatch(/\d:\D|:\D*発|:着/); // "7:27:発" のような崩れが無い
  });

  it('passes empty values through unchanged', () => {
    expect(win.hhmm('')).toBe('');
    expect(win.hhmm(undefined)).toBe(undefined);
  });
});
