import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, CalendarPlus, Check, Copy, Megaphone, RefreshCw, Users,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { ConfirmDelete } from '@/components/ui/ConfirmDelete'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  useAnnounceToGroup, useCloseJoinCode, useGroupAnnouncements, useGroupEvents,
  useGroupMembers, useGroupProgress, usePublishGroupEvent, useRemoveGroupMember,
  useRotateJoinCode, useTeachingGroups,
} from '@/features/teaching/queries'
import { useSchoolYear } from '@/features/schoolYear/SchoolYearProvider'
import { agendaLabel, todayPlain } from '@/lib/datetime'

/**
 * One class, from the teacher's side.
 *
 * Four things on one page rather than four tabs: the code, who is in it, the
 * dates, and what has been said. A teacher opening this is answering one of
 * exactly those four questions and a tab bar would make three of them a click
 * away from an answer they can see.
 */
export function TeachingGroup() {
  const { groupId = '' } = useParams()
  const { current } = useSchoolYear()
  const { data: groups = [], isLoading } = useTeachingGroups(current?.id)
  const group = groups.find((g) => g.id === groupId)

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6">
        <Skeleton className="h-40" />
      </div>
    )
  }

  if (!group) {
    return (
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6">
        <EmptyState
          icon={Users}
          title="That class is not here"
          description="It may have been archived, or it was never yours."
          action={<Link to="/app/teaching"><Button variant="secondary">Back to your classes</Button></Link>}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6">
      <Link
        to="/app/teaching"
        className="inline-flex items-center gap-1.5 text-[13px] text-text-muted hover:text-text"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Classes you teach
      </Link>

      <h1 className="mt-3 text-xl font-semibold tracking-tight text-text">{group.name}</h1>
      <p className="mt-1 text-[13px] text-text-muted">
        {[group.subject, group.room].filter(Boolean).join(' · ') || 'No subject set'}
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <JoinCode groupId={groupId} code={group.join_code} />
          <Roster groupId={groupId} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Dates groupId={groupId} />
          <Announcements groupId={groupId} />
        </div>
      </div>
    </div>
  )
}

/**
 * The code, and the two things that can be done to it.
 *
 * Rotating replaces rather than adds, so "who can still join" has one answer.
 * That is stated on the button rather than only in the database, because a
 * teacher who rotates expecting a second code has just locked out half a class.
 */
function JoinCode({ groupId, code }: { groupId: string; code: string | null }) {
  const rotate = useRotateJoinCode()
  const close = useCloseJoinCode()
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // A refused clipboard is not an error worth a banner -- the code is on
      // the screen in a font chosen so it can be read out loud.
    }
  }

  return (
    <Card>
      <CardHeader title="Join code" />
      <div className="px-5 pb-5">
        {code ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-[19px] tracking-[0.18em] text-text">
                {code}
              </code>
              <Button size="sm" variant="secondary" onClick={copy}>
                {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-text-subtle">
              Eight characters, with no O, 0, I or 1 in them, so it survives being
              read out. Anyone with it can join.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                loading={rotate.isPending}
                onClick={() => rotate.mutate(groupId)}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                New code
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={close.isPending}
                onClick={() => close.mutate(groupId)}
              >
                Close the class
              </Button>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-text-subtle">
              A new code replaces this one — the old one stops working. Closing stops
              anybody new joining. Neither removes a student.
            </p>
          </>
        ) : (
          <>
            <p className="text-[13px] leading-relaxed text-text-muted">
              This class is closed. Everybody already in it stays; nobody new can join
              until you make a code.
            </p>
            <Button
              className="mt-3"
              size="sm"
              loading={rotate.isPending}
              onClick={() => rotate.mutate(groupId)}
            >
              Make a code
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}

/**
 * Who is in the class, and what each of them is sharing.
 *
 * The roster and the progress table are one list rather than two, because they
 * are the same list: a name with nothing beside it and a name with an average
 * beside it are both answers to "how is this student doing", and splitting them
 * puts the students sharing nothing on a screen nobody opens.
 */
function Roster({ groupId }: { groupId: string }) {
  const { data: members = [], isLoading } = useGroupMembers(groupId)
  const { data: progress = [] } = useGroupProgress(groupId)
  const remove = useRemoveGroupMember()

  return (
    <Card>
      <CardHeader title={`Students${members.length ? ` (${members.length})` : ''}`} />
      <div className="px-5 pb-5">
        {isLoading && <Skeleton className="h-16" />}

        {!isLoading && members.length === 0 && (
          <p className="text-[13px] leading-relaxed text-text-muted">
            Nobody has joined yet. Give them the code above.
          </p>
        )}

        {members.length > 0 && (
          <ul className="divide-y divide-border">
            {members.map((m) => {
              const p = progress.find((x) => x.student_id === m.student_id)
              return (
                <li key={m.id} className="flex min-w-0 items-center gap-3 py-2.5 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] text-text">
                      {m.student_name ?? 'A student'}
                    </p>
                    <p className="truncate text-[12px] text-text-subtle">
                      {p?.sharing
                        ? p.average === null
                          ? 'Sharing marks — nothing marked yet'
                          // The working, not just the number. An average with
                          // no count behind it is a claim rather than a
                          // measurement, which is the rule the student's own
                          // grades tab already follows.
                          : `${p.average.toFixed(1)}% from ${p.marks === 1 ? '1 mark' : `${p.marks} marks`}`
                        : 'Not sharing marks'}
                    </p>
                  </div>
                  <ConfirmDelete
                    what={m.student_name ?? 'this student'}
                    title="Remove them from this class?"
                    detail="They stop seeing this class's dates and announcements. Their own notes and marks are untouched, and they can join again with a code."
                    onConfirm={() => remove.mutateAsync(m.id)}
                    pending={remove.isPending}
                  />
                </li>
              )
            })}
          </ul>
        )}

        <p className="mt-3 text-[12px] leading-relaxed text-text-subtle">
          Marks are private unless a student turns sharing on for this class, and only
          for the one class they linked. You cannot turn it on for them.
        </p>
      </div>
    </Card>
  )
}

/** Dates published to the class. */
function Dates({ groupId }: { groupId: string }) {
  const { current } = useSchoolYear()
  const { data: events = [], isLoading } = useGroupEvents(groupId)
  const publish = usePublishGroupEvent(groupId, current?.id)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayPlain())

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await publish.mutateAsync({
      title: title.trim(),
      categoryId: null,
      isAllDay: true,
      startDate: date,
      endDate: date,
      visibility: 'private',
      priority: 0,
    })
    setTitle('')
    setOpen(false)
  }

  return (
    <Card>
      <CardHeader
        title="Dates"
        action={
          !open && (
            <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
              <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
              Publish
            </Button>
          )
        }
      />
      <div className="px-5 pb-5">
        {open && (
          <form onSubmit={submit} className="mb-4 flex flex-col gap-3">
            <Input
              label="What"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Input
              label="When"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={publish.isPending} disabled={!title.trim()}>
                Publish to the class
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {isLoading && <Skeleton className="h-14" />}

        {!isLoading && events.length === 0 && !open && (
          <p className="text-[13px] leading-relaxed text-text-muted">
            Nothing published yet. A date you publish here appears on every student&apos;s
            own calendar.
          </p>
        )}

        {events.length > 0 && (
          <ul className="divide-y divide-border">
            {events.map((e) => (
              <li key={e.id} className="flex min-w-0 items-baseline gap-3 py-2 first:pt-0">
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-text">{e.title}</span>
                <span className="shrink-0 text-[12px] tabular text-text-subtle">
                  {agendaLabel(e.start_date)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-[12px] leading-relaxed text-text-subtle">
          One row, not a copy each. Changing a date changes it for everybody, rather than
          for whoever happens to reload.
        </p>
      </div>
    </Card>
  )
}

/** What has been said to the class. */
function Announcements({ groupId }: { groupId: string }) {
  const { data: posts = [], isLoading } = useGroupAnnouncements(groupId)
  const announce = useAnnounceToGroup(groupId)
  const [body, setBody] = useState('')
  const [notify, setNotify] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    await announce.mutateAsync({ body, notify })
    setBody('')
    setNotify(false)
  }

  return (
    <Card>
      <CardHeader title="Announcements" />
      <div className="px-5 pb-5">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label htmlFor="announcement" className="sr-only">Announcement</label>
          <textarea
            id="announcement"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Bring a calculator on Tuesday."
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[13.5px] leading-relaxed text-text transition-colors duration-150 hover:border-border-strong focus:border-brand focus:outline-none"
          />
          <label className="flex items-start gap-2 text-[12.5px] leading-relaxed text-text-muted">
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--brand)]"
            />
            {/* "Queued", not "sent". Whether it arrives depends on what each
                student turned on and on a dispatcher this page cannot see, and
                a button that claims delivery it cannot observe is the exact
                failure this project spent two days finding. */}
            Also queue a reminder for everyone. It goes out on the channels each student
            chose, and only to students who have set any up.
          </label>
          <div>
            <Button type="submit" size="sm" loading={announce.isPending} disabled={!body.trim()}>
              <Megaphone className="h-3.5 w-3.5" aria-hidden />
              Post
            </Button>
          </div>
        </form>

        {isLoading && <Skeleton className="mt-4 h-14" />}

        {posts.length > 0 && (
          <ul className="mt-4 divide-y divide-border">
            {posts.map((a) => (
              <li key={a.id} className="py-3 first:pt-0">
                <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-text">
                  {a.body}
                </p>
                <p className="mt-1 text-[12px] text-text-subtle">
                  {new Date(a.created_at).toLocaleDateString()}
                  {a.notified && ' · reminder queued'}
                </p>
              </li>
            ))}
          </ul>
        )}

        {!isLoading && posts.length === 0 && (
          <p className="mt-4 text-[13px] leading-relaxed text-text-muted">
            Nothing said yet.
          </p>
        )}
      </div>
    </Card>
  )
}
