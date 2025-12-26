/**
 * Simple LRU Cache with TTL for file reads
 */
class FileCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 50;       // Max cached files
    this.ttlMs = options.ttlMs || 30000;        // 30 seconds TTL
    this.cache = new Map();
    this.accessOrder = [];
  }

  /**
   * Generate cache key from path
   */
  key(path) {
    return path;
  }

  /**
   * Get cached content if valid
   */
  get(path) {
    const k = this.key(path);
    const entry = this.cache.get(k);
    
    if (!entry) return null;
    
    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(k);
      return null;
    }
    
    // Update access order (LRU)
    this.touch(k);
    
    return entry.content;
  }

  /**
   * Store content in cache
   */
  set(path, content) {
    const k = this.key(path);
    
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(k)) {
      this.evict();
    }
    
    this.cache.set(k, {
      content,
      timestamp: Date.now(),
    });
    
    this.touch(k);
  }

  /**
   * Update access order
   */
  touch(key) {
    const idx = this.accessOrder.indexOf(key);
    if (idx > -1) {
      this.accessOrder.splice(idx, 1);
    }
    this.accessOrder.push(key);
  }

  /**
   * Evict least recently used entry
   */
  evict() {
    if (this.accessOrder.length > 0) {
      const oldest = this.accessOrder.shift();
      this.cache.delete(oldest);
    }
  }

  /**
   * Invalidate cache for a path (after write)
   */
  invalidate(path) {
    const k = this.key(path);
    this.cache.delete(k);
    const idx = this.accessOrder.indexOf(k);
    if (idx > -1) {
      this.accessOrder.splice(idx, 1);
    }
  }

  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Get cache stats
   */
  stats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
    };
  }
}

// Singleton instance
const fileCache = new FileCache();

export { FileCache, fileCache };
export default fileCache;
