import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDelete } from '@/components/ui/ConfirmDelete'

/**
 * "Nothing is silently merged or deleted" is one of this project's stated
 * constraints, and it had already cost a round on the notebook: a
 * hover-revealed bin, no confirmation, one mis-click, a page and everything
 * inside it gone with no undo anywhere in the app.
 *
 * That was fixed for pages and then the same control was written four more
 * times -- for a mark, an attached file, a timetable slot, and a report card
 * whose deletion also removes the uploaded document. This is the component
 * that replaced all four, so this is where the rule is held.
 */

function setup(onConfirm = vi.fn(async () => {})) {
  render(<ConfirmDelete what="the mark for “Unit 3”" onConfirm={onConfirm} />)
  return onConfirm
}

describe('a delete that asks first', () => {
  it('does nothing on the first press', async () => {
    const onConfirm = setup()
    await userEvent.click(screen.getByRole('button', { name: /delete the mark/i }))
    // The dialog is open and nothing has happened yet. This is the whole point.
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('names the thing, so the dialog is not "are you sure?"', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /delete the mark/i }))
    expect(screen.getByRole('dialog').textContent).toContain('Unit 3')
    expect(screen.getByRole('dialog').textContent).toContain('cannot be undone')
  })

  it('deletes only when the second press says so', async () => {
    const onConfirm = setup()
    await userEvent.click(screen.getByRole('button', { name: /delete the mark/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('keeps it when asked to keep it', async () => {
    const onConfirm = setup()
    await userEvent.click(screen.getByRole('button', { name: /delete the mark/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('warns that it is permanent even when there is an extra consequence', async () => {
    // The irreversibility lives in the description rather than the body for
    // exactly this reason: filling the body with it instead meant the three
    // callers with something extra to say -- a file, a shared mark, a report
    // card -- were the three that stopped being told the delete was permanent.
    render(
      <ConfirmDelete
        what="“transcript.pdf”"
        detail="The file itself is removed from storage, not just this link to it."
        onConfirm={async () => {}}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /delete/i }))
    const said = screen.getByRole('dialog').textContent ?? ''
    expect(said).toContain('cannot be undone')
    expect(said).toContain('removed from storage')
  })

  it('says the extra consequence when there is one', async () => {
    // A file's row and the file itself are different things, and deleting one
    // deletes the other. Somebody expecting to remove a link would be wrong.
    render(
      <ConfirmDelete
        what="“transcript.pdf”"
        detail="The file itself is removed from storage, not just this link to it."
        onConfirm={async () => {}}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(screen.getByRole('dialog').textContent).toContain('removed from storage')
  })
})
