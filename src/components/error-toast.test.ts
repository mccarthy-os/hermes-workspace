import { describe, expect, it } from 'vitest'

import { classifyError } from './error-toast'

describe('classifyError', () => {
  it('surfaces gateway session-continuity auth failures before generic auth errors', () => {
    expect(
      classifyError(
        'OpenAI-compatible chat: 403 {"error":{"message":"Session continuation requires API key authentication"}}',
      ),
    ).toBe(
      'Gateway session continuity needs API auth — set HERMES_API_TOKEN to match API_SERVER_KEY, then restart Workspace and the Hermes gateway',
    )
  })

  it('keeps generic unauthorized errors mapped to the general auth message', () => {
    expect(classifyError('401 Unauthorized')).toBe(
      'Authentication error — check your API key in Settings',
    )
  })
})
