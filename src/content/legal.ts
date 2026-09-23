/**
 * The privacy policy and the terms, as data rather than as prose in a page.
 *
 * Two reasons it is shaped like this and not written straight into JSX.
 *
 * The first is this project's oldest bug wearing yet another costume. A privacy
 * policy is a claim about what a system does, and the whole argument of this
 * codebase is that a claim not downstream of the thing it describes drifts away
 * from it silently. A policy typed as paragraphs would list the data Calenda
 * held on the afternoon it was written and would be wrong the first time a
 * migration added a table -- with nothing failing, because prose does not fail.
 * So the inventory below names the tables each category covers, and
 * `legalDrift.test.ts` requires every table in `supabase/migrations/` to appear
 * in exactly one category. Add a table and the suite goes red until the policy
 * says what is in it. That is the only mechanism here that can actually keep a
 * legal document honest, and it was verified by adding a table and watching it
 * fail.
 *
 * The second is that both documents have to be readable, and a wall of legal
 * boilerplate is not read by anyone. Sections carry a heading and a short body,
 * so the page can set them at a size a person will actually get through.
 *
 * NEITHER DOCUMENT IS LEGAL ADVICE AND NEITHER HAS BEEN REVIEWED BY A LAWYER.
 * Both say so at the top, in the reader's own words rather than in a footnote.
 * The two placeholders that need a person -- a contact address and the
 * governing jurisdiction -- are marked with `NEEDS_OWNER` rather than being
 * guessed at, because a wrong address on a privacy policy is worse than a
 * visible gap: it silently swallows the requests the document exists to invite.
 */

/** Filled in by the owner. Left visible on the page on purpose -- see above. */
export const NEEDS_OWNER = '[to be filled in]'

export const LAST_UPDATED = '2026-09-17'

/**
 * What Calenda stores, named against the tables that store it.
 *
 * `tables` is not decoration. It is what `legalDrift.test.ts` checks against
 * the migrations, so a category that stops matching the schema fails the build
 * rather than quietly becoming untrue.
 */
export type DataCategory = {
  id: string
  title: string
  body: string
  tables: string[]
}

export const DATA_CATEGORIES: DataCategory[] = [
  {
    id: 'account',
    title: 'Your account',
    body:
      'Your email address, your name, the profile picture your sign-in provider gives out, ' +
      'and which provider you used. Your password, if you set one, is never seen or stored by ' +
      'Calenda -- sign-in is handled by Supabase Auth, which stores a one-way hash of it that ' +
      'cannot be turned back into your password. Calenda also keeps the answers you gave when ' +
      'you signed up: whether you are a student, a parent or a teacher, your school if you ' +
      'typed one, your grade, your timezone, and how you heard about Calenda.',
    tables: ['profiles'],
  },
  {
    id: 'schoolwork',
    title: 'Your schoolwork',
    body:
      'Your classes, the events and deadlines in your calendar, your assignments and tasks, ' +
      'your timetable, your notebook pages, and the school year and categories they are ' +
      'organised under. This is the app -- it is the reason there is an account at all.',
    tables: [
      'classes', 'events', 'event_series', 'event_categories', 'assignments', 'tasks',
      'notebook_pages', 'class_meetings', 'school_years',
    ],
  },
  {
    id: 'marks',
    title: 'Your marks and report cards',
    body:
      'Any marks you enter, and any report card you upload. A report card is a file, and it ' +
      'is kept in private storage that only your account can read. Marks are private by ' +
      'default: nothing is visible to a linked parent until you turn that on, one thing at a ' +
      'time. Report cards are never shared with a parent at all, by any control -- sharing one ' +
      'mark and handing over the document it came from, with its comments and every other mark ' +
      'on it, are different acts.',
    tables: ['grades', 'report_cards', 'report_card_lines'],
  },
  {
    id: 'files',
    title: 'Files you upload',
    body:
      'Attachments on your classes and notes, kept in the same private storage. Nobody else ' +
      'can read them unless you share them.',
    tables: ['files', 'file_links'],
  },
  {
    id: 'sharing',
    title: 'What you have chosen to share',
    body:
      'Which items you have shared and with whom, including links you have created for a ' +
      'specific person. Nothing is shared unless you shared it.',
    tables: ['shares'],
  },
  {
    id: 'family',
    title: 'Parent links',
    body:
      'If a parent joins your account using a code from your settings, Calenda stores the ' +
      'link between the two accounts and the relationship. Codes you have generated are stored ' +
      'until they are used.',
    tables: ['parent_invites', 'parent_links'],
  },
  {
    id: 'teaching',
    title: 'Classes you teach',
    body:
      'If you are a teacher: the groups you have made, their join codes, who is in them, and ' +
      'the announcements you have posted. A class in Calenda is not connected to any school’s ' +
      'systems -- it exists only here.',
    tables: ['teacher_groups', 'teacher_group_members', 'group_announcements'],
  },
  {
    id: 'imports',
    title: 'Dates you have imported',
    body:
      'When you import a school calendar, Calenda keeps the batch, the rows waiting for your ' +
      'review, and the decisions you made about them. Nothing from an import reaches your ' +
      'calendar until you accept it.',
    tables: ['import_batches', 'import_staging', 'event_reviews'],
  },
  {
    id: 'reminders',
    title: 'Reminders',
    body:
      'Your reminder settings and quiet hours, the queue of reminders waiting to go out, and a ' +
      'record of what was sent. If you turn on notifications in your browser, Calenda stores ' +
      'the address your browser gives it for delivering them, the keys needed to encrypt them, ' +
      'and which browser it was -- so you can tell two devices apart when removing one.',
    tables: [
      'notification_preferences', 'notification_category_prefs', 'notification_queue',
      'notification_deliveries', 'push_subscriptions',
    ],
  },
  {
    id: 'assistant',
    title: 'The assistant',
    body:
      'What you type to the assistant and what it replies, so a conversation is still there ' +
      'when you come back, plus a count of how many messages you have sent today. That count ' +
      'is what enforces the daily limit.',
    tables: ['chat_threads', 'chat_messages', 'chat_usage'],
  },
  {
    id: 'abuse',
    title: 'Rate limiting',
    body:
      'A count, against your account, of how many times you have recently done a few specific ' +
      'things -- entering a class join code, rotating one, posting an announcement. It holds ' +
      'the action, the count and the hour, and nothing else. It exists so that guessing a join ' +
      'code costs something.',
    tables: ['action_rates'],
  },
]

/**
 * Tables that exist in the schema and that nothing in the app or the Edge
 * Functions ever writes to.
 *
 * They are listed on the page rather than left out of it. A privacy policy that
 * silently omits a table holding a `refresh_token` column and a
 * `verification_hash` column is not a document anybody should trust, and "it is
 * empty" is a fact a reader can be told rather than a reason to say nothing.
 *
 * Found while writing this: the Google Calendar import reads the access token
 * Supabase hands back with the session and uses it in memory, so no refresh
 * token is ever requested and none of the three Google tables has ever had a
 * row written to it. Phone numbers are the same -- the SMS adapter is dormant
 * and nothing in the app collects a number.
 *
 * `legalDrift.test.ts` holds this list to that claim: if anything under `src/`
 * or `supabase/functions/` starts naming one of these tables, the test fails
 * and this section has to move into DATA_CATEGORIES.
 */
export const DORMANT_TABLES = [
  'google_accounts', 'google_calendars', 'google_event_map', 'phone_numbers',
] as const

export type Section = { heading: string; body: string[] }

/** Applies to both documents, and is the first thing on each. */
export const PLAIN_ENGLISH_NOTE =
  'This was written by the person who built Calenda, not by a lawyer, and no lawyer has ' +
  'reviewed it. It is here to tell you plainly what the app does with your information. It ' +
  'is not legal advice.'

export const PRIVACY: Section[] = [
  {
    heading: 'Who runs Calenda',
    body: [
      'Calenda is a personal project built and run by one student, Anshu Arunav. It is not a ' +
      'company. It is not affiliated with, endorsed by, or an official product of any school, ' +
      'including any school whose published calendar it reads.',
      'That matters for the rest of this page: there is no support team, no data protection ' +
      'officer and no legal department. There is one person, and the contact address below ' +
      'reaches him.',
    ],
  },
  {
    heading: 'What Calenda does not do',
    body: [
      'Calenda sets no cookies. It uses your browser’s local storage to remember small ' +
      'things -- your theme, which step of a form you were on, a draft you had started -- and ' +
      'that never leaves your device.',
      'There is no analytics, no tracking, no advertising and no third-party scripts of any ' +
      'kind on the site. The fonts are part of the app rather than fetched from Google. ' +
      'Nothing about you is sold, rented or shared for advertising, and there is no ' +
      'circumstance in which that would change without this page changing first.',
    ],
  },
  {
    heading: 'What Calenda stores',
    body: [
      'Everything below is stored because a feature you can see needs it. The list is checked ' +
      'against the database by an automated test, so it cannot quietly fall behind what the ' +
      'app actually holds.',
    ],
  },
  {
    heading: 'Who else sees it',
    body: [
      'Supabase hosts the database, the sign-in system, the file storage and the small ' +
      'server-side functions. Effectively everything above sits there.',
      'GitHub Pages serves the website itself. It sees the requests your browser makes for the ' +
      'page, as any web host does.',
      'When you ask the assistant a question, that question and the parts of your own data ' +
      'needed to answer it are sent to a language model provider -- Groq, Google or OpenAI, ' +
      'depending on which is configured. When you upload a report card for decoding, the image ' +
      'is sent to the same kind of provider. Both of those are explicit actions you take, and ' +
      'the report card asks before it sends anything. Nothing is sent to a model unless you ' +
      'ask a question or upload a document.',
      'Email reminders are sent through Brevo. Browser notifications go through whatever push ' +
      'service your browser uses -- Google for Chrome, Mozilla for Firefox, Apple for Safari. ' +
      'Their contents are encrypted so that only your browser can read them.',
      'If you sign in with Google, GitHub or Discord, that provider knows you signed in. If you ' +
      'import from Google Calendar, Calenda reads your calendars while you are on the page; it ' +
      'never stores a Google token and never writes anything back to Google.',
    ],
  },
  {
    heading: 'How it is kept safe',
    body: [
      'Every table is protected by rules inside the database itself, which decide what your ' +
      'account may read and write. They are not a matter of the app hiding buttons -- if the ' +
      'app were bypassed entirely, the database would still refuse. There is a test suite that ' +
      'signs in as the wrong person and requires each of those attempts to fail.',
      'The assistant runs as you, not as an administrator, so it cannot return anything you ' +
      'could not already open yourself.',
      'None of this is a promise that nothing can go wrong. It is one person’s project, and ' +
      'no system is perfectly secure. Do not put anything in Calenda that would harm you if it ' +
      'got out.',
    ],
  },
  {
    heading: 'Young people',
    body: [
      'Calenda is a school app, so many of the people using it are under eighteen, and it is ' +
      'built with that in mind: marks are private by default and nothing is shared with a ' +
      'parent unless the student shares it.',
      'It is not, however, built to meet the specific legal requirements for collecting ' +
      'information from children under thirteen, and it should not be used by anyone that age ' +
      'without a parent or guardian involved. If you are a parent and you would like your ' +
      'child’s account and everything in it deleted, write to the address below and it will ' +
      'be done.',
    ],
  },
  {
    heading: 'Getting your data out, and getting rid of it',
    body: [
      'Your calendar can be exported to a standard .ics file from the calendar screen, in your ' +
      'browser, with no request to any server. It opens in Google Calendar, Apple Calendar, ' +
      'Outlook and anything else that reads the format. An app you can only leave by abandoning ' +
      'your data is a trap, and this is the way out of that.',
      'Settings has a button that deletes your whole account. It removes the account itself and ' +
      'everything attached to it -- classes and notes, calendar and assignments, marks and any ' +
      'report card you uploaded, reminders, and any link with a parent -- along with every file ' +
      'you uploaded. It asks you to type your email address first, because it cannot be undone ' +
      'and there is no copy kept.',
      'Two things deliberately survive it, and neither names you afterwards. If you ever ' +
      'approved a community event or imported a school calendar, the record that it was ' +
      'approved or imported stays, with the person on it set to nobody. Deleting those would ' +
      'destroy the history of shared data rather than erase you from it.',
      'If the button fails it says so and says which step it failed at, and your account is ' +
      'still there. Writing to the address below still works.',
    ],
  },
  {
    heading: 'How long things are kept',
    body: [
      'Until you delete them, or until you ask for the account to be deleted. Nothing is kept ' +
      'on a schedule after that, and there are no backups held separately from Supabase’s ' +
      'own.',
    ],
  },
  {
    heading: 'Changes to this page',
    body: [
      'If what Calenda stores changes, this page changes with it -- that is enforced by a test ' +
      'rather than left to memory. The date at the top is when it last changed.',
    ],
  },
  {
    heading: 'Contact',
    body: [
      `Write to ${NEEDS_OWNER} for anything on this page: a copy of your data, a correction, ` +
      'deletion, or a question.',
    ],
  },
]

export const TERMS: Section[] = [
  {
    heading: 'What this is',
    body: [
      'Calenda is a free school planner built by one student as a personal project. These ' +
      'terms are the agreement between you and him. If you use Calenda, they apply to you.',
    ],
  },
  {
    heading: 'It is free, and it is one person',
    body: [
      'Calenda costs nothing and runs entirely on free plans. There is nothing to pay and ' +
      'nothing to cancel.',
      'It is also maintained by one person who is at school, which means it may be slow to be ' +
      'fixed, and it could one day stop being maintained altogether. That is the honest ' +
      'position, and it is why exporting your calendar takes one click and needs no ' +
      'permission from anybody.',
    ],
  },
  {
    heading: 'Check the dates with your school',
    body: [
      'Calenda reads the calendars schools publish, and a published calendar can be wrong, ' +
      'out of date, or incomplete -- and Calenda can read one imperfectly. Every imported date ' +
      'is shown to you for review before it reaches your calendar, and that review is there ' +
      'because the import cannot be assumed correct.',
      'Your school is the authority on when your exams are. Calenda is not. Do not rely on it ' +
      'alone for anything that matters.',
    ],
  },
  {
    heading: 'Reminders are not guaranteed',
    body: [
      'A reminder has to pass through your browser, an operating system and a push or mail ' +
      'service before it reaches you, and any of those can drop it, delay it or decide it is ' +
      'spam. Reminders are a convenience. They are not a safety net, and missing one is not a ' +
      'defence Calenda can offer on your behalf.',
    ],
  },
  {
    heading: 'The assistant can be wrong',
    body: [
      'The assistant is a language model. It reads your own data to answer and shows you which ' +
      'rows it read, but it can still be confidently wrong, and a decoded report card can ' +
      'misread a mark. Nothing it produces reaches your marks until you have looked at each ' +
      'line and accepted it. Check its work.',
    ],
  },
  {
    heading: 'What you put in it',
    body: [
      'What you write in Calenda is yours. Nothing gives anyone the right to use it for ' +
      'anything other than running the app for you.',
      'In return: do not upload other people’s personal information without their ' +
      'permission, do not upload anything illegal, do not try to reach another account’s ' +
      'data, and do not hammer the assistant or the sign-up form to run up costs on a free ' +
      'plan. An account doing any of those can be suspended or removed.',
    ],
  },
  {
    heading: 'Classes you teach',
    body: [
      'A class you create in Calenda is yours, not your school’s. It carries no ' +
      'institutional authority, is not connected to any school’s systems, and a date you ' +
      'publish in it is not an official notice. Students choose whether to share their marks ' +
      'with you, one class at a time, and can stop at any point.',
    ],
  },
  {
    heading: 'No warranty',
    body: [
      'Calenda is provided as it is, with no warranty of any kind. It may be unavailable, it ' +
      'may lose data, and it may be wrong. To the extent the law allows, the person who built ' +
      'it is not liable for any loss arising from your use of it -- including a missed ' +
      'deadline, a missed exam or a reminder that never arrived.',
      'Nothing here is intended to limit any right you have that cannot be limited by ' +
      'agreement.',
    ],
  },
  {
    heading: 'Ending it',
    body: [
      'You can stop using Calenda whenever you like. Export your calendar first if you want ' +
      'it, then delete your account from Settings.',
      'Access can be withdrawn if an account is being used in the ways listed above, or if ' +
      'Calenda shuts down. If it is shutting down there will be notice, and enough time to ' +
      'get your data out.',
    ],
  },
  {
    heading: 'Changes',
    body: [
      'These terms can change. The date at the top is when they last did. Continuing to use ' +
      'Calenda after a change means the new version applies.',
    ],
  },
  {
    heading: 'Which law applies',
    body: [
      `These terms are governed by the law of ${NEEDS_OWNER}.`,
    ],
  },
]
