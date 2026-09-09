/**
 * One place that knows how to ask a model something.
 *
 * Provider-agnostic on purpose. The owner's first choice (Gemini) turned out to
 * be unavailable to him, and swapping to Groq had to be a change of one
 * environment variable rather than a rewrite. `MODEL_PROVIDER` picks the
 * adapter, `MODEL_API_KEY` is the credential, and nothing above this file knows
 * which one answered.
 *
 * WHAT THIS FILE REFUSES TO DO
 *
 * It never invents an answer when there is no key. `configured()` is false and
 * the caller says so plainly. A chat box that produces plausible text with no
 * model behind it is the exact thing this project's rules forbid -- never fake
 * a feature to look complete.
 */

export type Provider = 'groq' | 'gemini' | 'openai-compatible'

const PROVIDER = (Deno.env.get('MODEL_PROVIDER') ?? 'groq').toLowerCase() as Provider
const KEY = Deno.env.get('MODEL_API_KEY') ?? ''
/** Overridable so a model can be changed without a deploy of this file. */
const MODEL = Deno.env.get('MODEL_NAME') ?? ''
/** Only used by 'openai-compatible', for a provider not listed here. */
const BASE = Deno.env.get('MODEL_BASE_URL') ?? ''

const DEFAULT_MODEL: Record<Provider, string> = {
  groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-2.5-flash',
  'openai-compatible': 'gpt-4o-mini',
}

export function configured(): boolean {
  return KEY.length > 0
}

export function providerName(): string {
  return PROVIDER
}

export type Ask = {
  system: string
  user: string
  /** Hard ceiling on the reply, so one question cannot spend the day's tokens. */
  maxTokens?: number
}

/**
 * Ask, and get text back.
 *
 * Throws on anything that is not a usable answer. The caller turns that into a
 * saved message carrying an error rather than a missing message, because a
 * reply that failed halfway should be visible as a failure.
 */
export async function ask({ system, user, maxTokens = 700 }: Ask): Promise<string> {
  if (!configured()) throw new Error('no model key configured')

  if (PROVIDER === 'gemini') return askGemini(system, user, maxTokens)
  return askOpenAiShaped(system, user, maxTokens)
}

/** Groq speaks the OpenAI chat-completions shape, and so do most others. */
async function askOpenAiShaped(system: string, user: string, maxTokens: number): Promise<string> {
  const base = PROVIDER === 'groq'
    ? 'https://api.groq.com/openai/v1'
    : (BASE || 'https://api.openai.com/v1')

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL || DEFAULT_MODEL[PROVIDER],
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature: 0.2,
    }),
  })

  if (!res.ok) {
    // The provider's own message, trimmed. A rate limit and a bad key are very
    // different problems and "the assistant failed" tells the owner neither.
    const body = await res.text().catch(() => '')
    throw new Error(`model ${res.status}: ${body.slice(0, 300)}`)
  }

  const json = await res.json()
  const text = json?.choices?.[0]?.message?.content
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('model returned nothing')
  }
  return text.trim()
}

async function askGemini(system: string, user: string, maxTokens: number): Promise<string> {
  const model = MODEL || DEFAULT_MODEL.gemini
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 },
      }),
    },
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`model ${res.status}: ${body.slice(0, 300)}`)
  }

  const json = await res.json()
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('model returned nothing')
  }
  return text.trim()
}
