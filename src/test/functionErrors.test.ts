import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * The sentence an Edge Function wrote, surviving the trip back.
 *
 * `functions.invoke` reports every non-2xx as one generic FunctionsHttpError,
 * so what the function actually said is in the response body and nowhere else.
 * Both call sites used to throw that away and apologise generically -- which
 * mattered most in the state every new deployment starts in, with no model key
 * set: the function says exactly that, and the user was told "the assistant is
 * not answering right now" instead.
 *
 * The decoder's case was worse. It writes its own reason onto the report card
 * row before answering, and the client then overwrote it with the string form
 * of the error object -- so "take a photo of it instead" became
 * "FunctionsHttpError: Edge Function returned a non-2xx status code" in the one
 * place the screen reads it back from.
 */

const invoke = vi.fn()
/** Every patch written to `report_cards`, in order. */
const updates: Array<Record<string, unknown>> = []
const update = vi.fn((patch: Record<string, unknown>) => {
  updates.push(patch)
  return { eq: vi.fn(async () => ({ error: null })) }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    from: () => ({ update }),
  },
}))

/** An error shaped the way supabase-js shapes one: the raw Response attached. */
function httpError(body: unknown) {
  return {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(JSON.stringify(body), { status: 503 }),
  }
}

beforeEach(() => {
  invoke.mockReset()
  update.mockClear()
  updates.length = 0
})

describe('what the assistant tells you when it cannot answer', () => {
  it('repeats the function\'s own reason rather than a generic apology', async () => {
    const { supabaseSource } = await import('@/data/supabaseSource')
    invoke.mockResolvedValue({
      data: null,
      error: httpError({
        error: 'not_configured',
        message: 'The assistant has no model key set, so it cannot answer yet.',
      }),
    })
    await expect(supabaseSource.sendChatMessage('t1', 'hello'))
      .rejects.toThrow('The assistant has no model key set, so it cannot answer yet.')
  })

  it('passes the quota message through too', async () => {
    const { supabaseSource } = await import('@/data/supabaseSource')
    invoke.mockResolvedValue({
      data: null,
      error: httpError({
        error: 'quota',
        message: "That's all the assistant can answer today. It resets tomorrow.",
      }),
    })
    await expect(supabaseSource.sendChatMessage('t1', 'hello'))
      .rejects.toThrow("That's all the assistant can answer today")
  })

  it('still has something to say when the body is not readable', async () => {
    const { supabaseSource } = await import('@/data/supabaseSource')
    invoke.mockResolvedValue({
      data: null,
      // No `context` at all: a network failure rather than a refusal.
      error: { name: 'FunctionsFetchError', message: 'Failed to send a request' },
    })
    await expect(supabaseSource.sendChatMessage('t1', 'hello'))
      .rejects.toThrow('The assistant is not answering right now')
  })
})

describe('what the report card reader tells you', () => {
  it('keeps the actionable half', async () => {
    const { supabaseSource } = await import('@/data/supabaseSource')
    invoke.mockResolvedValue({
      data: null,
      error: httpError({
        error: 'This provider cannot read PDFs.',
        message: 'This provider cannot read PDFs. Take a photo of it instead.',
      }),
    })
    await expect(supabaseSource.decodeReportCard('r1'))
      .rejects.toThrow('Take a photo of it instead')
  })

  it('does not overwrite the reason the function already recorded', async () => {
    const { supabaseSource } = await import('@/data/supabaseSource')
    invoke.mockResolvedValue({
      data: null,
      error: httpError({ message: 'This provider cannot read PDFs.' }),
    })
    await expect(supabaseSource.decodeReportCard('r1')).rejects.toThrow()
    // One write, and it is the consent stamp made before anything left. The
    // row already says why it failed -- the function wrote that itself before
    // answering -- and writing over it is how the useful sentence was being
    // destroyed.
    expect(updates).toHaveLength(1)
    expect(updates[0]!.status).toBe('decoding')
  })

  it('records something when the function said nothing', async () => {
    const { supabaseSource } = await import('@/data/supabaseSource')
    invoke.mockResolvedValue({
      data: null,
      error: { name: 'FunctionsFetchError', message: 'Failed to send a request' },
    })
    await expect(supabaseSource.decodeReportCard('r1')).rejects.toThrow()
    // The consent stamp, then a failure the function never got far enough to
    // record itself. Without the second the card sits on "decoding" forever
    // with nothing to explain it.
    expect(updates).toHaveLength(2)
    expect(updates[1]!.status).toBe('failed')
    expect(String(updates[1]!.error)).not.toMatch(/FunctionsFetchError|non-2xx/)
  })
})
