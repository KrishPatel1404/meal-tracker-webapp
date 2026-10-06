import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce } from "../../src/lib/debounce.js";

const WAIT_MS = 600;

describe("debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not call fn before the wait has passed", () => {
    const fn = vi.fn();
    debounce(fn, WAIT_MS)("a");
    vi.advanceTimersByTime(WAIT_MS - 1);
    expect(fn).not.toHaveBeenCalled();
  });

  it("calls fn once after the wait with the given arguments", () => {
    const fn = vi.fn();
    debounce(fn, WAIT_MS)("a", 2);
    vi.advanceTimersByTime(WAIT_MS);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("a", 2);
  });

  it("restarts the wait on every call and only fires the last arguments", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, WAIT_MS);
    debounced("first");
    vi.advanceTimersByTime(WAIT_MS - 100);
    debounced("second");
    vi.advanceTimersByTime(WAIT_MS - 100);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("second");
  });

  it("flush runs the pending call immediately with the latest arguments", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, WAIT_MS);
    debounced("a");
    debounced("b");
    debounced.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("b");
  });

  it("flush does not fire again when the original timer would have elapsed", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, WAIT_MS);
    debounced("a");
    debounced.flush();
    vi.advanceTimersByTime(WAIT_MS * 2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("flush with nothing pending does nothing", () => {
    const fn = vi.fn();
    debounce(fn, WAIT_MS).flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it("flush after the call already fired does nothing", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, WAIT_MS);
    debounced("a");
    vi.advanceTimersByTime(WAIT_MS);
    debounced.flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("cancel drops the pending call", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, WAIT_MS);
    debounced("a");
    debounced.cancel();
    vi.advanceTimersByTime(WAIT_MS * 2);
    expect(fn).not.toHaveBeenCalled();
  });

  it("flush after cancel does nothing", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, WAIT_MS);
    debounced("a");
    debounced.cancel();
    debounced.flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it("can be called again after a cancel", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, WAIT_MS);
    debounced("a");
    debounced.cancel();
    debounced("b");
    vi.advanceTimersByTime(WAIT_MS);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("b");
  });

  it("leaves no timers behind after cancel or flush", () => {
    const debounced = debounce(vi.fn(), WAIT_MS);
    debounced("a");
    debounced.cancel();
    expect(vi.getTimerCount()).toBe(0);
    debounced("b");
    debounced.flush();
    expect(vi.getTimerCount()).toBe(0);
  });
});
