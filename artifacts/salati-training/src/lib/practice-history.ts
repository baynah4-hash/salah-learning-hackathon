export type PracticeRecord = {
  id: string;
  dateKey: string;
  recordedAt: string;
  mode: 'recitation' | 'movement';
  itemTitle: string;
  pronunciationScore: number | null;
  movementScore: number | null;
  finalScore: number;
};

export const PRACTICE_HISTORY_KEY = 'salati-practice-history-v1';

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function validScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

export function loadPracticeHistory(storage?: Pick<Storage, 'getItem'>): PracticeRecord[] {
  try {
    const source = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    const raw = source?.getItem(PRACTICE_HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is PracticeRecord => {
      if (!item || typeof item !== 'object') return false;
      const record = item as Partial<PracticeRecord>;
      return typeof record.id === 'string'
        && typeof record.dateKey === 'string'
        && typeof record.recordedAt === 'string'
        && (record.mode === 'recitation' || record.mode === 'movement')
        && typeof record.itemTitle === 'string'
        && validScore(record.finalScore)
        && (record.pronunciationScore === null || validScore(record.pronunciationScore))
        && (record.movementScore === null || validScore(record.movementScore));
    }).slice(-500);
  } catch {
    return [];
  }
}

export function persistPracticeHistory(
  records: PracticeRecord[],
  storage?: Pick<Storage, 'setItem'>,
): void {
  try {
    const target = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    target?.setItem(PRACTICE_HISTORY_KEY, JSON.stringify(records.slice(-500)));
  } catch {
    // The current training result remains visible even when browser storage is unavailable.
  }
}

export function createPracticeRecord(
  input: Omit<PracticeRecord, 'id' | 'dateKey' | 'recordedAt'>,
  now = new Date(),
): PracticeRecord {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${now.getTime()}-${Math.random().toString(36).slice(2, 9)}`;
  return { ...input, id, dateKey: localDateKey(now), recordedAt: now.toISOString() };
}

export function appendPracticeRecord(
  records: PracticeRecord[],
  record: PracticeRecord,
): PracticeRecord[] {
  return [...records, record].slice(-500);
}
