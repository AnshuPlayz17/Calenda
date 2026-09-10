import { describe, expect, it } from 'vitest'
import { inlineSegments } from '@/features/assistant/richText'

/**
 * The assistant's answers are somebody else's text, and this is the only thing
 * standing between that text and the screen. The tests that matter most are
 * the ones about what it refuses to do.
 */

describe('inlineSegments', () => {
  it('renders the bold a model actually emits', () => {
    // The literal answer that exposed this: asterisks on screen.
    expect(inlineSegments('Curriculum Night is on **September 22, 2026**.')).toEqual([
      { text: 'Curriculum Night is on ' },
      { text: 'September 22, 2026', bold: true },
      { text: '.' },
    ])
  })

  it('leaves ordinary text entirely alone', () => {
    expect(inlineSegments('Nothing is due this week.')).toEqual([
      { text: 'Nothing is due this week.' },
    ])
  })

  it('handles inline code', () => {
    expect(inlineSegments('Try `ICS3U` instead.')).toEqual([
      { text: 'Try ' }, { text: 'ICS3U', code: true }, { text: ' instead.' },
    ])
  })

  it('handles several marks in one sentence', () => {
    const out = inlineSegments('**A** then **B**')
    expect(out.filter((s) => s.bold).map((s) => s.text)).toEqual(['A', 'B'])
  })

  it('leaves a lone or unclosed asterisk literal', () => {
    // Half a mark is not a mark. Swallowing it would delete a character the
    // model meant to type.
    expect(inlineSegments('2 ** 3 is eight')).toEqual([{ text: '2 ** 3 is eight' }])
    expect(inlineSegments('**unclosed')).toEqual([{ text: '**unclosed' }])
  })

  it('never spans a line break', () => {
    // An unclosed mark at the end of one line must not swallow the next.
    const out = inlineSegments('**start\nend**')
    expect(out).toEqual([{ text: '**start\nend**' }])
  })

  it('produces no markup, only text', () => {
    // The whole reason this exists rather than a markdown renderer: the model
    // is fed the user's own notes, which anyone sharing a class can write
    // into. Nothing here may ever become HTML.
    const nasty = 'look **<img src=x onerror=alert(1)>** at this'
    const out = inlineSegments(nasty)
    expect(out.find((s) => s.bold)?.text).toBe('<img src=x onerror=alert(1)>')
    // It comes back as text to be rendered as a text node, tags and all.
    expect(out.every((s) => typeof s.text === 'string')).toBe(true)
  })

  it('returns something for an empty answer', () => {
    expect(inlineSegments('')).toEqual([{ text: '' }])
  })
})
