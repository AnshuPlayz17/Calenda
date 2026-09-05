-- ---------------------------------------------------------------------------
-- Web push is the channel that actually works.
--
-- notification_preferences.channels defaulted to '{email}', which was decided
-- before it was clear which channel would be configured first. Email needs a
-- third-party sending account; web push needs a VAPID key pair, which is
-- generated locally and costs nothing.
--
-- With email unconfigured, the default meant every queued reminder was an
-- email reminder, and the dispatcher marked each one failed rather than
-- sending anything. Reminders looked broken because the default pointed at
-- the one channel that had no sender behind it.
-- ---------------------------------------------------------------------------

alter table notification_preferences
  alter column channels set default '{web_push}';

-- Move accounts that never chose for themselves. An account that has
-- deliberately picked email is left alone: exactly '{email}' is the old
-- default, anything else is a choice someone made.
update notification_preferences
   set channels = '{web_push}'
 where channels = '{email}';

-- Pending email reminders can never send -- there has never been a sender --
-- so they would sit in the queue failing forever. Nothing was ever delivered
-- through them, so nothing is lost. Rescheduling recreates them on the
-- channel the account now uses.
delete from notification_queue
 where channel = 'email'
   and state = 'pending';

comment on column notification_preferences.channels is
  'Delivery channels. Defaults to web_push: it needs only a VAPID key pair, '
  'which is free and self-generated. Email requires a sending account.';
