import { Bell, GraduationCap, Lightbulb, Settings, ShieldCheck } from 'lucide-react'
import { Placeholder } from './Placeholder'

export const ClassesPage = () => (
  <Placeholder
    title="Classes" icon={GraduationCap} phase="Phase 5"
    lede="A workspace for each class — notes, assignments, tasks, files and deadlines."
    emptyTitle="No classes yet"
    emptyBody="Connect Google Calendar to detect your classes by course code, or add one by hand."
  />
)

export const NotificationsPage = () => (
  <Placeholder
    title="Notifications" icon={Bell} phase="Phase 7"
    lede="Reminders by email and push, on the schedule you choose."
    emptyTitle="You're up to date"
    emptyBody="Reminders you receive will be listed here, with what triggered each one."
  />
)

export const SuggestionsPage = () => (
  <Placeholder
    title="Suggestions" icon={Lightbulb} phase="Phase 3"
    lede="Submit an event for the whole school, and follow it through review."
    emptyTitle="No suggestions yet"
    emptyBody="Suggest a community event and you'll be able to track whether it's pending, approved or declined."
  />
)

export const SettingsPage = () => (
  <Placeholder
    title="Settings" icon={Settings} phase="Phase 1 — appearance available now"
    lede="Your profile, calendars, reminders, parent sharing, privacy and appearance."
    emptyTitle="More settings are on the way"
    emptyBody="Theme is already available from the toggle in the sidebar. The rest arrives with each phase."
  />
)

export const AdminPage = () => (
  <Placeholder
    title="Admin" icon={ShieldCheck} phase="Phase 3"
    lede="Review suggested events, publish community events and import the school calendar."
    emptyTitle="Nothing waiting for review"
    emptyBody="Pending suggestions and calendar imports will queue up here for approval."
  />
)
