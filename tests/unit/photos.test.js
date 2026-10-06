import { beforeEach, describe, expect, it, vi } from "vitest";
import { PHOTO_BUCKET, PHOTO_SIGNED_URL_TTL_S } from "../../src/config.js";
import { LoadError } from "../../src/data/errors.js";
import { getPhotoUrl } from "../../src/data/photos.js";
import { supabase } from "../../src/data/supabase.js";

vi.mock("../../src/data/supabase.js", () => ({
  supabase: { storage: { from: vi.fn() } },
}));

const createSignedUrls = vi.fn();
const MISSING_PATH = "user/2001-01-01/missing.webp";
const signedUrlFor = (path) => `https://example.test/sign/${path}?token=t`;

// Storage signs every path it knows and returns an error entry for the missing one.
function signKnownPaths(paths) {
  return Promise.resolve({
    data: paths.map((path) =>
      path === MISSING_PATH
        ? { path, signedUrl: null, error: "Object not found" }
        : { path, signedUrl: signedUrlFor(path), error: null },
    ),
    error: null,
  });
}

// The module caches URLs for the whole session, so every test uses its own photo paths.
describe("getPhotoUrl", () => {
  beforeEach(() => {
    createSignedUrls.mockReset().mockImplementation(signKnownPaths);
    vi.mocked(supabase.storage.from).mockReset().mockReturnValue({ createSignedUrls });
  });

  it("signs photos asked for together in one storage request", async () => {
    const paths = ["u/2001-01-01/meal-1.webp", "u/2001-01-01/meal-2.jpg", "u/2001-01-01/x.webp"];

    const urls = await Promise.all(paths.map(getPhotoUrl));

    expect(urls).toEqual(paths.map(signedUrlFor));
    expect(createSignedUrls, "one batched request for three photos").toHaveBeenCalledTimes(1);
    expect(createSignedUrls).toHaveBeenCalledWith(paths, PHOTO_SIGNED_URL_TTL_S);
    expect(supabase.storage.from).toHaveBeenCalledWith(PHOTO_BUCKET);
  });

  it("serves a repeat request from the cache without signing again", async () => {
    const path = "u/2001-01-02/meal-1.webp";

    await getPhotoUrl(path);
    const again = await getPhotoUrl(path);

    expect(again).toBe(signedUrlFor(path));
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
  });

  it("starts a new batch for photos asked for after the previous one was sent", async () => {
    await getPhotoUrl("u/2001-01-03/meal-1.webp");
    await getPhotoUrl("u/2001-01-03/meal-2.webp");

    expect(createSignedUrls.mock.calls.map(([paths]) => paths)).toEqual([
      ["u/2001-01-03/meal-1.webp"],
      ["u/2001-01-03/meal-2.webp"],
    ]);
  });

  it("rejects only the photo storage couldn't sign, others in the batch still load", async () => {
    const goodPath = "u/2001-01-04/meal-1.webp";

    const [good, missing] = await Promise.allSettled([
      getPhotoUrl(goodPath),
      getPhotoUrl(MISSING_PATH),
    ]);

    expect(good).toEqual({ status: "fulfilled", value: signedUrlFor(goodPath) });
    expect(missing.status).toBe("rejected");
    expect(missing.reason).toBeInstanceOf(LoadError);
  });

  it("rejects every photo in the batch with a LoadError when the request fails", async () => {
    createSignedUrls.mockResolvedValue({ data: null, error: { message: "boom", code: "XX000" } });

    const results = await Promise.allSettled([
      getPhotoUrl("u/2001-01-05/meal-1.webp"),
      getPhotoUrl("u/2001-01-05/meal-2.webp"),
    ]);

    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(results.every((result) => result.reason instanceof LoadError)).toBe(true);
  });
});
