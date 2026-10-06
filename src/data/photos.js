import {
  MS_PER_SECOND,
  PHOTO_BUCKET,
  PHOTO_EXTENSIONS,
  PHOTO_SIGN_BATCH_DELAY_MS,
  PHOTO_SIGNED_URL_TTL_S,
  PHOTO_URL_REFRESH_MARGIN_S,
} from "../config.js";
import { getUserId } from "./auth.js";
import { LoadError, SaveError, unwrap } from "./errors.js";
import { supabase } from "./supabase.js";

const LOAD_MESSAGE = "Couldn't load that photo.";

const signedUrlCache = new Map();
let pendingBatch = null;

const storage = () => supabase.storage.from(PHOTO_BUCKET);

export async function uploadPhoto(date, ownerKey, blob) {
  const extension = PHOTO_EXTENSIONS[blob.type];
  if (!extension) throw new SaveError(`Photos must be WebP or JPEG, got "${blob.type}".`);
  const path = `${await getUserId()}/${date}/${ownerKey}.${extension}`;
  const result = await storage().upload(path, blob, { contentType: blob.type, upsert: true });
  unwrap(result, SaveError, "Couldn't save that photo.");
  signedUrlCache.delete(path);
  return path;
}

function getCachedUrl(path) {
  const cached = signedUrlCache.get(path);
  return cached && cached.expiresAt > Date.now() ? cached.url : null;
}

async function signPaths(paths) {
  const result = await storage().createSignedUrls(paths, PHOTO_SIGNED_URL_TTL_S);
  const signed = unwrap(result, LoadError, LOAD_MESSAGE);
  const lifetimeS = PHOTO_SIGNED_URL_TTL_S - PHOTO_URL_REFRESH_MARGIN_S;
  const expiresAt = Date.now() + lifetimeS * MS_PER_SECOND;
  for (const { path, signedUrl } of signed) {
    if (signedUrl) signedUrlCache.set(path, { url: signedUrl, expiresAt });
  }
}

// Paths asked for within one batch window share a single signing request.
function queueSigning(path) {
  if (!pendingBatch) {
    const batch = { paths: new Set() };
    batch.done = new Promise((resolve) => setTimeout(resolve, PHOTO_SIGN_BATCH_DELAY_MS)).then(
      () => {
        pendingBatch = null;
        return signPaths([...batch.paths]);
      },
    );
    pendingBatch = batch;
  }
  pendingBatch.paths.add(path);
  return pendingBatch.done;
}

export async function getPhotoUrl(path) {
  const cached = getCachedUrl(path);
  if (cached) return cached;
  await queueSigning(path);
  const signed = getCachedUrl(path);
  if (!signed) throw new LoadError(LOAD_MESSAGE);
  return signed;
}

export async function deletePhoto(path) {
  const result = await storage().remove([path]);
  unwrap(result, SaveError, "Couldn't remove that photo.");
  signedUrlCache.delete(path);
}
