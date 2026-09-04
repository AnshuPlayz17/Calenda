-- ============================================================================
-- Calenda -- reference data
-- Categories and the current school year. Safe to re-run.
-- ============================================================================

insert into event_categories (slug, name, color_token, icon, sort_order, is_system) values
  ('academic',    'Academic',       'cat-academic',    'graduation-cap',  10, true),
  ('school',      'School',         'cat-school',      'school',          20, true),
  ('pa-day',      'PA Day',         'cat-pa-day',      'coffee',          30, true),
  ('holiday',     'Holiday',        'cat-holiday',     'palmtree',        40, true),
  ('exam',        'Exam',           'cat-exam',        'file-check',      50, true),
  ('assignment',  'Assignment',     'cat-assignment',  'clipboard-list',  60, true),
  ('sports',      'Sports',         'cat-sports',      'trophy',          70, true),
  ('clubs',       'Clubs',          'cat-clubs',       'users',           80, true),
  ('trips',       'Trips',          'cat-trips',       'map',             90, true),
  ('performance', 'Performance',    'cat-performance', 'music',          100, true),
  ('family',      'Parent/Family',  'cat-family',      'home',           110, true),
  ('personal',    'Personal',       'cat-personal',    'user',           120, true),
  ('other',       'Other',          'cat-other',       'circle',         130, true)
on conflict (slug) do nothing;

-- Dates taken from the 2026-27 Important Dates PDF: first student day is
-- 8 September 2026 and the last staff day is 30 June 2027.
insert into school_years (label, starts_on, ends_on, is_current) values
  ('2026–27', '2026-09-01', '2027-06-30', true)
on conflict (label) do nothing;
