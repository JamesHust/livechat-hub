// Root aggregate config used by lint-staged, which runs ESLint from the repo
// root rather than per-package. It must register every plugin any package's
// inline disable comments reference (e.g. react-hooks/exhaustive-deps), so use
// the React preset here — its hooks rules only fire on hooks and are inert for
// the framework-agnostic packages. Per-package linting still uses each
// package's own config via Turbo.
import { reactConfig } from '@livechat-hub/eslint-config';

export default reactConfig;
