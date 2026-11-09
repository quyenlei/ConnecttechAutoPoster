import { describe, expect, it } from 'vitest';
import {
  ALLOWED_IMAGE_TYPES,
  checkImageFile,
  dataUrlBytes,
  dataUrlToBytes,
  fitSize,
  needsResize,
  safeImageName,
  sanitizeImage,
  totalImageBytes,
  validateImages,
} from '../src/lib/images';
import { LIMITS } from '../src/lib/limits';
import type { CampaignImage } from '../src/lib/types';

const b64 = (n: number) => Buffer.alloc(n, 1).toString('base64');
const image = (over: Partial<CampaignImage> = {}, size = 10): CampaignImage => ({
  id: 'i1',
  name: 'a.png',
  mime: 'image/png',
  dataUrl: `data:image/png;base64,${b64(size)}`,
  bytes: size,
  ...over,
});

describe('checkImageFile', () => {
  it('accepts jpeg, png and webp', () => {
    for (const mime of ALLOWED_IMAGE_TYPES) expect(checkImageFile({ mime, bytes: 100 })).toBeNull();
  });
  it('rejects other types', () => {
    for (const mime of ['image/gif', 'image/svg+xml', 'application/pdf', '', 'IMAGE/PNG ']) {
      expect(checkImageFile({ mime, bytes: 100 })).toMatch(/JPG|PNG|WebP/);
    }
  });
  it('rejects empty files', () => {
    expect(checkImageFile({ mime: 'image/png', bytes: 0 })).not.toBeNull();
  });
});

describe('dataUrlBytes', () => {
  it('computes the decoded size, with and without padding', () => {
    for (const n of [1, 2, 3, 4, 10, 1000]) expect(dataUrlBytes(`data:image/png;base64,${b64(n)}`)).toBe(n);
  });
  it('returns 0 for a value that is not a base64 data URL', () => {
    expect(dataUrlBytes('https://example.com/a.png')).toBe(0);
    expect(dataUrlBytes('data:image/png,abc')).toBe(0);
  });
});

describe('needsResize / fitSize', () => {
  it('resizes when too many bytes or too wide', () => {
    expect(needsResize({ bytes: LIMITS.maxImageBytes, width: 100, height: 100 })).toBe(false);
    expect(needsResize({ bytes: LIMITS.maxImageBytes + 1, width: 100, height: 100 })).toBe(true);
    expect(needsResize({ bytes: 10, width: LIMITS.maxImageEdgePx, height: 10 })).toBe(false);
    expect(needsResize({ bytes: 10, width: 10, height: LIMITS.maxImageEdgePx + 1 })).toBe(true);
  });
  it('keeps the aspect ratio', () => {
    expect(fitSize(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 });
    expect(fitSize(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitSize(1, 5000, 1600)).toEqual({ width: 1, height: 1600 });
  });
});

describe('safeImageName', () => {
  it('strips paths and control characters', () => {
    expect(safeImageName('C:\\a\\b\\ảnh đẹp.png')).toBe('ảnh đẹp.png');
    expect(safeImageName('../../etc/passwd')).toBe('passwd');
    expect(safeImageName('a\u0000b\nc.jpg')).toBe('abc.jpg');
  });
  it('falls back and caps the length', () => {
    expect(safeImageName('   ')).toBe('anh');
    expect(safeImageName('x'.repeat(500)).length).toBeLessThanOrEqual(100);
  });
});

describe('totalImageBytes / validateImages', () => {
  it('sums bytes', () => {
    expect(totalImageBytes([image({ bytes: 3 }), image({ bytes: 4 })])).toBe(7);
  });
  it('accepts a valid list and an empty one', () => {
    expect(validateImages([image()], 0)).toBeNull();
    expect(validateImages([], 0)).toBeNull();
  });
  it('limits the count at the boundary', () => {
    const ok = Array.from({ length: LIMITS.maxImagesPerCampaign }, (_, i) => image({ id: `i${i}` }));
    expect(validateImages(ok, 0)).toBeNull();
    expect(validateImages([...ok, image({ id: 'x' })], 0)).toMatch(/tối đa/);
  });
  it('limits each image at the boundary', () => {
    const at = image({ bytes: LIMITS.maxImageBytes });
    const over = image({ bytes: LIMITS.maxImageBytes + 1 });
    expect(validateImages([at], 0)).toBeNull();
    expect(validateImages([over], 0)).toMatch(/1 MB|dung lượng/);
  });
  it('limits the total including other campaigns', () => {
    const imgs = [image({ bytes: 900_000 }), image({ id: 'b', bytes: 900_000 })];
    expect(validateImages(imgs, LIMITS.maxTotalImageBytes - 1_800_000)).toBeNull();
    expect(validateImages(imgs, LIMITS.maxTotalImageBytes - 1_800_000 + 1)).toMatch(/tổng/);
  });
  it('rejects a wrong type', () => {
    expect(validateImages([image({ mime: 'image/gif' as never })], 0)).not.toBeNull();
  });
});

describe('sanitizeImage (used for backups)', () => {
  it('accepts a good image and recomputes bytes from the data', () => {
    const out = sanitizeImage({ ...image({}, 12), bytes: 1 });
    expect(out).toMatchObject({ mime: 'image/png', bytes: 12, name: 'a.png' });
  });
  it('rejects a mime that does not match the data URL', () => {
    expect(sanitizeImage(image({ mime: 'image/jpeg' }))).toBeNull();
  });
  it('rejects non-image data, bad types and oversized images', () => {
    expect(sanitizeImage(null)).toBeNull();
    expect(sanitizeImage({ ...image(), dataUrl: 'https://x/y.png' })).toBeNull();
    expect(sanitizeImage({ ...image(), mime: 'image/gif', dataUrl: `data:image/gif;base64,${b64(5)}` })).toBeNull();
    const big = LIMITS.maxImageBytes + 1;
    expect(sanitizeImage(image({ dataUrl: `data:image/png;base64,${b64(big)}`, bytes: big }))).toBeNull();
  });
  it('rejects a data URL with characters outside base64', () => {
    expect(sanitizeImage({ ...image(), dataUrl: 'data:image/png;base64,AA"><script>' })).toBeNull();
  });
  it('gives a missing id a safe value is not possible: rejects it', () => {
    expect(sanitizeImage({ ...image(), id: '' })).toBeNull();
  });
});

describe('dataUrlToBytes', () => {
  it('decodes the payload', () => {
    expect([...(dataUrlToBytes(`data:image/png;base64,${Buffer.from([1, 2, 3, 250]).toString('base64')}`) ?? [])]).toEqual([1, 2, 3, 250]);
  });
  it('returns null for invalid data', () => {
    expect(dataUrlToBytes('data:image/png;base64,@@@')).toBeNull();
    expect(dataUrlToBytes('nope')).toBeNull();
  });
});
