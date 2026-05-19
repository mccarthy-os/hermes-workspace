import { createFileRoute } from '@tanstack/react-router'
import { execFileSync } from 'node:child_process'
import nodeos from 'node:os'
import nodepath from 'node:path'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  BEARER_TOKEN,
  CLAUDE_API,
  ensureGatewayProbed,
} from '../../../server/gateway-capabilities'

function authHeaders(): Record<string, string> {
  return BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}
}

export const Route = createFileRoute('/api/skills/uninstall')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const body = (await request.json()) as {
            skillId?: string
            name?: string
            category?: string
            origin?: string
          }
          const name = (body.name || body.skillId || '').trim()
          if (!name) {
            return json(
              { ok: false, error: 'name or skillId required' },
              { status: 400 },
            )
          }

          // McCarthy skill uninstall
          if (body.origin === 'mccarthy') {
            const category = (body.category || '').trim()
            const username = process.env.MCCARTHY_OS_USERNAME || nodeos.userInfo().username
            if (!category) {
              return json({ ok: false, error: 'category required for McCarthy skills' }, { status: 400 })
            }
            if (!/^[a-z0-9-]+$/.test(name) || !/^[a-z0-9-]+$/.test(category)) {
              return json({ ok: false, error: 'Invalid skillId or category format' }, { status: 400 })
            }
            const scriptPath = nodepath.join(nodeos.homedir(), 'mccarthy-os-template/scripts/uninstall-skill.sh')
            const uid = process.getuid ? process.getuid() : 1001
            const xdgDir = '/run/user/' + uid
            const dbusAddr = 'unix:path=' + xdgDir + '/bus'
            try {
              execFileSync('bash', [scriptPath, username, name, category], {
                env: { ...process.env, XDG_RUNTIME_DIR: xdgDir, DBUS_SESSION_BUS_ADDRESS: dbusAddr },
                timeout: 60_000,
                stdio: 'pipe',
              })
              return json({ ok: true, action: 'uninstall', skillId: name })
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              return json({ ok: false, error: 'Uninstall script failed: ' + msg }, { status: 500 })
            }
          }

          const capabilities = await ensureGatewayProbed()
          if (capabilities.dashboard.available) {
            return json(
              {
                ok: false,
                error:
                  'Skill uninstall is only available on the legacy enhanced fork right now.',
              },
              { status: 501 },
            )
          }

          const response = await fetch(`${CLAUDE_API}/api/skills/uninstall`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...authHeaders(),
            },
            body: JSON.stringify({ name }),
            signal: AbortSignal.timeout(30_000),
          })

          const result = await response.json()
          return json(result, { status: response.status })
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to uninstall skill',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
