import { TABLES } from "../config.js";
import { ensureDay } from "./days.js";
import { SaveError, unwrap } from "./errors.js";
import { supabase } from "./supabase.js";

const SAVE_MESSAGE = "Couldn't save that.";

export async function addExtra(date, fields = {}) {
  await ensureDay(date);
  const result = await supabase
    .from(TABLES.EXTRAS)
    .insert({ date, ...fields })
    .select()
    .single();
  return unwrap(result, SaveError, SAVE_MESSAGE);
}

export async function updateExtra(id, fields) {
  const result = await supabase.from(TABLES.EXTRAS).update(fields).eq("id", id);
  unwrap(result, SaveError, SAVE_MESSAGE);
}

export async function deleteExtra(id) {
  const result = await supabase.from(TABLES.EXTRAS).delete().eq("id", id);
  unwrap(result, SaveError, SAVE_MESSAGE);
}
