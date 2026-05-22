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
