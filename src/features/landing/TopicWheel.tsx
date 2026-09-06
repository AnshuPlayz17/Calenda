import { Reveal } from '@/components/Reveal'
import { WheelCarousel } from '@/components/motion/WheelCarousel'
import type { WheelCarouselItem } from '@/components/motion/WheelCarousel'

/**
 * The questions people actually ask, on a wheel.
 *
 * The published carousel pairs each label with a photograph. There are no
 * photographs here and inventing some would put fiction on a page whose entire
 * argument is that its contents are real, so each item carries an answer
 * instead. That makes the wheel a way of choosing a question rather than a
 * slideshow, which is a better use of it.
 */

const TOPICS: WheelCarouselItem[] = [
  {
    label: 'Does it cost anything?',
    detail: `No, and not in the way that means "not yet". Everything it runs on sits inside a
             free tier — hosting, the database, sign-in, notifications. Where something could
             not be free it was left off rather than faked.`,
  },
  {
    label: 'Is it the school’s?',
    detail: `No. It is a personal project by a student, not affiliated with or endorsed by
             University of Toronto Schools. The school's published dates are in it; the school
             is not behind it.`,
  },
  {
    label: 'What can my parents see?',
    detail: `Only what you share, one item at a time, and you can stop sharing at any point.
             Connecting a parent by itself shows them nothing — that rule is a database policy
             with a test that tries to break it.`,
  },
  {
    label: 'Does it touch Google?',
    detail: `No. Google Calendar is read only. Your events come in and sit alongside everything
             else, and nothing Calenda does writes back.`,
  },
  {
    label: 'Do I type the dates?',
    detail: `No. All forty-nine are already there before you sign in, including the sixteen that
             share a title and would defeat a simpler importer.`,
  },
  {
    label: 'What if I miss one?',
    detail: `You can set how far ahead each kind of thing warns you, and quiet hours you will not
             be woken inside. A reminder cannot arrive twice — the database refuses to store the
             second one.`,
  },
]

export function TopicWheel() {
  return (
    <section className="relative z-10 px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-[1120px]">
        <Reveal>
          <p className="label-caps">Before you sign up</p>
          <h2 className="mt-3 max-w-[20ch] font-display text-[30px] font-medium leading-tight tracking-tight sm:text-[40px]">
            The six questions everyone asks.
          </h2>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="mt-8">
            <WheelCarousel items={TOPICS} />
          </div>
        </Reveal>
      </div>
    </section>
  )
}
