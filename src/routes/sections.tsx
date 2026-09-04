import { Bell } from 'lucide-react'
import { Placeholder } from './Placeholder'


export const NotificationsPage = () => (
  <Placeholder
    title="Notifications" icon={Bell} phase="Phase 7"
    lede="Reminders by email and push, on the schedule you choose."
    emptyTitle="You're up to date"
    emptyBody="Reminders you receive will be listed here, with what triggered each one."
  />
)

