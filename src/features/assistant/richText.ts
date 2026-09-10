/**
 * The little bit of Markdown a language model actually emits, and nothing else.
 *
 * The assistant is told to answer in two or three sentences, and it reaches for
 * `**bold**` on dates and names whether or not it is asked to. The bubble
 * rendered `message.content` as plain text, so those asterisks appeared on
 * screen -- "Curriculum Night is on **September 22, 2026**." -- which reads as
 * the app being broken rather than the model being chatty.
 *
 * WHY NOT A MARKDOWN LIBRARY
 *
 * Because the output is somebody else's text. A renderer that produces HTML
 * from model output is one prompt injection away from putting a link or an
 * image of somebody's choosing inside the app -- and the model's context is
 * this user's own notes, which anyone who shares a class can write into. This
 * returns plain segments for React to render as elements. There is no HTML
 * anywhere in the path, so there is nothing to sanitise and nothing to get
 * wrong later.
 *
 * Bold and inline code only. Everything else stays literal, which is the right
 * failure: an unhandled `_underscore_` shows as an underscore, which is what
 * the model typed and is never worse than the asterisks were.
 */

export type Segment = { text: string; bold?: boolean; code?: boolean }

/** Matches `**bold**` or `` `code` ``, non-greedy, never spanning a newline. */
const MARKS = /(\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*|`([^`\n]+?)`)/g

export function inlineSegments(input: string): Segment[] {
  const out: Segment[] = []
  let last = 0

  for (const m of input.matchAll(MARKS)) {
    const at = m.index ?? 0
    if (at > last) out.push({ text: input.slice(last, at) })

    // Group 2 is the inside of `**...**`; group 3 the inside of backticks.
    if (m[2] !== undefined) out.push({ text: m[2], bold: true })
    else if (m[3] !== undefined) out.push({ text: m[3], code: true })

    last = at + m[0].length
  }

  if (last < input.length) out.push({ text: input.slice(last) })
  // An empty answer still has to render as something rather than nothing.
  return out.length > 0 ? out : [{ text: input }]
}
