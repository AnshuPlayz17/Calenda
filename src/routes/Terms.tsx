import { LegalPage } from '@/features/legal/LegalPage'
import { TERMS } from '@/content/legal'

export function Terms() {
  return (
    <LegalPage
      title="Terms"
      intro="The short version: Calenda is free, it is one student's project, it can be wrong, and your school is still the authority on when your exams are."
      sections={TERMS}
      other={{ to: '/privacy', label: 'Privacy' }}
    />
  )
}
