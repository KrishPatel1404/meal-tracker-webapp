import { OWNER_EMAIL, SECRET_LINK_HASH_KEY } from "../config.js";
import { AuthError, unwrap } from "./errors.js";
import { supabase } from "./supabase.js";

export const SESSION_STATE = Object.freeze({
  SIGNED_IN: "signed-in",
  NEEDS_LINK: "needs-link",
});

const TOKEN_PATTERN = new RegExp(`(?:^|[#&])${SECRET_LINK_HASH_KEY}=([^&\\s]+)`);

function findLinkToken(text) {
  const match = TOKEN_PATTERN.exec(text);
  return match ? decodeURIComponent(match[1]) : null;
}

function stripHash() {
  history.replaceState(null, "", location.pathname + location.search);
}

async function getExistingSession() {
  const result = await supabase.auth.getSession();
  return unwrap(result, AuthError, "Couldn't check your sign in.").session;
}

// Accepts the full secret link or the bare token.
export async function signInWithLink(linkOrToken) {
  const trimmed = (linkOrToken ?? "").trim();
  const token = findLinkToken(trimmed) ?? trimmed;
  if (!token) throw new AuthError("That link doesn't look right. Paste the whole link again.");
  const result = await supabase.auth.signInWithPassword({ email: OWNER_EMAIL, password: token });
  unwrap(result, AuthError, "That link didn't open the app. Check it and try again.");
}

export async function ensureSession() {
  const hashToken = findLinkToken(location.hash);
  if (hashToken) stripHash();
  if (await getExistingSession()) return SESSION_STATE.SIGNED_IN;
  if (!hashToken) return SESSION_STATE.NEEDS_LINK;
  await signInWithLink(hashToken);
  return SESSION_STATE.SIGNED_IN;
}

export async function getUserId() {
  const session = await getExistingSession();
  if (!session) throw new AuthError("You're signed out. Open your secret link again.");
  return session.user.id;
}
