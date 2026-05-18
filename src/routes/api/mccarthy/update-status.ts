import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isAuthenticated } from '../../../server/auth-middleware'

export const Route = createFileRoute('/api/mccarthy/update-status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const wsDir = process.env.HERMES_WORKSPACE_DIR
        if (!wsDir) {
          return json({ available: false, reason: 'HERMES_WORKSPACE_DIR not set' })
        }

        const flagPath = join(wsDir, '.update-available.json')
        if (!existsSync(flagPath)) {
          return json({ available: false })
        }

        try {
          const data = JSON.parse(readFileSync(flagPath, 'utf8'))
          return json({ ...data, ok: true })
        } catch {
          return json({ available: false, reason: 'flag file unreadable' })
        }
      },
    },
  },
})
