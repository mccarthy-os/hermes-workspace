'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type UseVoiceTtsOptions = {
  storageKey?: string
}

type UseVoiceTtsReturn = {
  enabled: boolean
  isPlaying: boolean
  play: (text: string) => void
  enqueue: (text: string) => void
  stop: () => void
  toggle: () => void
}

function readStoredEnabled(key: string): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem(key) !== 'false'
}

export function useVoiceTts(
  options: UseVoiceTtsOptions = {},
): UseVoiceTtsReturn {
  const { storageKey = 'voice_tts_enabled' } = options

  const [enabled, setEnabled] = useState<boolean>(() =>
    readStoredEnabled(storageKey),
  )
  const [isPlaying, setIsPlaying] = useState(false)

  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const queueRef = useRef<string[]>([])
  const processingRef = useRef(false)

  const stop = useCallback(() => {
    queueRef.current = []
    processingRef.current = false
    if (sourceRef.current) {
      try {
        sourceRef.current.stop()
      } catch {
        // may already be stopped
      }
      sourceRef.current = null
    }
    setIsPlaying(false)
  }, [])

  // Fetch audio for one sentence and play it; when done, advance the queue
  const playNext = useCallback(async () => {
    if (queueRef.current.length === 0) {
      processingRef.current = false
      setIsPlaying(false)
      return
    }

    const text = queueRef.current.shift()!

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext()
      }
      const ctx = audioContextRef.current

      const response = await fetch('/api/voice-speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })

      if (!response.ok) {
        console.error('[useVoiceTts] fetch failed:', response.status, response.statusText)
        if (processingRef.current) void playNext()
        return
      }

      const arrayBuffer = await response.arrayBuffer()

      if (!processingRef.current) return // stopped while fetching

      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)

      if (!processingRef.current) return // stopped while decoding

      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)
      source.onended = () => {
        sourceRef.current = null
        void playNext()
      }

      sourceRef.current = source
      setIsPlaying(true)
      source.start()
    } catch (err) {
      console.error('[useVoiceTts] playback error:', err)
      if (processingRef.current) void playNext()
    }
  }, [])

  // Add a sentence to the queue; start playing if idle
  const enqueue = useCallback(
    (text: string) => {
      if (!enabled || !text.trim()) return
      queueRef.current.push(text.trim())
      if (!processingRef.current) {
        processingRef.current = true
        void playNext()
      }
    },
    [enabled, playNext],
  )

  // Interrupt current playback and play a single piece of text immediately
  const play = useCallback(
    (text: string) => {
      if (!enabled || !text.trim()) return
      stop()
      queueRef.current = [text.trim()]
      processingRef.current = true
      void playNext()
    },
    [enabled, stop, playNext],
  )

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev
      if (!next) stop()
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, String(next))
      }
      return next
    })
  }, [storageKey, stop])

  useEffect(() => {
    return () => {
      stop()
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
        audioContextRef.current = null
      }
    }
  }, [stop])

  return { enabled, isPlaying, enqueue, play, stop, toggle }
}
