// Trailing debounce. flush() runs a pending call now, cancel() drops it.
export function debounce(fn, ms) {
  let timerId = null;
  let pendingArgs = null;

  function cancel() {
    clearTimeout(timerId);
    timerId = null;
    pendingArgs = null;
  }

  function flush() {
    if (pendingArgs === null) return;
    const args = pendingArgs;
    cancel();
    fn(...args);
  }

  function debounced(...args) {
    clearTimeout(timerId);
    pendingArgs = args;
    timerId = setTimeout(flush, ms);
  }

  debounced.flush = flush;
  debounced.cancel = cancel;
  return debounced;
}
