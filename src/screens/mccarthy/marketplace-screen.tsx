'use client'

import { useState, useEffect, useCallback } from 'react'

interface SkillStatus {
  id: string
  category: string
  installed: boolean
}

interface Category {
  id: string
  name: string
  description: string
}

interface ManifestSkill {
  id: string
  name: string
  category: string
  description: string
  source_path: string
  tags: string[]
  tier: string
}

interface SkillsStatusResponse {
  ok: boolean
  skills?: SkillStatus[]
  categories?: Category[]
  manifest?: ManifestSkill[]
  error?: string
}

function idToName(id: string): string {
  return id
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function MarketplaceScreen() {
  const [status, setStatus] = useState<SkillsStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [operating, setOperating] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const manifestById = new Map(status?.manifest?.map((s) => [s.id, s]) ?? [])

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/mccarthy/skills-status')
      const data: SkillsStatusResponse = (await res.json()) as SkillsStatusResponse
      if (!data.ok) throw new Error(data.error ?? 'Failed to load skills')
      setStatus(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  async function handleInstall(skillId: string, category: string) {
    setOperating((prev) => new Set(prev).add(skillId))
    try {
      const res = await fetch('/api/mccarthy/install-skill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId, category }),
      })
      const data = (await res.json()) as { ok: boolean; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'Install failed')
      await loadStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Install failed')
    } finally {
      setOperating((prev) => {
        const next = new Set(prev)
        next.delete(skillId)
        return next
      })
    }
  }

  async function handleUninstall(skillId: string, category: string) {
    setOperating((prev) => new Set(prev).add(skillId))
    try {
      const res = await fetch('/api/mccarthy/uninstall-skill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId, category }),
      })
      const data = (await res.json()) as { ok: boolean; error?: string }
      if (!data.ok) throw new Error(data.error ?? 'Uninstall failed')
      await loadStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Uninstall failed')
    } finally {
      setOperating((prev) => {
        const next = new Set(prev)
        next.delete(skillId)
        return next
      })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading skill catalog...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-destructive">{error}</p>
        <button
          onClick={() => void loadStatus()}
          className="text-sm text-muted-foreground hover:text-foreground underline"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!status?.skills || !status.categories) return null

  const categories = status.categories.filter((cat) =>
    status.skills!.some((s) => s.category === cat.id),
  )

  const visibleSkills =
    activeCategory === 'all'
      ? status.skills
      : status.skills.filter((s) => s.category === activeCategory)

  const grouped = categories
    .filter((cat) => activeCategory === 'all' || cat.id === activeCategory)
    .map((cat) => ({
      ...cat,
      skills: visibleSkills.filter((s) => s.category === cat.id),
    }))
    .filter((g) => g.skills.length > 0)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 pt-6 pb-4 border-b border-border">
        <h1 className="text-xl font-semibold">Skill Marketplace</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Curated McCarthy OS skills for your workspace
        </p>
      </div>

      <div className="px-6 pt-4 pb-2 flex gap-2 flex-wrap border-b border-border">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeCategory === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          All ({status.skills.length})
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeCategory === cat.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-8">
        {grouped.map((group) => (
          <div key={group.id}>
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-foreground">{group.name}</h2>
              <p className="text-xs text-muted-foreground">{group.description}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {group.skills.map((skill) => {
                const busy = operating.has(skill.id)
                const meta = manifestById.get(skill.id)
                return (
                  <div
                    key={skill.id}
                    className={`rounded-lg border p-4 flex flex-col gap-3 ${
                      skill.installed
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-border bg-card'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {meta?.name ?? idToName(skill.id)}
                          </span>
                          {skill.installed && (
                            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                              Installed
                            </span>
                          )}
                        </div>
                        {meta?.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {meta.description}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground/60 mt-0.5 font-mono">
                          {skill.id}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-auto">
                      {skill.installed ? (
                        <button
                          onClick={() => void handleUninstall(skill.id, skill.category)}
                          disabled={busy}
                          className="flex-1 text-xs py-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors disabled:opacity-50"
                        >
                          {busy ? 'Removing...' : 'Uninstall'}
                        </button>
                      ) : (
                        <button
                          onClick={() => void handleInstall(skill.id, skill.category)}
                          disabled={busy}
                          className="flex-1 text-xs py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                          {busy ? 'Installing...' : 'Install'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {grouped.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-12">
            No skills in this category.
          </p>
        )}
      </div>
    </div>
  )
}
