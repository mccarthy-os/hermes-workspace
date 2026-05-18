import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { isAuthenticated } from '../../../server/auth-middleware'

interface ManifestSkill {
  id: string
  name: string
  category: string
  description: string
  source_path: string
  tags: string[]
  tier: string
}

interface ManifestCategory {
  id: string
  name: string
  description: string
}

interface Manifest {
  skills: ManifestSkill[]
  categories: ManifestCategory[]
}

async function fetchManifest(manifestUrl: string): Promise<Manifest> {
  const res = await fetch(manifestUrl)
  if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status}`)
  return res.json() as Promise<Manifest>
}

function resolveHermesHome(username: string): string {
  // Check if the per-user service is active (Gaille, future users).
  // John uses the legacy default hermes-gateway.service — his per-user unit
  // exists but is not active. Try per-user first, then fall back.
  const perUserService = `hermes-gateway-${username}`
  const perUserUnit = join(homedir(), `.config/systemd/user/${perUserService}.service`)
  const defaultUnit = join(homedir(), '.config/systemd/user/hermes-gateway.service')

  let unitPath: string
  try {
    execFileSync('systemctl', ['--user', 'is-active', perUserService], { stdio: 'pipe' })
    unitPath = perUserUnit
  } catch {
    unitPath = defaultUnit
  }

  if (!existsSync(unitPath)) throw new Error(`Gateway unit not found: ${unitPath}`)
  const content = readFileSync(unitPath, 'utf-8')
  const match = content.match(/^Environment="HERMES_HOME=(.+)"$/m)
  if (!match) throw new Error(`HERMES_HOME not found in ${unitPath}`)
  return match[1].trim()
}

export const Route = createFileRoute('/api/mccarthy/skills-status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const username = process.env.MCCARTHY_OS_USERNAME
          if (!username) {
            return json({ ok: false, error: 'MCCARTHY_OS_USERNAME not set' }, { status: 500 })
          }

          const manifestUrl =
            process.env.MCCARTHY_SKILLS_MANIFEST_URL ??
            'https://skills.mccarthyai.com/manifest.json'
          const manifest = await fetchManifest(manifestUrl)

          let hermesHome = ''
          try {
            hermesHome = resolveHermesHome(username)
          } catch {
            // hermesHome stays '' — skills will all show as not installed
          }

          const skillsStatus = manifest.skills.map((skill) => {
            let installed = false
            if (hermesHome) {
              const skillPath = join(hermesHome, 'skills', skill.category, skill.id, 'SKILL.md')
              installed = existsSync(skillPath)
            }
            return { id: skill.id, category: skill.category, installed }
          })

          return json({
            ok: true,
            skills: skillsStatus,
            categories: manifest.categories,
            manifest: manifest.skills.map((s) => ({
              id: s.id,
              name: s.name,
              category: s.category,
              description: s.description,
              source_path: s.source_path,
              tags: s.tags,
              tier: s.tier,
            })),
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          return json({ ok: false, error: message }, { status: 500 })
        }
      },
    },
  },
})
