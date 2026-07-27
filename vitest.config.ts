import { defineConfig } from 'vitest/config';

/**
 * One project. MCP has one runtime (Node), one collaborator (the ship SDK),
 * and no I/O of its own — the tier split that ship's suite needs (unit /
 * integration / e2e / browser) would be four names for the same thing here.
 *
 * `tests/setup.ts` carries the hermeticity invariants (credential scrub +
 * no-network guard); see its header for why each exists.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    testTimeout: 5000,
    // Mock hygiene as config rather than per-file boilerplate: call history
    // clears before every test, so an assertion can never pass on a previous
    // test's calls, and `vi.stubGlobal` is undone after every test.
    clearMocks: true,
    unstubGlobals: true,
    // Console policy lives here, not in per-file mute spies: passing tests stay
    // quiet, failing tests print everything they logged. `src/index.ts` writes
    // its startup banner to stderr, and index.test.ts drives it repeatedly.
    silent: 'passed-only',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['**/node_modules/**', '**/*.d.ts'],
      /**
       * The 2026-07-27 measurement, held exactly. Unlike ship — where the bin
       * block, the TTY spinner and the browser-detection arms are unreachable
       * in-process and force per-file floors — MCP has no such corner: three
       * small modules, all drivable through the protocol or the process
       * boundary. So the bar is the ceiling, and a new tool that arrives
       * without a test fails the run.
       *
       * NOTE: thresholds catch coverage DECAY. They cannot catch a test that
       * asserts nothing — a tautology neither raises nor lowers coverage. That
       * class is fenced by tests/architecture/test-integrity.test.ts.
       */
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
