import { describe, expect, it } from 'vitest';
import pako from 'pako';
import { encodeShareAttachmentUrls, formatSize, getMimeType } from './file-utils';

function decodeShareAttachmentUrls(hash: string): string[] {
  const raw = (hash || '')
    .replace(/^#/, '')
    .replace(/~/g, '+')
    .replace(/_/g, '/')
    .replace(/-/g, '=');
  const base64AttachmentUrls = atob(raw);
  const u8Array = new Uint8Array(base64AttachmentUrls.length);
  for (let i = 0; i < base64AttachmentUrls.length; i++) {
    u8Array[i] = base64AttachmentUrls.charCodeAt(i);
  }
  return JSON.parse(pako.inflate(u8Array, { to: 'string' }) as string);
}

describe('file-utils', () => {
  it('formats sizes', () => {
    expect(formatSize(0)).toBe('0 Bytes');
    expect(formatSize(1024)).toContain('KB');
  });

  it('resolves mime types', () => {
    expect(getMimeType('a.txt')).toContain('text');
    expect(getMimeType('a.unknownext')).toBe('application/octet-stream');
  });

  it('encodes and decodes share attachment urls', () => {
    const urls = ['https://cdn.discordapp.com/a/1', 'https://cdn.discordapp.com/a/2?x=1'];
    const encoded = encodeShareAttachmentUrls(urls);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
    expect(decodeShareAttachmentUrls(`#${encoded}`)).toEqual(urls);
  });
});
