import '@testing-library/jest-dom/vitest';

// jsdom does not implement scrollIntoView; provide a no-op so components that
// auto-scroll don't throw under test.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
