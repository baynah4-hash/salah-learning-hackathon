import { Check, CircleHelp, ClipboardCheck, Save } from 'lucide-react';
import styles from './training-panels.module.css';

export type TrainingEvaluationPanelProps = {
  pronunciationScore: number | null;
  movementScore: number | null;
  finalScore: number | null;
  notes: string[];
  onSave?: () => void;
};

function Score({ label, value, final = false }: { label: string; value: number | null; final?: boolean }) {
  return (
    <div className={`${styles.scoreItem} ${final ? styles.final : ''}`} data-testid={`score-${final ? 'final' : label === 'النطق' ? 'pronunciation' : 'movement'}`}>
      <span className={styles.scoreLabel}>{label}</span>
      {value === null
        ? <span className={styles.notAssessed} data-testid="score-not-assessed">لم يُقيّم</span>
        : <strong className={styles.scoreValue} dir="ltr">{value}<small> / 100</small></strong>}
    </div>
  );
}

export function TrainingEvaluationPanel({ pronunciationScore, movementScore, finalScore, notes, onSave }: TrainingEvaluationPanelProps) {
  return (
    <section className={styles.panel} aria-labelledby="training-evaluation-title" data-testid="panel-training-evaluation">
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.headingIcon}><ClipboardCheck size={19} aria-hidden="true" /></span>
          <div>
            <h2 className={styles.title} id="training-evaluation-title">ملخّص التدريب</h2>
            <p className={styles.subtitle}>راجعي ما توفر من ملاحظات بهدوء</p>
          </div>
        </div>
        <span className={styles.tag}>للمراجعة الشخصية</span>
      </header>

      <div className={styles.scoreGrid} aria-label="نتائج التدريب">
        <Score label="النطق" value={pronunciationScore} />
        <Score label="الحركة" value={movementScore} />
        <Score label="النتيجة النهائية" value={finalScore} final />
      </div>
      <p className={styles.scoreExplanation} data-testid="evaluation-score-explanation">
        النتيجة النهائية تجمع الدرجات المتاحة فقط؛ وما لم يُقيّم يظهر بوضوح دون اعتباره صفرًا.
      </p>
      {onSave && finalScore !== null && (
        <div className={styles.buttonRow}>
          <button type="button" className={`${styles.button} ${styles.primary}`} onClick={onSave} data-testid="button-save-evaluation">
            <Save size={15} aria-hidden="true" /> احفظي تقييم اليوم على جهازك
          </button>
        </div>
      )}

      {notes.length ? (
        <ul className={styles.notes} aria-label="ملاحظات التدريب" data-testid="evaluation-notes">
          {notes.map((note, index) => <li key={`${index}-${note}`}><Check size={14} aria-hidden="true" />{note}</li>)}
        </ul>
      ) : (
        <p className={styles.notesEmpty} data-testid="evaluation-empty-notes">
          <CircleHelp size={14} aria-hidden="true" /> لا توجد ملاحظات بعد. خذي وقتك، وعودي إلى التدريب متى شئتِ.
        </p>
      )}
    </section>
  );
}

export default TrainingEvaluationPanel;
