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

function toResolverKey<Func extends AnyFunction>(
  value: any | Parameters<Func>
): CacheKey {
  if (Array.isArray(value) && value.length == 1) return toResolverKey(value[0]);

  if (typeof value != "object" || !value) return String(value);

  return hash(value);
}

function defaultResolver<Func extends AnyFunction>(): Parameters<Func> {
  var args = [],
    args_i = arguments.length;
  while (args_i-- > 0) args[args_i] = arguments[args_i];

  return args as Parameters<Func>;
}

export function rejectFailedPromise<CacheValue extends ReturnType<AnyFunction>>(
  item: CacheItem<CacheValue>
) {
  var value = item.value;

  // Don't allow failed promises to be cached
  if (!isPromise(value)) return;

  value.catch(item.clear);
}

function getCache<Func extends AnyFunction>(
  options: ThrottleOptions<Func>
): ICache<CacheKey, CacheItem<ReturnType<Func>>> {
  if (options.cache) return options.cache;

  if (isNumber(options.maxSize) && options.maxSize < Infinity)
    return new LruCache<CacheKey, CacheItem<ReturnType<Func>>>({
      maxSize: options.maxSize,
    });

  return new Map<CacheKey, CacheItem<ReturnType<Func>>>();
}

function getOnCached<Func extends AnyFunction>(
  options: ThrottleOptions<Func>
): OnCachedFunction<ReturnType<Func>> {
  var onCached = options.onCached;

  if (options.rejectFailedPromise === false) return onCached || noop;

  // Cache promises that result in rejection
  if (!isFunction(onCached)) return rejectFailedPromise;

  return function (item: CacheItem<ReturnType<Func>>) {
    rejectFailedPromise(item);
    // todo
    onCached!(item);
  };
}

type CacheKey = string | number;

type Nullable<T> = T | null;

type AnyFunction = (...args: any[]) => any;

type CacheKeyResolverFunction<Func extends AnyFunction> = (
  ...args: Parameters<Func>
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

type ThrottleOptions<Func extends AnyFunction> = {
  resolver?: CacheKeyResolverFunction<Func>;
  cache?: ICache<CacheKey, CacheItem<ReturnType<Func>>>;
  onCached?: OnCachedFunction<ReturnType<Func>>;
  maxSize?: number;
  rejectFailedPromise?: boolean;
};

type InnerFunction<Func extends AnyFunction> = (
  ...args: Parameters<Func>
) => ReturnType<Func>;

export type ThrottledFunction<Func extends AnyFunction> = {
  (...args: Parameters<Func>): ReturnType<Func>;
  retrieveCachedValue(...args: Parameters<Func>): ReturnType<Func> | undefined;
  clearCache(): void;
};

export const throttle = <Func extends AnyFunction>(
  func: Func,
  timeout?: number,
  options: ThrottleOptions<Func> = {}
): ThrottledFunction<Func> => {
  type FuncArgs = Parameters<Func>;
  type CacheValue = ReturnType<Func>;

  // By default uses first argument as cache key.
  var resolver = options.resolver || defaultResolver;

  const cache = getCache<Func>(options);

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
  var onCached = getOnCached<Func>(options);

  const retrieveCachedValue = function get(
    ...args: FuncArgs
  ): CacheValue | undefined {
    const key: CacheKey = toResolverKey(resolver(...args));
    return cache.get(key)?.value;
  };

  const clearCache = function clear() {
    if (arguments.length < 1) {
      cache.clear();
      return;
    }

    var args = [],
      args_i = arguments.length;
    while (args_i-- > 0) args[args_i] = arguments[args_i];

    var key = toResolverKey(resolver.apply(null, args as Parameters<Func>));
    cache.delete(key);
  };

  return Object.assign(
    (...args: FuncArgs) => {
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

        // TODO: might need to be changed to `return cacheItem.value;`
        return cache.get(key)!.value;
      }

      return cache.get(key)!.value;
    },
    {
      retrieveCachedValue,
      clearCache,
    }
  );
};
