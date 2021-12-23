export function makeWeakRef<T extends object>(v: any): WeakRef<T> {
  return new WeakRef(v);
}
export function getRealRef<T extends object>(v: WeakRef<T>): T | undefined {
  return v.deref();
}
export function isRealRefDead<T extends object>(v: WeakRef<T>): boolean {
  return typeof v.deref() === undefined;
}
