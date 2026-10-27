import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { StudyDetailModal } from '../../src/components/StudyDetailModal';
import type { Subject } from '../../src/types';

const subject: Subject = {
  id: 'matematica',
  name: 'Matemática & Raciocínio Lógico',
  category: 'Exatas',
  color: '#0ea5e9',
};

function CalendarSyncModalHarness() {
  const [saved, setSaved] = useState('');
  return (
    <>
      <StudyDetailModal
        isOpen
        onClose={() => undefined}
        subject={subject}
        dayInfo={{ index: 0, name: 'Segunda-feira', dateStr: '2026-10-26' }}
        existingEntry={null}
        hasGoogleCalendar
        onSave={async (data) => setSaved(JSON.stringify(data))}
        isSaving={false}
      />
      <output data-testid="saved-payload">{saved}</output>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<CalendarSyncModalHarness />);
