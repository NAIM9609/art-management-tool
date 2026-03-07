const DB_NAME = 'art-management-image-cache';
const STORE_NAME = 'images';
const DB_VERSION = 1;
const MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50 MB
const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CachedImageEntry {
  url: string;
  blob: Blob;
  etag: string | null;
  cachedAt: number;
  size: number;
}

class ImageCacheManager {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /** Initialize IndexedDB and open the database. */
  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise<void>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        // SSR environment – skip gracefully
        resolve();
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
          store.createIndex('cachedAt', 'cachedAt', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = () => reject(request.error);
    });

    return this.initPromise;
  }

  /**
   * Retrieve an image from cache or fetch it from the network.
   * Validates freshness via ETag and updates the cache when stale.
   */
  async getImage(url: string, signal?: AbortSignal): Promise<string> {
    await this.init();

    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    const cached = await this.readEntry(url);

    if (cached) {
      const isExpired = Date.now() - cached.cachedAt > CACHE_DURATION_MS;

      if (!isExpired) {
        // Update access time so size eviction behaves like LRU for hot entries.
        this.touchEntry(url, cached).catch(() => undefined);
        // Revalidate with ETag in the background when possible
        this.revalidate(url, cached, signal).catch(() => undefined);
        return URL.createObjectURL(cached.blob);
      }

      // Expired – delete and fetch fresh copy
      await this.deleteEntry(url);
    }

    return this.fetchAndCache(url, signal);
  }

  /**
   * Store a blob in the cache.
   * Enforces the 50 MB size cap by evicting the least-recently-used entries first.
   * Oversized single blobs are skipped and not cached.
   */
  async cacheImage(url: string, blob: Blob, etag: string | null = null): Promise<void> {
    await this.init();
    if (!this.db) return;

    if (blob.size > MAX_CACHE_SIZE) {
      return;
    }

    await this.clearOldCache();
    const canStore = await this.enforceMaxSize(blob.size);
    if (!canStore) {
      return;
    }

    const entry: CachedImageEntry = {
      url,
      blob,
      etag,
      cachedAt: Date.now(),
      size: blob.size,
    };

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  /** Remove all entries older than CACHE_DURATION_MS. */
  async clearOldCache(): Promise<void> {
    await this.init();
    if (!this.db) return;

    const cutoff = Date.now() - CACHE_DURATION_MS;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('cachedAt');
      const range = IDBKeyRange.upperBound(cutoff);
      const req = index.openCursor(range);

      req.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /** Preload an array of image URLs into the cache. */
  async preloadImages(urls: string[]): Promise<void> {
    await Promise.allSettled(urls.map((url) => this.getImage(url)));
  }

  /** Return the total size (in bytes) of all cached entries. */
  async getCacheSize(): Promise<number> {
    await this.init();
    if (!this.db) return 0;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();

      req.onsuccess = () => {
        const entries: CachedImageEntry[] = req.result;
        const total = entries.reduce((sum, e) => sum + (e.size ?? 0), 0);
        resolve(total);
      };

      req.onerror = () => reject(req.error);
    });
  }

  /** Remove every entry from the cache. */
  async clearCache(): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async readEntry(url: string): Promise<CachedImageEntry | null> {
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(url);
      req.onsuccess = () => resolve((req.result as CachedImageEntry) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  private async deleteEntry(url: string): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(url);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  private async touchEntry(url: string, cached: CachedImageEntry): Promise<void> {
    if (!this.db) return;

    const refreshed: CachedImageEntry = {
      ...cached,
      url,
      cachedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(refreshed);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  /** Fetch from network with WebP/AVIF preference and store in cache. */
  private async fetchAndCache(url: string, signal?: AbortSignal): Promise<string> {
    const response = await fetch(url, {
      signal,
      headers: { Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    const etag = response.headers.get('etag');
    const blob = await response.blob();
    await this.cacheImage(url, blob, etag);
    return URL.createObjectURL(blob);
  }

  /** Conditionally re-fetch using ETag; update cache only when content changed. */
  private async revalidate(url: string, cached: CachedImageEntry, signal?: AbortSignal): Promise<void> {
    if (!cached.etag) return;

    const response = await fetch(url, {
      signal,
      headers: {
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
        'If-None-Match': cached.etag,
      },
    });

    if (response.status === 304) {
      // Keep frequently accessed entries fresh when origin confirms no changes.
      await this.touchEntry(url, cached);
      return;
    }

    if (response.ok) {
      const etag = response.headers.get('etag');
      const blob = await response.blob();
      await this.cacheImage(url, blob, etag);
    }
  }

  /**
   * Evict the oldest entries until there is enough free space to store
   * `requiredBytes` without exceeding MAX_CACHE_SIZE.
   */
  private async enforceMaxSize(requiredBytes: number): Promise<boolean> {
    if (!this.db) return false;
    if (requiredBytes > MAX_CACHE_SIZE) {
      return false;
    }

    let currentSize = await this.getCacheSize();

    while (currentSize + requiredBytes > MAX_CACHE_SIZE) {
      const evicted = await this.evictOldest();
      if (!evicted) {
        return false;
      }
      currentSize -= evicted;
    }

    return true;
  }

  /**
   * Delete the single oldest cache entry.
   * Returns the freed byte count, or 0 if the store is empty.
   */
  private async evictOldest(): Promise<number> {
    if (!this.db) return 0;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const index = tx.objectStore(STORE_NAME).index('cachedAt');
      const req = index.openCursor(); // ascending order → oldest first
      let freed = 0;

      req.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (!cursor) {
          return;
        }
        const entry: CachedImageEntry = cursor.value;
        freed = entry.size ?? 0;
        cursor.delete();
      };

      tx.oncomplete = () => resolve(freed);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
      req.onerror = () => reject(req.error);
    });
  }
}

export const imageCache = new ImageCacheManager();
export type { CachedImageEntry };
export { ImageCacheManager };
