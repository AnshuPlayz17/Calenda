import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, CalendarPlus, Check, Copy, KeyRound, Megaphone, RefreshCw, Users,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
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
import { useDraft } from '@/lib/draft'
import { agendaLabel, todayPlain } from '@/lib/datetime'
import { cn } from '@/lib/cn'

/**
 * One class, from the teacher's side.
 *
 * THIS WAS FOUR CARDS ON ONE PAGE AND THAT WAS WRONG.
 *
 * The reasoning written down at the time was that a teacher opening this is
 * answering one of exactly four questions, so a tab bar would put three of them
 * a click away from an answer they could otherwise see. It reads well and it
 * did not survive first contact: the first person to make a real class called
 * it "really congested", which is what four cards in two columns actually looks
 * like once each of them has content in it rather than an empty state.
 *
 * The mistake underneath is that the four are not equals. The stream and the
 * dates are read constantly; the roster occasionally; the join code once, at
 * the start of a term, and then never again -- and it was taking the top-left
 * corner, which is the most expensive space on the page.
 *
 * So: a header that identifies the class, and four tabs in the order they are
 * actually reached. The code lives in Settings with the things that are done
 * once. Recorded as a reversal rather than quietly rewritten, because the
 * reasoning was stated confidently and was still wrong -- and the thing that
 * corrected it was somebody using it.
 *
 * The structural cues are borrowed from the tool every student and teacher
 * already knows, which was asked for by name. The look is Calenda's own: none
 * of the colours, type or marks are anyone else's.
 */

const TABS = [
  { id: 'stream', label: 'Stream', Icon: Megaphone },
  { id: 'dates', label: 'Dates', Icon: CalendarPlus },
  { id: 'people', label: 'People', Icon: Users },
  { id: 'settings', label: 'Settings', Icon: KeyRound },
] as const

type TabId = (typeof TABS)[number]['id']

function readTab(value: string | null): TabId {
  return TABS.some((t) => t.id === value) ? (value as TabId) : 'stream'
}

export function TeachingGroup() {
  const { groupId = '' } = useParams()
  const { current } = useSchoolYear()
  const { data: groups = [], isLoading } = useTeachingGroups(current?.id)
  const group = groups.find((g) => g.id === groupId)

  // In the address, not in state. The same reason the sign-up form's step is:
  // the browser's own Back button is the one a phone puts under your thumb, and
  // with the tab in state it leaves the class entirely.
  const [params, setParams] = useSearchParams()
  const tab = readTab(params.get('tab'))

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1000px] px-4 py-6 sm:px-6">
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    )
  }

  if (!group) {
    return (
      <div className="mx-auto w-full max-w-[1000px] px-4 py-6 sm:px-6">
        <EmptyState
          icon={Users}
          title="That class is not here"
          description="It may have been archived, or it was never yours."
          action={
            <Link to="/teaching">
              <Button variant="secondary">Back to your classes</Button>
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-6 sm:px-6">
      <Link
        to="/teaching"
        className="inline-flex items-center gap-1.5 text-[13px] text-text-muted hover:text-text"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Classes you teach
      </Link>

      {/* The class's own band. One object at the top of the page saying which
          class this is, so the tabs below it are unambiguous after a scroll. */}
      <header className="mt-3 overflow-hidden rounded-2xl border border-border bg-brand-subtle px-5 py-6 sm:px-7 sm:py-8">
        <h1 className="font-display text-[26px] font-medium leading-tight tracking-tight text-text sm:text-[32px]">
          {group.name}
        </h1>
        <p className="mt-1.5 text-[13.5px] text-text-muted">
          {[group.subject, group.room].filter(Boolean).join(' · ') || 'No subject set'}
        </p>
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-text-subtle">
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {group.member_count === 1 ? '1 student' : `${group.member_count} students`}
          </span>
          {group.join_code
            ? <span className="font-mono tracking-[0.14em]">{group.join_code}</span>
            : <span>Closed to new students</span>}
        </p>
      </header>

      <nav
        aria-label="This class"
        className="mt-5 flex gap-1 overflow-x-auto border-b border-border"
      >
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            // A real pressed state, so a screen reader is told which tab is
            // open rather than being left to infer it from a colour.
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => setParams(id === 'stream' ? {} : { tab: id }, { replace: true })}
            className={cn(
              'relative -mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13.5px] transition-colors duration-150',
              tab === id
                ? 'border-brand font-medium text-text'
                : 'border-transparent text-text-muted hover:text-text',
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-5">
        {tab === 'stream' && <Stream groupId={groupId} />}
        {tab === 'dates' && <Dates groupId={groupId} />}
        {tab === 'people' && <People groupId={groupId} />}
        {tab === 'settings' && <Settings groupId={groupId} code={group.join_code} />}
      </div>
    </div>
  )
}

/** What has been said to the class, newest first. */
function Stream({ groupId }: { groupId: string }) {
  const { data: posts = [], isLoading } = useGroupAnnouncements(groupId)
  const announce = useAnnounceToGroup(groupId)
  const draft = useDraft(`calenda.announcement.${groupId}`, { body: '' })
  const [notify, setNotify] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.value.body.trim()) return
    await announce.mutateAsync({ body: draft.value.body, notify })
    draft.clear()
    setNotify(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label htmlFor="announcement" className="text-[13px] font-medium text-text">
            Tell the class something
          </label>
          <textarea
            id="announcement"
            rows={3}
            value={draft.value.body}
            onChange={(e) => draft.set('body', e.target.value)}
            placeholder="Bring a calculator on Tuesday."
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[14px] leading-relaxed text-text transition-colors duration-150 hover:border-border-strong focus:border-brand focus:outline-none"
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
                a button claiming a delivery it cannot observe is the exact
                failure this project spent two days finding. */}
            Also queue a reminder for everyone. It goes out on the channels each student
            chose, and only to students who have set any up.
          </label>
          <div>
            <Button
              type="submit"
              size="sm"
              loading={announce.isPending}
              disabled={!draft.value.body.trim()}
            >
              <Megaphone className="h-3.5 w-3.5" aria-hidden />
              Post
            </Button>
          </div>
        </form>
      </Card>

      {isLoading && <Skeleton className="h-24 rounded-xl" />}

      {!isLoading && posts.length === 0 && (
        <Card className="p-5">
          <p className="text-[13.5px] leading-relaxed text-text-muted">
            Nothing said yet. Anything you post here appears for everybody in the class.
          </p>
        </Card>
      )}

      {posts.map((a) => (
        <Card key={a.id} className="p-5">
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-text">{a.body}</p>
          <p className="mt-2.5 text-[12px] text-text-subtle">
            {new Date(a.created_at).toLocaleDateString()}
            {a.notified && ' · reminder queued'}
          </p>
        </Card>
      ))}
    </div>
  )
}

/** Dates published to the class. */
function Dates({ groupId }: { groupId: string }) {
  const { current } = useSchoolYear()
  const { data: events = [], isLoading } = useGroupEvents(groupId)
  const publish = usePublishGroupEvent(groupId, current?.id)
  const draft = useDraft(`calenda.groupdate.${groupId}`, { title: '', date: todayPlain() })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.value.title.trim()) return
    await publish.mutateAsync({
      title: draft.value.title.trim(),
      categoryId: null,
      isAllDay: true,
      startDate: draft.value.date,
      endDate: draft.value.date,
      visibility: 'private',
      priority: 0,
    })
    draft.clear()
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <form onSubmit={submit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Input
              label="What"
              placeholder="Unit 1 test"
              value={draft.value.title}
              onChange={(e) => draft.set('title', e.target.value)}
            />
          </div>
          <div className="sm:w-[190px]">
            <Input
              label="When"
              type="date"
              value={draft.value.date}
              onChange={(e) => draft.set('date', e.target.value)}
            />
          </div>
          <Button type="submit" loading={publish.isPending} disabled={!draft.value.title.trim()}>
            <CalendarPlus className="h-4 w-4" aria-hidden />
            Publish
          </Button>
        </form>
        <p className="mt-3 text-[12px] leading-relaxed text-text-subtle">
          One row, not a copy each. Changing a date changes it for everybody, rather than
          for whoever happens to reload.
        </p>
      </Card>

      {isLoading && <Skeleton className="h-24 rounded-xl" />}

      {!isLoading && events.length === 0 && (
        <Card className="p-5">
          <p className="text-[13.5px] leading-relaxed text-text-muted">
            Nothing published yet. A date you publish here appears on every student&apos;s
            own calendar.
          </p>
        </Card>
      )}

      {events.length > 0 && (
        <Card className="divide-y divide-border p-0">
          {events.map((e) => (
            <div key={e.id} className="flex min-w-0 items-baseline gap-3 px-5 py-3.5">
              <span className="min-w-0 flex-1 truncate text-[14px] text-text">{e.title}</span>
              <span className="shrink-0 text-[12.5px] tabular text-text-subtle">
                {agendaLabel(e.start_date)}
              </span>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

/**
 * Who is in the class, and what each of them is sharing.
 *
 * The roster and the progress table are one list rather than two, because they
 * are the same list: a name with an average beside it and a name with nothing
 * beside it are both answers to "how is this student doing", and splitting them
 * puts every student who shares nothing on a screen nobody opens.
 */
function People({ groupId }: { groupId: string }) {
  const { data: members = [], isLoading } = useGroupMembers(groupId)
  const { data: progress = [] } = useGroupProgress(groupId)
  const remove = useRemoveGroupMember()

  return (
    <div className="flex flex-col gap-4">
      {isLoading && <Skeleton className="h-24 rounded-xl" />}

      {!isLoading && members.length === 0 && (
        <Card className="p-5">
          <p className="text-[13.5px] leading-relaxed text-text-muted">
            Nobody has joined yet. The code is under Settings.
          </p>
        </Card>
      )}

      {members.length > 0 && (
        <Card className="divide-y divide-border p-0">
          {members.map((m) => {
            const p = progress.find((x) => x.student_id === m.student_id)
            return (
              <div key={m.id} className="flex min-w-0 items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] text-text">
                    {m.student_name ?? 'A student'}
                  </p>
                  <p className="truncate text-[12.5px] text-text-subtle">
                    {p?.sharing
                      ? p.average === null
                        ? 'Sharing marks — nothing marked yet'
                        // The working, not just the number. An average with no
                        // count behind it is a claim rather than a measurement.
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
              </div>
            )
          })}
        </Card>
      )}

      <p className="text-[12px] leading-relaxed text-text-subtle">
        Marks are private unless a student turns sharing on for this class, and only for
        the one class they linked. You cannot turn it on for them.
      </p>
    </div>
  )
}

/**
 * The things done once: the code, and closing the class.
 *
 * Here rather than on the first screen because that is how often they are
 * needed. The code was in the top-left corner, which is the most expensive
 * space on the page, and it is read at the start of a term and then never.
 */
function Settings({ groupId, code }: { groupId: string; code: string | null }) {
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
      // A refused clipboard is not worth a banner -- the code is on the screen
      // in a font chosen so it can be read out loud.
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-[15px] font-semibold tracking-tight text-text">Join code</h2>

      {code ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="rounded-lg border border-border bg-surface-2 px-4 py-2.5 font-mono text-[22px] tracking-[0.2em] text-text">
              {code}
            </code>
            <Button size="sm" variant="secondary" onClick={copy}>
              {copied
                ? <Check className="h-3.5 w-3.5" aria-hidden />
                : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p className="mt-3 max-w-[60ch] text-[12.5px] leading-relaxed text-text-subtle">
            Eight characters, with no O, 0, I or 1 in them, so it survives being read out.
            Anyone with it can join.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
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
          <p className="mt-2.5 max-w-[60ch] text-[12px] leading-relaxed text-text-subtle">
            A new code replaces this one — the old one stops working. Closing stops anybody
            new joining. Neither removes a student.
          </p>
        </>
      ) : (
        <>
          <p className="mt-2 max-w-[60ch] text-[13.5px] leading-relaxed text-text-muted">
            This class is closed. Everybody already in it stays; nobody new can join until
            you make a code.
          </p>
          <Button
            className="mt-4"
            size="sm"
            loading={rotate.isPending}
            onClick={() => rotate.mutate(groupId)}
          >
            Make a code
          </Button>
        </>
      )}

      <p className="mt-6 max-w-[60ch] border-t border-border pt-4 text-[12px] leading-relaxed text-text-subtle">
        A class here is not connected to any school&apos;s systems. Students join because
        you gave them the code, and they choose what they share back.
      </p>
    </Card>
  )
}
