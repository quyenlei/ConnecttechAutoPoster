import { checkImageFile, dataUrlBytes, fitSize, needsResize, safeImageName } from '@/lib/images';
import { LIMITS } from '@/lib/limits';
import { newId } from '@/lib/id';
import type { CampaignImage } from '@/lib/types';

export type PreparedImage = { ok: true; image: CampaignImage } | { ok: false; error: string };

const readAsDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

/** Shrinks to a JPEG that fits the per-image limit. Transparent areas become white. */
async function shrink(bitmap: ImageBitmap): Promise<Blob | null> {
  let { width, height } = fitSize(bitmap.width, bitmap.height, LIMITS.maxImageEdgePx);
  for (let round = 0; round < 6; round++) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    for (const quality of [0.9, 0.8, 0.7, 0.55]) {
      const blob = await canvasToBlob(canvas, quality);
      if (blob && blob.size <= LIMITS.maxImageBytes) return blob;
    }
    width = Math.max(1, Math.round(width * 0.8));
    height = Math.max(1, Math.round(height * 0.8));
  }
  return null;
}

/** Reads a picked file and shrinks it when needed. Everything stays on this device. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const typeError = checkImageFile({ mime: file.type, bytes: file.size });
  if (typeError) return { ok: false, error: `${safeImageName(file.name)}: ${typeError}` };
  const name = safeImageName(file.name);
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const blob = needsResize({ bytes: file.size, width: bitmap.width, height: bitmap.height }) ? await shrink(bitmap) : file;
      if (!blob) return { ok: false, error: `${name}: không thu nhỏ được ảnh xuống dưới ${LIMITS.maxImageBytes / 1_000_000} MB.` };
      const dataUrl = await readAsDataUrl(blob);
      const mime = blob.type as CampaignImage['mime'];
      return { ok: true, image: { id: newId(), name, mime, dataUrl, bytes: dataUrlBytes(dataUrl) } };
    } finally {
      bitmap.close();
    }
  } catch {
    return { ok: false, error: `${name}: không đọc được ảnh này.` };
  }
}
