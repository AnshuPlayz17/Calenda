import { Bell, GraduationCap } from 'lucide-react'
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

