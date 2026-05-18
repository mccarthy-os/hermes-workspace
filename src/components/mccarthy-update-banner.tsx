'use client'

import { useEffect, useState } from 'react'

const DISMISS_KEY = 'mccarthy-update-dismissed'
const POLL_INTERVAL = 30 * 60 * 1000 // 30 minutes

interface UpdateStatus {
  available: boolean
  latest?: string
  commit_message?: string
}

export function McCarthyUpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [applying, setApplying] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const checkStatus = async () => {
    try {
      const res = await fetch('/api/mccarthy/update-status')
      if (res.ok) {
        const data: UpdateStatus = await res.json()
        setStatus(data)
        // Reset dismissed state if the latest sha changed (new commit since last dismiss)
        if (data.latest) {
          const savedSha = localStorage.getItem(DISMISS_KEY)
          if (savedSha !== data.latest) setDismissed(false)
        }
      }
    } catch {
      // Network error — banner stays hidden; no console noise on intentional offline use
    }
  }

  useEffect(() => {
    checkStatus()
    const id = setInterval(checkStatus, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [])

  if (!status?.available || dismissed) return null

  const handleDismiss = () => {
    if (status.latest) localStorage.setItem(DISMISS_KEY, status.latest)
    setDismissed(true)
  }

  const handleUpdate = async () => {
    setApplying(true)
    try {
      const res = await fetch('/api/mccarthy/update-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        // Service is restarting — 8s delay accounts for dev server startup time
        setTimeout(() => window.location.reload(), 8_000)
      } else {
        setApplying(false)
      }
    } catch {
      setApplying(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: '#1a1a2e',
        color: '#e0e0e0',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderBottom: '1px solid #333',
        fontSize: '14px',
      }}
    >
      <span style={{ flex: 1 }}>
        McCarthy OS update available: {status.commit_message ?? 'new version'}
      </span>
      {applying ? (
        <span>Updating... (~30s)</span>
      ) : (
        <>
          <button
            onClick={handleDismiss}
            style={{ padding: '4px 12px', cursor: 'pointer' }}
          >
            Dismiss
          </button>
          <button
            onClick={handleUpdate}
            style={{ padding: '4px 12px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Update Now
          </button>
        </>
      )}
    </div>
  )
}
