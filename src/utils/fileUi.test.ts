import { describe, expect, it } from 'vitest';
import { canPreviewFile, joinPath, makeId, normalizePath } from './fileUi';

describe('fileUi utils', () => {
  it('normalizePath trims slashes', () => {
    expect(normalizePath('/a/b/')).toBe('a/b');
    expect(normalizePath('')).toBe('');
  });

  it('joinPath builds rooted paths', () => {
    expect(joinPath('', 'x.txt')).toBe('/x.txt');
    expect(joinPath('/a/', 'b')).toBe('/a/b');
  });

  it('canPreviewFile respects type/size', () => {
    expect(canPreviewFile('a.png', 100)).toBe(true);
    expect(canPreviewFile('a.mp4', 100)).toBe(true);
    expect(canPreviewFile('a.bin', 100)).toBe(false);
    expect(canPreviewFile('a.png', 26 * 1024 * 1024)).toBe(false);
  });

  it('makeId returns unique-ish strings', () => {
    expect(makeId()).not.toBe(makeId());
  });
});
