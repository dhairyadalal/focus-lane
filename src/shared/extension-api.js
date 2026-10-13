// Firefox exposes `browser`; Chrome exposes `chrome`. The shared app only uses
// APIs implemented by both browsers: storage, alarms, and runtime messaging.
export const ext = globalThis.browser ?? globalThis.chrome;

if (!ext) throw new Error("Focus Lane must run inside a browser extension.");
