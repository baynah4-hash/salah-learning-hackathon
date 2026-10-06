import type { WuduStepId } from '@/lib/wudu-classifier';

export type WuduTrainingStep = {
  id: WuduStepId | 'intention';
  label: string;
  description: string;
  visuallyObservable: boolean;
};

export const wuduTrainingSteps: WuduTrainingStep[] = [
  {
    id: 'intention',
    label: 'النية والتسمية',
    description: 'استحضري نية الوضوء وابدئي بذكر اسم الله؛ لا يمكن للكاميرا ملاحظة ذلك.',
    visuallyObservable: false,
  },
  {
    id: 'hands',
    label: 'غسل الكفين',
    description: 'اغسلي الكفين. وقد لا تميّز الكاميرا الغسل الفعلي أو عدد مرات التكرار.',
    visuallyObservable: true,
  },
  {
    id: 'mouth-nose',
    label: 'المضمضة والاستنشاق',
    description: 'تمضمضي واستنشقي الماء برفق؛ قراءة الحركة البصرية لا تتحقق من وصول الماء.',
    visuallyObservable: true,
  },
  {
    id: 'face',
    label: 'غسل الوجه',
    description: 'اغسلي الوجه. الكاميرا قد تلاحظ اقتراب اليدين، ولا تتحقق من غسل الوجه.',
    visuallyObservable: true,
  },
  {
    id: 'arms',
    label: 'غسل اليدين إلى المرفقين',
    description: 'اغسلي اليدين والذراعين إلى المرفقين. قراءة الحركة تقريبية.',
    visuallyObservable: true,
  },
  {
    id: 'head',
    label: 'مسح الرأس',
    description: 'امسحي الرأس؛ قد تخمّن الكاميرا اقتراب اليد من أعلى الرأس فقط.',
    visuallyObservable: true,
  },
  {
    id: 'ears',
    label: 'مسح الأذنين',
    description: 'امسحي الأذنين. تعرّف الكاميرا على الحركة تقريبي.',
    visuallyObservable: true,
  },
  {
    id: 'feet',
    label: 'غسل القدمين إلى الكعبين',
    description: 'اغسلي القدمين إلى الكعبين. لا يمكن للكاميرا التأكد من غسل المواضع.',
    visuallyObservable: true,
  },
];
