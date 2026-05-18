import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  getClientIp,
  rateLimit,
  rateLimitResponse,
  requireJsonContentType,
} from '../../../server/rate-limit'

export const Route = createFileRoute('/api/mccarthy/uninstall-skill')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        if (!rateLimit(`uninstall-skill:${getClientIp(request)}`, 10, 60_000)) {
          return rateLimitResponse()
        }

        const username = process.env.MCCARTHY_OS_USERNAME
        if (!username) {
          return json({ ok: false, error: 'MCCARTHY_OS_USERNAME not set' }, { status: 500 })
        }

        let body: { skillId?: string; category?: string }
        try {
          body = (await request.json()) as { skillId?: string; category?: string }
        } catch {
          return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
        }

        const { skillId, category } = body
        if (!skillId || !category) {
          return json({ ok: false, error: 'skillId and category are required' }, { status: 400 })
        }

        // Validate inputs — no path traversal
        if (!/^[a-z0-9-]+$/.test(skillId) || !/^[a-z0-9-]+$/.test(category)) {
          return json({ ok: false, error: 'Invalid skillId or category format' }, { status: 400 })
        }

        const scriptPath = join(homedir(), 'mccarthy-os-template/scripts/uninstall-skill.sh')
        const uid = parseInt(
          execFileSync('id', ['-u'], { encoding: 'utf8' }).trim(),
          10,
        )

        try {
          execFileSync('bash', [scriptPath, username, skillId, category], {
            env: {
              ...process.env,
              XDG_RUNTIME_DIR: `/run/user/${uid}`,
              DBUS_SESSION_BUS_ADDRESS: `unix:path=/run/user/${uid}/bus`,
            },
            timeout: 30_000,
            stdio: 'pipe',
          })
          return json({ ok: true, message: `Uninstalled ${skillId} from ${username}` })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Uninstall failed'
          return json({ ok: false, error: message }, { status: 500 })
        }
      },
    },
  },
})
