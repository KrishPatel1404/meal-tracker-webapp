// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAVE_STATE, TEXT_SAVE_DEBOUNCE_MS } from "../../src/config.js";

// save-status.js keeps module-level state, so every test gets a fresh copy. errors.js is
// re-imported with it, so `instanceof` checks match the copy save-status.js uses.
let saveStatus;
let NetworkError;

beforeEach(async () => {
  vi.resetModules();
  saveStatus = await import("../../src/ui/save-status.js");
  ({ NetworkError } = await import("../../src/data/errors.js"));
});

afterEach(() => {
  vi.useRealTimers();
});

const failure = () => Promise.reject(new NetworkError("offline"));
const success = (value) => Promise.resolve(value);

// A write the way a card does it: fails while `server.down` is true, retries itself on failure.
function createRetryingWrite(server) {
  const attempts = [];
  async function write() {
    attempts.push(server.down ? "failed" : "saved");
    const result = await saveStatus.settleSave(server.down ? failure() : success(), write);
    return result.saved;
  }
  return { write, attempts };
}

describe("save status pill", () => {
  it("starts hidden, shows saving while a write is out and saved once it lands", async () => {
    const pill = saveStatus.createSaveStatus();
    expect(pill.dataset.state, "fresh pill").toBe(SAVE_STATE.IDLE);

    let finish;
    const pending = saveStatus.settleSave(new Promise((resolve) => (finish = resolve)));
    expect(pill.dataset.state, "write in flight").toBe(SAVE_STATE.SAVING);
    expect(pill.textContent).toBe("Saving...");

    finish("row");
    await expect(pending).resolves.toEqual({ saved: true, value: "row" });
    expect(pill.dataset.state, "write landed").toBe(SAVE_STATE.SAVED);
  });

  it("stays on saving until every overlapping write has settled", async () => {
    const pill = saveStatus.createSaveStatus();
    let finishSlow;
    const slow = saveStatus.settleSave(new Promise((resolve) => (finishSlow = resolve)));
    await saveStatus.settleSave(success());
    expect(pill.dataset.state, "the slow write is still out").toBe(SAVE_STATE.SAVING);
    finishSlow();
    await slow;
    expect(pill.dataset.state).toBe(SAVE_STATE.SAVED);
  });

  it("keeps showing an error while a failed write is waiting to be retried", async () => {
    const pill = saveStatus.createSaveStatus();
    const server = { down: true };
    const { write, attempts } = createRetryingWrite(server);

    expect(await write(), "first attempt fails").toBe(false);
    expect(pill.dataset.state).toBe(SAVE_STATE.ERROR);
    expect(pill.textContent).toBe("Couldn't save");

    // An unrelated write landing (while the retry fails again) must not hide the failed one.
    await saveStatus.settleSave(success());
    await vi.waitFor(() => expect(attempts).toEqual(["failed", "failed"]));
    await vi.waitFor(() => expect(pill.dataset.state).toBe(SAVE_STATE.ERROR));
  });

  it("rethrows bugs (untyped errors) and shows the error until the next save lands", async () => {
    const pill = saveStatus.createSaveStatus();
    const bug = new TypeError("undefined is not a function");
    // TypeError is not one of the typed data-layer errors, so it must not be swallowed.
    await expect(saveStatus.settleSave(Promise.reject(bug))).rejects.toBe(bug);
    expect(pill.dataset.state).toBe(SAVE_STATE.ERROR);
    await saveStatus.settleSave(success());
    expect(pill.dataset.state).toBe(SAVE_STATE.SAVED);
  });
});

describe("failed write retries", () => {
  it("re-sends a failed write on the next save, and the pill clears once it lands", async () => {
    const pill = saveStatus.createSaveStatus();
    const server = { down: true };
    const { write, attempts } = createRetryingWrite(server);
    await write();

    server.down = false;
    await saveStatus.settleSave(success());
    await vi.waitFor(() => expect(attempts).toEqual(["failed", "saved"]));
    await vi.waitFor(() => expect(pill.dataset.state).toBe(SAVE_STATE.SAVED));
  });

  it("re-sends failed writes on retryFailedSaves (the 'online' handler)", async () => {
    const pill = saveStatus.createSaveStatus();
    const server = { down: true };
    const { write, attempts } = createRetryingWrite(server);
    await write();

    server.down = false;
    saveStatus.retryFailedSaves();
    await vi.waitFor(() => expect(pill.dataset.state).toBe(SAVE_STATE.SAVED));
    expect(attempts).toEqual(["failed", "saved"]);
  });

  it("keeps a write that fails again on the list, retrying it once per trigger", async () => {
    const pill = saveStatus.createSaveStatus();
    const server = { down: true };
    const { write, attempts } = createRetryingWrite(server);
    await write();

    saveStatus.retryFailedSaves();
    await vi.waitFor(() => expect(attempts).toEqual(["failed", "failed"]));
    expect(pill.dataset.state, "still unsaved").toBe(SAVE_STATE.ERROR);

    server.down = false;
    saveStatus.retryFailedSaves();
    await vi.waitFor(() => expect(attempts).toEqual(["failed", "failed", "saved"]));
    await vi.waitFor(() => expect(pill.dataset.state).toBe(SAVE_STATE.SAVED));
  });

  it("flushPendingSaves sends waiting text and failed writes right away", async () => {
    vi.useFakeTimers();
    saveStatus.createSaveStatus();
    const server = { down: true };
    const { write, attempts } = createRetryingWrite(server);
    await write();
    const textSave = vi.fn();
    saveStatus.debounceTextSave(textSave)();

    server.down = false;
    saveStatus.flushPendingSaves();
    expect(textSave, "text save runs without waiting for the debounce").toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(attempts).toEqual(["failed", "saved"]));

    vi.advanceTimersByTime(TEXT_SAVE_DEBOUNCE_MS);
    expect(textSave, "a flushed text save doesn't fire a second time").toHaveBeenCalledTimes(1);
  });
});

describe("moving to another day (a new pill)", () => {
  it("starts idle when nothing is outstanding, even after an earlier failure without retry", async () => {
    const oldPill = saveStatus.createSaveStatus();
    await saveStatus.settleSave(failure());
    expect(oldPill.dataset.state).toBe(SAVE_STATE.ERROR);

    const newPill = saveStatus.createSaveStatus();
    expect(newPill.dataset.state).toBe(SAVE_STATE.IDLE);
  });

  it("starts idle after the previous day's saves all landed", async () => {
    saveStatus.createSaveStatus();
    await saveStatus.settleSave(success());
    expect(saveStatus.createSaveStatus().dataset.state).toBe(SAVE_STATE.IDLE);
  });

  it("still shows an error for a failed write carried over from the day that was left", async () => {
    saveStatus.createSaveStatus();
    const server = { down: true };
    const { write, attempts } = createRetryingWrite(server);
    await write();

    const newPill = saveStatus.createSaveStatus();
    expect(newPill.dataset.state, "the unsaved write is not forgotten").toBe(SAVE_STATE.ERROR);

    server.down = false;
    await saveStatus.settleSave(success());
    await vi.waitFor(() => expect(newPill.dataset.state).toBe(SAVE_STATE.SAVED));
    expect(attempts).toEqual(["failed", "saved"]);
  });
});
