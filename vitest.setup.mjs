import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

// Captured before any spec can install fake timers, so the teardown drain below always
// uses a timer that actually fires.
const realSetTimeout = globalThis.setTimeout;

afterEach(async () => {
  // Restore real timers before anything else. A spec that installs vi.useFakeTimers and
  // does not put them back leaves the fake clock in place for React Testing Library's
  // unmount cleanup and for every later spec in the file. Mantine's transition cleanup
  // then calls `window.clearTimeout`, which cannot cancel a timer scheduled on the other
  // clock, so the orphaned timer fires after the environment is torn down. That surfaces
  // as an unhandled "window is not defined" blamed on whichever file happened to be
  // running next, while the summary still reports every test as passing and only the exit
  // code disagrees. Restoring here ends the whole class rather than one instance of it.
  vi.useRealTimers();
  localStorage.clear();
  // @mantine/hooks' useFocusTrap schedules its deferred focus with a bare `setTimeout` and
  // keeps no handle, so its effect cleanup cannot cancel it — unmounting a modal leaves the
  // callback queued. If the file's environment is torn down first, it runs against a gone
  // `document` and surfaces as an unhandled "document is not defined". Yielding one
  // macrotask lets those zero-delay timers drain while the document still exists.
  // Deliberately the real timer captured above: under vi.useFakeTimers a faked setTimeout
  // would never fire here and this hook would hang until the test timeout.
  await new Promise((resolve) => {
    realSetTimeout(resolve, 0);
  });
});

const { getComputedStyle } = window;
window.getComputedStyle = (elt) => getComputedStyle(elt);
window.HTMLElement.prototype.scrollIntoView = () => {};

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

window.ResizeObserver = ResizeObserver;

// jsdom has no FontFaceSet; Mantine's autosizing Textarea listens for font load events.
Object.defineProperty(document, 'fonts', {
  writable: true,
  value: { addEventListener: () => {}, removeEventListener: () => {} },
});
