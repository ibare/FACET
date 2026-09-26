/**
 * cooperative-yielding — 선언.
 *
 * @notation native — 스테이지가 보이는 코드 두 변형(`codeSetTimeout` · `codeQueueMicrotask`)
 * 은 실제 자바스크립트다. 코드 패널(`codePanel`)의 IR 은 별개로, 두 갈래를 정수
 * 산수로 다시 편 스케줄 계산(`computeSchedule`)을 보인다.
 */
import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';
import type { CooperativeYieldingData } from './algorithm.js';

const initialData: CooperativeYieldingData = {
  type: 'cooperativeYielding',
  stepMs: 1300,
  totalRows: 500,
  msPer100Rows: 12,
  clickIds: ['click1', 'click2', 'click3'],
  clickTimes: [7, 27, 47],
  clickProcessMs: 2,
  nestingFloorLevel: 5,
  nestingFloorMs: 4,
  chunkSizes: [500, 250, 100, 50, 25],
  viaOptions: [0, 1],
  chunkSize: 100,
  via: 0,
  codeSetTimeout:
    '// via = setTimeout\n' +
    'function chunk(from) {\n' +
    '  addRows(from, from + SIZE);\n' +
    '  if (from + SIZE < 500) setTimeout(() => chunk(from + SIZE), 0);\n' +
    '}\n' +
    'chunk(0);',
  codeQueueMicrotask:
    '// via = queueMicrotask\n' +
    'function chunk(from) {\n' +
    '  addRows(from, from + SIZE);\n' +
    '  if (from + SIZE < 500) queueMicrotask(() => chunk(from + SIZE));\n' +
    '}\n' +
    'chunk(0);',
};

export const cooperativeYieldingFacet: FacetJson = {
  id: 'facet:cooperativeYielding',
  title: {
    en: 'Cooperative yielding',
    ko: '협조적 양보',
    ja: '協調的譲歩',
    zh: '协作式让出',
    ar: 'التنازل التعاوني',
    es: 'Cesión cooperativa',
    fr: 'Cession coopérative',
    hi: 'सहकारी यील्डिंग',
    id: 'Penyerahan kooperatif',
    pt: 'Cessão cooperativa',
  },
  description: {
    en: 'Chunking a long task only helps if the next chunk re-queues via the task queue — via the microtask queue, everything still freezes until done.',
    ko: '긴 일을 쪼개도 다음 조각을 태스크 줄로 다시 걸어야 화면이 산다 — 마이크로태스크 줄로 이으면 다 끝날 때까지 그대로 멎는다.',
    ja: '長い処理を分割しても、次の断片をタスクキューへ再度並べない限り画面は生き返らない — マイクロタスクキューでつなぐと終わるまで固まったままだ。',
    zh: '把长任务切块也没用,除非下一块重新排回任务队列——用微任务队列衔接,画面会一直冻结到全部完成。',
    ar: 'تقسيم مهمة طويلة لا يفيد إلا إذا أعيدت الجزئية التالية إلى طابور المهام — أما عبر طابور المايكروتاسك فتبقى الشاشة مجمدة حتى الانتهاء.',
    es: 'Trocear una tarea larga solo ayuda si el siguiente fragmento vuelve a la cola de tareas — encadenado por microtareas, todo sigue congelado hasta terminar.',
    fr: "Découper une tâche longue n'aide que si le prochain morceau repasse par la file de tâches — via la file de microtâches, tout reste figé jusqu'à la fin.",
    hi: 'लंबे काम को टुकड़ों में बांटना तभी काम आता है जब अगला टुकड़ा फिर से टास्क क्यू में जाए — माइक्रोटास्क क्यू से जोड़ने पर सब कुछ अंत तक जमा रहता है।',
    id: 'Memecah tugas panjang hanya membantu jika potongan berikutnya kembali ke antrean tugas — lewat antrean microtask, layar tetap beku sampai selesai.',
    pt: 'Dividir uma tarefa longa só ajuda se o próximo pedaço voltar à fila de tarefas — encadeado por microtarefas, tudo continua congelado até terminar.',
  },
  algorithm: 'module:cooperativeYielding',
  projector: 'module:cooperativeYieldingProjector',
  initialData,
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'header' }, { ref: 'stage' }, { ref: 'controls' }, { ref: 'codePanel' }],
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'cooperative-yielding-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        ...CONTROL_SET.playback,
        {
          widget: 'segmented-slider',
          action: 'chunkSize',
          name: 'chunkSize',
          label: {
            en: 'Chunk size',
            ko: '쪼갬 크기',
            ja: '分割サイズ',
            zh: '分块大小',
            ar: 'حجم الجزء',
            es: 'Tamaño del fragmento',
            fr: 'Taille du bloc',
            hi: 'खंड आकार',
            id: 'Ukuran potongan',
            pt: 'Tamanho do bloco',
          },
          segments: [
            { value: 500, label: '500' },
            { value: 250, label: '250' },
            { value: 100, label: '100', default: true },
            { value: 50, label: '50' },
            { value: 25, label: '25' },
          ],
        },
        {
          widget: 'segmented-slider',
          action: 'via',
          name: 'via',
          label: {
            en: 'Continuation via',
            ko: '이어 거는 곳',
            ja: '継続先',
            zh: '续接方式',
            ar: 'طريقة المتابعة',
            es: 'Vía de continuación',
            fr: 'Relais via',
            hi: 'जारी रखने का माध्यम',
            id: 'Lanjut lewat',
            pt: 'Continuação via',
          },
          segments: [
            { value: 0, label: 'setTimeout', default: true },
            { value: 1, label: 'queueMicrotask' },
          ],
        },
      ],
      metrics: [
        {
          name: 'renders',
          label: {
            en: 'Renders',
            ko: '그려진 횟수',
            ja: '描画回数',
            zh: '渲染次数',
            ar: 'مرات العرض',
            es: 'Renderizados',
            fr: 'Rendus',
            hi: 'रेंडर संख्या',
            id: 'Jumlah render',
            pt: 'Renderizações',
          },
          initial: 0,
        },
        {
          name: 'longest-wait',
          label: {
            en: 'Longest wait (ms)',
            ko: '가장 긴 기다림(ms)',
            ja: '最長待ち時間(ms)',
            zh: '最长等待(ms)',
            ar: 'أطول انتظار (ms)',
            es: 'Espera más larga (ms)',
            fr: 'Attente la plus longue (ms)',
            hi: 'सबसे लंबा इंतजार (ms)',
            id: 'Tunggu terlama (ms)',
            pt: 'Espera mais longa (ms)',
          },
          initial: 0,
        },
      ],
    },
    codePanel: {
      type: 'code-view',
      ir: 'ir:cooperative-yielding-imperative',
      label: {
        en: 'Schedule computation',
        ko: '스케줄 계산',
        ja: 'スケジュール計算',
        zh: '调度计算',
        ar: 'حساب الجدولة',
        es: 'Cálculo del calendario',
        fr: 'Calcul du planning',
        hi: 'शेड्यूल गणना',
        id: 'Perhitungan jadwal',
        pt: 'Cálculo do agendamento',
      },
    },
  },
  messages: {
    'caption.round': {
      en: 'Chunk {chunkSize} rows · {numChunks} chunks · {chunkMs}ms each · {api}',
      ko: '쪼갬 {chunkSize}행 · 조각 {numChunks}개 · 조각당 {chunkMs}ms · {api}',
      ja: '分割{chunkSize}行 · 断片{numChunks}個 · 断片あたり{chunkMs}ms · {api}',
      zh: '分块{chunkSize}行 · {numChunks}块 · 每块{chunkMs}ms · {api}',
      ar: 'تجزئة {chunkSize} صفًا · {numChunks} جزءًا · {chunkMs} مللي ثانية لكل جزء · {api}',
      es: 'Fragmento {chunkSize} filas · {numChunks} fragmentos · {chunkMs}ms cada uno · {api}',
      fr: 'Bloc de {chunkSize} lignes · {numChunks} blocs · {chunkMs}ms chacun · {api}',
      hi: 'खंड {chunkSize} पंक्तियाँ · {numChunks} खंड · प्रत्येक {chunkMs}ms · {api}',
      id: 'Potongan {chunkSize} baris · {numChunks} potongan · {chunkMs}ms per potongan · {api}',
      pt: 'Bloco de {chunkSize} linhas · {numChunks} blocos · {chunkMs}ms cada · {api}',
    },
    'label.dom': {
      en: 'DOM rows',
      ko: 'DOM 행 수',
      ja: 'DOM行数',
      zh: 'DOM行数',
      ar: 'صفوف DOM',
      es: 'Filas del DOM',
      fr: 'Lignes du DOM',
      hi: 'DOM पंक्तियाँ',
      id: 'Baris DOM',
      pt: 'Linhas do DOM',
    },
    'label.screen': {
      en: 'Rows on screen',
      ko: '화면에 그려진 행 수',
      ja: '画面上の行数',
      zh: '屏幕上的行数',
      ar: 'صفوف على الشاشة',
      es: 'Filas en pantalla',
      fr: "Lignes à l'écran",
      hi: 'स्क्रीन पर पंक्तियाँ',
      id: 'Baris di layar',
      pt: 'Linhas na tela',
    },
    'label.click': {
      en: 'Click {n}',
      ko: '클릭 {n}',
      ja: 'クリック{n}',
      zh: '点击{n}',
      ar: 'النقرة {n}',
      es: 'Clic {n}',
      fr: 'Clic {n}',
      hi: 'क्लिक {n}',
      id: 'Klik {n}',
      pt: 'Clique {n}',
    },
    'caption.wait': {
      en: 'Waited {waitMs}ms',
      ko: '기다림 {waitMs}ms',
      ja: '待ち時間{waitMs}ms',
      zh: '等待{waitMs}ms',
      ar: 'انتظر {waitMs} مللي ثانية',
      es: 'Esperó {waitMs}ms',
      fr: 'Attente de {waitMs}ms',
      hi: '{waitMs}ms इंतजार किया',
      id: 'Menunggu {waitMs}ms',
      pt: 'Esperou {waitMs}ms',
    },
    'caption.done': {
      en: 'All 500 rows done at {atMs}ms',
      ko: '500행 다 됨 · {atMs}ms',
      ja: '500行完了 · {atMs}ms',
      zh: '500行完成 · {atMs}ms',
      ar: 'اكتملت 500 صف عند {atMs} مللي ثانية',
      es: 'Las 500 filas listas a los {atMs}ms',
      fr: 'Les 500 lignes terminées à {atMs}ms',
      hi: 'सभी 500 पंक्तियाँ {atMs}ms पर पूर्ण',
      id: 'Semua 500 baris selesai pada {atMs}ms',
      pt: 'As 500 linhas concluídas em {atMs}ms',
    },
    'label.code': {
      en: 'Code running now',
      ko: '지금 도는 코드',
      ja: '現在実行中のコード',
      zh: '当前运行的代码',
      ar: 'الشفرة قيد التشغيل الآن',
      es: 'Código en ejecución',
      fr: "Code en cours d'exécution",
      hi: 'अभी चल रहा कोड',
      id: 'Kode yang sedang berjalan',
      pt: 'Código em execução',
    },
  },
};
