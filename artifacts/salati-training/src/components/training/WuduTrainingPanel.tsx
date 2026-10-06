import { AlertTriangle, Check, CheckCircle2, Circle, Droplets, Play, ShieldCheck, Video, X } from 'lucide-react';
import styles from './training-panels.module.css';

export type WuduStep = {
  id: string;
  label: string;
  description: string;
  status: 'upcoming' | 'current' | 'done' | 'needs-attention';
};
export type WuduTrainingPanelProps = {
  active: boolean;
  cameraOn: boolean;
  steps: WuduStep[];
  detectionLabel: string;
  alert: { stepId: string; title: string; message: string } | null;
  summary: { completedLabels: string[]; notes: string[] } | null;
  videoOpen: boolean;
  videoUrl: string;
  videoTitle: string;
  videoStepLabel: string | null;
  onStart: () => void;
  onFinish: () => void;
  onConfirmAlert: () => void;
  onDismissAlert: () => void;
  onShowVideo: (stepId?: string) => void;
  onCloseVideo: () => void;
};

const stateText = {
  upcoming: 'قادم',
  current: 'الخطوة الحالية',
  done: 'مكتمل',
  'needs-attention': 'ملاحظة للتدرّب',
} as const;

export function WuduTrainingPanel({
  active, cameraOn, steps, detectionLabel, alert, summary, videoOpen, videoUrl, videoTitle,
  videoStepLabel, onStart, onFinish, onConfirmAlert, onDismissAlert, onShowVideo, onCloseVideo,
}: WuduTrainingPanelProps) {
  const currentStep = steps.find((step) => step.status === 'current');
  const alertStep = alert ? steps.find((step) => step.id === alert.stepId) : undefined;

  return (
    <section className={styles.panel} aria-labelledby="wudu-training-title" data-testid="panel-wudu-training">
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.headingIcon}><Droplets size={19} aria-hidden="true" /></span>
          <div>
            <h2 className={styles.title} id="wudu-training-title">التدرّب على الوضوء</h2>
            <p className={styles.subtitle}>خطوات مرتّبة وملاحظات تقريبية، على مهل</p>
          </div>
        </div>
        <span className={styles.tag}>خصوصية أولًا</span>
      </header>

      <div className={styles.buttonRow}>
        {active ? (
          <button type="button" className={`${styles.button} ${styles.primary}`} onClick={onFinish} data-testid="button-wudu-finish">
            <CheckCircle2 size={16} aria-hidden="true" /> إنهاء التدريب
          </button>
        ) : (
          <button type="button" className={`${styles.button} ${styles.primary}`} onClick={onStart} data-testid="button-wudu-start">
            <Play size={16} aria-hidden="true" /> ابدئي التدريب
          </button>
        )}
        <button type="button" className={`${styles.button} ${styles.outline}`} onClick={() => onShowVideo()} data-testid="button-wudu-full-video">
          <Video size={16} aria-hidden="true" /> مشاهدة الطريقة كاملة
        </button>
      </div>

      <div className={styles.detection} role="status" aria-live="polite" data-testid="wudu-detection">
        <ShieldCheck size={17} aria-hidden="true" />
        <span>
          <strong className={styles.detectionLabel}>{detectionLabel}</strong>
          <span className={styles.detectionCaption}>
            {active
              ? cameraOn ? 'الملاحظة البصرية تقريبية؛ تابعي التدريب بالطريقة التي تناسبك.' : 'التدريب مستمر، لكن المعاينة غير مفعّلة حاليًا.'
              : 'ستظهر هنا ملاحظة التقدّم أثناء التدريب. لا نطلب تشغيل كاميرا منفصلة.'}
          </span>
        </span>
      </div>

      {currentStep && active && (
        <p className={styles.hint} data-testid="wudu-current-step"><Circle size={13} aria-hidden="true" /> خطوتك الآن: {currentStep.label}</p>
      )}

      {steps.length ? (
        <ol className={styles.stepList} aria-label="خطوات الوضوء" data-testid="wudu-step-list">
          {steps.map((step, index) => {
            const kind = step.status === 'current' ? 'current' : step.status === 'done' ? 'done' : step.status === 'needs-attention' ? 'attention' : '';
            return (
              <li key={step.id} className={`${styles.step} ${kind ? styles[kind] : ''}`} data-testid={`wudu-step-${step.id}`}>
                <span className={styles.stepMarker} aria-hidden="true">
                  {step.status === 'done' ? <Check size={15} /> : index + 1}
                </span>
                <span className={styles.stepBody}>
                  <strong className={styles.stepTitle}>{step.label}</strong>
                  <span className={styles.stepDescription}>{step.description}</span>
                  <span className={styles.stepBadge}>{stateText[step.status]}</span>
                </span>
                <button type="button" className={styles.videoStepButton} onClick={() => onShowVideo(step.id)} aria-label={`شاهدي الطريقة الصحيحة لخطوة ${step.label}`} data-testid={`button-wudu-video-${step.id}`}>
                  <Play size={13} aria-hidden="true" /> الطريقة
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className={styles.section} data-testid="wudu-steps-empty">
          <strong className={styles.statusTitle}>خطوات الوضوء ستظهر هنا</strong>
          <span className={styles.statusText}>ابدئي التدريب لعرض التقدّم خطوة بخطوة.</span>
        </div>
      )}

      {alert && (
        <aside className={styles.alert} aria-labelledby="wudu-alert-title" data-testid="wudu-observation-alert">
          <div className={styles.alertHeading}>
            <AlertTriangle size={17} aria-hidden="true" />
            <div>
              <h3 className={styles.alertTitle} id="wudu-alert-title">{alert.title}</h3>
              <p className={styles.alertMessage}>{alert.message}{alertStep ? ` · ${alertStep.label}` : ''}</p>
            </div>
          </div>
          <div className={styles.alertActions}>
            <button type="button" className={`${styles.button} ${styles.primary}`} onClick={onConfirmAlert} data-testid="button-wudu-alert-confirm">
              <Check size={15} aria-hidden="true" /> تأكيد الملاحظة
            </button>
            <button type="button" className={`${styles.button} ${styles.outline}`} onClick={onDismissAlert} data-testid="button-wudu-alert-dismiss">
              متابعة دون تغيير
            </button>
            <button type="button" className={styles.videoStepButton} onClick={() => onShowVideo(alert.stepId)} data-testid="button-wudu-alert-video">
              <Play size={13} aria-hidden="true" /> شاهدي الطريقة الصحيحة
            </button>
          </div>
        </aside>
      )}

      {summary && (
        <div className={styles.summary} aria-live="polite" data-testid="wudu-summary">
          <h3 className={styles.summaryTitle}><CheckCircle2 size={17} aria-hidden="true" /> ملخّص محاولتك</h3>
          {summary.completedLabels.length ? (
            <div className={styles.summaryLabels} aria-label="الخطوات المكتملة">
              {summary.completedLabels.map((label, index) => <span className={styles.summaryChip} key={`${label}-${index}`}>{label}</span>)}
            </div>
          ) : <p className={styles.statusText}>لم تُسجّل خطوات مكتملة في هذه المحاولة.</p>}
          {summary.notes.length > 0 && (
            <ul className={styles.notes} data-testid="wudu-summary-notes">
              {summary.notes.map((note, index) => <li key={`${index}-${note}`}><Check size={14} aria-hidden="true" />{note}</li>)}
            </ul>
          )}
        </div>
      )}

      {videoOpen && (
        <div className={styles.videoDialog} role="presentation" data-testid="wudu-video-overlay">
          <section className={styles.videoCard} role="dialog" aria-modal="true" aria-labelledby="wudu-video-title" data-testid="wudu-video-dialog">
            <header className={styles.videoDialogHeader}>
              <div>
                <h3 className={styles.videoTitle} id="wudu-video-title">{videoTitle}</h3>
                <p className={styles.videoSubtitle}>{videoStepLabel ? `شرح خطوة: ${videoStepLabel}` : 'مشاهدة توضيحية لطريقة الوضوء'}</p>
              </div>
              <button type="button" className={styles.closeButton} onClick={onCloseVideo} aria-label="إغلاق الفيديو" data-testid="button-wudu-video-close"><X size={17} aria-hidden="true" /></button>
            </header>
            {videoUrl ? (
              <video className={styles.video} src={videoUrl} controls playsInline preload="none" aria-label={videoTitle} data-testid="wudu-training-video">
                لا يدعم متصفحك تشغيل الفيديو.
              </video>
            ) : (
              <div className={styles.videoUnavailable} role="status" data-testid="wudu-video-unavailable">
                الفيديو غير متاح حاليًا. يمكنك متابعة الخطوات المكتوبة بهدوء.
              </div>
            )}
            <a
              className={styles.videoSource}
              href="https://risala.prh.gov.sa/ar/content/514"
              target="_blank"
              rel="noreferrer"
            >
              المصدر الرسمي للفيديو: رسالة الحرمين
            </a>
          </section>
        </div>
      )}
    </section>
  );
}

export default WuduTrainingPanel;
