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
