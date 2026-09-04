import { isConfigured } from '@/lib/env'
import { previewSource } from './previewSource'
import { supabaseSource } from './supabaseSource'
import type { DataSource } from './source'

/**
 * Supabase when it is configured, otherwise a seeded in-memory preview. The
 * choice is made once, here, so no component has to know which it is using.
 */
export const dataSource: DataSource = isConfigured ? supabaseSource : previewSource

export const isPreview = dataSource.kind === 'preview'
export type { DataSource, EventFilters } from './source'
