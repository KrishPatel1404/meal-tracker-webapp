import { SAVE_STATE, TEXT_SAVE_DEBOUNCE_MS } from "../config.js";
import { isTypedError } from "../data/errors.js";
import { debounce } from "../lib/debounce.js";
import { h } from "./dom.js";

const LABELS = Object.freeze({
  [SAVE_STATE.IDLE]: "",
  [SAVE_STATE.SAVING]: "Saving...",
  [SAVE_STATE.SAVED]: "Saved",
  [SAVE_STATE.ERROR]: "Couldn't save",
});

// Module singleton: one save state for the whole app, shown by the current view's header pill.
// The pill is worked out from what is still outstanding, never from a stale last result.
let savesInFlight = 0;
// Writes that failed and still need to reach the server. Each entry re-runs the write with the
// latest unsaved data, so retrying it again later is always safe.
const failedSaves = new Set();
// A failed write with no retry (e.g. adding a row): shown until the next save succeeds.
let hasUnretriedFailure = false;
// Something saved since this pill appeared, so "Saved" is worth showing.
let hasSaved = false;
let statusEl = null;
// Debounced text saves that haven't run yet, so a view can flush them when the page is left.
const pendingTextSaves = new Set();

function getState() {
  if (savesInFlight > 0) return SAVE_STATE.SAVING;
  if (failedSaves.size > 0 || hasUnretriedFailure) return SAVE_STATE.ERROR;
  return hasSaved ? SAVE_STATE.SAVED : SAVE_STATE.IDLE;
}

function render() {
  if (!statusEl) return;
  const state = getState();
  statusEl.dataset.state = state;
  statusEl.textContent = LABELS[state];
}

// A new pill starts from what is outstanding now: writes that failed elsewhere still show.
export function createSaveStatus() {
  hasSaved = false;
  hasUnretriedFailure = false;
  statusEl = h("span", { class: "save-status", role: "status" });
  render();
  return statusEl;
}

// Runs every failed write again. Each one is taken off the list first and comes back on its own
// if it fails again, so a retry that triggers more retries can't loop.
export function retryFailedSaves() {
  const retries = [...failedSaves];
  failedSaves.clear();
  for (const retry of retries) retry();
  render();
}

// Any new write is the "next interaction", so failed writes go out again alongside it.
async function track(promise, retry) {
  retryFailedSaves();
  savesInFlight += 1;
  render();
  try {
    const value = await promise;
    hasSaved = true;
    hasUnretriedFailure = false;
    if (retry) failedSaves.delete(retry);
    return value;
  } catch (error) {
    if (retry && isTypedError(error)) failedSaves.add(retry);
    else hasUnretriedFailure = true;
    throw error;
  } finally {
    savesInFlight -= 1;
    render();
  }
}

// Every UI write goes through here. The pill reflects outstanding writes; the promise passes through.
export function trackSave(promise) {
  return track(promise, null);
}

// Runs writes one after another, so quick repeat taps reach the server in tap order.
export function createSaveQueue() {
  let tail = Promise.resolve();
  return (task) => {
    const run = tail.then(task);
    // Ordering only: the caller still gets any failure through `run`.
    tail = run.catch(() => undefined);
    return run;
  };
}

// Runs a write through the header save status. Typed failures are already shown there,
// so they come back as { saved: false }. Anything else is a bug and keeps throwing.
// `retry` re-sends the caller's latest unsaved data: it is kept on failure and run on the next
// write, when the browser comes back online and when the day is left (see flushPendingSaves).
export async function settleSave(promise, retry = null) {
  try {
    return { saved: true, value: await track(promise, retry) };
  } catch (error) {
    if (!isTypedError(error)) throw error;
    return { saved: false };
  }
}

// Text field save: runs after a pause in typing, and on flushPendingSaves().
export function debounceTextSave(save) {
  const debounced = debounce(() => {
    pendingTextSaves.delete(debounced);
    save();
  }, TEXT_SAVE_DEBOUNCE_MS);
  const schedule = () => {
    pendingTextSaves.add(debounced);
    debounced();
  };
  schedule.flush = debounced.flush;
  schedule.cancel = () => {
    pendingTextSaves.delete(debounced);
    debounced.cancel();
  };
  return schedule;
}

// Sends everything not yet on the server: typed text still waiting on its debounce,
// and writes that failed earlier.
export function flushPendingSaves() {
  for (const save of [...pendingTextSaves]) save.flush();
  retryFailedSaves();
}
