import { LIMITS } from './limits';
import type { CampaignImage } from './types';

export const ALLOWED_IMAGE_TYPES: readonly CampaignImage['mime'][] = ['image/jpeg', 'image/png', 'image/webp'];

const MAX_NAME_LENGTH = 100;
const MAX_ID_LENGTH = 200;
const BASE64_MARKER = ';base64,';
const BASE64_BODY = /^[A-Za-z0-9+/]*={0,2}$/;
const MB = (bytes: number) => `${bytes / 1_000_000} MB`;

const isAllowedType = (mime: string): mime is CampaignImage['mime'] => (ALLOWED_IMAGE_TYPES as readonly string[]).includes(mime);

/** Checks a file the user picked, before it is read. Returns a Vietnamese error or null. */
export function checkImageFile(file: { mime: string; bytes: number }): string | null {
  if (!isAllowedType(file.mime)) return 'Chỉ nhận ảnh JPG, PNG hoặc WebP.';
  if (file.bytes <= 0) return 'Tệp ảnh trống.';
  return null;
}

/** Decoded size of a base64 data URL; 0 when the value is not one. */
export function dataUrlBytes(dataUrl: string): number {
  if (!dataUrl.startsWith('data:')) return 0;
  const marker = dataUrl.indexOf(BASE64_MARKER);
  if (marker < 0) return 0;
  const payload = dataUrl.slice(marker + BASE64_MARKER.length);
  if (payload.length === 0 || payload.length % 4 !== 0 || !BASE64_BODY.test(payload)) return 0;
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return (payload.length / 4) * 3 - padding;
}

/** Raw bytes of a base64 data URL, or null when it is not valid. */
export function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  if (dataUrlBytes(dataUrl) === 0) return null;
  const binary = atob(dataUrl.slice(dataUrl.indexOf(BASE64_MARKER) + BASE64_MARKER.length));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** True when the UI should shrink the image before saving it. */
export function needsResize(info: { bytes: number; width: number; height: number }): boolean {
  return info.bytes > LIMITS.maxImageBytes || Math.max(info.width, info.height) > LIMITS.maxImageEdgePx;
}

/** Scales down to the longest-side limit, never up, and keeps the aspect ratio. */
export function fitSize(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** File name for display: no path, no control characters, bounded length. */
export function safeImageName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return clean.slice(0, MAX_NAME_LENGTH) || 'anh';
}

export const totalImageBytes = (images: readonly CampaignImage[]): number => images.reduce((sum, image) => sum + image.bytes, 0);

/**
 * Enforces every image limit. `otherBytes` is what the other campaigns already use.
 * Returns a Vietnamese error or null.
 */
export function validateImages(images: readonly CampaignImage[], otherBytes: number): string | null {
  if (images.length > LIMITS.maxImagesPerCampaign) return `Mỗi chiến dịch tối đa ${LIMITS.maxImagesPerCampaign} ảnh.`;
  for (const image of images) {
    const typeError = checkImageFile({ mime: image.mime, bytes: image.bytes });
    if (typeError) return typeError;
    if (image.bytes > LIMITS.maxImageBytes) return `Ảnh “${image.name}” vượt quá ${MB(LIMITS.maxImageBytes)} (dung lượng sau khi thu nhỏ).`;
  }
  if (otherBytes + totalImageBytes(images) > LIMITS.maxTotalImageBytes) {
    return `Vượt giới hạn tổng dung lượng ảnh của mọi chiến dịch (${MB(LIMITS.maxTotalImageBytes)}).`;
  }
  return null;
}

/** Validates one image from an untrusted source (a backup file). The size is recomputed from the data. */
export function sanitizeImage(raw: unknown): CampaignImage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const item = raw as Record<string, unknown>;
  const { id, name, mime, dataUrl } = item;
  if (typeof id !== 'string' || !id || id.length > MAX_ID_LENGTH) return null;
  if (typeof mime !== 'string' || !isAllowedType(mime)) return null;
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(`data:${mime};base64,`)) return null;
  const bytes = dataUrlBytes(dataUrl);
  if (bytes <= 0 || bytes > LIMITS.maxImageBytes) return null;
  return { id, name: safeImageName(typeof name === 'string' ? name : ''), mime, dataUrl, bytes };
}
