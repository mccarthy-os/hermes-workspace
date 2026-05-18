import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { execFileSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  getClientIp,
  rateLimit,
  rateLimitResponse,
  requireJsonContentType,
} from '../../../server/rate-limit'

const BRANCH = 'mccarthy-customizations'

function exec(
  command: string,
  args: Array<string>,
  options: { cwd?: string; timeout?: number } = {},
): string {
  return execFileSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: 'utf8',
    timeout: options.timeout ?? 60_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

export const Route = createFileRoute('/api/mccarthy/update-apply')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        if (!rateLimit('update-apply:' + getClientIp(request), 3, 60_000)) {
          return rateLimitResponse()
        }

        const username = process.env.MCCARTHY_OS_USERNAME
        const wsDir = process.env.HERMES_WORKSPACE_DIR
        if (!username || !wsDir) {
          return json(
            { ok: false, error: 'MCCARTHY_OS_USERNAME or HERMES_WORKSPACE_DIR not set' },
            { status: 500 },
          )
        }

        // Determine the workspace clone directory from process.cwd()
        // (systemd WorkingDirectory= is set to the workspace clone dir)
        const repoPath = process.cwd()

        try {
          // Capture HEAD before update to detect pnpm changes
          const oldHead = exec('git', ['rev-parse', 'HEAD'], { cwd: repoPath })

          // Fetch and reset to latest origin/mccarthy-customizations
          exec('git', ['fetch', 'origin', BRANCH], { cwd: repoPath, timeout: 60_000 })
          exec('git', ['reset', '--hard', 'origin/' + BRANCH], { cwd: repoPath })

          const newHead = exec('git', ['rev-parse', 'HEAD'], { cwd: repoPath })

          if (oldHead !== newHead) {
            // Check if pnpm deps changed between old and new HEAD
            const changedFilesRaw = exec(
              'git',
              ['diff', '--name-only', oldHead, newHead],
              { cwd: repoPath },
            )
            const changedFiles = changedFilesRaw.split('\n').filter(Boolean)

            if (changedFiles.some((f) => f === 'package.json' || f === 'pnpm-lock.yaml')) {
              exec('pnpm', ['install', '--no-frozen-lockfile'], {
                cwd: repoPath,
                timeout: 180_000,
              })
            }
          }

          // Clear the update flag BEFORE restart (prevents race where new process reads stale flag)
          const flagPath = join(wsDir, '.update-available.json')
          if (existsSync(flagPath)) rmSync(flagPath)

          // Restart the systemd user service for this user
          // XDG_RUNTIME_DIR required for systemctl --user from non-login Node.js context
          const uid = parseInt(
            execFileSync('id', ['-u'], { encoding: 'utf8' }).trim(),
            10,
          )
          execFileSync(
            'systemctl',
            ['--user', 'restart', 'hermes-workspace-' + username],
            {
              env: {
                ...process.env,
                XDG_RUNTIME_DIR: '/run/user/' + uid,
                DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/' + uid + '/bus',
              },
              timeout: 30_000,
            },
          )

          return json({ ok: true, restartTriggered: true })
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
