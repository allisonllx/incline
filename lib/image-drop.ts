export type ImageDropInput = {
  files: File[];
  imageUrl?: string;
  uriList?: string;
  text?: string;
};
export type ImageDrop =
  | { kind: 'files'; files: File[] }
  | { kind: 'url'; url: string };

const maxBytes = 8_000_000;
const imageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const saveFileHelp =
  'Save the image to your computer, then choose or drop the file here.';

function imageAddress(value: string): string {
  const source = value.trim();
  if (/^data:image\/(png|jpeg|webp|gif);base64,/i.test(source)) {
    if (source.length > Math.ceil(maxBytes / 3) * 4 + 100)
      throw new Error('Choose an image up to 8 MB.');
    return source;
  }
  try {
    const url = new URL(source);
    if (
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      source.length <= 16_000
    )
      return url.href;
  } catch {
    /* The drop may be text, a private blob, or a local path. */
  }
  throw new Error(`This drop does not contain a usable image. ${saveFileHelp}`);
}

export function resolveImageDrop(input: ImageDropInput): ImageDrop {
  if (input.files.length) return { kind: 'files', files: input.files };
  // A linked image's URI list can point to the enclosing page; prefer the image itself.
  if (input.imageUrl?.trim())
    return { kind: 'url', url: imageAddress(input.imageUrl) };
  const addresses = (input.uriList || input.text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  if (addresses.length > 1)
    throw new Error(
      'Drop web images one at a time, or choose multiple saved image files.',
    );
  return { kind: 'url', url: imageAddress(addresses[0] || '') };
}

export async function fetchDroppedImage(value: string): Promise<File> {
  const url = imageAddress(value);
  let response: Response;
  try {
    response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error(
      `Could not copy this web image. The website may block direct copying or be unavailable. ${saveFileHelp}`,
    );
  }
  const type = (response.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!response.ok || !imageTypes.includes(type) || !response.body) {
    await response.body?.cancel();
    throw new Error(
      `This address did not provide a supported image. ${saveFileHelp}`,
    );
  }
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body.cancel();
    throw new Error('Choose an image up to 8 MB.');
  }
  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      size += chunk.byteLength;
      if (size > maxBytes) throw new Error('Choose an image up to 8 MB.');
      chunks.push(new Uint8Array(chunk).buffer);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (size > maxBytes) throw error;
    throw new Error(`The image could not finish downloading. ${saveFileHelp}`);
  } finally {
    reader.releaseLock();
  }
  if (!size) throw new Error(`The image was empty. ${saveFileHelp}`);
  const extension = type === 'image/jpeg' ? 'jpg' : type.slice('image/'.length);
  let name = `Web image.${extension}`;
  if (!url.startsWith('data:')) {
    try {
      name = decodeURIComponent(
        new URL(url).pathname.split('/').pop() || name,
      ).slice(0, 160);
    } catch {
      /* Keep a readable fallback for malformed filename escapes. */
    }
  }
  return new File(chunks, name, { type });
}
