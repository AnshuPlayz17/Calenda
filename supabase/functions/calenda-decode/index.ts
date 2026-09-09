/**
 * Reads a report card into rows nobody has agreed to yet.
 *
 * Deploy:  supabase functions deploy calenda-decode  (or merge)
 * Secrets: MODEL_PROVIDER, MODEL_API_KEY, optionally MODEL_VISION_NAME
 *
 * WHAT IT PRODUCES IS A PROPOSAL, NOT A RESULT
 *
 * Every line it writes lands in `report_card_lines` with decision = 'pending',
 * whatever confidence the model claimed. Nothing reaches `grades` from here.
 * The student accepts lines one at a time in the review screen, and only then
 * are marks written. That is the same rule the calendar import follows and for
 * the same reason: nothing is silently merged.
 *
 * OWNERSHIP IS CHECKED BEFORE THE FILE IS TOUCHED
 *
 * The report card row is fetched with the caller's own token, so RLS decides
 * whether they may see it. Only after that does the service role read the
 * object out of storage -- which it must, because the bucket is private and a
 * function has no signed URL of its own. Reversing that order would let anybody
 * with a uuid have somebody else's transcript read aloud to them.
 *
 * THE HONEST LIMIT: PDFs
 *
 * Reading a report card needs a model that can look at it. Gemini accepts a PDF
 * directly; the OpenAI-shaped providers (Groq included) accept images. So a
 * photograph or a screenshot works everywhere, and a PDF works only on a
 * provider that reads PDFs. When it cannot, this says so in a sentence the
 * student can act on -- "take a photo of it instead" -- rather than failing
 * with a stack trace or, worse, returning an empty reading that looks like a
 * report card with no marks on it.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const PROVIDER = (Deno.env.get('MODEL_PROVIDER') ?? 'groq').toLowerCase()
const KEY = Deno.env.get('MODEL_API_KEY') ?? ''
const VISION_MODEL = Deno.env.get('MODEL_VISION_NAME')
  ?? (PROVIDER === 'gemini' ? 'gemini-2.5-flash' : 'meta-llama/llama-4-scout-17b-16e-instruct')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const INSTRUCTION = [
  'This is a school report card. Read every subject line off it.',
  '',
  'Return ONLY a JSON array, no prose and no code fence. Each element:',
  '{"course_name": string, "course_code": string|null, "teacher": string|null,',
  ' "mark": number|null, "out_of": number|null, "letter": string|null,',
  ' "term": string|null, "remark": string|null, "confidence": number}',
  '',
  'Rules:',
  '- Copy what is printed. Do NOT correct spelling: a misread subject name is',
  '  the signal that tells the student not to trust that line.',
  '- If a mark is a percentage, mark is the number and out_of is 100.',
  '- If it is only a letter or a level, put it in letter and leave mark null.',
  '- Never invent a mark. null is a correct answer.',
  '- confidence is 0 to 1, your own honest read of how legible that line was.',
].join('\n')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'not signed in' }, 401)

  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData } = await asUser.auth.getUser()
  const user = userData?.user
  if (!user) return json({ error: 'not signed in' }, 401)

  let body: { reportCardId?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad request' }, 400)
  }
  const id = body.reportCardId
  if (!id) return json({ error: 'bad request' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const fail = async (message: string, status = 400) => {
    await admin.from('report_cards')
      .update({ status: 'failed', error: message }).eq('id', id)
    return json({ error: message }, status)
  }

  if (!KEY) return await fail('The assistant has no model key set, so nothing can be read yet.', 503)

  // RLS decides this, not us. A row the caller cannot see comes back null.
  const { data: card } = await asUser
    .from('report_cards').select('*').eq('id', id).maybeSingle()
  if (!card) return json({ error: 'not found' }, 404)

  const mime = String(card.mime_type ?? '')
  const isPdf = mime === 'application/pdf'
  if (isPdf && PROVIDER !== 'gemini') {
    return await fail(
      'This provider cannot read PDFs. Take a photo or a screenshot of the '
      + 'report card and upload that instead.',
    )
  }
  if (!isPdf && !mime.startsWith('image/')) {
    return await fail('That file is not an image or a PDF, so there is nothing to read.')
  }

  // Private bucket, so the service role is the only way to the bytes -- and it
  // only gets here after the ownership check above.
  const { data: file, error: downloadError } = await admin.storage
    .from('attachments').download(String(card.storage_path))
  if (downloadError || !file) return await fail('We could not open that file.')

  const bytes = new Uint8Array(await file.arrayBuffer())
  const base64 = encodeBase64(bytes)

  let raw: string
  try {
    raw = PROVIDER === 'gemini'
      ? await readWithGemini(base64, mime)
      : await readWithOpenAiShaped(base64, mime)
  } catch (err) {
    console.error('[calenda-decode]', String(err))
    return await fail('The model could not read that. You can add the marks by hand.')
  }

  const rows = parseRows(raw)
  if (rows.length === 0) {
    return await fail(
      'Nothing legible was found on that. A clearer photo usually fixes it, '
      + 'and you can always add marks by hand.',
    )
  }

  // Matched against the student's own classes, by name then by code. A
  // suggestion only -- `decision` stays 'pending' regardless, so a wrong match
  // costs a correction and never a wrong mark.
  const { data: classes } = await asUser
    .from('classes').select('id, name, course_code').eq('is_archived', false)

  const match = (name: string | null, code: string | null): string | null => {
    if (!classes) return null
    const n = (name ?? '').trim().toLowerCase()
    const c = (code ?? '').trim().toLowerCase()
    for (const k of classes) {
      if (c && String(k.course_code ?? '').toLowerCase() === c) return k.id as string
      if (n && String(k.name).toLowerCase() === n) return k.id as string
    }
    return null
  }

  await admin.from('report_card_lines').delete().eq('report_card_id', id)
  const { error: insertError } = await admin.from('report_card_lines').insert(
    rows.map((r) => ({
      report_card_id: id,
      owner_id: user.id,
      course_name: r.course_name ?? null,
      course_code: r.course_code ?? null,
      teacher: r.teacher ?? null,
      mark: numberOrNull(r.mark),
      out_of: numberOrNull(r.out_of),
      letter: r.letter ?? null,
      term: r.term ?? card.term ?? null,
      remark: r.remark ?? null,
      confidence: clamp01(r.confidence),
      raw: r,
      matched_class_id: match(r.course_name ?? null, r.course_code ?? null),
      decision: 'pending',
    })),
  )
  if (insertError) return await fail('We read it but could not save what we read.')

  await admin.from('report_cards').update({
    status: 'decoded',
    decoded_at: new Date().toISOString(),
    error: null,
  }).eq('id', id)

  return json({ lines: rows.length })
})

// ------------------------------------------------------------- helpers ----

type Row = {
  course_name?: string | null
  course_code?: string | null
  teacher?: string | null
  mark?: unknown
  out_of?: unknown
  letter?: string | null
  term?: string | null
  remark?: string | null
  confidence?: unknown
}

/**
 * Models are asked for bare JSON and sometimes wrap it in a fence anyway, so
 * the first `[` to the last `]` is taken rather than trusting the shape. A
 * whole decode failing because of three backticks would be an absurd way to
 * lose somebody's report card.
 */
function parseRows(text: string): Row[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return []
  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    return Array.isArray(parsed) ? parsed.filter((r) => r && typeof r === 'object') : []
  } catch {
    return []
  }
}

function numberOrNull(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

function clamp01(v: unknown): number | null {
  const n = numberOrNull(v)
  if (n === null) return null
  return Math.min(1, Math.max(0, n))
}

/** Chunked, because spreading a multi-megabyte array into String.fromCharCode
 *  overflows the call stack on a file a phone camera produces. */
function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

async function readWithOpenAiShaped(base64: string, mime: string): Promise<string> {
  const base = PROVIDER === 'groq'
    ? 'https://api.groq.com/openai/v1'
    : (Deno.env.get('MODEL_BASE_URL') ?? 'https://api.openai.com/v1')

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: INSTRUCTION },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
        ],
      }],
      max_tokens: 2000,
      temperature: 0,
    }),
  })
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`)
  const jsonBody = await res.json()
  return String(jsonBody?.choices?.[0]?.message?.content ?? '')
}

async function readWithGemini(base64: string, mime: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${VISION_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: INSTRUCTION },
            { inline_data: { mime_type: mime, data: base64 } },
          ],
        }],
        generationConfig: { maxOutputTokens: 2000, temperature: 0 },
      }),
    },
  )
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`)
  const jsonBody = await res.json()
  return String(jsonBody?.candidates?.[0]?.content?.parts?.[0]?.text ?? '')
}
