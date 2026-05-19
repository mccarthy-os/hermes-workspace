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

export const Route = createFileRoute('/api/skills/install')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const body = (await request.json()) as {
            skillId?: string
            identifier?: string
            category?: string
            origin?: string
            force?: boolean
          }
          const identifier =
            (body.identifier || body.skillId || '').trim()
          if (!identifier) {
            return json(
              { ok: false, error: 'identifier or skillId required' },
              { status: 400 },
            )
          }

          // McCarthy skill install — bypass Hermes gateway entirely
          if (body.origin === 'mccarthy') {
            const category = (body.category || '').trim()
            const username = process.env.MCCARTHY_OS_USERNAME || nodeos.userInfo().username
            if (!category) {
              return json({ ok: false, error: 'category required for McCarthy skills' }, { status: 400 })
            }
            if (!/^[a-z0-9-]+$/.test(identifier) || !/^[a-z0-9-]+$/.test(category)) {
              return json({ ok: false, error: 'Invalid skillId or category format' }, { status: 400 })
            }
            const scriptPath = nodepath.join(nodeos.homedir(), 'mccarthy-os-template/scripts/install-skill.sh')
            const uid = process.getuid ? process.getuid() : 1001
            const XDG_RUNTIME_DIR = '/run/user/' + String(uid)
            const DBUS_SESSION_BUS_ADDRESS = 'unix:path=' + XDG_RUNTIME_DIR + '/bus'
            try {
              execFileSync('bash', [scriptPath, username, identifier, category], {
                env: { ...process.env, XDG_RUNTIME_DIR, DBUS_SESSION_BUS_ADDRESS },
                timeout: 120_000,
                stdio: 'pipe',
              })
              return json({ ok: true, action: 'install', skillId: identifier })
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              return json({ ok: false, error: 'Install script failed: ' + msg }, { status: 500 })
            }
          }

          const capabilities = await ensureGatewayProbed()
          if (capabilities.dashboard.available) {
            return json(
              {
                ok: false,
                error:
                  'Skill install is only available on the legacy enhanced fork right now.',
              },
              { status: 501 },
            )
          }

          const response = await fetch(`${CLAUDE_API}/api/skills/install`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...authHeaders(),
            },
            body: JSON.stringify({
              identifier,
              category: body.category || '',
              force: Boolean(body.force),
            }),
            signal: AbortSignal.timeout(120_000),
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
                  : 'Failed to install skill',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
