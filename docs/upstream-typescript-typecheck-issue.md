# Upstream issue draft: TypeScript typecheck mixes app, e2e, worker, and test environments

## Title

TypeScript typecheck currently mixes app, e2e, worker, and test environments

## Summary

`pnpm run build` succeeds, but a direct TypeScript check fails because the root `tsconfig.json` appears to include all `**/*.ts` and `**/*.tsx` files across incompatible runtime/type environments.

This makes `pnpm exec tsc --noEmit --pretty false` noisy and hard to use as a real quality gate, because it checks React/Vite app code, Playwright e2e tests, Vitest tests, Cloudflare Worker/Durable Object code, server/API routes, and playground/Three.js code under one shared config.

## Reproduction

```bash
pnpm install
pnpm run build
pnpm exec tsc --noEmit --pretty false
```

## Observed locally:

- `pnpm run build` passes.
- `pnpm exec tsc --noEmit --pretty false` fails.
- After splitting configs and adding the missing environment type packages, `typecheck:e2e` and `typecheck:worker` pass independently.
- `typecheck:app` and `typecheck:test` still expose real app/test type debt, but those errors are no longer mixed with Playwright and Cloudflare Worker environment setup failures.

## Examples of current failures

### Playwright e2e files checked without Playwright type environment

Examples:

```text
e2e/chat-flicker-duplicate.spec.ts(1,30): error TS2307: Cannot find module '@playwright/test' or its corresponding type declarations.
e2e/chat-thinking-state.spec.ts(1,30): error TS2307: Cannot find module '@playwright/test' or its corresponding type declarations.
e2e/conductor-mobile-rendering.spec.ts(1,30): error TS2307: Cannot find module '@playwright/test' or its corresponding type declarations.
```

### Cloudflare Worker/Durable Object files checked without worker types

Examples:

```text
playground-ws-worker/src/worker.ts(...): error TS2304: Cannot find name 'DurableObjectNamespace'.
playground-ws-worker/src/worker.ts(...): error TS2304: Cannot find name 'DurableObjectState'.
playground-ws-worker/src/worker.ts(...): error TS2552: Cannot find name 'WebSocketPair'. Did you mean 'WebSocket'?
```

### Mixed app/server/test/playground errors

After the environment errors, the same raw check also reports unrelated app, server, route, test, and playground errors together. This makes it difficult to distinguish real app type debt from wrong-environment false positives.

## Likely root cause

The root `tsconfig.json` currently uses broad includes and a single type environment. In this repo, different file groups need different TypeScript environments:

- Vite/React app code
- Node/server/API route code
- Vitest test files
- Playwright e2e tests
- Cloudflare Worker/Durable Object code
- Three.js/react-three-fiber playground code

## Suggested direction

Add separate TypeScript configs and package scripts, for example:

```json
{
  "scripts": {
    "typecheck": "pnpm run typecheck:app && pnpm run typecheck:e2e && pnpm run typecheck:worker",
    "typecheck:app": "tsc --noEmit -p tsconfig.app.json",
    "typecheck:e2e": "tsc --noEmit -p tsconfig.e2e.json",
    "typecheck:worker": "tsc --noEmit -p playground-ws-worker/tsconfig.json"
  }
}
```

Potential config split:

- `tsconfig.app.json`
  - app/server/routes/components
  - excludes `e2e`, worker, build output, and environment-specific tests as appropriate
- `tsconfig.e2e.json`
  - includes `e2e/**/*.ts`
  - includes Playwright types
- `playground-ws-worker/tsconfig.json`
  - owns worker files and Cloudflare Worker/Durable Object types
- optional `tsconfig.vitest.json`
  - if test files should be checked separately from app runtime code

## Why this matters

A clean, environment-aware typecheck would make it much easier to:

- catch real regressions before runtime
- use TypeScript in CI as a quality gate
- avoid mixing app errors with e2e/worker/test environment errors
- accept smaller focused fixes without having to clean the whole repo at once

## Notes

This is separate from normal Vite build behavior. `vite build` can pass while `tsc --noEmit` fails because Vite transpiles TypeScript and does not enforce full type correctness by default.
