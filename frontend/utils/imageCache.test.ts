/**
 * Unit tests for ImageCacheManager
 *
 * These tests mock IndexedDB (via a minimal in-memory implementation) and the
 * global `fetch` to exercise all public methods of ImageCacheManager.
 */

import { ImageCacheManager } from './imageCache';

// ---------------------------------------------------------------------------
// Minimal in-memory IndexedDB mock
// ---------------------------------------------------------------------------

type StoreRecord = Record<string, unknown>;

function createIDBMock() {
  const stores: Record<string, Map<IDBValidKey, StoreRecord>> = {
    images: new Map(),
  };

  const makeRequest = <T>(fn: () => T): IDBRequest<T> => {
    const listeners: Record<string, ((e: Event) => void)[]> = {};
    const req = {
      result: undefined as T,
      error: null as DOMException | null,
      onsuccess: null as ((e: Event) => void) | null,
      onerror: null as ((e: Event) => void) | null,
      addEventListener: (type: string, cb: (e: Event) => void) => {
        (listeners[type] = listeners[type] ?? []).push(cb);
      },
    } as unknown as IDBRequest<T>;

    Promise.resolve().then(() => {
      try {
        (req as unknown as { result: T }).result = fn();
        req.onsuccess?.({ target: req } as unknown as Event);
        listeners['success']?.forEach((cb) => cb({ target: req } as unknown as Event));
      } catch (err) {
        (req as unknown as { error: unknown }).error = err;
        req.onerror?.({ target: req } as unknown as Event);
        listeners['error']?.forEach((cb) => cb({ target: req } as unknown as Event));
      }
    });

    return req;
  };

  const makeTransaction = (storeNames: string | string[], _mode: IDBTransactionMode) => {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    const tx: Partial<IDBTransaction> & {
      oncomplete: ((e: Event) => void) | null;
      onerror: ((e: Event) => void) | null;
    } = {
      oncomplete: null,
      onerror: null,
      objectStore: (name: string) => {
        if (!names.includes(name)) throw new Error(`Store ${name} not in transaction`);
        const map = stores[name];
        const completeTx = () =>
          Promise.resolve().then(() =>
            (tx as { oncomplete: ((e: Event) => void) | null }).oncomplete?.({} as Event)
          );

        const store: Partial<IDBObjectStore> & {
          index: (name: string) => Partial<IDBIndex>;
        } = {
          put: (value: StoreRecord) => {
            const req = makeRequest(() => {
              map.set(value['url'] as IDBValidKey, value);
              return value['url'] as IDBValidKey;
            });
            Promise.resolve().then(() =>
              (tx as { oncomplete: ((e: Event) => void) | null }).oncomplete?.({} as Event)
            );
            return req as IDBRequest<IDBValidKey>;
          },
          get: (key: IDBValidKey) =>
            makeRequest(() => map.get(key) as StoreRecord | undefined) as IDBRequest,
          delete: (key: IDBValidKey) =>
            (() => {
              const req = makeRequest(() => {
                map.delete(key);
              }) as IDBRequest;
              completeTx();
              return req;
            })(),
          clear: () =>
            (() => {
              const req = makeRequest(() => {
                map.clear();
              }) as IDBRequest;
              completeTx();
              return req;
            })(),
          getAll: () => makeRequest(() => [...map.values()]) as IDBRequest,
          index: (indexName: string) => {
            const idx: Partial<IDBIndex> & {
              openCursor: (range?: IDBKeyRange | null) => IDBRequest;
            } = {
              openCursor: (range?: IDBKeyRange | null) => {
                const allEntries = [...map.values()].sort(
                  (a, b) => (a['cachedAt'] as number) - (b['cachedAt'] as number)
                );

                let filtered = allEntries;
                if (range) {
                  // Support upperBound only (used in clearOldCache)
                  filtered = allEntries.filter(
                    (e) => (e['cachedAt'] as number) <= (range as unknown as { upper: number }).upper
                  );
                }

                let idx2 = 0;
                const nextCursor = () => {
                  if (idx2 >= filtered.length) {
                    cursorReq.result = null as unknown as IDBCursorWithValue;
                    cursorReq.onsuccess?.({ target: cursorReq } as unknown as Event);
                    completeTx();
                    return;
                  }
                  const entry = filtered[idx2++];
                  const cursor: Partial<IDBCursorWithValue> = {
                    value: entry,
                    delete: () => {
                      map.delete(entry['url'] as IDBValidKey);
                      return makeRequest(() => undefined) as IDBRequest;
                    },
                    continue: () => Promise.resolve().then(nextCursor),
                  };
                  (cursorReq as unknown as { result: unknown }).result = cursor;
                  cursorReq.onsuccess?.({ target: cursorReq } as unknown as Event);
                };

                const cursorReq = {
                  result: null as unknown as IDBCursorWithValue,
                  error: null as DOMException | null,
                  onsuccess: null as ((e: Event) => void) | null,
                  onerror: null as ((e: Event) => void) | null,
                } as unknown as IDBRequest<IDBCursorWithValue>;

                Promise.resolve().then(nextCursor);
                return cursorReq;
              },
            };
            void indexName;
            return idx as IDBIndex;
          },
        };

        return store as IDBObjectStore;
      },
    };

    return tx as IDBTransaction & {
      oncomplete: ((e: Event) => void) | null;
      onerror: ((e: Event) => void) | null;
    };
  };

  const db: Partial<IDBDatabase> = {
    objectStoreNames: {
      contains: () => true,
    } as unknown as DOMStringList,
    transaction: makeTransaction as unknown as IDBDatabase['transaction'],
  };

  const open = () => {
    const openRequest = {
      result: db as IDBDatabase,
      error: null as DOMException | null,
      onsuccess: null as ((e: Event) => void) | null,
      onerror: null as ((e: Event) => void) | null,
      onupgradeneeded: null as ((e: IDBVersionChangeEvent) => void) | null,
    };

    // Fire success asynchronously after handlers are attached.
    setTimeout(() => {
      openRequest.onsuccess?.({ target: openRequest } as unknown as Event);
    }, 0);

    return openRequest;
  };

  return { open, stores };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let manager: ImageCacheManager;
let idbMock: ReturnType<typeof createIDBMock>;

beforeEach(() => {
  idbMock = createIDBMock();

  // Replace global indexedDB.open with our mock
  Object.defineProperty(global, 'indexedDB', {
    configurable: true,
    value: {
      open: () => idbMock.open(),
    },
  });

  // clearOldCache uses IDBKeyRange.upperBound(...)
  Object.defineProperty(global, 'IDBKeyRange', {
    configurable: true,
    value: {
      upperBound: (upper: number) => ({ upper }),
    },
  });

  // Replace global fetch
  global.fetch = jest.fn();

  manager = new ImageCacheManager();
});

afterEach(() => {
  jest.resetAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBlob(content = 'image-data', type = 'image/png') {
  return new Blob([content], { type });
}

function mockFetch(blob: Blob, etag: string | null = '"abc123"', status = 200) {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : String(status),
    headers: {
      get: (header: string) => (header.toLowerCase() === 'etag' ? etag : null),
    },
    blob: () => Promise.resolve(blob),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ImageCacheManager.init()', () => {
  it('initialises without throwing', async () => {
    await expect(manager.init()).resolves.toBeUndefined();
  });

  it('calling init() twice reuses the same promise', async () => {
    const p1 = manager.init();
    const p2 = manager.init();
    await expect(Promise.all([p1, p2])).resolves.toEqual([undefined, undefined]);
  });
});

describe('ImageCacheManager.cacheImage()', () => {
  it('stores an entry in the images store', async () => {
    await manager.init();
    const blob = makeBlob();
    await manager.cacheImage('https://example.com/img.png', blob, '"etag1"');
    expect(idbMock.stores['images'].has('https://example.com/img.png')).toBe(true);
  });

  it('records the correct size and etag', async () => {
    await manager.init();
    const blob = makeBlob('hello');
    await manager.cacheImage('https://example.com/img2.png', blob, '"xyz"');
    const entry = idbMock.stores['images'].get('https://example.com/img2.png') as {
      etag: string;
      size: number;
    };
    expect(entry.etag).toBe('"xyz"');
    expect(entry.size).toBe(blob.size);
  });
});

describe('ImageCacheManager.getCacheSize()', () => {
  it('returns 0 for an empty cache', async () => {
    await manager.init();
    expect(await manager.getCacheSize()).toBe(0);
  });

  it('sums the size of all stored entries', async () => {
    await manager.init();
    const b1 = makeBlob('abc');
    const b2 = makeBlob('defgh');
    await manager.cacheImage('https://example.com/a.png', b1, null);
    await manager.cacheImage('https://example.com/b.png', b2, null);
    const size = await manager.getCacheSize();
    expect(size).toBe(b1.size + b2.size);
  });
});

describe('ImageCacheManager.clearCache()', () => {
  it('removes all entries from the store', async () => {
    await manager.init();
    await manager.cacheImage('https://example.com/c.png', makeBlob(), null);
    expect(idbMock.stores['images'].size).toBe(1);
    await manager.clearCache();
    expect(idbMock.stores['images'].size).toBe(0);
  });
});

describe('ImageCacheManager.clearOldCache()', () => {
  it('removes expired entries only', async () => {
    await manager.init();

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const oldTimestamp = Date.now() - sevenDaysMs - 1000;
    const freshTimestamp = Date.now();

    // Manually seed the store with one old and one fresh entry
    idbMock.stores['images'].set('https://example.com/old.png', {
      url: 'https://example.com/old.png',
      blob: makeBlob(),
      etag: null,
      cachedAt: oldTimestamp,
      size: 10,
    });
    idbMock.stores['images'].set('https://example.com/fresh.png', {
      url: 'https://example.com/fresh.png',
      blob: makeBlob(),
      etag: null,
      cachedAt: freshTimestamp,
      size: 10,
    });

    await manager.clearOldCache();

    expect(idbMock.stores['images'].has('https://example.com/old.png')).toBe(false);
    expect(idbMock.stores['images'].has('https://example.com/fresh.png')).toBe(true);
  });
});

describe('ImageCacheManager.getImage()', () => {
  beforeEach(() => {
    // URL.createObjectURL is not available in jsdom by default
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
  });

  it('fetches and caches on first call', async () => {
    const blob = makeBlob();
    mockFetch(blob);

    const result = await manager.getImage('https://example.com/img.png');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result).toBe('blob:mock-url');
    expect(idbMock.stores['images'].has('https://example.com/img.png')).toBe(true);
  });

  it('serves from cache on subsequent call (no extra network request)', async () => {
    // Pre-populate cache
    await manager.init();
    await manager.cacheImage('https://example.com/cached.png', makeBlob(), '"etag1"');

    // Override the cached entry's timestamp to be fresh
    const entry = idbMock.stores['images'].get('https://example.com/cached.png') as {
      cachedAt: number;
    };
    (entry as { cachedAt: number }).cachedAt = Date.now();

    // Mock fetch for the background ETag revalidation (no-op 304)
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 304,
      headers: { get: () => null },
      blob: () => Promise.resolve(makeBlob()),
    });

    const result = await manager.getImage('https://example.com/cached.png');
    expect(result).toBe('blob:mock-url');
  });

  it('re-fetches when cached entry is expired', async () => {
    await manager.init();

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    idbMock.stores['images'].set('https://example.com/expired.png', {
      url: 'https://example.com/expired.png',
      blob: makeBlob(),
      etag: null,
      cachedAt: Date.now() - sevenDaysMs - 1000,
      size: 10,
    });

    mockFetch(makeBlob());

    const result = await manager.getImage('https://example.com/expired.png');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result).toBe('blob:mock-url');
  });

  it('throws when fetch fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: { get: () => null },
    });

    await expect(manager.getImage('https://example.com/missing.png')).rejects.toThrow(
      'Failed to fetch image: 404'
    );
  });
});

describe('ImageCacheManager.preloadImages()', () => {
  beforeEach(() => {
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
  });

  it('preloads multiple URLs without throwing', async () => {
    const blob = makeBlob();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      blob: () => Promise.resolve(blob),
    });

    await expect(
      manager.preloadImages([
        'https://example.com/img1.png',
        'https://example.com/img2.png',
      ])
    ).resolves.toBeUndefined();

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
