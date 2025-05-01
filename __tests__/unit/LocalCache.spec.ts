import path from 'path';
import { describe, expect, it } from 'vitest';
import { LocalCache } from '../../src/LocalCache.js';
const cache = new LocalCache({
  path: path.resolve(import.meta.dirname, '../../temp/test.json'),
});
describe('LocalCache', () => {
  it('should be able to cache a value', async () => {
    await cache.set('foo', 'bar');
    const result = await cache.get('foo');
    expect(result).toBe('bar');
  });
  it('should be able to cache a value with a non-string key', async () => {
    await cache.set({ foo: 'bar' }, 'baz');
    const result = await cache.get({ foo: 'bar' });
    expect(result).toBe('baz');
  });
  it('should be able to cache a value with a non-string key regardless of property order', async () => {
    await cache.set({ apple: 'banana', candy: 'donut' }, 'baz');
    const result = await cache.get({ candy: 'donut', apple: 'banana' });
    expect(result).toBe('baz');
  });
});
