# Hermes Voice Architecture

---

## 1. Overview

The Hermes Voice feature adds fully bidirectional, hands-free voice interaction to the Hermes chat interface. It solves two distinct problems:

1. **Voice input (Speech-to-Text / STT):** The user should be able to speak a message rather than type it. Holding a button records audio, releasing it sends the recording to Groq's Whisper API for transcription, and the resulting text is automatically submitted to the agent — no typing required.

2. **Voice output (Text-to-Speech / TTS):** As the agent streams its reply, completed sentences are detected in real time and queued for audio playback via Deepgram's Aura voice synthesis API. The user hears the agent's response spoken aloud as each sentence finishes, without waiting for the full reply to complete.

Together, these two capabilities create a natural conversational loop: speak → agent thinks → hears the reply — all without touching the keyboard.

**Who it is for:** Any Hermes user who wants to interact with the AI agent by voice. Primary use cases include hands-free operation (e.g. walking, cooking, commuting), accessibility use, and a more natural dialogue-style interaction with the agent. The feature is optional and independently toggleable at runtime — STT requires browser microphone permission; TTS is gated by a toggle button in the composer toolbar that persists to localStorage.

---

## 2. Platform

**Hermes** is a full-stack web application that serves as a desktop workspace for the Hermes Agent. It provides a chat interface, multi-agent orchestration, terminal panels, file exploration, and a gateway to AI model providers (Claude, OpenAI, local Ollama models, etc.).

**Framework:** TanStack Start (v1.132.x) — a full-stack React meta-framework built on top of Vite and TanStack Router. It provides file-based routing for both client pages and server API endpoints, SSR support, and a unified TypeScript codebase for both browser and Node.js server code. API routes are defined as `createFileRoute` exports in `src/routes/api/` and run as server-side handlers.

**Runtime environment:**
- Development: `pnpm dev` (Vite dev server with HMR)
- Production: Node.js server (`node .output/server/index.mjs`) running on a VPS or local machine
- Desktop: Also packaged as an Electron app (`pnpm electron:build`) for native desktop distribution
- Containerised: Docker via `docker-compose.yml` / `docker-compose.dev.yml`

The voice feature runs entirely within this stack — no separate service, no lambda, no edge function. The two API routes (`/api/voice-transcribe` and `/api/voice-speak`) are collocated in the main Hermes Next server and proxy to third-party AI APIs using credentials that live only on the server side.

---

## 3. Tech Stack

| Technology | Role | Version (where known) |
|---|---|---|
| **TypeScript** | Primary language across all files | ^5.7.2 |
| **React** | UI component library and hook system | ^19.2.0 |
| **react-dom / flushSync** | Synchronous React state flush to prevent race conditions | ^19.2.0 |
| **TanStack Start** | Full-stack framework — SSR, file-based API routes | ^1.132.0 |
| **TanStack Router** | Client-side routing, `createFileRoute` for API endpoints | ^1.132.0 |
| **TanStack React Query** | Server state management, used in composer for model/session queries | ^5.84.1 |
| **Vite** | Build tool and dev server | ^7.3.2 |
| **pnpm** | Package manager | workspace monorepo |
| **MediaRecorder API** | Browser API — captures microphone audio as webm/opus or mp4 blobs | Web standard |
| **Web Audio API / AudioContext** | Browser API — decodes and plays MP3 audio buffers for TTS | Web standard |
| **Groq API** | Cloud STT — `whisper-large-v3-turbo` model transcribes audio to text | External |
| **Deepgram API** | Cloud TTS — `aura-athena-en` voice (or configurable) synthesises text to MP3 | External |
| **@hugeicons/core-free-icons** | Icon library providing `AiMicIcon`, `VolumeHighIcon`, `Mic01Icon` | ^3.1.1 |
| **@hugeicons/react** | React wrapper for Hugeicons (`HugeiconsIcon` component) | ^1.1.4 |
| **Tailwind CSS v4** | Utility-first CSS for all button and state styling | ^4.1.18 |
| **localStorage** | Browser storage — persists TTS enabled/disabled preference across sessions | Web standard |
| **zustand** | Global state store (used elsewhere in app; not directly in voice hooks) | ^5.0.11 |

---

## 4. Feature Summary

### Two-Way Voice: Complete UX Flow

#### Part A — Voice Input (STT, push-to-talk)

1. The user sees an **AI mic button** (`AiMicIcon`) in the chat composer. On mobile it appears inline in the composer's send-button area. On desktop it appears as a `PromptInputAction` in the toolbar row.
2. The user **holds (pointer down)** the AI mic button. `handleSttPointerDown` fires immediately, calling `groqStt.start()`.
3. `useGroqStt` delegates to `useVoiceRecorder`, which calls `navigator.mediaDevices.getUserMedia({ audio: true })`, creates a `MediaRecorder`, and begins capturing audio chunks every 100ms.
4. While recording, the button icon switches from `AiMicIcon` to `Mic01Icon` (standard mic) and pulses amber (`animate-pulse text-amber-500`). The aria-label reads "Listening… release to send".
5. The user **releases (pointer up or pointer leave)**. `handleSttPointerUp` fires, calling `groqStt.stop()` → `recorder.stop()`. The MediaRecorder fires its `onstop` event, assembles the chunks into a Blob (webm/opus preferred, mp4 fallback), and invokes the `onRecorded` callback only if: (a) the blob is non-empty and (b) the recording lasted more than 500ms (to avoid submitting accidental taps).
6. `useGroqStt`'s `handleRecorded` callback fires. State transitions to `processing`. The button icon stays as `Mic01Icon` with a processing aria-label. A `FormData` object is built with the audio blob appended as `'audio'`.
7. A `POST` request is sent to `/api/voice-transcribe` with the FormData body.
8. The server route receives the request, checks authentication (`isAuthenticated`), extracts the blob, repackages it into a new FormData with filename `audio.webm` and model `whisper-large-v3-turbo` and language `en`, then POSTs to `https://api.groq.com/openai/v1/audio/transcriptions`.
9. Groq returns a JSON `{ text: "..." }`. The server returns `{ text, duration_ms }` to the browser.
10. Back in `useGroqStt`, the `onResult` callback fires with the transcript string.
11. In `ChatComposer`, the `onResult` callback runs **`flushSync`** to force React to commit `setValue(trimmed)` and `persistDraft(trimmed)` synchronously before calling `handleSubmitRef.current()`. This is critical — without `flushSync`, React batches the state update and `handleSubmit` executes before the textarea value is updated, submitting an empty message.
12. The message is submitted to the agent exactly as if the user had typed it and pressed Send.
13. STT state returns to `idle`; the button icon reverts to `AiMicIcon`.

#### Part B — Voice Output (TTS, sentence streaming)

1. The user sees a **speaker toggle button** (`VolumeHighIcon`) in the desktop composer toolbar. It is coloured primary-blue when TTS is enabled, neutral-grey when disabled. The state is read from `localStorage` key `voice_tts_enabled` on mount, defaulting to `true` (enabled) if no stored value exists.
2. Clicking the speaker button calls `ttsToggle` → `useVoiceTts.toggle()`. If toggling off, any active playback is stopped immediately. The new state is persisted to `localStorage`.
3. When the user submits a message, `onStarted` fires in `ChatScreen`. This calls `ttsStop()` (clearing any in-progress speech from the previous turn) and resets `spokenUpToRef.current = 0`.
4. As the agent's reply streams in, `onChunk(_delta, fullText)` fires on every SSE chunk with the full accumulated text so far.
5. Inside `onChunk`, if `ttsEnabledRef.current` is true, the code slices `fullText` from `spokenUpToRef.current` to get the **unprocessed portion**. It then runs a regex `/[.!?]+\s+/g` over that unprocessed portion to find sentence boundaries.
6. For each detected complete sentence, `cleanForTts(sentence)` is called. This function: strips fenced code blocks, strips inline code, unwraps bold/italic markers (keeping the text), strips ATX headers and list markers and blockquotes, strips URLs and markdown links (keeping the label text), normalises whitespace, and then applies an **alpha-ratio filter**: if fewer than 45% of characters in the cleaned string are alphabetic letters, the string is considered technical noise (a cron expression, a file path, a shell command, etc.) and an empty string is returned, causing the sentence to be skipped entirely.
7. Sentences that survive `cleanForTts` and are longer than 2 characters are passed to `ttsEnqueue(clean)`.
8. `spokenUpToRef.current` is advanced by `prevEnd` (the number of characters consumed from the unprocessed slice), so the next chunk call picks up exactly where this one left off.
9. `useVoiceTts.enqueue(text)` pushes the sentence onto `queueRef.current`. If the queue was previously idle (`processingRef.current === false`), it sets the flag and calls `playNext()`.
10. `playNext()` shifts the first item off the queue, creates an `AudioContext` if one does not exist, POSTs to `/api/voice-speak` with `{ text }`, receives raw MP3 bytes as an `ArrayBuffer`, decodes them via `AudioContext.decodeAudioData`, creates an `AudioBufferSourceNode`, connects it to `ctx.destination`, sets `source.onended` to call `playNext()` again, and calls `source.start()`. This creates a seamless chain: each sentence begins playing the moment the previous one finishes.
11. If TTS is toggled off (or playback is manually stopped), `stop()` clears the queue, sets `processingRef.current = false`, calls `source.stop()` on any currently-playing node, and sets `isPlaying` to false.
12. When the stream **completes** (`onComplete` fires), any remaining text that did not end with a sentence-boundary punctuation mark (e.g. a final sentence ending with no trailing space) is flushed: `cleanForTts(fullText.slice(spokenUpToRef.current).trim())` is computed and enqueued if non-trivial. Then `spokenUpToRef.current` is reset to 0 for the next turn.

---

## 5. Prerequisites

### Accounts and API Keys

#### Groq (Speech-to-Text)
- **What it is:** Groq provides ultra-fast inference on Whisper models via an OpenAI-compatible REST API.
- **Where to get a key:** https://console.groq.com — sign up, go to API Keys, create a new key.
- **Environment variable:** `GROQ_API_KEY`
- **Used in:** `src/routes/api/voice-transcribe.ts` (server-side only, never exposed to browser)
- **Model used:** `whisper-large-v3-turbo` (fastest high-quality Whisper variant available on Groq)
- **Cost:** As of build time, Groq offers a generous free tier for audio transcription.

#### Deepgram (Text-to-Speech)
- **What it is:** Deepgram Aura is a real-time text-to-speech API that returns raw MP3 audio data over HTTP.
- **Where to get a key:** https://console.deepgram.com — sign up, create a project, generate an API key.
- **Environment variables:**
  - `DEEPGRAM_API_KEY` — required; the secret token sent as `Authorization: Token <key>`
  - `DEEPGRAM_VOICE` — optional; defaults to `aura-athena-en` if not set. Can be any valid Deepgram Aura voice model string (e.g. `aura-orion-en`, `aura-luna-en`).
- **Used in:** `src/routes/api/voice-speak.ts` (server-side only)
- **Cost:** Deepgram has a free tier with monthly character limits; paid plans beyond that.

### Environment Variables Summary

| Variable | Required | Default | Description |
|---|---|---|---|
| `GROQ_API_KEY` | Yes (for STT) | — | Groq API secret key for Whisper transcription |
| `DEEPGRAM_API_KEY` | Yes (for TTS) | — | Deepgram API secret key for Aura TTS |
| `DEEPGRAM_VOICE` | No | `aura-athena-en` | Deepgram Aura voice model ID |

These must be set in the server environment. In development, add them to a `.env` file at the workspace root (Vite/TanStack Start picks up `.env` files automatically via `dotenv`). In production, set them as environment variables on the VPS, in Docker via `environment:` in `docker-compose.yml`, or via the hosting platform's secret management.

### Browser Permissions

- **Microphone access:** The browser will prompt for microphone permission the first time the user activates push-to-talk. This is handled natively by `navigator.mediaDevices.getUserMedia`. No additional configuration is needed. If the user denies permission, `useVoiceRecorder` catches the error and calls `onError` with "Microphone access denied", which surfaces as a toast.
- **AudioContext:** Modern browsers require a user gesture before creating an `AudioContext`. Because TTS is triggered by the user receiving a response to a message they explicitly submitted, the AudioContext creation inside `playNext` is always downstream of a user interaction and will not be blocked.

### Packages

All required packages are already listed in `package.json`. No additional `pnpm add` commands are needed beyond those already installed. The relevant packages for voice are:

- `@hugeicons/core-free-icons` ^3.1.1 — for `AiMicIcon`, `VolumeHighIcon`, `Mic01Icon`
- `@hugeicons/react` ^1.1.4 — for `HugeiconsIcon` renderer
- React 19 and react-dom (already a core dependency) — `flushSync` comes from `react-dom`

No native Node.js packages, no WebRTC libraries, no additional audio processing packages are required. All audio capture is through the browser's native `MediaRecorder` and `AudioContext` APIs.

---

## 6. Architecture Diagram (ASCII)

```
VOICE INPUT (STT) FLOW
======================

User holds AI mic button
        |
        v
handleSttPointerDown()
        |
        v
useGroqStt.start()
        |
        v
useVoiceRecorder.start()
        |
        v
navigator.mediaDevices.getUserMedia({ audio: true })
        |
        v
MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
  recorder.start(100)   ← chunk every 100ms
        |
        |  [user releases button]
        v
handleSttPointerUp() → useGroqStt.stop() → recorder.stop()
        |
        v
recorder.onstop fires
  new Blob(chunks, { type: mimeType })
  only if: blob.size > 0 && duration > 500ms
        |
        v
useGroqStt handleRecorded(blob)
  setState('processing')
  FormData { audio: blob }
        |
        v
POST /api/voice-transcribe   (multipart/form-data)
        |
        v
[SERVER: voice-transcribe.ts]
  isAuthenticated(request) check
  reads GROQ_API_KEY from process.env
  repackages FormData:
    file: blob (as 'audio.webm')
    model: 'whisper-large-v3-turbo'
    language: 'en'
        |
        v
POST https://api.groq.com/openai/v1/audio/transcriptions
        |
        v
Groq returns { text: "transcribed speech here" }
        |
        v
Server returns JSON { text, duration_ms }
        |
        v
Browser receives { text }
        |
        v
onResult(text) callback fires in ChatComposer
        |
        v
flushSync(() => {
  setValue(trimmed)       ← React state updated synchronously
  persistDraft(trimmed)
})
        |
        v
handleSubmitRef.current()   ← submits message to agent
        |
        v
[normal chat submission flow]


VOICE OUTPUT (TTS) FLOW
========================

Agent SSE stream begins
        |
        v
onStarted() in ChatScreen
  ttsStop()               ← clears any previous turn's audio
  spokenUpToRef.current = 0
        |
        v
  [for each SSE chunk]
        |
        v
onChunk(_delta, fullText) in ChatScreen
  if (!ttsEnabledRef.current) return
        |
        v
  unprocessed = fullText.slice(spokenUpToRef.current)
  regex: /[.!?]+\s+/g  ← find sentence boundaries
        |
        v
  for each complete sentence found:
    cleanForTts(sentence)
      - strip ``` code blocks
      - strip `inline code`
      - unwrap **bold** / *italic* / __under__ / _em_
      - strip # headers, - list markers, > blockquotes
      - strip [link](url) → keep label; strip bare URLs
      - normalise whitespace
      - alpha-ratio filter: if alpha/total < 0.45 → return ''
        |
        v
    if clean.length > 2:
      ttsEnqueue(clean)
        |
        v
  spokenUpToRef.current += prevEnd
        |
        v
useVoiceTts.enqueue(text)
  if (!enabled || !text.trim()) return
  queueRef.current.push(text)
  if (!processingRef.current):
    processingRef.current = true
    playNext()
        |
        v
playNext()
  text = queueRef.current.shift()
  audioContextRef.current = new AudioContext()  [created once, reused]
        |
        v
POST /api/voice-speak
  body: { text }
        |
        v
[SERVER: voice-speak.ts]
  isAuthenticated(request) check
  reads DEEPGRAM_API_KEY, DEEPGRAM_VOICE from process.env
  voiceId = voice ?? DEEPGRAM_VOICE ?? 'aura-athena-en'
        |
        v
POST https://api.deepgram.com/v1/speak?model=aura-athena-en&encoding=mp3
  body: { text }
        |
        v
Deepgram returns: raw MP3 bytes (audio/mpeg)
        |
        v
Server returns: Response(audioBuffer, { 'Content-Type': 'audio/mpeg' })
        |
        v
Browser receives ArrayBuffer (MP3 bytes)
        |
        v
ctx.decodeAudioData(arrayBuffer) → AudioBuffer
        |
        v
source = ctx.createBufferSource()
source.buffer = audioBuffer
source.connect(ctx.destination)   ← speaker output
source.onended = () => playNext() ← chain to next sentence
source.start()
        |
        v
[user hears sentence]
        |
        v
[next sentence in queue plays]
        |  ... repeats until queue empty ...
        v
processingRef.current = false
setIsPlaying(false)


ON STREAM COMPLETE
==================

onComplete(completedMessage) in ChatScreen
  if ttsEnabledRef.current:
    remaining = cleanForTts(fullText.slice(spokenUpToRef.current).trim())
    if remaining.length > 2: ttsEnqueue(remaining)
  spokenUpToRef.current = 0


USER TOGGLES TTS OFF
=====================

VolumeHighIcon button → onClick → onTtsToggle → ttsToggle()
  setEnabled(false)
  stop() → queueRef.current = []
         → processingRef.current = false
         → source.stop()
         → setIsPlaying(false)
  localStorage.setItem('voice_tts_enabled', 'false')
```

---

## 7. Files Created

The following files are **net-new** additions to the Hermes workspace — they did not exist before the voice feature was built.

---

### File 1: `src/routes/api/voice-transcribe.ts`

**Purpose:** Server-side API route that acts as an authenticated proxy to the Groq Whisper STT API. Keeps the `GROQ_API_KEY` on the server; the browser never sees it.

**Complete code:**

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'

export const Route = createFileRoute('/api/voice-transcribe')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const apiKey = process.env.GROQ_API_KEY
        if (!apiKey) {
          return json({ error: 'GROQ_API_KEY not configured' }, { status: 503 })
        }

        const formData = await request.formData()
        const audio = formData.get('audio') as Blob | null

        const outForm = new FormData()
        outForm.append('file', audio as Blob, 'audio.webm')
        outForm.append('model', 'whisper-large-v3-turbo')
        outForm.append('language', 'en')

        const start = Date.now()

        const groqRes = await fetch(
          'https://api.groq.com/openai/v1/audio/transcriptions',
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}` },
            body: outForm,
          },
        )

        const duration_ms = Date.now() - start
        console.log(`[voice-transcribe] STT: ${duration_ms}ms`)

        if (!groqRes.ok) {
          const errText = await groqRes.text().catch(() => groqRes.statusText)
          return json({ error: errText }, { status: 500 })
        }

        const { text } = (await groqRes.json()) as { text: string }
        return json({ text, duration_ms })
      },
    },
  },
})
```

---

### File 2: `src/routes/api/voice-speak.ts`

**Purpose:** Server-side API route that acts as an authenticated proxy to the Deepgram Aura TTS API. Returns raw MP3 bytes with `Content-Type: audio/mpeg`. The `DEEPGRAM_API_KEY` never leaves the server.

**Complete code:**

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'

export const Route = createFileRoute('/api/voice-speak')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const apiKey = process.env.DEEPGRAM_API_KEY
        if (!apiKey) {
          return json({ error: 'TTS service not configured' }, { status: 503 })
        }

        const { text, voice } = await request.json()

        if (!text || typeof text !== 'string' || text.trim().length === 0) {
          return json({ error: 'text is required' }, { status: 400 })
        }

        const voiceId = voice ?? process.env.DEEPGRAM_VOICE ?? 'aura-athena-en'
        const url = `https://api.deepgram.com/v1/speak?model=${voiceId}&encoding=mp3`

        const start = Date.now()

        const upstream = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Token ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text }),
        })

        if (!upstream.ok) {
          return json({ error: 'TTS failed' }, { status: 502 })
        }

        const audioBuffer = await upstream.arrayBuffer()
        const duration_ms = Date.now() - start

        console.log(`[voice-speak] TTS: ${duration_ms}ms ${text.length} chars`)

        return new Response(audioBuffer, {
          headers: { 'Content-Type': 'audio/mpeg' },
        })
      },
    },
  },
})
```

---

### File 3: `src/hooks/use-voice-recorder.ts`

**Purpose:** Low-level browser hook wrapping the `MediaRecorder` API. Handles microphone permission, audio capture, chunk assembly, maximum recording duration enforcement, and cleanup. Intentionally knows nothing about STT or TTS — it just records audio and returns a Blob.

**Complete code:**

```typescript
'use client'

import { useCallback, useRef, useState } from 'react'

type RecorderState = 'idle' | 'recording' | 'processing'

type UseVoiceRecorderOptions = {
  /** Max recording duration in ms. Default: 120000 (2 min) */
  maxDurationMs?: number
  /** Called with the recorded audio blob + duration */
  onRecorded?: (blob: Blob, durationMs: number) => void
  onError?: (error: string) => void
}

type UseVoiceRecorderReturn = {
  state: RecorderState
  isRecording: boolean
  isSupported: boolean
  durationMs: number
  start: () => void
  stop: () => void
}

export function useVoiceRecorder(
  options: UseVoiceRecorderOptions = {},
): UseVoiceRecorderReturn {
  const { maxDurationMs = 120_000, onRecorded, onError } = options
  const [state, setState] = useState<RecorderState>('idle')
  const [durationMs, setDurationMs] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Array<Blob>>([])
  const startTimeRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const callbacksRef = useRef({ onRecorded, onError })
  callbacksRef.current = { onRecorded, onError }

  const isSupported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current)
      maxTimerRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      setState('idle')
      return
    }
    recorder.stop()
    // Stream tracks cleanup
    recorder.stream.getTracks().forEach((t) => t.stop())
    cleanup()
  }, [cleanup])

  const start = useCallback(async () => {
    if (!isSupported) {
      callbacksRef.current.onError?.('Audio recording not supported')
      return
    }

    // Stop any existing recording
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
      recorderRef.current.stream.getTracks().forEach((t) => t.stop())
    }
    cleanup()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // Prefer webm/opus, fall back to whatever is available
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4'

      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      startTimeRef.current = Date.now()
      setDurationMs(0)

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        setState('processing')
        const blob = new Blob(chunksRef.current, { type: mimeType })
        const duration = Date.now() - startTimeRef.current
        chunksRef.current = []
        recorderRef.current = null
        setState('idle')

        if (blob.size > 0 && duration > 500) {
          callbacksRef.current.onRecorded?.(blob, duration)
        }
      }

      recorder.onerror = () => {
        callbacksRef.current.onError?.('Recording failed')
        setState('idle')
        cleanup()
      }

      recorderRef.current = recorder
      recorder.start(100) // collect chunks every 100ms
      setState('recording')

      // Duration counter
      timerRef.current = setInterval(() => {
        setDurationMs(Date.now() - startTimeRef.current)
      }, 100)

      // Max duration auto-stop
      maxTimerRef.current = setTimeout(() => {
        stop()
      }, maxDurationMs)
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Microphone access denied'
      callbacksRef.current.onError?.(msg)
      setState('idle')
    }
  }, [isSupported, cleanup, stop, maxDurationMs])

  return {
    state,
    isRecording: state === 'recording',
    isSupported,
    durationMs,
    start,
    stop,
  }
}
```

---

### File 4: `src/hooks/use-groq-stt.ts`

**Purpose:** Mid-level hook that composes `useVoiceRecorder` with the `/api/voice-transcribe` fetch. Manages the overall STT state machine (`idle → recording → processing → idle/error`) and calls the consumer's `onResult` callback when a transcript is ready.

**Complete code:**

```typescript
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
```

---

### File 5: `src/hooks/use-voice-tts.ts`

**Purpose:** Complete TTS playback engine. Manages the audio queue, fetches MP3 audio from `/api/voice-speak` per sentence, plays sentences sequentially using the Web Audio API (`AudioContext`), handles interruption and cleanup, and persists the enabled/disabled toggle to `localStorage`.

**Complete code:**

```typescript
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
```

---

## 8. Files Modified

The following existing files were modified to integrate the voice feature.

---

### File 1: `src/screens/chat/chat-screen.tsx`

**What changed and why:**

Three distinct modifications were made to this file:

1. **Import added:** `useVoiceTts` was imported from `@/hooks/use-voice-tts`.
2. **`cleanForTts` function added:** A module-level utility function was added to strip markdown and technical noise before any text reaches the TTS engine. This is defined at module scope (not inside the component) because it is a pure function with no closure dependencies.
3. **TTS wiring inside the component:** `useVoiceTts()` is instantiated; `ttsEnabledRef` and `spokenUpToRef` refs are created; `onChunk`, `onStarted`, and `onComplete` callbacks are extended to drive TTS; and `ttsEnabled` / `ttsToggle` are passed down to `ChatComposer` via props.

**Relevant code sections (complete, as they exist in the file):**

Import (line 55):
```typescript
import { useVoiceTts } from '@/hooks/use-voice-tts'
```

`cleanForTts` function (lines 163–195):
```typescript
/**
 * Strip markdown and technical noise before passing text to TTS.
 * Returns empty string when the fragment is pure code/commands so the
 * caller can skip it (cron expressions, file paths, shell snippets, etc.).
 */
function cleanForTts(raw: string): string {
  let t = raw
  // Remove fenced code blocks entirely
  t = t.replace(/```[\s\S]*?```/g, ' ')
  // Remove inline code
  t = t.replace(/`[^`\n]+`/g, ' ')
  // Unwrap bold / italic (keep the text)
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '$1')
  t = t.replace(/\*([^*\n]+)\*/g, '$1')
  t = t.replace(/__([^_\n]+)__/g, '$1')
  t = t.replace(/_([^_\n]+)_/g, '$1')
  // Strip ATX headers, list markers, blockquotes
  t = t.replace(/^#{1,6}\s+/gm, '')
  t = t.replace(/^[ \t]*[-*+>]\s+/gm, '')
  t = t.replace(/^[ \t]*\d+[.)]\s+/gm, '')
  // Strip URLs and markdown links (keep label text)
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  t = t.replace(/https?:\/\/[^\s)>\]]+/g, '')
  // Normalise whitespace
  t = t.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
  // Reject fragments where < 45 % of characters are letters — these are
  // almost always technical strings (cron expressions, paths, commands).
  if (t.length > 4) {
    const alpha = (t.match(/[a-zA-Z]/g) ?? []).length
    if (alpha / t.length < 0.45) return ''
  }
  return t
}
```

Inside the `ChatScreen` component — TTS hook instantiation and refs (lines 1066–1080):
```typescript
const {
  enabled: ttsEnabled,
  enqueue: ttsEnqueue,
  stop: ttsStop,
  toggle: ttsToggle,
} = useVoiceTts()

// Ref so onChunk (a stable useCallback) can always read the current ttsEnabled
// without being recreated every time the user toggles voice.
const ttsEnabledRef = useRef(ttsEnabled)
ttsEnabledRef.current = ttsEnabled

// Tracks how many characters of the streaming response have already been
// enqueued for TTS so we don't re-speak text on each chunk event.
const spokenUpToRef = useRef(0)
```

`onChunk` callback (lines 1115–1131):
```typescript
onChunk: useCallback((_delta: string, fullText: string) => {
  if (!ttsEnabledRef.current) return
  // Detect sentence boundaries in the unprocessed portion of the stream.
  // Enqueue each completed sentence immediately so audio starts within ~1s
  // of the first sentence arriving — matching the test-build behaviour.
  const unprocessed = fullText.slice(spokenUpToRef.current)
  const re = /[.!?]+\s+/g
  let match
  let prevEnd = 0
  while ((match = re.exec(unprocessed)) !== null) {
    const sentence = unprocessed.slice(prevEnd, match.index + 1).trim()
    prevEnd = match.index + match[0].length
    const clean = cleanForTts(sentence)
    if (clean.length > 2) ttsEnqueue(clean)
  }
  spokenUpToRef.current += prevEnd
}, [ttsEnqueue]),
```

`onStarted` callback (lines 1132–1150):
```typescript
onStarted: useCallback(
  ({ runId }: { runId: string | null }) => {
    // Stop any TTS from the previous turn before the new stream begins
    ttsStop()
    spokenUpToRef.current = 0
    const activeSend = activeSendRef.current
    if (!activeSend?.clientId) return
    updateHistoryMessageByClientIdEverywhere(
      queryClient,
      activeSend.clientId,
      // ... (existing optimistic update logic unchanged)
    )
    setSending(false)
  },
  [queryClient, ttsStop],
),
```

`onComplete` callback — TTS flush section (lines 1152–1180):
```typescript
onComplete: useCallback((completedMessage: ChatMessage) => {
  const activeSend = activeSendRef.current
  if (activeSend?.clientId) {
    updateHistoryMessageByClientIdEverywhere(
      queryClient,
      activeSend.clientId,
      // ... (existing update logic unchanged)
    )
  }
  // Play notification sound if the user opted in (Settings → Chat).
  if (useChatSettingsStore.getState().settings.soundOnChatComplete) {
    playChatComplete()
  }
  // Flush any remaining text that didn't end with a sentence boundary
  if (ttsEnabledRef.current) {
    const fullText = textFromMessage(completedMessage)
    const remaining = cleanForTts(fullText.slice(spokenUpToRef.current).trim())
    if (remaining.length > 2) ttsEnqueue(remaining)
  }
  spokenUpToRef.current = 0
}, [queryClient, streamFinish, ttsEnqueue]),
```

`ChatComposer` JSX props (lines 2851–2852):
```tsx
ttsEnabled={ttsEnabled}
onTtsToggle={ttsToggle}
```

---

### File 2: `src/screens/chat/components/chat-composer.tsx`

**What changed and why:**

Five distinct modifications were made to the composer:

1. **Imports added:** `AiMicIcon`, `VolumeHighIcon` from `@hugeicons/core-free-icons`; `useGroqStt` from `@/hooks/use-groq-stt`; `useVoiceRecorder` from `@/hooks/use-voice-recorder`; `flushSync` from `react-dom`.
2. **Props added:** `ttsEnabled?: boolean` and `onTtsToggle?: () => void` added to `ChatComposerProps`.
3. **Hook instantiation:** `useGroqStt` instantiated with the `onResult` callback that uses `flushSync` + `handleSubmitRef`. `useVoiceRecorder` instantiated for voice-note long-press (separate from STT). `handleSttPointerDown` / `handleSttPointerUp` handlers created.
4. **Mobile AI mic button:** In the mobile composer layout, before the send button, an inline `<button>` with `onPointerDown`/`onPointerUp`/`onPointerLeave` shows the AI mic with live state feedback.
5. **Desktop toolbar buttons:** In the desktop `PromptInputActions` row — a `VolumeHighIcon` toggle (only rendered if `onTtsToggle` is provided) and an `AiMicIcon` `PromptInputAction` (only rendered if `groqStt.isSupported`).

**Relevant code sections (complete, as they exist in the file):**

Imports (lines 1–13, 54–55):
```typescript
import { createPortal, flushSync } from 'react-dom'
import {
  Add01Icon,
  AiMicIcon,
  ArrowDown01Icon,
  ArrowUp02Icon,
  AttachmentIcon,
  Cancel01Icon,
  Delete01Icon,
  Mic01Icon,
  StopIcon,
  VolumeHighIcon,
} from '@hugeicons/core-free-icons'
// ...
import { useGroqStt } from '@/hooks/use-groq-stt'
import { useVoiceRecorder } from '@/hooks/use-voice-recorder'
```

Props type (lines 100–101):
```typescript
ttsEnabled?: boolean
onTtsToggle?: () => void
```

Destructured props with defaults (lines 807–808):
```typescript
ttsEnabled = true,
onTtsToggle,
```

Hook instantiation — STT (lines 1633–1649):
```typescript
// Voice input (tap = Groq STT → auto-submit)
const groqStt = useGroqStt({
  onResult: useCallback(
    (text: string) => {
      if (!text.trim()) return
      const trimmed = text.trim()
      // flushSync forces React to commit the value update synchronously so
      // handleSubmitRef.current closes over the new value before we call it.
      flushSync(() => {
        setValue(trimmed)
        persistDraft(trimmed)
      })
      handleSubmitRef.current()
    },
    [persistDraft],
  ),
})
```

Hook instantiation — voice recorder for voice notes (lines 1651–1686):
```typescript
// Voice recorder (long-press = voice note)
const voiceRecorder = useVoiceRecorder({
  onRecorded: useCallback(
    (blob: Blob, durationMs: number) => {
      const ext = blob.type.includes('webm') ? 'webm' : 'mp4'
      const name = `voice-note-${Date.now()}.${ext}`
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : ''
        if (!dataUrl) return
        const secs = Math.round(durationMs / 1000)
        // ... (attaches voice note as audio attachment to composer)
      }
      reader.readAsDataURL(blob)
    },
    [persistDraft],
  ),
})
```

Push-to-talk handlers (lines 1688–1698):
```typescript
// Push-to-talk handlers for the AI mic (STT) button
const handleSttPointerDown = useCallback(() => {
  if (!groqStt.isListening && !groqStt.isProcessing) {
    groqStt.start()
  }
}, [groqStt])
const handleSttPointerUp = useCallback(() => {
  if (groqStt.isListening) {
    groqStt.stop()
  }
}, [groqStt])
```

Long-press handlers for voice-note mic (lines 1700–1721):
```typescript
// Long-press detection for voice-note mic button (voice note only)
const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
const isLongPressRef = useRef(false)
const handleMicPointerDown = useCallback(() => {
  isLongPressRef.current = false
  if (!voiceRecorder.isRecording) {
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true
      voiceRecorder.start()
    }, 800)
  }
}, [voiceRecorder])
const handleMicPointerUp = useCallback(() => {
  if (longPressTimerRef.current) {
    clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = null
  }
  if (isLongPressRef.current) {
    voiceRecorder.stop()
    isLongPressRef.current = false
  }
}, [voiceRecorder])
```

Mobile AI mic button JSX (lines 2172–2200):
```tsx
) : groqStt.isSupported ? (
  <button
    type="button"
    onPointerDown={handleSttPointerDown}
    onPointerUp={handleSttPointerUp}
    onPointerLeave={handleSttPointerUp}
    aria-label={
      groqStt.isListening
        ? 'Listening… release to send'
        : groqStt.isProcessing
          ? 'Processing…'
          : 'Hold to talk'
    }
    className={cn(
      'flex h-9 w-9 items-center justify-center rounded-full transition-colors select-none',
      groqStt.isListening || groqStt.isProcessing
        ? 'text-amber-500 bg-amber-50 animate-pulse'
        : 'text-primary-500 bg-neutral-100 dark:bg-white/10',
    )}
  >
    <HugeiconsIcon
      icon={groqStt.isListening || groqStt.isProcessing ? Mic01Icon : AiMicIcon}
      size={20}
      strokeWidth={1.5}
    />
  </button>
) : (
```

Desktop TTS speaker toggle + AI mic PromptInputAction (lines 2881–2939):
```tsx
{onTtsToggle ? (
  <PromptInputAction tooltip={ttsEnabled ? 'Voice responses on' : 'Voice responses off'}>
    <Button
      type="button"
      onClick={onTtsToggle}
      size="icon-sm"
      variant="ghost"
      className={cn(
        'rounded-lg transition-colors',
        ttsEnabled
          ? 'text-primary-500 hover:bg-primary-100 dark:hover:bg-primary-800'
          : 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/10',
      )}
      aria-label={ttsEnabled ? 'Voice responses on — click to mute' : 'Voice responses off — click to enable'}
    >
      <HugeiconsIcon icon={VolumeHighIcon} size={20} strokeWidth={1.5} />
    </Button>
  </PromptInputAction>
) : null}
{groqStt.isSupported ? (
  <PromptInputAction
    tooltip={
      groqStt.isListening
        ? 'Listening…'
        : groqStt.isProcessing
          ? 'Processing…'
          : 'Hold to talk'
    }
  >
    <Button
      onPointerDown={handleSttPointerDown}
      onPointerUp={handleSttPointerUp}
      onPointerLeave={handleSttPointerUp}
      size="icon-sm"
      variant="ghost"
      className={cn(
        'rounded-lg transition-colors select-none',
        groqStt.isListening
          ? 'text-amber-500 bg-amber-50 animate-pulse dark:bg-amber-900/30'
          : groqStt.isProcessing
            ? 'text-amber-400 animate-pulse'
            : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/10',
      )}
      aria-label={
        groqStt.isListening
          ? 'Listening… release to send'
          : groqStt.isProcessing
            ? 'Processing…'
            : 'Hold to talk'
      }
      disabled={disabled}
    >
      <HugeiconsIcon
        icon={groqStt.isListening || groqStt.isProcessing ? Mic01Icon : AiMicIcon}
        size={20}
        strokeWidth={1.5}
      />
    </Button>
  </PromptInputAction>
```

---

## 9. Key Design Decisions

### 1. Server-side API proxy instead of calling Groq/Deepgram directly from the browser

**Decision:** Both `/api/voice-transcribe` and `/api/voice-speak` are server routes that proxy to the third-party APIs.

**Why:** API keys (`GROQ_API_KEY`, `DEEPGRAM_API_KEY`) must never be exposed in client-side JavaScript bundles. A server proxy also allows centralized authentication (`isAuthenticated` check), rate limiting in the future, and the ability to swap providers without any client code changes.

**Alternative rejected:** Calling Groq/Deepgram directly from the browser with a public key. Rejected because this exposes the key in the bundle and allows any visitor to consume the account's quota.

---

### 2. flushSync instead of setTimeout to bridge transcript → submit

**Decision:** `flushSync(() => { setValue(trimmed); persistDraft(trimmed) })` is called synchronously before `handleSubmitRef.current()`.

**Why:** The original naive approach was to call `setValue(trimmed)` and then `setTimeout(() => handleSubmitRef.current(), 0)`. This appeared to work in some cases but introduced a race condition: React 18+ and React 19 batch state updates, and there is no guarantee that a `setTimeout(0)` fires after React has committed the state update to the DOM and the internal state closure. In practice, `handleSubmit` was reading the old (empty) textarea value and submitting a blank message.

`flushSync` is the React-sanctioned escape hatch that forces all pending state updates to be committed synchronously before returning. After `flushSync` returns, `handleSubmitRef.current` is guaranteed to close over the correct updated value.

**Caveat:** `flushSync` is a synchronous DOM commit — it cannot be called inside an existing render cycle. In this case it is called inside an async callback (`onResult`) which runs outside of React's render loop, so it is safe.

---

### 3. Sentence streaming for TTS instead of full-response TTS

**Decision:** TTS begins as soon as the first complete sentence is detected in the stream, not after the full agent reply arrives.

**Why:** Waiting for the full reply to arrive before starting TTS would mean the user sits in silence for potentially 10–30 seconds for a long response. Starting audio after the first sentence (which typically arrives within 1–3 seconds of the model starting) makes the interaction feel conversational and natural. The audio queue ensures sentences play in order and seamlessly chain one to the next.

**Trade-off:** This adds complexity — the `spokenUpToRef` cursor, the regex boundary detection, and the `onComplete` flush are all necessary to handle the streaming correctly. The alternative (buffer entire response, call TTS once) would be dramatically simpler but would destroy the user experience.

---

### 4. Sentence boundary detection by regex on fullText, not per-delta

**Decision:** `onChunk` receives both `_delta` (the new characters in this chunk) and `fullText` (all text so far). The regex runs on `fullText.slice(spokenUpToRef.current)` rather than on `_delta`.

**Why:** SSE deltas can be arbitrarily small — a single character, a word, half a word. Punctuation and the following space that signals a sentence boundary can arrive in separate chunks. Running the regex only on `_delta` would miss boundaries that span chunk boundaries. Running on the full accumulated text from the cursor forward guarantees correctness regardless of chunk size.

---

### 5. spokenUpToRef as a character cursor, not a sentence counter

**Decision:** `spokenUpToRef.current` tracks the number of characters of `fullText` that have already been enqueued, not the number of sentences.

**Why:** It needs to be an absolute character position in `fullText` so that slicing is safe across any number of chunks. A sentence counter would require re-counting sentences on every chunk which is O(n) per chunk. The character cursor is O(1) to apply and only the unprocessed slice needs to be scanned.

---

### 6. alpha-ratio filter (< 45% alphabetic characters → skip)

**Decision:** After all markdown stripping, if fewer than 45% of the characters in the cleaned string are ASCII letters, the string is discarded and not sent to TTS.

**Why:** Agent responses frequently include technical content — cron expressions (`0 */6 * * *`), file paths (`/var/log/nginx/access.log`), shell commands (`npm install --save-dev`), JSON fragments, IP addresses, etc. These are nonsensical when spoken aloud and would produce jarring audio. The 45% threshold was calibrated empirically: normal English prose typically has 70–85% alpha ratio; purely technical strings typically fall below 30%; the 45% threshold cleanly separates them with minimal false positives or negatives.

---

### 7. Push-to-talk (hold) instead of tap-toggle for STT

**Decision:** The AI mic button uses `onPointerDown` / `onPointerUp` / `onPointerLeave` for push-to-talk, not a toggle on click.

**Why:** Push-to-talk is a more reliable interaction pattern for voice input because:
- It eliminates the need for manual "stop recording" — the user just releases the button.
- It prevents accidentally leaving the microphone active.
- It mirrors the mental model users have from walkie-talkies, push-to-talk apps, and Discord.
- `onPointerLeave` as a secondary stop ensures recording stops if the user's finger/cursor slides off the button without releasing.

**Why pointer events over mouse events:** `onPointerDown`/`onPointerUp` fire for both mouse and touch, making the implementation work identically on mobile and desktop. `onMouseDown`/`onMouseUp` do not fire on touch devices.

---

### 8. Language pinned to English (`language: 'en'`)

**Decision:** The `voice-transcribe` route hard-codes `language: 'en'` in the Groq FormData.

**Why:** Whisper's auto-detection mode occasionally misidentifies short English utterances as other languages (most commonly French, Spanish, or Malay) when the audio is brief or contains proper nouns. Pinning to `en` eliminates this class of errors entirely at the cost of non-English speech being transcribed with lower quality (Whisper will still attempt transcription but force phonemic mapping to English). For a predominantly English-language product, this is the correct trade-off. If the product needs multi-language support in the future, this constant should be made a per-user preference.

---

### 9. Single AudioContext, reused across all sentences

**Decision:** `audioContextRef` stores one `AudioContext` instance that is created lazily on the first TTS call and reused for all subsequent sentences in a session.

**Why:** `AudioContext` is a heavyweight browser resource. Creating a new one per sentence would be wasteful and could trigger browser resource limits. The single instance is connected to the system audio output and remains open for the lifetime of the component. It is properly closed in the `useEffect` cleanup when the `ChatScreen` component unmounts.

---

### 10. onPointerLeave as tertiary stop for STT

**Decision:** `onPointerLeave={handleSttPointerUp}` is added alongside `onPointerUp`.

**Why:** If the user presses the button, then drags their cursor off it without releasing the mouse button, `onPointerUp` never fires. Without `onPointerLeave`, the recorder would be left running with no obvious way to stop it. Adding `onPointerLeave` ensures the recording stops whenever the pointer leaves the button's bounding box.

---

### 11. 500ms minimum recording duration filter

**Decision:** In `useVoiceRecorder`, `onRecorded` is only called if `duration > 500`. Short recordings are silently discarded.

**Why:** Accidental taps that do not constitute intentional speech produce very short recordings. Groq's Whisper model will still attempt to transcribe silence or noise, often returning hallucinated text (common Whisper artifacts include "Thank you." or "Bye." for short silent recordings). The 500ms threshold filters out taps that are too short to be intentional voice input.

---

### 12. TTS enabled by default, persisted to localStorage

**Decision:** TTS defaults to `true` (enabled) on first load. The toggle state is persisted under the key `voice_tts_enabled`.

**Why:** Defaulting to enabled surfaces the feature to users who have not explicitly configured it, making it discoverable. Persisting to localStorage means the choice survives page reloads and browser restarts without requiring a backend settings sync. The `readStoredEnabled` function safely handles the server-side rendering case by checking `typeof window === 'undefined'` and returning `true` as the SSR default.

---

## 10. How to Add to a Fresh Hermes Workspace

These instructions assume you are starting from a clean Hermes workspace repository that does not yet have the voice feature.

### Step 1: Obtain API keys

1. Create a Groq account at https://console.groq.com and generate an API key. Copy the key value.
2. Create a Deepgram account at https://console.deepgram.com and generate an API key. Copy the key value.

### Step 2: Set environment variables

Add the following to your `.env` file at the workspace root (create it if it does not exist):

```
GROQ_API_KEY=gsk_your_groq_key_here
DEEPGRAM_API_KEY=your_deepgram_key_here
DEEPGRAM_VOICE=aura-athena-en
```

`DEEPGRAM_VOICE` is optional. Remove it to use the default `aura-athena-en`, or set it to any Deepgram Aura voice model ID you prefer.

For production (VPS / Docker), set these as server environment variables in your deployment environment rather than committing them to the `.env` file. The Docker compose file's `environment:` block is the appropriate place.

### Step 3: Create the server API routes

Create `src/routes/api/voice-transcribe.ts` with the complete code shown in Section 7, File 1.

Create `src/routes/api/voice-speak.ts` with the complete code shown in Section 7, File 2.

Both files follow the TanStack Start file-route convention. TanStack Router's Vite plugin automatically discovers them and registers the routes — no manual route registration is required.

### Step 4: Create the client hooks

Create `src/hooks/use-voice-recorder.ts` with the complete code shown in Section 7, File 3.

Create `src/hooks/use-groq-stt.ts` with the complete code shown in Section 7, File 4.

Create `src/hooks/use-voice-tts.ts` with the complete code shown in Section 7, File 5.

### Step 5: Modify chat-screen.tsx

Open `src/screens/chat/chat-screen.tsx`.

5a. Add this import near the other hook imports (around line 55):
```typescript
import { useVoiceTts } from '@/hooks/use-voice-tts'
```

5b. Add the `cleanForTts` function at module scope (before the component function definition, after all imports):
```typescript
function cleanForTts(raw: string): string {
  let t = raw
  t = t.replace(/```[\s\S]*?```/g, ' ')
  t = t.replace(/`[^`\n]+`/g, ' ')
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '$1')
  t = t.replace(/\*([^*\n]+)\*/g, '$1')
  t = t.replace(/__([^_\n]+)__/g, '$1')
  t = t.replace(/_([^_\n]+)_/g, '$1')
  t = t.replace(/^#{1,6}\s+/gm, '')
  t = t.replace(/^[ \t]*[-*+>]\s+/gm, '')
  t = t.replace(/^[ \t]*\d+[.)]\s+/gm, '')
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  t = t.replace(/https?:\/\/[^\s)>\]]+/g, '')
  t = t.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
  if (t.length > 4) {
    const alpha = (t.match(/[a-zA-Z]/g) ?? []).length
    if (alpha / t.length < 0.45) return ''
  }
  return t
}
```

5c. Inside the `ChatScreen` component body, after `useStreamingMessage` or similar streaming hook calls, add:
```typescript
const {
  enabled: ttsEnabled,
  enqueue: ttsEnqueue,
  stop: ttsStop,
  toggle: ttsToggle,
} = useVoiceTts()

const ttsEnabledRef = useRef(ttsEnabled)
ttsEnabledRef.current = ttsEnabled

const spokenUpToRef = useRef(0)
```

5d. In the `onStarted` callback, add at the beginning of the callback body:
```typescript
ttsStop()
spokenUpToRef.current = 0
```
And add `ttsStop` to the dependency array.

5e. In the `onChunk` callback, add:
```typescript
if (!ttsEnabledRef.current) return
const unprocessed = fullText.slice(spokenUpToRef.current)
const re = /[.!?]+\s+/g
let match
let prevEnd = 0
while ((match = re.exec(unprocessed)) !== null) {
  const sentence = unprocessed.slice(prevEnd, match.index + 1).trim()
  prevEnd = match.index + match[0].length
  const clean = cleanForTts(sentence)
  if (clean.length > 2) ttsEnqueue(clean)
}
spokenUpToRef.current += prevEnd
```
And add `ttsEnqueue` to the dependency array.

5f. In the `onComplete` callback, before resetting `spokenUpToRef`, add:
```typescript
if (ttsEnabledRef.current) {
  const fullText = textFromMessage(completedMessage)
  const remaining = cleanForTts(fullText.slice(spokenUpToRef.current).trim())
  if (remaining.length > 2) ttsEnqueue(remaining)
}
spokenUpToRef.current = 0
```
And add `ttsEnqueue` to the dependency array.

5g. Find the `<ChatComposer` JSX element and add the two new props:
```tsx
ttsEnabled={ttsEnabled}
onTtsToggle={ttsToggle}
```

### Step 6: Modify chat-composer.tsx

Open `src/screens/chat/components/chat-composer.tsx`.

6a. Add to the existing import from `@hugeicons/core-free-icons`:
```typescript
AiMicIcon,
VolumeHighIcon,
Mic01Icon,
```

6b. Add `flushSync` to the existing import from `react-dom`:
```typescript
import { createPortal, flushSync } from 'react-dom'
```

6c. Add hook imports:
```typescript
import { useGroqStt } from '@/hooks/use-groq-stt'
import { useVoiceRecorder } from '@/hooks/use-voice-recorder'
```

6d. Add to `ChatComposerProps` type:
```typescript
ttsEnabled?: boolean
onTtsToggle?: () => void
```

6e. Add to the component function's destructured props with defaults:
```typescript
ttsEnabled = true,
onTtsToggle,
```

6f. Add inside the component body (after `handleSubmitRef` is declared):
```typescript
// Always-current ref to handleSubmit — setTimeout callback reads this after React flushes
const handleSubmitRef = useRef(handleSubmit)
handleSubmitRef.current = handleSubmit

const groqStt = useGroqStt({
  onResult: useCallback(
    (text: string) => {
      if (!text.trim()) return
      const trimmed = text.trim()
      flushSync(() => {
        setValue(trimmed)
        persistDraft(trimmed)
      })
      handleSubmitRef.current()
    },
    [persistDraft],
  ),
})

const handleSttPointerDown = useCallback(() => {
  if (!groqStt.isListening && !groqStt.isProcessing) {
    groqStt.start()
  }
}, [groqStt])

const handleSttPointerUp = useCallback(() => {
  if (groqStt.isListening) {
    groqStt.stop()
  }
}, [groqStt])
```

6g. In the mobile composer JSX, find the send button area and add the mobile AI mic button JSX immediately before the send button:
```tsx
{groqStt.isSupported ? (
  <button
    type="button"
    onPointerDown={handleSttPointerDown}
    onPointerUp={handleSttPointerUp}
    onPointerLeave={handleSttPointerUp}
    aria-label={
      groqStt.isListening
        ? 'Listening… release to send'
        : groqStt.isProcessing
          ? 'Processing…'
          : 'Hold to talk'
    }
    className={cn(
      'flex h-9 w-9 items-center justify-center rounded-full transition-colors select-none',
      groqStt.isListening || groqStt.isProcessing
        ? 'text-amber-500 bg-amber-50 animate-pulse'
        : 'text-primary-500 bg-neutral-100 dark:bg-white/10',
    )}
  >
    <HugeiconsIcon
      icon={groqStt.isListening || groqStt.isProcessing ? Mic01Icon : AiMicIcon}
      size={20}
      strokeWidth={1.5}
    />
  </button>
) : null}
```

6h. In the desktop `PromptInputActions` toolbar, add the TTS toggle and AI mic `PromptInputAction` elements:
```tsx
{onTtsToggle ? (
  <PromptInputAction tooltip={ttsEnabled ? 'Voice responses on' : 'Voice responses off'}>
    <Button
      type="button"
      onClick={onTtsToggle}
      size="icon-sm"
      variant="ghost"
      className={cn(
        'rounded-lg transition-colors',
        ttsEnabled
          ? 'text-primary-500 hover:bg-primary-100 dark:hover:bg-primary-800'
          : 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/10',
      )}
      aria-label={ttsEnabled ? 'Voice responses on — click to mute' : 'Voice responses off — click to enable'}
    >
      <HugeiconsIcon icon={VolumeHighIcon} size={20} strokeWidth={1.5} />
    </Button>
  </PromptInputAction>
) : null}
{groqStt.isSupported ? (
  <PromptInputAction
    tooltip={
      groqStt.isListening
        ? 'Listening…'
        : groqStt.isProcessing
          ? 'Processing…'
          : 'Hold to talk'
    }
  >
    <Button
      onPointerDown={handleSttPointerDown}
      onPointerUp={handleSttPointerUp}
      onPointerLeave={handleSttPointerUp}
      size="icon-sm"
      variant="ghost"
      className={cn(
        'rounded-lg transition-colors select-none',
        groqStt.isListening
          ? 'text-amber-500 bg-amber-50 animate-pulse dark:bg-amber-900/30'
          : groqStt.isProcessing
            ? 'text-amber-400 animate-pulse'
            : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/10',
      )}
      aria-label={
        groqStt.isListening
          ? 'Listening… release to send'
          : groqStt.isProcessing
            ? 'Processing…'
            : 'Hold to talk'
      }
      disabled={disabled}
    >
      <HugeiconsIcon
        icon={groqStt.isListening || groqStt.isProcessing ? Mic01Icon : AiMicIcon}
        size={20}
        strokeWidth={1.5}
      />
    </Button>
  </PromptInputAction>
) : null}
```

### Step 7: Verify TypeScript

Run the TypeScript compiler to check for errors:
```bash
pnpm exec tsc --noEmit
```

Resolve any type errors before proceeding.

### Step 8: Start development server and test

```bash
pnpm dev
```

Navigate to the chat screen and verify the voice buttons appear. Test STT and TTS per the testing checklist in Section 12.

### Step 9: Deploy

Follow the normal Hermes deployment process:
- Commit changes to a working branch
- Push to remote — CI/CD picks up and deploys
- Verify the environment variables are set in the production environment before the build lands

---

## 11. Gotchas and Known Issues

### Gotcha 1: The race condition between React state and handleSubmit (the flushSync issue)

**What happened:** The first implementation used `setTimeout(() => handleSubmitRef.current(), 0)` after calling `setValue(trimmed)`. In local testing this appeared to work. In practice, especially on fast machines and in React 19's concurrent mode, `handleSubmit` was executing before React had committed the state update, and the submitted message was blank.

**Why it happened:** React 19 batches state updates aggressively. `setValue(trimmed)` schedules a state update but does not immediately apply it. A `setTimeout(fn, 0)` does not guarantee that React's flush cycle has completed before `fn` runs — the scheduler may interleave them differently depending on the current rendering workload.

**How it was resolved:** Replaced `setTimeout` with `flushSync(() => { setValue(trimmed); persistDraft(trimmed) })`. `flushSync` forces React to synchronously commit all pending state updates before returning, guaranteeing that `handleSubmitRef.current()` sees the updated state.

---

### Gotcha 2: Groq Whisper detecting the wrong language for short utterances

**What happened:** During testing with short English phrases (under 3 seconds), Groq's Whisper model in auto-detect mode occasionally returned the transcript in French or Spanish, or produced gibberish phonemic output. The phrase "set a timer for five minutes" was transcribed as "Set a time pour cinq minutes" in one test.

**Why it happened:** Whisper's language detection relies on statistical patterns in the audio. Very short utterances provide insufficient signal for reliable language identification. Common English sounds (particularly short vowels and consonants) overlap with several Romance languages, causing the model to occasionally make incorrect language assignments.

**How it was resolved:** Hard-coded `language: 'en'` in the `voice-transcribe` route's FormData. Groq's Whisper implementation honours the `language` parameter and forces phonemic mapping to English, eliminating the misdetection entirely.

---

### Gotcha 3: Safari's AudioContext requiring a user gesture

**What happened:** In Safari, creating an `AudioContext` outside of a direct user gesture synchronous call stack throws a `NotAllowedError` or silently produces an audio context in the `suspended` state that never plays audio.

**Why it happened:** Safari's autoplay policy requires that audio playback be initiated within a synchronous user gesture handler (e.g., a click handler's immediate call stack). Async callbacks downstream of user gestures may or may not be accepted depending on Safari's heuristics.

**How it is handled:** `useVoiceTts` creates the `AudioContext` lazily inside `playNext()`, which is only called after a message has been submitted (a user gesture) and the first sentence has completed (a downstream async event). In practice this works because the TTS chain is always initiated by the user submitting a message. If Safari issues arise, the AudioContext creation can be moved into the send-button click handler directly and passed via ref.

---

### Gotcha 4: onPointerLeave not firing on mobile in some cases

**What happened:** On some mobile browsers, `onPointerLeave` does not fire reliably when a touch point moves off an element — particularly when the user lifts their finger while it is already slightly off the button.

**Why it happened:** Touch event semantics differ from pointer event semantics on mobile. A `touchend` always fires on the element the touch started on, regardless of where the finger is when released. A `pointerleave` during a touch may not fire in the same circumstances as a `mouseleave`.

**Mitigation:** `onPointerUp` fires reliably on both desktop and mobile because it fires on the element that captured the pointer (i.e. the element where `pointerdown` occurred), regardless of current position. `onPointerLeave` is therefore a supplementary safety net for the desktop case where the cursor slides off the button. For mobile, `onPointerUp` is the primary stop trigger and works correctly.

---

### Gotcha 5: MediaRecorder mimeType compatibility across browsers

**What happened:** `audio/webm;codecs=opus` is not supported on Safari/iOS. Attempting to create a `MediaRecorder` with an unsupported mimeType throws a `NotSupportedError`.

**How it is handled:** `useVoiceRecorder` uses `MediaRecorder.isTypeSupported()` to probe support in order of preference: `audio/webm;codecs=opus` → `audio/webm` → `audio/mp4`. The filename sent to Groq is always `audio.webm` regardless of actual format, because Groq identifies format from the audio stream header, not the filename. Groq handles all three formats correctly.

---

### Gotcha 6: Sending very short recordings causing Whisper hallucinations

**What happened:** Accidental taps (< 200ms) and very short recordings (< 500ms) were being sent to Groq. Whisper regularly returns hallucinated text for near-silent recordings — most commonly "Thank you.", "Thank you for watching.", or "Bye." — which would then be auto-submitted as messages.

**How it was resolved:** Added a `duration > 500` guard in `useVoiceRecorder`'s `onstop` handler. Recordings under 500ms are discarded silently. This 500ms threshold is conservative enough to prevent accidental taps while still being responsive for intentional quick utterances.

---

### Gotcha 7: TTS continuing to speak after the user sends a new message

**What happened:** During early testing, if a user sent a second message while the agent's first response was still being spoken, the TTS queue continued playing the first response's remaining sentences while the second response's sentences were also added. The user heard an overlapping mess of two responses.

**How it was resolved:** Added `ttsStop()` at the start of the `onStarted` callback in `ChatScreen`. Every time a new streaming run begins, the current TTS playback is halted, the queue is cleared, and `spokenUpToRef.current` is reset to 0. The new response starts with a clean slate.

---

### Gotcha 8: Code blocks and technical strings being spoken aloud

**What happened:** Agent responses that included code examples caused the TTS engine to attempt to vocalise backtick-wrapped code, fenced code blocks, URLs, cron expressions, and file paths. This produced nonsensical audio output.

**How it was resolved:** The `cleanForTts` function strips all fenced and inline code blocks before passing text to TTS. Additionally, the alpha-ratio filter (< 45% alphabetic characters → discard) catches residual technical strings that survive the regex cleaning (cron expressions, file paths, shell arguments, etc.).

---

### Gotcha 9: spokenUpToRef being reset to 0 at onComplete causing the final sentence to be re-spoken

**What happened:** In an early version, `spokenUpToRef.current = 0` was placed at the top of `onComplete`. The flush that sends the remaining text used `spokenUpToRef.current` which by that point was already 0, causing the entire response to be re-enqueued to TTS, not just the remainder.

**How it was resolved:** The flush (`const remaining = cleanForTts(fullText.slice(spokenUpToRef.current).trim())`) is now computed before the reset, and `spokenUpToRef.current = 0` is the last line of the `onComplete` callback, not the first. Order is critical here.

---

## 12. Testing Checklist

Use this checklist to verify each part of the voice feature works correctly after adding it to a fresh workspace.

### Environment setup verification

- [ ] `GROQ_API_KEY` is set in the environment. Verify by running the server and checking that `pnpm dev` starts without env warnings.
- [ ] `DEEPGRAM_API_KEY` is set in the environment.
- [ ] Both API keys are valid (not expired, not revoked). Test by hitting the endpoints directly (see below).

### API route verification — STT

- [ ] Record a short audio file (or use any `.webm` file) and POST it to `/api/voice-transcribe`:
  ```bash
  curl -X POST http://localhost:3000/api/voice-transcribe \
    -F "audio=@test-audio.webm" \
    -H "Cookie: your_session_cookie_here"
  ```
  Expected response: `{ "text": "...", "duration_ms": ... }`
- [ ] Without a valid session cookie, confirm the endpoint returns `401 Unauthorized`.
- [ ] Without `GROQ_API_KEY` set, confirm the endpoint returns `503`.

### API route verification — TTS

- [ ] POST a JSON body to `/api/voice-speak`:
  ```bash
  curl -X POST http://localhost:3000/api/voice-speak \
    -H "Content-Type: application/json" \
    -H "Cookie: your_session_cookie_here" \
    -d '{"text": "Hello, this is a test of the voice system."}' \
    --output test.mp3
  ```
  Expected: `test.mp3` is created and is a valid MP3 file that plays back speech.
- [ ] Without a valid session cookie, confirm the endpoint returns `401 Unauthorized`.
- [ ] POST with an empty `text` field. Confirm the endpoint returns `400`.

### STT browser behaviour

- [ ] Open the chat screen. The AI mic button (`AiMicIcon`) appears in the composer toolbar (desktop) and in the mobile send area (mobile).
- [ ] On a browser that does not support `MediaRecorder` (e.g. some older environments), confirm the AI mic button does not render (`groqStt.isSupported` is false).
- [ ] Hold the AI mic button. Confirm the browser shows a microphone permission prompt (first time only).
- [ ] After granting permission, hold the button. Confirm the button icon switches to `Mic01Icon` and pulses amber.
- [ ] Speak a short phrase. Release the button. Confirm the button transitions through amber pulse (processing) and then returns to the `AiMicIcon` state.
- [ ] Confirm the spoken phrase appears in the chat input and is auto-submitted as a message.
- [ ] Confirm that denying microphone permission shows a toast error and the button returns to idle state.
- [ ] Tap the button (less than 500ms). Confirm nothing is submitted (accidental tap filter working).

### TTS browser behaviour

- [ ] Open the chat screen (desktop). Confirm the `VolumeHighIcon` speaker button appears in the composer toolbar.
- [ ] Confirm the speaker button is coloured primary-blue by default (TTS enabled by default).
- [ ] Click the speaker button. Confirm it turns grey (TTS disabled). Reload the page. Confirm it stays grey (localStorage persistence).
- [ ] Click again. Confirm it turns blue (TTS re-enabled).
- [ ] With TTS enabled, send a message to the agent. Confirm audio playback begins within a few seconds of the agent starting to respond.
- [ ] Confirm the audio plays sentence by sentence, chaining seamlessly.
- [ ] Confirm that code blocks in the agent response are not spoken aloud.
- [ ] Confirm that cron expressions, file paths, and other technical strings are not spoken aloud.
- [ ] Send a second message while the first response is still being spoken. Confirm the first response's speech stops immediately and the second response begins speaking once it starts streaming.
- [ ] With TTS disabled, send a message. Confirm no audio plays.

### End-to-end voice conversation test

- [ ] Enable TTS (speaker button blue).
- [ ] Hold the AI mic button and ask "What is two plus two?"
- [ ] Release the button. Confirm the question is transcribed and submitted automatically.
- [ ] Confirm the agent responds and the response is spoken aloud ("Four" or similar).
- [ ] The full loop completes without errors: speak → transcript → submit → agent reply → speech.

### Console and error checking

- [ ] Open browser DevTools console during all tests. Confirm no uncaught errors appear.
- [ ] Check server logs for `[voice-transcribe] STT: Xms` and `[voice-speak] TTS: Xms X chars` log lines appearing on each STT and TTS call respectively.
- [ ] Confirm that closing and reopening the chat tab does not leave any microphone stream tracks open (check browser's active microphone indicator in the OS/browser chrome).
