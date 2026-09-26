import { describe, it, expect, vi } from 'vitest';
import { createPlacePhotoService, type PlacePhotoInfo } from '../src/places-photo';

const KEY = 'secret-server-key';
const IMG = Buffer.from('jpeg-bytes');

const quietLog = { error: vi.fn(), warn: vi.fn(), log: vi.fn() };

function image(status = 200) {
  return new Response(status === 200 ? IMG : 'err', { status, headers: { 'content-type': 'image/jpeg' } });
}

function makeInfo(): Record<string, PlacePhotoInfo> {
  return { '1': { placeId: 'PLACE1', photoName: 'places/PLACE1/photos/STALE', photoAttribution: '一宇・Kazutaka' } };
}

// URLに応じて応答を返すfetchのモック。呼び出し履歴も返す。
function makeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn(async (input: any, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  });
  return { fn: fn as unknown as typeof fetch, calls, mock: fn };
}

const isMedia = (u: string) => u.includes('/media');
const isDetails = (u: string) => u.includes('/places/PLACE1') && !u.includes('/photos/');

describe('createPlacePhotoService', () => {
  it('returns not_found when the temple has no photo reference, without calling fetch', async () => {
    const f = makeFetch(() => image());
    const svc = createPlacePhotoService({ info: { '2': { placeId: 'P2' } }, apiKey: KEY, fetchImpl: f.fn, log: quietLog });
    expect(await svc.getPhoto(2)).toEqual({ status: 'not_found' });
    expect(await svc.getPhoto(3)).toEqual({ status: 'not_found' });
    expect(f.calls).toHaveLength(0);
  });

  it('fetches the image once when the stored reference is still valid (no Place Details call)', async () => {
    const f = makeFetch(() => image());
    const svc = createPlacePhotoService({ info: makeInfo(), apiKey: KEY, fetchImpl: f.fn, log: quietLog });
    const r = await svc.getPhoto(1);
    expect(r.status).toBe('ok');
    expect(f.calls).toHaveLength(1);
    expect(isMedia(f.calls[0].url)).toBe(true);
    expect(f.calls[0].url).toContain('places/PLACE1/photos/STALE/media');
  });

  it('serves a repeat request from the in-memory cache without calling fetch again', async () => {
    const f = makeFetch(() => image());
    const svc = createPlacePhotoService({ info: makeInfo(), apiKey: KEY, fetchImpl: f.fn, log: quietLog });
    await svc.getPhoto(1);
    const r = await svc.getPhoto(1);
    expect(r.status).toBe('ok');
    expect(f.calls).toHaveLength(1);
  });

  it('refetches the image after the cache TTL has passed', async () => {
    let t = 0;
    const f = makeFetch(() => image());
    const svc = createPlacePhotoService({ info: makeInfo(), apiKey: KEY, fetchImpl: f.fn, now: () => t, imageTtlMs: 1000, log: quietLog });
    await svc.getPhoto(1);
    t = 999;
    await svc.getPhoto(1);
    expect(f.calls).toHaveLength(1);
    t = 1001;
    await svc.getPhoto(1);
    expect(f.calls).toHaveLength(2);
  });

  describe('when the stored photo reference has expired (400 from the media API)', () => {
    function expiredScenario() {
      const info = makeInfo();
      const f = makeFetch((url) => {
        if (isDetails(url)) {
          return Response.json({ photos: [{ name: 'places/PLACE1/photos/FRESH', authorAttributions: [{ displayName: 'Kazutaka' }] }] });
        }
        if (url.includes('/photos/FRESH/media')) return image();
        return image(400); // STALE
      });
      const svc = createPlacePhotoService({ info, apiKey: KEY, fetchImpl: f.fn, log: quietLog });
      return { info, f, svc };
    }

    it('re-resolves the reference from the placeId and retries once', async () => {
      const { info, f, svc } = expiredScenario();
      const r = await svc.getPhoto(1);
      expect(r.status).toBe('ok');
      expect(f.calls.map((c) => (isDetails(c.url) ? 'details' : c.url.includes('FRESH') ? 'media-fresh' : 'media-stale'))).toEqual([
        'media-stale',
        'details',
        'media-fresh',
      ]);
      expect(info['1'].photoName).toBe('places/PLACE1/photos/FRESH');
    });

    it('updates the credit to the refreshed photo author so the page shows the matching attribution', async () => {
      const { info, svc } = expiredScenario();
      await svc.getPhoto(1);
      expect(info['1'].photoAttribution).toBe('Kazutaka');
    });

    it('sends the API key as a header (not in the URL) and asks only for photo fields on Place Details', async () => {
      const { f, svc } = expiredScenario();
      await svc.getPhoto(1);
      const details = f.calls.find((c) => isDetails(c.url))!;
      const headers = details.init!.headers as Record<string, string>;
      expect(headers['X-Goog-Api-Key']).toBe(KEY);
      expect(headers['X-Goog-FieldMask']).toBe('photos.name,photos.authorAttributions');
      expect(details.url).not.toContain(KEY);
    });

    it('also retries on 404', async () => {
      const info = makeInfo();
      const f = makeFetch((url) => {
        if (isDetails(url)) return Response.json({ photos: [{ name: 'places/PLACE1/photos/FRESH' }] });
        if (url.includes('/photos/FRESH/media')) return image();
        return image(404);
      });
      const svc = createPlacePhotoService({ info, apiKey: KEY, fetchImpl: f.fn, log: quietLog });
      expect((await svc.getPhoto(1)).status).toBe('ok');
      expect(info['1'].photoAttribution).toBeNull();
    });

    it('shares one Place Details call between concurrent requests for the same temple', async () => {
      const { f, svc } = expiredScenario();
      const results = await Promise.all([svc.getPhoto(1), svc.getPhoto(1), svc.getPhoto(1)]);
      expect(results.every((r) => r.status === 'ok')).toBe(true);
      expect(f.calls.filter((c) => isDetails(c.url))).toHaveLength(1);
    });

    it('returns upstream_error when Place Details fails, and does not retry the details call during the cooldown', async () => {
      let t = 0;
      const f = makeFetch((url) => (isDetails(url) ? new Response('nope', { status: 500 }) : image(400)));
      const svc = createPlacePhotoService({ info: makeInfo(), apiKey: KEY, fetchImpl: f.fn, now: () => t, refreshCooldownMs: 600_000, log: quietLog });
      expect((await svc.getPhoto(1)).status).toBe('upstream_error');
      expect((await svc.getPhoto(1)).status).toBe('upstream_error');
      expect(f.calls.filter((c) => isDetails(c.url))).toHaveLength(1);
      t = 600_001;
      await svc.getPhoto(1);
      expect(f.calls.filter((c) => isDetails(c.url))).toHaveLength(2);
    });

    it('returns upstream_error when the refreshed reference also fails', async () => {
      const f = makeFetch((url) =>
        isDetails(url) ? Response.json({ photos: [{ name: 'places/PLACE1/photos/FRESH' }] }) : image(400)
      );
      const svc = createPlacePhotoService({ info: makeInfo(), apiKey: KEY, fetchImpl: f.fn, log: quietLog });
      expect((await svc.getPhoto(1)).status).toBe('upstream_error');
    });

    it('returns upstream_error without calling Place Details when the temple has no placeId', async () => {
      const f = makeFetch(() => image(400));
      const svc = createPlacePhotoService({
        info: { '1': { photoName: 'places/X/photos/STALE' } },
        apiKey: KEY,
        fetchImpl: f.fn,
        log: quietLog,
      });
      expect((await svc.getPhoto(1)).status).toBe('upstream_error');
      expect(f.calls).toHaveLength(1);
    });

    it('returns upstream_error when Place Details returns no photos', async () => {
      const f = makeFetch((url) => (isDetails(url) ? Response.json({}) : image(400)));
      const svc = createPlacePhotoService({ info: makeInfo(), apiKey: KEY, fetchImpl: f.fn, log: quietLog });
      expect((await svc.getPhoto(1)).status).toBe('upstream_error');
    });
  });

  it('does not re-resolve on other upstream errors such as 403 (quota/permission problems)', async () => {
    const f = makeFetch(() => image(403));
    const svc = createPlacePhotoService({ info: makeInfo(), apiKey: KEY, fetchImpl: f.fn, log: quietLog });
    expect((await svc.getPhoto(1)).status).toBe('upstream_error');
    expect(f.calls).toHaveLength(1);
  });

  it('returns upstream_error when fetch throws, and never writes the API key to the log', async () => {
    const log = { error: vi.fn(), warn: vi.fn(), log: vi.fn() };
    const f = makeFetch(() => {
      throw new Error('network down');
    });
    const svc = createPlacePhotoService({ info: makeInfo(), apiKey: KEY, fetchImpl: f.fn, log });
    expect((await svc.getPhoto(1)).status).toBe('upstream_error');
    const logged = JSON.stringify([...log.error.mock.calls, ...log.log.mock.calls, ...log.warn.mock.calls]);
    expect(logged).not.toContain(KEY);
  });
});
