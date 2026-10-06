import { CalendarDays, Clock3, TrendingUp } from 'lucide-react';
import type { PracticeRecord } from '@/lib/practice-history';

type PracticeHistoryPanelProps = {
  records: PracticeRecord[];
  rangeDays: 30 | 60;
  onRangeChange: (days: 30 | 60) => void;
};

function dateKeyFromOffset(offset: number, now: Date) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  date.setDate(date.getDate() - offset);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatDay(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('ar-SA', { day: 'numeric', month: 'short' })
    .format(new Date(year, month - 1, day));
}

export function PracticeHistoryPanel({ records, rangeDays, onRangeChange }: PracticeHistoryPanelProps) {
  const now = new Date();
  const todayKey = dateKeyFromOffset(0, now);
  const startKey = dateKeyFromOffset(rangeDays - 1, now);
  const rangeRecords = records.filter((record) => record.dateKey >= startKey && record.dateKey <= todayKey);
  const average = rangeRecords.length
    ? Math.round(rangeRecords.reduce((total, record) => total + record.finalScore, 0) / rangeRecords.length)
    : null;
  const lastSeven = Array.from({ length: 7 }, (_, index) => {
    const dateKey = dateKeyFromOffset(6 - index, now);
    const dayRecords = records.filter((record) => record.dateKey === dateKey);
    const score = dayRecords.length
      ? Math.round(dayRecords.reduce((total, record) => total + record.finalScore, 0) / dayRecords.length)
      : null;
    return { dateKey, score, count: dayRecords.length };
  });
  const maxScore = Math.max(1, ...lastSeven.map((day) => day.score ?? 0));
  const recentRecords = [...rangeRecords].sort((left, right) => right.recordedAt.localeCompare(left.recordedAt)).slice(0, 5);

  return (
    <section className="progress-panel" aria-labelledby="progress-title" data-testid="panel-practice-history">
      <div className="progress-panel-heading">
        <div className="progress-heading-copy">
          <span className="progress-icon"><TrendingUp size={19} aria-hidden="true" /></span>
          <div>
            <h2 id="progress-title">تقدّمك اليومي</h2>
            <p>النتائج محفوظة محليًا على هذا الجهاز فقط</p>
          </div>
        </div>
        <div className="progress-range" role="group" aria-label="مدة عرض التقييم التراكمي">
          <button type="button" aria-pressed={rangeDays === 30} onClick={() => onRangeChange(30)}>شهر</button>
          <button type="button" aria-pressed={rangeDays === 60} onClick={() => onRangeChange(60)}>شهران</button>
        </div>
      </div>

      <div className="progress-stats">
        <div className="progress-stat">
          <span>محاولات آخر {rangeDays === 30 ? '٣٠' : '٦٠'} يوم</span>
          <strong>{rangeRecords.length}</strong>
        </div>
        <div className="progress-stat featured">
          <span>المتوسط التراكمي</span>
          <strong>{average === null ? '—' : <>{average}<small>٪</small></>}</strong>
        </div>
        <div className="progress-stat">
          <span>تقييم اليوم</span>
          <strong>{records.filter((record) => record.dateKey === todayKey).length || '—'}</strong>
        </div>
      </div>

      <div className="progress-chart" role="img" aria-label="متوسط التقييم اليومي في آخر سبعة أيام">
        {lastSeven.map((day) => (
          <div className="progress-day" key={day.dateKey}>
            <strong>{day.score === null ? '—' : `${day.score}٪`}</strong>
            <div className="progress-bar-track">
              <span style={{ height: day.score === null ? '4px' : `${Math.max(10, day.score / maxScore * 100)}%` }} />
            </div>
            <span>{formatDay(day.dateKey)}</span>
          </div>
        ))}
      </div>

      <div className="progress-records-heading">
        <h3><CalendarDays size={15} aria-hidden="true" /> آخر المحاولات</h3>
        <span>آخر {rangeDays} يوم</span>
      </div>
      {recentRecords.length ? (
        <ul className="progress-records" data-testid="practice-record-list">
          {recentRecords.map((record) => (
            <li key={record.id}>
              <span className="record-title">{record.itemTitle}</span>
              <span className="record-date"><Clock3 size={12} aria-hidden="true" /> {formatDay(record.dateKey)}</span>
              <strong>{record.finalScore}٪</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="progress-empty" data-testid="practice-history-empty">
          احفظي أول نتيجة بعد مراجعة التلاوة، وسيظهر هنا تقييم اليوم والأيام السابقة.
        </p>
      )}
      <p className="progress-disclaimer">المؤشر يقارن الكلمات التي التقطها النموذج بالنص فقط، ولا يقيّم التجويد أو صحة الصلاة.</p>
    </section>
  );
}

export default PracticeHistoryPanel;
