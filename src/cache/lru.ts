export type ICache<Key, Value> = {
  clear: Map<Key, Value>["clear"];
  delete: Map<Key, Value>["delete"];
  get: Map<Key, Value>["get"];
  has: Map<Key, Value>["has"];
  set: Map<Key, Value>["set"];
};

type LruCacheOptions = {
  maxSize?: number;
};

export default class LruCache<Key, Value> implements ICache<Key, Value> {
  #storage: Map<Key, Value>;
  #queue: Key[];
  #maxSize: number;

  constructor(options: LruCacheOptions = {}) {
    this.#storage = new Map();
    this.#queue = [];
    this.#maxSize = options.maxSize || Infinity;
  }

  #hit = (key: Key) => {
    var idx = this.#queue.indexOf(key);

    if (idx > -1) {
      // If it is aready in the queue, move it to the end of the queue
      this.#queue.splice(idx, 1);
      this.#queue.push(key);
    } else {
      // Add to queue
      this.#queue.push(key);

      // Delete least recently used from queue and storage
      if (this.#queue.length > this.#maxSize) {
        var evictKey = this.#queue.shift();

        if (evictKey) {
          this.#storage.delete(evictKey);
        }
      }
    }
  };

  #evict = (key: Key) => {
    var idx = this.#queue.indexOf(key);

    if (idx > -1) this.#queue.splice(idx, 1);
  };

  get(key: Key) {
    if (this.has(key)) this.#hit(key);

    return this.#storage.get(key);
  }

  has(key: Key) {
    return this.#storage.has(key);
  }

  set(key: Key, value: Value) {
    this.#hit(key);
    return this.#storage.set(key, value);
  }

  delete(key: Key) {
    this.#evict(key);
    return this.#storage.delete(key);
  }

  clear() {
    this.#queue = [];
    this.#storage.clear();
  }
}
