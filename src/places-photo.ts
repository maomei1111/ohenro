/**
 * 札所写真(Google Places API (New))の代理取得サービス。
 *
 * Places写真の参照名(photo name)は恒久的なIDではなく、時間が経つと失効する
 * (失効した参照でmedia APIを呼ぶと 400 "The photo resource in the request is invalid" が返る)。
 * temples_88_places.json に保存した参照名は取得時点のものなので、放置すると全札所の写真が
 * 表示できなくなる。そこで、参照名が失効していた場合(400/404)だけ、placeIdからPlace Details
 * で最新の参照名を取り直して1回だけリトライし、結果をメモリ上の情報へ反映する。
 *
 * 方針:
 *  - 通常時(参照名が有効)は従来どおり media API を1回呼ぶだけ(Place Detailsは呼ばない)。
 *  - 取り直しは札所ごとに同時1件に集約し、失敗した場合は一定時間(既定10分)再試行しない
 *    (壊れたplaceIdなどで課金対象のAPIを連打しないため)。
 *  - 取得できた画像は一定時間(既定24時間)メモリに保持し、同じ写真への繰り返し課金を避ける。
 *  - APIキーはログ・戻り値へ出さない。
 */

export interface PlacePhotoInfo {
  placeId?: string | null;
  photoName?: string | null;
  photoAttribution?: string | null;
  [key: string]: unknown;
}

export type PhotoResult =
  | { status: 'ok'; body: Buffer; contentType: string }
  | { status: 'not_found' }
  | { status: 'upstream_error' };

export interface PlacePhotoServiceOptions {
  /** temples_88_places.json の内容。取り直した参照名・撮影者名はこのオブジェクトへ書き戻す。 */
  info: Record<string, PlacePhotoInfo>;
  apiKey: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  imageTtlMs?: number;
  refreshCooldownMs?: number;
  log?: Pick<Console, 'error' | 'warn' | 'log'>;
}

const PLACES_BASE = 'https://places.googleapis.com/v1';
const MAX_HEIGHT_PX = 500;

export function createPlacePhotoService(options: PlacePhotoServiceOptions) {
  const { info, apiKey } = options;
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const now = options.now ?? Date.now;
  const imageTtlMs = options.imageTtlMs ?? 24 * 60 * 60 * 1000;
  const refreshCooldownMs = options.refreshCooldownMs ?? 10 * 60 * 1000;
  const log = options.log ?? console;

  const imageCache = new Map<number, { body: Buffer; contentType: string; at: number }>();
  const refreshInFlight = new Map<number, Promise<boolean>>();
  const refreshFailedAt = new Map<number, number>();

  async function fetchMedia(photoName: string) {
    return fetchImpl(`${PLACES_BASE}/${photoName}/media?maxHeightPx=${MAX_HEIGHT_PX}&key=${apiKey}`);
  }

  // placeIdから最新の写真参照(1枚目。事前取得スクリプトと同じ選び方)を取り直し、infoへ反映する。
  async function refreshPhotoReference(no: number): Promise<boolean> {
    const entry = info[String(no)];
    const placeId = entry?.placeId;
    if (!entry || !placeId) return false;

    const failedAt = refreshFailedAt.get(no);
    if (failedAt !== undefined && now() - failedAt < refreshCooldownMs) return false;

    const inFlight = refreshInFlight.get(no);
    if (inFlight) return inFlight;

    const task = (async () => {
      try {
        const res = await fetchImpl(`${PLACES_BASE}/places/${encodeURIComponent(placeId)}`, {
          headers: {
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'photos.name,photos.authorAttributions',
          },
        });
        if (!res.ok) {
          log.error(`[temple-photo] place details status ${res.status} for temple ${no}`);
          refreshFailedAt.set(no, now());
          return false;
        }
        const data: any = await res.json();
        const photo = data?.photos?.[0];
        if (!photo?.name) {
          log.error(`[temple-photo] no photos returned for temple ${no}`);
          refreshFailedAt.set(no, now());
          return false;
        }
        entry.photoName = photo.name;
        // 帰属表示は取り直した写真の撮影者名に揃える(古い撮影者名を別の写真に付けないため)。
        entry.photoAttribution = photo.authorAttributions?.[0]?.displayName ?? null;
        refreshFailedAt.delete(no);
        log.log(`[temple-photo] refreshed photo reference for temple ${no}`);
        return true;
      } catch (e) {
        log.error(`[temple-photo] place details exception for temple ${no}:`, (e as Error)?.message ?? e);
        refreshFailedAt.set(no, now());
        return false;
      } finally {
        refreshInFlight.delete(no);
      }
    })();
    refreshInFlight.set(no, task);
    return task;
  }

  async function getPhoto(no: number): Promise<PhotoResult> {
    const entry = info[String(no)];
    if (!entry?.photoName) return { status: 'not_found' };

    const cached = imageCache.get(no);
    if (cached && now() - cached.at < imageTtlMs) {
      return { status: 'ok', body: cached.body, contentType: cached.contentType };
    }

    try {
      let res = await fetchMedia(entry.photoName);

      // 参照名の失効(400)・消失(404)のときだけ、最新の参照名を取り直して1回だけ再試行する。
      if ((res.status === 400 || res.status === 404) && (await refreshPhotoReference(no)) && entry.photoName) {
        res = await fetchMedia(entry.photoName);
      }

      if (!res.ok) {
        log.error(`[temple-photo] upstream status ${res.status} for temple ${no}`);
        return { status: 'upstream_error' };
      }
      const body = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') ?? 'image/jpeg';
      imageCache.set(no, { body, contentType, at: now() });
      return { status: 'ok', body, contentType };
    } catch (e) {
      log.error(`[temple-photo] exception for temple ${no}:`, (e as Error)?.message ?? e);
      return { status: 'upstream_error' };
    }
  }

  return { getPhoto };
}
