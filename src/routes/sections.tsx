import { Bell, GraduationCap, Settings } from 'lucide-react'
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

export const SettingsPage = () => (
  <Placeholder
    title="Settings" icon={Settings} phase="Phase 1 — appearance available now"
    lede="Your profile, calendars, reminders, parent sharing, privacy and appearance."
    emptyTitle="More settings are on the way"
    emptyBody="Theme is already available from the toggle in the sidebar. The rest arrives with each phase."
  />
)
