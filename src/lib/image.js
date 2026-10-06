import { MIME_TYPE, PHOTO_MAX_EDGE_PX, PHOTO_QUALITY } from "../config.js";
import { SaveError } from "../data/errors.js";

const PREFERRED_TYPE = MIME_TYPE.WEBP;
const FALLBACK_TYPE = MIME_TYPE.JPEG;

function loadWithImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new SaveError("Could not read that photo"));
    };
    img.src = url;
  });
}

async function decodeImage(file) {
  if (typeof createImageBitmap !== "function") return loadWithImageElement(file);
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (cause) {
    throw new SaveError("Could not read that photo", { cause });
  }
}

function encodeCanvas(canvas, type) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, PHOTO_QUALITY));
}

// Safari can't encode WebP and silently returns PNG, so check the returned type and fall back to JPEG.
async function encodeSmallest(canvas) {
  const webp = await encodeCanvas(canvas, PREFERRED_TYPE);
  if (webp?.type === PREFERRED_TYPE) return webp;
  const jpeg = await encodeCanvas(canvas, FALLBACK_TYPE);
  if (!jpeg) throw new SaveError("Could not compress that photo");
  return jpeg;
}

// Draws the image scaled down (never up) so its long edge fits maxEdge.
// Returns null when the browser can't give a 2D canvas.
export function resizeToCanvas(source, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function compressImage(file) {
  const source = await decodeImage(file);
  const canvas = resizeToCanvas(source, PHOTO_MAX_EDGE_PX);
  source.close?.();
  if (!canvas) throw new SaveError("Could not compress that photo");
  return encodeSmallest(canvas);
}
