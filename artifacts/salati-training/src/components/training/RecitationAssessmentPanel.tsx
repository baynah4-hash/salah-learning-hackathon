import { AlertCircle, Check, CheckCircle2, Download, LockKeyhole, Mic, MicOff, RotateCw, ShieldCheck, Sparkles, Volume2 } from 'lucide-react';
import styles from './training-panels.module.css';

export type RecitationWord = {
  target: string;
  heard: string | null;
  score: number;
  status: 'matched' | 'missing' | 'different';
};

export type RecitationAssessmentPanelProps = {
  status: 'idle' | 'loading' | 'ready' | 'recording' | 'processing' | 'error';
  modelReady: boolean;
  modelProgress: number | null;
  message: string | null;
  score: number | null;
  words: RecitationWord[];
  showReference: boolean;
  onPlayReference: () => void;
  onStart: () => void;
  onStop: () => void;
};

const statusLabels = {
  idle: 'جاهز عند رغبتك',
  loading: 'جارٍ تجهيز النموذج',
  ready: 'النموذج جاهز',
  recording: 'جارٍ الاستماع',
  processing: 'جارٍ مراجعة الكلمات',
  error: 'تعذّر إكمال التقييم',
} as const;

export function RecitationAssessmentPanel({
  status, modelReady, modelProgress, message, score, words, showReference, onPlayReference, onStart, onStop,
}: RecitationAssessmentPanelProps) {
  const progress = modelProgress === null ? null : Math.max(0, Math.min(100, modelProgress));
  const canStart = status === 'idle' || status === 'ready' || status === 'error';
  const isBusy = status === 'loading' || status === 'processing';

  return (
    <section className={styles.panel} aria-labelledby="recitation-assessment-title" data-testid="panel-recitation-assessment">
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.headingIcon}><Mic size={19} aria-hidden="true" /></span>
          <div>
            <h2 className={styles.title} id="recitation-assessment-title">مراجعة التلاوة</h2>
            <p className={styles.subtitle}>ملاحظة تقريبية للكلمات، على جهازك</p>
          </div>
        </div>
        <span className={styles.tag}>تجربة خاصة</span>
      </header>

      <div className={styles.section} role="status" aria-live="polite" data-testid="recitation-model-status">
        <div className={styles.statusRow}>
          <span className={styles.statusIcon}>
            {status === 'error' ? <AlertCircle size={17} /> : modelReady ? <ShieldCheck size={17} /> : <Download size={17} />}
          </span>
          <div className={styles.statusCopy}>
            <strong className={styles.statusTitle}>{statusLabels[status]}</strong>
            <span className={styles.statusText}>
              {message ?? (modelReady
                ? 'النموذج المحلي محفوظ للاستخدام على هذا الجهاز.'
                : status === 'loading'
                  ? 'يُجهّز النموذج محليًا. قد يستغرق التنزيل الأول بعض الوقت.'
            : 'يُنزّل النموذج المحلي عند أول استخدام. بعد اكتمال التجهيز يمكن مراجعة الكلمات دون إنترنت على هذا الجهاز.')}
            </span>
            {!modelReady && progress !== null && (
              <div className={styles.progressTrack} role="progressbar" aria-label="تقدم تجهيز النموذج" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                <span className={styles.progressBar} style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.buttonRow}>
        {status === 'recording' ? (
          <button type="button" className={`${styles.button} ${styles.danger}`} onClick={onStop} data-testid="button-recitation-stop">
            <MicOff size={16} aria-hidden="true" /> إيقاف الاستماع
          </button>
        ) : (
          <button type="button" className={`${styles.button} ${styles.primary}`} onClick={onStart} disabled={!canStart || isBusy} data-testid="button-recitation-start">
            {!modelReady ? <Download size={16} aria-hidden="true" /> : status === 'error' ? <RotateCw size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
            {!modelReady ? 'تجهيز النموذج المحلي والبدء' : status === 'error' ? 'إعادة المحاولة' : 'ابدئي التلاوة'}
          </button>
        )}
        {showReference && status !== 'recording' && (
          <button type="button" className={`${styles.button} ${styles.outline}`} onClick={onPlayReference} data-testid="button-play-reference">
            <Volume2 size={16} aria-hidden="true" /> استمعي إلى النص للمقارنة
          </button>
        )}
      </div>

      <p className={styles.privacyNote} data-testid="recitation-privacy-note">
        <LockKeyhole size={14} aria-hidden="true" /> يبقى الصوت والمراجعة على جهازك؛ لا يُرسل تسجيلك إلى جهة أخرى.
      </p>

      {score !== null && (
        <div className={styles.section} aria-live="polite" data-testid="recitation-result">
          <div className={styles.statusRow}>
            <Sparkles size={17} className={styles.statusIcon} aria-hidden="true" />
            <div className={styles.statusCopy}>
              <strong className={styles.statusTitle}>نتيجة المطابقة التقريبية: <span dir="ltr">{score}%</span></strong>
              <span className={styles.statusText}>اقرئي الملاحظات كتوجيه للمراجعة، لا كحكم على التلاوة.</span>
            </div>
          </div>
          {words.length > 0 ? (
            <div className={styles.wordList} aria-label="ملاحظات الكلمات">
              {words.map((word, index) => {
                const state = word.status === 'matched' ? 'متقاربة' : word.status === 'missing' ? 'لم تُلتقط' : 'تحتاج مراجعة';
                const rowClass = word.status === 'matched' ? '' : word.status;
                return (
                  <div className={styles.wordRow} key={`${word.target}-${index}`} data-testid={`recitation-word-${index}`}>
                    <span><span className={styles.wordCaption}>النص</span><span className={styles.wordTarget}>{word.target}</span></span>
                    <span className={`${styles.wordStatus} ${rowClass ? styles[rowClass] : ''}`}>
                      {word.status === 'matched' ? <Check size={13} /> : word.status === 'missing' ? <AlertCircle size={13} /> : <RotateCw size={13} />}
                      {state}
                    </span>
                    <span><span className={styles.wordCaption}>المسموع</span><span className={styles.wordHeard}>{word.heard ?? '—'}</span></span>
                    <span className={styles.wordScore}>{word.score}%</span>
                  </div>
                );
              })}
            </div>
          ) : <p className={styles.emptyWords}>لا توجد ملاحظات كلمات لهذه المحاولة.</p>}
        </div>
      )}

      <div className={styles.limitation} data-testid="recitation-limitation">
        <AlertCircle size={15} aria-hidden="true" />
        <span>المطابقة تقريبية للكلمات المسموعة فقط؛ لا تقيّم التجويد أو القارئ، ولا تصدر حكمًا دينيًا.</span>
      </div>
      {status === 'processing' && <span className={styles.emptyWords}><CheckCircle2 size={13} aria-hidden="true" /> تُراجع المحاولة محليًا…</span>}
    </section>
  );
}

export default RecitationAssessmentPanel;
