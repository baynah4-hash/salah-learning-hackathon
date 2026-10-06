import { type ReactNode, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  AlertCircle,
  Activity,
  BookOpen,
  Camera,
  CameraOff,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  HandHeart,
  LockKeyhole,
  Mic,
  MicOff,
  MoveVertical,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { usePoseAnalysis } from '@/hooks/use-pose-analysis';
import { useRecitationAssessment } from '@/hooks/use-recitation-assessment';
import { RecitationAssessmentPanel } from '@/components/training/RecitationAssessmentPanel';
import { TrainingEvaluationPanel } from '@/components/training/TrainingEvaluationPanel';
import { PracticeHistoryPanel } from '@/components/training/PracticeHistoryPanel';
import { prayerTexts } from '@/lib/prayer-recitation';
import {
  appendPracticeRecord,
  createPracticeRecord,
  loadPracticeHistory,
  persistPracticeHistory,
  type PracticeRecord,
} from '@/lib/practice-history';
import type { PrayerPose } from '@/lib/pose-classifier';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();
type PracticeMode = 'recitation' | 'movement';
type MovementKey = 'standing' | 'bowing' | 'prostration' | 'sitting';

const movements: Record<MovementKey, { title: string; guidance: string; cue: string }> = {
  standing: {
    title: 'القيام',
    guidance: 'قفي بهدوء واتجهي إلى القبلة. اجعلي ظهرك معتدلًا، وقدميك مستقرّتين، وانظري إلى موضع سجودك.',
    cue: 'السكينة تبدأ من الوقوف',
  },
  bowing: {
    title: 'الركوع',
    guidance: 'انحني حتى يستوي ظهرك، وضعي يديك على ركبتيك مع ثباتهما. خذي وقتك في الوصول إلى وضع مريح ومتزن.',
    cue: 'ظهر مستوٍ وطمأنينة',
  },
  prostration: {
    title: 'السجود',
    guidance: 'انزلي بسكينة إلى السجود، مع استقرار الجبهة والكفين والركبتين وأطراف القدمين. لا تتعجلي الانتقال.',
    cue: 'انتقال هادئ وثبات',
  },
  sitting: {
    title: 'الجلوس',
    guidance: 'اجلسي بطمأنينة بين السجدتين أو للتشهد، مع استقرار الجسد وراحة الظهر. اختاري هيئة تناسب استطاعتك.',
    cue: 'استقرار وراحة',
  },
};

const poseNames: Record<PrayerPose, string> = {
  standing: 'القيام',
  bowing: 'الركوع',
  prostration: 'السجود',
};
const poseCorrections: Record<PrayerPose, string> = {
  standing: 'للتدرّب على القيام، جرّبي رفع الجذع بهدوء والوقوف بثبات مريح.',
  bowing: 'للتدرّب على الركوع، جرّبي إمالة الجذع للأمام تدريجيًا مع إبقاء الحركة مريحة.',
  prostration: 'للتدرّب على السجود، انتقلي إلى الأسفل بتأنٍ وبالقدر المريح لك.',
};

function Home() {
  const [mode, setMode] = useState<PracticeMode>('recitation');
  const [movement, setMovement] = useState<MovementKey>('standing');
  const [selectedPrayerTextId, setSelectedPrayerTextId] = useState('fatiha');
  const [assisted, setAssisted] = useState(true);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [practiceRecords, setPracticeRecords] = useState<PracticeRecord[]>(() => loadPracticeHistory());
  const [historyRangeDays, setHistoryRangeDays] = useState<30 | 60>(30);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [poseAnalysisEnabled, setPoseAnalysisEnabled] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordingMime, setRecordingMime] = useState('audio/webm');
  const [status, setStatus] = useState('مساحتك جاهزة. اختاري تدريبك وابدئي حين تشائين.');
  const [statusError, setStatusError] = useState(false);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [elapsed, setElapsed] = useState(0);
  const [switchSupported, setSwitchSupported] = useState(false);
  const selectedPrayerText = prayerTexts.find((item) => item.id === selectedPrayerTextId) ?? prayerTexts[3];
  const recitation = useRecitationAssessment(selectedPrayerText.text);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const objectUrlRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const recordingRef = useRef(false);
  const poseAnalysis = usePoseAnalysis(
    videoRef,
    stream,
    poseAnalysisEnabled && mode === 'movement' && movement !== 'sitting',
  );

  useEffect(() => {
    const updateOnlineState = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnlineState);
    window.addEventListener('offline', updateOnlineState);
    return () => {
      window.removeEventListener('online', updateOnlineState);
      window.removeEventListener('offline', updateOnlineState);
    };
  }, []);

  useEffect(() => {
    persistPracticeHistory(practiceRecords);
  }, [practiceRecords]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    if (!recording) return;
    const startedAt = Date.now();
    setElapsed(0);
    timerRef.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [recording]);

  useEffect(() => () => {
    recordingRef.current = false;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      try { recorder.stop(); } catch { /* recorder may already be closing */ }
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  const updateStatus = (message: string, error = false) => {
    setStatus(message);
    setStatusError(error);
  };

  const startCamera = async (nextFacing = facing, includeAudio = true) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      updateStatus('متصفحك لا يتيح الوصول إلى الكاميرا. جرّبي صفحة آمنة عبر HTTPS أو localhost.', true);
      return;
    }
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: nextFacing } },
        audio: includeAudio,
      });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = nextStream;
      setStream(nextStream);
      setFacing(nextFacing);
      const devices: MediaDeviceInfo[] = await navigator.mediaDevices
        .enumerateDevices()
        .catch((): MediaDeviceInfo[] => []);
      setSwitchSupported(devices.filter((device) => device.kind === 'videoinput').length > 1);
      updateStatus(
        includeAudio
          ? 'الكاميرا والميكروفون يعملان على جهازك فقط. لا يُرسل أي شيء إلى جهة أخرى.'
          : 'الكاميرا تعمل على جهازك فقط؛ لا يُطلب الميكروفون إلا عند بدء التسجيل الصوتي.',
      );
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      const message = name === 'NotAllowedError'
        ? `لم يُسمح باستخدام ${includeAudio ? 'الكاميرا أو الميكروفون' : 'الكاميرا'}. يمكنك تعديل الإذن من إعدادات المتصفح.`
        : name === 'NotFoundError'
          ? `لم نعثر على ${includeAudio ? 'كاميرا أو ميكروفون' : 'كاميرا'} متاحة على هذا الجهاز.`
          : name === 'NotReadableError'
            ? 'تعذّر فتح الكاميرا؛ قد تكون مستخدمة في تطبيق آخر.'
            : 'تعذّر تشغيل الكاميرا. تحققي من الأذونات واستخدمي HTTPS أو localhost.';
      updateStatus(message, true);
    }
  };

  const stopCamera = () => {
    setPoseAnalysisEnabled(false);
    if (recordingRef.current) stopRecording();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
    streamRef.current = null;
    setStream(null);
    setSwitchSupported(false);
    updateStatus('أُوقفت الكاميرا والميكروفون. بقي تسجيلك السابق متاحًا للمراجعة هنا.');
  };

  const switchCamera = async () => {
    const nextFacing = facing === 'user' ? 'environment' : 'user';
    const previous = streamRef.current;
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: nextFacing } },
        audio: (previous?.getAudioTracks().length ?? 0) > 0,
      });
      previous?.getTracks().forEach((track) => track.stop());
      streamRef.current = nextStream;
      setStream(nextStream);
      setFacing(nextFacing);
      const devices: MediaDeviceInfo[] = await navigator.mediaDevices
        .enumerateDevices()
        .catch((): MediaDeviceInfo[] => []);
      setSwitchSupported(devices.filter((device) => device.kind === 'videoinput').length > 1);
      updateStatus('تم تبديل الكاميرا. المعاينة ما زالت على جهازك.');
    } catch {
      updateStatus('لا تتوفر كاميرا أخرى للتبديل إليها على هذا الجهاز.', true);
      setSwitchSupported(false);
    }
  };

  const startRecording = async () => {
    const currentStream = streamRef.current;
    if (!currentStream) {
      updateStatus('شغّلي الكاميرا والميكروفون أولًا لبدء التسجيل.', true);
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      updateStatus('التسجيل غير مدعوم في هذا المتصفح. يمكنك تجربة متصفح أحدث.', true);
      return;
    }
    let recordingStream = currentStream;
    if (!currentStream.getAudioTracks().some((track) => track.readyState === 'live')) {
      updateStatus('يحتاج التسجيل الصوتي إلى إذن الميكروفون. لن يبدأ التسجيل قبل موافقتك.');
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (streamRef.current !== currentStream) {
          audioStream.getTracks().forEach((track) => track.stop());
          updateStatus('تغيّرت الكاميرا قبل بدء التسجيل. حاولي مرة أخرى.', true);
          return;
        }
        audioStreamRef.current = audioStream;
        recordingStream = new MediaStream([
          ...currentStream.getVideoTracks(),
          ...audioStream.getAudioTracks(),
        ]);
      } catch {
        updateStatus('لم يُسمح باستخدام الميكروفون. يمكنك السماح به في إعدادات المتصفح ثم المحاولة مجددًا.', true);
        return;
      }
    }
    const options = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
      .find((type) => MediaRecorder.isTypeSupported?.(type));
    try {
      const recorder = options ? new MediaRecorder(recordingStream, { mimeType: options }) : new MediaRecorder(recordingStream);
      chunksRef.current = [];
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        recordingRef.current = false;
        setRecording(false);
        audioStreamRef.current?.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
        updateStatus('حدثت مشكلة أثناء التسجيل. أوقفيه ثم حاولي مرة أخرى.', true);
      };
      recorder.onstop = () => {
        if (!chunksRef.current.length) {
          audioStreamRef.current?.getTracks().forEach((track) => track.stop());
          audioStreamRef.current = null;
          updateStatus('انتهى التسجيل، لكن لم يتوفر ملف للمراجعة. حاولي تسجيلًا جديدًا.', true);
          return;
        }
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setRecordedUrl(url);
        setRecordingMime(blob.type || 'video/webm');
        audioStreamRef.current?.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
        updateStatus('اكتمل تسجيلك وحُفظ مؤقتًا في هذه الصفحة. شاهديه أو نزّليه لمراجعته بنفسك.');
      };
      recorder.start(250);
      recordingRef.current = true;
      setRecording(true);
      setRecordedUrl(null);
      updateStatus('جارٍ التسجيل على جهازك. أوقفيه عندما تنتهين.');
    } catch {
      audioStreamRef.current?.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
      updateStatus('تعذّر بدء التسجيل. قد لا يدعم المتصفح تنسيق التسجيل المتاح.', true);
    }
  };

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
        recordingRef.current = false;
        setRecording(false);
      } catch {
        updateStatus('تعذّر إنهاء التسجيل بأمان. أوقفي الكاميرا ثم حاولي مجددًا.', true);
      }
    }
  }

  const speakExcerpt = () => {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      updateStatus('القراءة الصوتية غير مدعومة في هذا المتصفح.', true);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(selectedPrayerText.text.replace(/ ۞ /gu, ' '));
    utterance.lang = 'ar-SA';
    utterance.rate = 0.82;
    utterance.onstart = () => updateStatus('تُقرأ الآيات بصوت المتصفح. هذه القراءة مساعدة فقط.');
    utterance.onerror = () => updateStatus('تعذّرت القراءة الصوتية. قد لا يتوفر صوت عربي في جهازك.', true);
    window.speechSynthesis.speak(utterance);
  };

  const saveRecitationEvaluation = () => {
    if (recitation.score === null) return;
    const record = createPracticeRecord({
      mode: 'recitation',
      itemTitle: selectedPrayerText.title,
      pronunciationScore: recitation.score,
      movementScore: null,
      finalScore: recitation.score,
    });
    setPracticeRecords((current) => appendPracticeRecord(current, record));
    updateStatus('حُفظ تقييم اليوم على هذا الجهاز فقط؛ ويمكنك الرجوع إليه خلال الشهر أو الشهرين القادمين.');
  };

  const selectedMovement = movements[movement];
  const selectedTargetPose: PrayerPose | null = movement === 'sitting' ? null : movement;
  const poseFeedback = () => {
    if (movement === 'sitting') {
      return 'التحليل الحالي يميّز القيام والركوع والسجود فقط. اختاري إحدى هذه الحركات للتوجيه.';
    }
    if (poseAnalysis.status === 'loading') {
      return 'يُحمّل نموذج تقدير الوضعية على جهازك. قد يستغرق ذلك لحظات في أول مرة.';
    }
    if (poseAnalysis.status === 'error') {
      return poseAnalysis.message ?? 'تعذّر تشغيل التحليل. أوقفيه ثم أعيدي المحاولة.';
    }
    if (poseAnalysis.status === 'idle') {
      return 'ضعي الهاتف بزاوية جانبية، وأظهري جسمك كاملًا ضمن الإطار للحصول على قراءة أوضح.';
    }
    if (!poseAnalysis.pose) {
      return poseAnalysis.clarity === 'unclear'
        ? 'لم يظهر الجسم بوضوح. جرّبي إضاءة أفضل، وإظهار الجسم كاملًا، ووضع الهاتف بزاوية جانبية.'
        : 'لم تتضح الحركة بعد. ثبّتي الهاتف قليلًا وامنحي النموذج لحظة لقراءة الوضعية.';
    }
    if (poseAnalysis.clarity === 'unclear') {
      const possiblePose = poseNames[poseAnalysis.pose];
      const correction = poseAnalysis.pose !== selectedTargetPose && assisted
        ? ` للتدرّب على ${poseNames[movement]}، ${poseCorrections[movement]}`
        : '';
      return `القراءة منخفضة الوضوح؛ قد تكون أقرب إلى ${possiblePose}. أظهري جسمك كاملًا وحسّني الإضاءة لتأكيدها.${correction}`;
    }
    if (poseAnalysis.pose === selectedTargetPose) {
      return `الوضعية الأقرب تبدو متوافقة مع تدريب ${poseNames[selectedTargetPose]}. هذه قراءة بصرية تقريبية قد تتأثر بزاوية الهاتف والإضاءة.`;
    }
    if (!assisted) {
      return 'الوضعية الأقرب تختلف عن الحركة المختارة. فعّلي «بمساعدة» إذا رغبتِ في عرض توجيه التصحيح.';
    }
    return poseCorrections[movement];
  };
  const poseStatusLabel = movement === 'sitting'
    ? 'غير متاح للجلوس'
    : poseAnalysis.status === 'loading'
      ? 'جارٍ تجهيز التحليل'
      : poseAnalysis.status === 'error'
        ? 'تعذّر تشغيل التحليل'
        : poseAnalysis.pose
          ? `${poseAnalysis.clarity === 'unclear' ? 'قراءة منخفضة الوضوح · ' : ''}الأقرب: ${poseNames[poseAnalysis.pose]}`
          : poseAnalysis.status === 'analyzing'
            ? 'بانتظار وضوح الحركة'
            : 'التحليل متوقف';
  const formattedTime = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  return (
    <div className="app-shell" dir="rtl">
      <header className="topbar">
        <div className="brand" data-testid="brand-salati">
          <div className="brand-mark" aria-hidden="true"><Sparkles size={20} strokeWidth={1.5} /></div>
          <div>
            <div className="brand-name">صلاتي</div>
            <div className="brand-caption">تدرّبي على مهل، وبخصوصية</div>
          </div>
        </div>
        <div className="privacy-chip" data-testid="status-privacy">
          {isOnline ? <LockKeyhole size={14} aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />}
          <span>{isOnline ? 'خصوصيتك أولًا' : 'وضع دون إنترنت'}</span>
        </div>
      </header>

      <main className="main-wrap">
        <section className="welcome" aria-labelledby="page-title">
          <div>
            <h1 id="page-title" data-testid="text-page-title">خطوة هادئة نحو إتقانك</h1>
            <p>تدرّبي على التلاوة أو حركات الصلاة، وراجعي محاولتك بنفسك.</p>
          </div>
          <div className="session-index">مساحتك الخاصة <span aria-hidden="true">·</span> على جهازك</div>
        </section>

        <div className="workspace">
          <section className="panel training-panel" aria-labelledby="practice-heading">
            <div className="panel-heading">
              <h2 id="practice-heading">اختاري ما تريدين التدرّب عليه</h2>
              <span className="eyebrow">ممارسة شخصية</span>
            </div>

            <div className="mode-switch" role="group" aria-label="نوع التدريب">
              <button
                type="button"
                className={mode === 'recitation' ? 'active' : ''}
                aria-pressed={mode === 'recitation'}
                data-testid="button-mode-recitation"
                onClick={() => { setMode('recitation'); setPoseAnalysisEnabled(false); updateStatus('اخترتِ تدريب التلاوة. حددي النص ثم ابدئي المراجعة المحلية.'); }}
              >
                تلاوة
              </button>
              <button
                type="button"
                className={mode === 'movement' ? 'active' : ''}
                aria-pressed={mode === 'movement'}
                data-testid="button-mode-movement"
                onClick={() => { setMode('movement'); updateStatus('اخترتِ التدريب على حركات الصلاة. اختاري الحركة لعرض إرشادها.'); }}
              >
                حركات الصلاة
              </button>
            </div>

            {mode === 'recitation' ? (
              <div data-testid="section-recitation">
                <label className="field-label" htmlFor="recitation-content">النص للتدرّب</label>
                <div className="select-wrap">
                  <select
                    id="recitation-content"
                    value={selectedPrayerTextId}
                    onChange={(event) => setSelectedPrayerTextId(event.target.value)}
                    data-testid="select-recitation"
                  >
                    {prayerTexts.map((item) => (
                      <option key={item.id} value={item.id}>{item.stage} · {item.title}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} aria-hidden="true" />
                </div>
                {assisted ? (
                  <>
                    <div className="verse-card" data-testid="text-quran-excerpt">
                      <div className="verse-label"><BookOpen size={13} aria-hidden="true" /> {selectedPrayerText.stage} · {selectedPrayerText.title}</div>
                      <div className="verse-text" lang="ar" dir="rtl">
                        {selectedPrayerText.text}
                      </div>
                      {selectedPrayerText.note && <p className="verse-note">{selectedPrayerText.note}</p>}
                    </div>
                    <button type="button" className="speak-button" onClick={speakExcerpt} data-testid="button-speak-excerpt">
                      <Volume2 size={16} aria-hidden="true" />
                      استمعي إلى النص بصوت جهازك
                    </button>
                  </>
                ) : (
                  <div className="movement-guide" data-testid="text-unassisted">
                    <h3>مساحة للتذكّر من نفسك</h3>
                    <p>أخفيْنا النص والإرشادات لتتدرّبي دون مساعدة. اختاري «بمساعدة» لإظهارهما متى احتجتِ.</p>
                  </div>
                )}
                <RecitationAssessmentPanel
                  status={recitation.status}
                  modelReady={recitation.modelReady}
                  modelProgress={recitation.modelProgress}
                  message={recitation.message}
                  score={recitation.score}
                  words={recitation.words}
                  showReference={assisted}
                  onPlayReference={speakExcerpt}
                  onStart={recitation.onStart}
                  onStop={recitation.onStop}
                />
              </div>
            ) : (
              <div data-testid="section-movement">
                <label className="field-label" htmlFor="movement-select">اختاري الحركة</label>
                <div className="select-wrap">
                  <select
                    id="movement-select"
                    value={movement}
                    onChange={(event) => setMovement(event.target.value as MovementKey)}
                    data-testid="select-movement"
                  >
                    <option value="standing">القيام</option>
                    <option value="bowing">الركوع</option>
                    <option value="prostration">السجود</option>
                    <option value="sitting">الجلوس</option>
                  </select>
                  <ChevronDown size={16} aria-hidden="true" />
                </div>
                {assisted ? (
                  <div className="movement-guide" data-testid={`guide-movement-${movement}`}>
                    <h3>{selectedMovement.title}</h3>
                    <p>{selectedMovement.guidance}</p>
                    <span className="guide-tag"><MoveVertical size={13} aria-hidden="true" /> {selectedMovement.cue}</span>
                  </div>
                ) : (
                  <div className="movement-guide" data-testid="text-unassisted">
                    <h3>{selectedMovement.title}</h3>
                    <p>تدرّبي على الحركة التي اخترتِها دون إرشاد ظاهر. أعيدي المساعدة متى رغبتِ.</p>
                  </div>
                )}
              </div>
            )}

            <div className="help-block">
              <span className="field-label">طريقة التمرين</span>
              <div className="mode-switch" role="group" aria-label="مستوى المساعدة">
                <button
                  type="button"
                  className={assisted ? 'active' : ''}
                  aria-pressed={assisted}
                  data-testid="button-assisted"
                  onClick={() => { setAssisted(true); updateStatus('وضع المساعدة مفعّل؛ ستظهر الإرشادات أثناء التدريب.'); }}
                >
                  <span>بمساعدة</span>
                </button>
                <button
                  type="button"
                  className={!assisted ? 'active' : ''}
                  aria-pressed={!assisted}
                  data-testid="button-unassisted"
                  onClick={() => { setAssisted(false); updateStatus('وضع التدريب دون مساعدة مفعّل؛ يمكنك التركيز على محاولتك.'); }}
                >
                  <span>دون مساعدة</span>
                </button>
              </div>
              {assisted && (
                <p className="help-caption" data-testid="text-help-caption">
                  {mode === 'recitation'
                    ? 'اقرئي النص المحدد، أو استمعي إليه بصوت الجهاز قبل المحاولة.'
                    : `اتبعي الإرشاد المختصر لحركة ${selectedMovement.title}، وخذي وقتك في التدرّب.`}
                </p>
              )}
            </div>
            <div className="capability-note" data-testid="notice-analysis-limit">
              <CircleHelp size={16} aria-hidden="true" />
              <span>مراجعة الكلمات محلية وتقريبية، وتحليل الحركة للتدريب فقط؛ لا يصدر التطبيق حكمًا على صحة الصلاة أو التلاوة.</span>
            </div>
          </section>

          <section className="panel camera-panel" aria-labelledby="camera-heading">
            <div className="panel-heading">
              <h2 id="camera-heading">شاهدي محاولتك إن رغبتِ</h2>
              <span className="eyebrow">محلي وآمن</span>
            </div>
            <div className="camera-stage" data-testid="camera-preview">
              {stream ? (
                <>
                  <video ref={videoRef} autoPlay muted playsInline aria-label="معاينة الكاميرا المحلية" data-testid="video-preview" />
                  <div className="camera-live-tag"><span className="live-dot" /> معاينة على جهازك</div>
                </>
              ) : (
                <div className="camera-placeholder" data-testid="camera-placeholder">
                  <div className="camera-glyph"><Camera size={26} strokeWidth={1.4} aria-hidden="true" /></div>
                  <strong>تظهر المعاينة هنا</strong>
                  <p>شغّلي الكاميرا عند رغبتك وامنحي المتصفح الإذن. لا تُرسل المعاينة إلى أي مكان.</p>
                </div>
              )}
            </div>

            <div className="control-row">
              <button
                type="button"
                className="button button-primary"
                onClick={() => stream ? stopCamera() : void startCamera()}
                data-testid="button-camera-toggle"
              >
                {stream ? <CameraOff size={16} aria-hidden="true" /> : <Camera size={16} aria-hidden="true" />}
                {stream ? 'إيقاف الكاميرا' : 'تشغيل الكاميرا'}
              </button>
              <button
                type="button"
                className="button button-soft"
                onClick={() => void switchCamera()}
                disabled={!stream || recording || !switchSupported}
                aria-label="تبديل الكاميرا"
                data-testid="button-switch-camera"
                title={!switchSupported ? 'لا تتوفر كاميرا أخرى على هذا الجهاز' : 'التبديل إلى الكاميرا الأخرى'}
              >
                <RefreshCw size={15} aria-hidden="true" />
                تبديل
              </button>
              <button
                type="button"
                className={`button button-record${recording ? ' recording' : ''}`}
                onClick={() => recording ? stopRecording() : startRecording()}
                disabled={!stream}
                data-testid="button-record"
              >
                {recording ? <MicOff size={15} aria-hidden="true" /> : <Mic size={15} aria-hidden="true" />}
                {recording ? 'إيقاف التسجيل' : 'بدء التسجيل'}
              </button>
            </div>

            {mode === 'movement' && (
              <section className="pose-analysis" aria-labelledby="pose-analysis-heading" data-testid="section-pose-analysis">
                <div className="pose-analysis-heading">
                  <div>
                    <Activity size={17} aria-hidden="true" />
                    <h3 id="pose-analysis-heading">تحليل تقريبي لحركة الجسم</h3>
                  </div>
                  <span className="pose-local-tag">داخل المتصفح</span>
                </div>
                <p className="pose-intro">
                  قارني الوضعية الأقرب بالحركة المختارة. التوجيه تقريبي، وليس تقييمًا طبيًا أو حكمًا على صحة الصلاة.
                </p>
                <button
                  type="button"
                  className={`pose-toggle-button${poseAnalysisEnabled ? ' active' : ''}`}
                  onClick={() => {
                    if (poseAnalysisEnabled) {
                      setPoseAnalysisEnabled(false);
                      updateStatus('أُوقف تحليل الحركة، وبقيت معاينة الكاميرا كما هي.');
                      return;
                    }
                    void (async () => {
                      if (!streamRef.current) {
                        await startCamera(facing, false);
                        if (!streamRef.current) return;
                      }
                      setPoseAnalysisEnabled(true);
                      updateStatus('بدأ التحليل التقريبي داخل المتصفح. لا تُرسل إطارات الكاميرا.');
                    })();
                  }}
                  disabled={movement === 'sitting' && !poseAnalysisEnabled}
                  aria-pressed={poseAnalysisEnabled}
                  data-testid="button-pose-analysis"
                >
                  <Sparkles size={15} aria-hidden="true" />
                  {poseAnalysisEnabled ? 'إيقاف التحليل' : 'بدء تحليل الوضعية'}
                </button>
                {poseAnalysisEnabled ? (
                  <div
                    className={`pose-result${poseAnalysis.status === 'error' ? ' error' : poseAnalysis.pose && poseAnalysis.pose !== selectedTargetPose ? ' adjust' : ''}`}
                    role="status"
                    aria-live="polite"
                    data-testid="status-pose-analysis"
                  >
                    <div className="pose-result-heading">
                      <span className={`pose-live-indicator${poseAnalysis.status === 'analyzing' ? ' active' : ''}`} />
                      <strong>{poseStatusLabel}</strong>
                      {poseAnalysis.status === 'loading' && <span className="pose-spinner" aria-hidden="true" />}
                    </div>
                    <p>{poseFeedback()}</p>
                    <span className="pose-disclaimer">
                      تقدير بصري تقريبي؛ قد يخطئ ولا يقيّم الدقة الطبية أو الشرعية.
                    </span>
                  </div>
                ) : (
                  <div className="pose-ready-note" data-testid="notice-pose-camera">
                    <CircleHelp size={14} aria-hidden="true" />
                    <span>
                      {movement === 'sitting'
                        ? 'اختاري القيام أو الركوع أو السجود؛ الجلوس غير مدعوم في هذا التحليل.'
                        : 'يُطلب إذن الكاميرا عند البدء. تُعالج الإطارات على جهازك ولا تُرفع؛ قد يحتاج التحليل اتصالًا لتنزيل ملفات التشغيل.'}
                    </span>
                  </div>
                )}
              </section>
            )}

            <div className={`status-box${statusError ? ' error' : ''}`} role="status" aria-live="polite" data-testid="status-message">
              {statusError ? <AlertCircle size={15} aria-hidden="true" /> : <ShieldCheck size={15} aria-hidden="true" />}
              <span>{status}</span>
            </div>

            {recording && (
              <div className="recording-controls" data-testid="status-recording">
                <div className="recording-title">
                  <span><span className="live-dot" style={{ background: '#a44a43' }} /> جارٍ التسجيل</span>
                  <time>{formattedTime}</time>
                </div>
              </div>
            )}
            {!recording && recordedUrl && (
              <div className="recording-controls" data-testid="section-recording-review">
                <div className="recording-title">
                  <span><Check size={15} color="#638067" /> تسجيلك جاهز للمراجعة</span>
                  <span className="eyebrow">{recordingMime.includes('audio') ? 'صوت' : 'فيديو'}</span>
                </div>
                <video className="audio-player" controls playsInline src={recordedUrl} aria-label="تشغيل التسجيل المحلي" data-testid="media-recording">
                  <track kind="captions" />
                </video>
                <a
                  className="download-link"
                  href={recordedUrl}
                  download={`salati-practice.${recordingMime.includes('mp4') ? 'mp4' : 'webm'}`}
                  data-testid="link-download-recording"
                >
                  <Download size={14} aria-hidden="true" /> تنزيل التسجيل على جهازك
                </a>
              </div>
            )}

            <div className="steps" aria-label="خطوات التدريب">
              <div className="step" data-testid="step-choose"><b>١</b>اختاري التدريب</div>
              <div className="step" data-testid="step-practice"><b>٢</b>تدرّبي بهدوء</div>
              <div className="step" data-testid="step-record"><b>٣</b>سجّلي إن رغبتِ</div>
              <div className="step" data-testid="step-review"><b>٤</b>راجعي بنفسك</div>
            </div>
            <div className="capability-note" data-testid="notice-local-recording">
              <LockKeyhole size={15} aria-hidden="true" />
              <span>التسجيل يبقى مؤقتًا في هذه الصفحة. نزّليه إذا أردتِ الاحتفاظ به؛ لا يوجد حساب أو رفع سحابي.</span>
            </div>
          </section>
        </div>
        {mode === 'recitation' && (
          <TrainingEvaluationPanel
            pronunciationScore={recitation.score}
            movementScore={null}
            finalScore={recitation.score}
            notes={recitation.words
              .filter((word) => word.status !== 'matched')
              .slice(0, 5)
              .map((word) => word.heard
                ? `قارني كلمة «${word.target}» بما التقطه النموذج «${word.heard}».`
                : `لم يلتقط النموذج كلمة «${word.target}» بوضوح.`)}
            onSave={saveRecitationEvaluation}
          />
        )}
        <PracticeHistoryPanel
          records={practiceRecords}
          rangeDays={historyRangeDays}
          onRangeChange={setHistoryRangeDays}
        />
        <footer className="privacy-footer" data-testid="text-footer">
          <span><HandHeart size={13} aria-hidden="true" /> مساحة تدريب خاصة؛ تحليل الحركة تقريبي ولا تُشارك التسجيلات.</span>
        </footer>
      </main>
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
