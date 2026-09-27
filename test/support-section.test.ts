import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const PUBLIC_DIR = path.join(__dirname, '..', 'src', 'public');
const JS_DIR = path.join(PUBLIC_DIR, 'js');
const read = (f: string) => fs.readFileSync(path.join(JS_DIR, f), 'utf8');

// 実際のindex.htmlと、date-utils.js / i18n.js / settings.js をjsdomに読み込み、
// 「任意の応援」セクションの表示・購入操作・結果通知を、AndroidBridgeのモックで検証する。
function load(bridge?: Record<string, any>) {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  const win: any = dom.window;
  if (bridge) win.AndroidBridge = bridge;
  win.eval(read('date-utils.js'));
  win.eval(read('i18n.js'));
  win.eval(`
    var { createTranslator, formatGtfsTime } = window.OhenroApp;
    var currentLang = 'ja';
    var t = createTranslator(() => currentLang);
    var __toasts = [];
    var showToast = function(m){ __toasts.push(m); };
  `);
  win.eval(read('settings.js'));
  return { win, doc: dom.window.document as Document, toasts: () => win.eval('__toasts') as string[] };
}

const PRODUCTS = JSON.stringify([
  { id: 'support_100', price: '¥100', title: 'ささやかな応援' },
  { id: 'support_500', price: '¥500', title: 'コーヒー1杯分' },
]);

describe('support section markup', () => {
  it('is hidden by default (only shown by the Android app when products are available)', () => {
    const { doc } = load();
    expect((doc.getElementById('supportSection') as HTMLElement).hidden).toBe(true);
  });

  it('hides the legacy-purchaser section now that the app is free with optional support', () => {
    const { doc } = load();
    expect((doc.getElementById('entitlementSection') as HTMLElement).hidden).toBe(true);
  });
});

describe('initSupportSection', () => {
  it('does nothing (and does not throw) outside the Android app', () => {
    const { win, doc } = load();
    expect(win.isSupportAvailable()).toBe(false);
    expect(() => win.initSupportSection()).not.toThrow();
    expect((doc.getElementById('supportSection') as HTMLElement).hidden).toBe(true);
  });

  it('asks the Android app for the products when the bridge supports it', () => {
    const requestSupportProducts = vi.fn();
    const { win } = load({ requestSupportProducts, purchaseSupport: vi.fn() });
    win.initSupportSection();
    expect(requestSupportProducts).toHaveBeenCalledTimes(1);
  });

  it('treats an older Android app without the support bridge as unavailable', () => {
    const { win } = load({ hasLocationPermission: () => true });
    expect(win.isSupportAvailable()).toBe(false);
  });

  it('survives a bridge that throws', () => {
    const { win } = load({
      requestSupportProducts: () => {
        throw new Error('boom');
      },
      purchaseSupport: vi.fn(),
    });
    expect(() => win.initSupportSection()).not.toThrow();
  });
});

describe('rendering products', () => {
  it('shows the section with one button per product (price + name)', () => {
    const { win, doc } = load({ requestSupportProducts: vi.fn(), purchaseSupport: vi.fn() });
    win.__onSupportProducts(PRODUCTS);
    expect((doc.getElementById('supportSection') as HTMLElement).hidden).toBe(false);
    const buttons = [...doc.querySelectorAll('#supportButtons .support-btn')] as HTMLElement[];
    expect(buttons).toHaveLength(2);
    expect(buttons[0].dataset.productId).toBe('support_100');
    expect(buttons[0].querySelector('.support-price')!.textContent).toBe('¥100');
    expect(buttons[0].querySelector('.support-label')!.textContent).toBe('ささやかな応援');
  });

  it('keeps the section hidden when there are no products (e.g. not set up in Play Console yet)', () => {
    const { win, doc } = load({ requestSupportProducts: vi.fn(), purchaseSupport: vi.fn() });
    win.__onSupportProducts('[]');
    expect((doc.getElementById('supportSection') as HTMLElement).hidden).toBe(true);
  });

  it('hides the section again if a later refresh returns no products', () => {
    const { win, doc } = load({ requestSupportProducts: vi.fn(), purchaseSupport: vi.fn() });
    win.__onSupportProducts(PRODUCTS);
    win.__onSupportProducts('[]');
    expect((doc.getElementById('supportSection') as HTMLElement).hidden).toBe(true);
    expect(doc.querySelectorAll('#supportButtons .support-btn')).toHaveLength(0);
  });

  it('does not duplicate buttons when the product list is delivered more than once', () => {
    const { win, doc } = load({ requestSupportProducts: vi.fn(), purchaseSupport: vi.fn() });
    win.__onSupportProducts(PRODUCTS);
    win.__onSupportProducts(PRODUCTS);
    expect(doc.querySelectorAll('#supportButtons .support-btn')).toHaveLength(2);
  });

  it('ignores malformed JSON and malformed entries safely', () => {
    const { win, doc } = load({ requestSupportProducts: vi.fn(), purchaseSupport: vi.fn() });
    expect(() => win.__onSupportProducts('not json')).not.toThrow();
    expect((doc.getElementById('supportSection') as HTMLElement).hidden).toBe(true);
    win.__onSupportProducts(JSON.stringify([null, { id: 1, price: '¥1' }, { id: 'a' }, { id: 'ok', price: '¥300' }]));
    expect(doc.querySelectorAll('#supportButtons .support-btn')).toHaveLength(1);
  });

  it('renders product names as text, never as HTML', () => {
    const { win, doc } = load({ requestSupportProducts: vi.fn(), purchaseSupport: vi.fn() });
    win.__onSupportProducts(JSON.stringify([{ id: 'x', price: '¥100', title: '<img src=x onerror=alert(1)>' }]));
    expect(doc.querySelector('#supportButtons img')).toBeNull();
    expect(doc.querySelector('#supportButtons .support-label')!.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('purchasing', () => {
  let purchaseSupport: ReturnType<typeof vi.fn>;
  let ctx: ReturnType<typeof load>;
  const buttons = () => [...ctx.doc.querySelectorAll('#supportButtons .support-btn')] as HTMLButtonElement[];

  beforeEach(() => {
    purchaseSupport = vi.fn();
    ctx = load({ requestSupportProducts: vi.fn(), purchaseSupport });
    ctx.win.__onSupportProducts(PRODUCTS);
  });

  it('starts the purchase for the tapped product and disables the buttons meanwhile', () => {
    buttons()[1].click();
    expect(purchaseSupport).toHaveBeenCalledWith('support_500');
    expect(buttons().every((b) => b.disabled)).toBe(true);
  });

  it('ignores a second tap while a purchase is in progress', () => {
    buttons()[0].click();
    ctx.win.purchaseSupport('support_100');
    expect(purchaseSupport).toHaveBeenCalledTimes(1);
  });

  it('thanks the user on success and re-enables the buttons', () => {
    buttons()[0].click();
    ctx.win.__onSupportPurchaseResult('support_100', 'success');
    expect(ctx.toasts()).toEqual([ctx.win.t('support_thanks')]);
    expect(buttons().every((b) => !b.disabled)).toBe(true);
  });

  it('shows nothing when the user cancels, and re-enables the buttons', () => {
    buttons()[0].click();
    ctx.win.__onSupportPurchaseResult('support_100', 'canceled');
    expect(ctx.toasts()).toEqual([]);
    expect(buttons().every((b) => !b.disabled)).toBe(true);
  });

  it('explains a pending payment', () => {
    buttons()[0].click();
    ctx.win.__onSupportPurchaseResult('support_100', 'pending');
    expect(ctx.toasts()).toEqual([ctx.win.t('support_pending')]);
  });

  it('shows an error message on failure and lets the user retry', () => {
    buttons()[0].click();
    ctx.win.__onSupportPurchaseResult('support_100', 'error');
    expect(ctx.toasts()).toEqual([ctx.win.t('support_error')]);
    buttons()[0].click();
    expect(purchaseSupport).toHaveBeenCalledTimes(2);
  });

  it('recovers with an error message when the bridge throws while starting the purchase', () => {
    const c = load({
      requestSupportProducts: vi.fn(),
      purchaseSupport: () => {
        throw new Error('boom');
      },
    });
    c.win.__onSupportProducts(PRODUCTS);
    (c.doc.querySelector('#supportButtons .support-btn') as HTMLButtonElement).click();
    expect(c.toasts()).toEqual([c.win.t('support_error')]);
    expect([...c.doc.querySelectorAll('#supportButtons .support-btn')].every((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
  });
});

describe('support strings', () => {
  it('are defined in all 7 languages', () => {
    const { win } = load();
    const I18N = win.OhenroApp.I18N;
    for (const lang of Object.keys(I18N)) {
      for (const key of ['support_section', 'support_desc', 'support_note', 'support_thanks', 'support_pending', 'support_error']) {
        expect(typeof I18N[lang][key], `${lang}.${key}`).toBe('string');
        expect(I18N[lang][key].length).toBeGreaterThan(0);
      }
    }
  });
});
