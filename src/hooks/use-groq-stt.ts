'use client'

import { useCallback, useRef, useState } from 'react'
import { useVoiceRecorder } from './use-voice-recorder'

type SttState = 'idle' | 'recording' | 'processing' | 'error'

type UseGroqSttOptions = {
  onResult?: (text: string) => void
  onError?: (error: string) => void
}

type UseGroqSttReturn = {
  state: SttState
  isListening: boolean
  isProcessing: boolean
  isSupported: boolean
  transcript: string
  start: () => void
  stop: () => void
  toggle: () => void
}

export function useGroqStt(options: UseGroqSttOptions = {}): UseGroqSttReturn {
  const [state, setState] = useState<SttState>('idle')
  const [transcript, setTranscript] = useState('')

  const callbacksRef = useRef(options)
  callbacksRef.current = options

  const handleRecorded = useCallback(async (blob: Blob) => {
    setState('processing')

    try {
      const formData = new FormData()
      formData.append('audio', blob)

      const res = await fetch('/api/voice-transcribe', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        throw new Error(`Transcription request failed: ${res.status}`)
      }

      const { text } = (await res.json()) as { text: string }

      setTranscript(text)
      setState('idle')
      callbacksRef.current.onResult?.(text)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transcription failed'
      setState('error')
      callbacksRef.current.onError?.(msg)
    }
  }, [])

  const handleError = useCallback((error: string) => {
    setState('error')
    callbacksRef.current.onError?.(error)
  }, [])

  const recorder = useVoiceRecorder({
    onRecorded: handleRecorded,
    onError: handleError,
  })

  const start = useCallback(() => {
    setState('recording')
    recorder.start()
  }, [recorder])

  const stop = useCallback(() => {
    recorder.stop()
  }, [recorder])

  const toggle = useCallback(() => {
    if (state === 'recording') {
      stop()
    } else {
      start()
    }
  }, [state, start, stop])

  return {
    state,
    isListening: state === 'recording',
    isProcessing: state === 'processing',
    isSupported: recorder.isSupported,
    transcript,
    start,
    stop,
    toggle,
  }
}
