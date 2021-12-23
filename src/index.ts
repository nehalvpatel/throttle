import LruCache from "./cache/lru";
import type { ICache } from "./cache/lru";
import * as weak from "./weakref-generic";
import hash from "hash-it";

function noop<T>(v: T): T {
  return v;
}
function isFunction(v: any): v is Function {
  return typeof v === "function";
}
function isNumber(v: any): v is number {
  return typeof v === "number";
}
function isPromise(v: any): v is Promise<any> {
  return v && isFunction(v.then) && isFunction(v.catch);
}

function toResolverKey<FuncArgs extends any[]>(
  value: any | FuncArgs
): CacheKey {
  if (Array.isArray(value) && value.length == 1) return toResolverKey(value[0]);

  if (typeof value != "object" || !value) return String(value);

  return hash(value);
}

function defaultResolver<FuncArgs extends any[]>(): FuncArgs {
  var args = [],
    args_i = arguments.length;
  while (args_i-- > 0) args[args_i] = arguments[args_i];

  return args as FuncArgs;
}

export function rejectFailedPromise<CacheValue>(item: CacheItem<CacheValue>) {
  var value = item.value;

  // Don't allow failed promises to be cached
  if (!isPromise(value)) return;

  value.catch(item.clear);
}

function getCache<FuncArgs extends any[], CacheValue>(
  options: ThrottleOptions<FuncArgs, CacheValue>
): ICache<CacheKey, CacheItem<CacheValue>> {
  if (options.cache) return options.cache;

  if (isNumber(options.maxSize) && options.maxSize < Infinity)
    return new LruCache<CacheKey, CacheItem<CacheValue>>({
      maxSize: options.maxSize,
    });

  return new Map<CacheKey, CacheItem<CacheValue>>();
}

function getOnCached<FuncArgs extends any[], CacheValue>(
  options: ThrottleOptions<FuncArgs, CacheValue>
): OnCachedFunction<CacheValue> {
  var onCached = options.onCached;

  if (options.rejectFailedPromise === false) return onCached || noop;

  // Cache promises that result in rejection
  if (!isFunction(onCached)) return rejectFailedPromise;

  return function (item: CacheItem<CacheValue>) {
    rejectFailedPromise(item);
    // todo
    onCached!(item);
  };
}

type CacheKey = string | number;

type Nullable<T> = T | null;

// TODO
type FunctionToThrottle = (...args: any[]) => any;

// TODO
type CacheKeyResolverFunction<FuncArgs extends any[]> = (
  ...args: FuncArgs
) => any;

type OnCachedFunction<CacheValue> = (item: CacheItem<CacheValue>) => void;

type CacheClearFunction = () => void;

type NewTimeoutFunction = (newTimeout: number | false) => void;

type CacheItem<CacheValue> = {
  key: CacheKey;
  value: CacheValue;
  clear: CacheClearFunction;
  ttl: NewTimeoutFunction;
};

type ThrottleOptions<FuncArgs extends any[], CacheValue> = {
  resolver?: CacheKeyResolverFunction<FuncArgs>;
  cache?: ICache<CacheKey, CacheItem<CacheValue>>;
  onCached?: OnCachedFunction<CacheValue>;
  maxSize?: number;
  rejectFailedPromise?: boolean;
};

export function throttle(
  func: FunctionToThrottle,
  timeout?: number,
  options: ThrottleOptions<
    Parameters<typeof func>,
    ReturnType<typeof func>
  > = {}
) {
  type FuncArgs = Parameters<typeof func>;
  type CacheValue = ReturnType<typeof func>;

  // By default uses first argument as cache key.
  var resolver = options.resolver || defaultResolver;

  const cache = getCache<FuncArgs, CacheValue>(options);
  /**
   * This creates a weak reference in nodejs.
   *
   * A WeakRef ensures that the cache can be garbage collected once it is
   * longer accessible. If we were not using a WeakRef the setTimeout
   * would keep a reference, keeping the data alive until the timer
   * expires.
   */
  var cacheRef: WeakRef<typeof cache> = weak.makeWeakRef(cache);

  // Method that allows clearing the cache based on the value being cached.
  var onCached = getOnCached<FuncArgs, CacheValue>(options);

  function execute(...args: FuncArgs) {
    // If there is no timeout set we simply call `func`
    if (!timeout || timeout < 1) return func(...args);

    const key: CacheKey = toResolverKey(resolver(...args));
    var value: Nullable<CacheValue> = null;
    var timer: Nullable<NodeJS.Timeout> = null;

    function cancelTimeout() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    // Populate the cache when there is nothing there yet.
    if (!cache.has(key)) {
      const value: CacheValue = func(...args);

      const clear: CacheClearFunction = function () {
        cancelTimeout();

        if (!weak.isRealRefDead(cacheRef)) {
          const realCache = weak.getRealRef(cacheRef);
          if (realCache) {
            // ref not dead
            realCache.delete(key);
          }
        }
      };

      const applyTimeout: NewTimeoutFunction = function (newTimeout) {
        cancelTimeout();

        // Allow non-expiring entries
        if (newTimeout === Infinity || newTimeout === false) return;

        timer = setTimeout(clear, newTimeout);

        if (typeof timer.unref === "function") timer.unref();
      };

      var cacheItem: CacheItem<CacheValue> = {
        key: key,
        value: value,
        clear: clear,
        ttl: applyTimeout,
      };

      cache.set(key, cacheItem);

      applyTimeout(timeout);
      onCached(cacheItem);
    }

    return cache.get(key)!.value;
  }

  execute.clear = function clear() {
    if (arguments.length < 1) {
      cache.clear();
      return;
    }

    var args = [],
      args_i = arguments.length;
    while (args_i-- > 0) args[args_i] = arguments[args_i];

    var key = toResolverKey(resolver.apply(null, args));
    cache.delete(key);
  };

  return execute;
}
