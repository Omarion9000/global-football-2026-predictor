import { describe, it, expect } from 'vitest';
import { smoke } from '../smoke';

describe('smoke', () => {
  it('returns "ok"', () => {
    expect(smoke()).toBe('ok');
  });
});
