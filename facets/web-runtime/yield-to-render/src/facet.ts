/**
 * @piece
 * @notation native — 화면의 코드는 사양이 준 자바스크립트 그대로다. 다음 조각을
 * `setTimeout` 으로 태스크 줄에 보낸다는 것이 곧 이 조각의 주장이다.
 *
 * 질문: 500 행을 넣는 일을 100 행씩 태스크로 쪼개면, 일이 다 끝나기 전에 화면에
 * 무엇이 보이는가?
 */
import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';
import type { YieldToRenderFacetData } from './algorithm.js';

const initialData: YieldToRenderFacetData = {
  type: 'yieldToRender',
  code: [
    'function chunk(from) {',
    '  addRows(from, from + 100);',
    '  if (from + 100 < 500) setTimeout(() => chunk(from + 100), 0);',
    '}',
    'chunk(0);',
  ],
  totalRows: 500,
  chunkRows: 100,
  workMs: 12,
  stepMs: 1300,
};

export const yieldToRenderFacet: FacetJson = {
  id: 'facet:yieldToRender',
  title: {
    en: 'Yield to render',
    ko: '렌더에게 자리를 내주기',
    ja: 'レンダーへ順番を譲る',
    zh: '把机会让给渲染',
    ar: 'التنازل عن الدور للعرض',
    es: 'Ceder el turno al renderizado',
    fr: 'Céder la place au rendu',
    hi: 'रेंडर को बारी देना',
    id: 'Memberi giliran untuk render',
    pt: 'Ceder a vez para a renderização',
  },
  description: {
    en: 'Splitting a long task into chunks lets a screen paint slip in between them.',
    ko: '긴 일을 조각내면 그 사이로 화면이 그려질 틈이 생긴다.',
    ja: '長い処理をタスクに分けると、その合間に画面の描画が割り込める。',
    zh: '把长任务拆成小块,渲染就能趁着间隙插进来。',
    ar: 'تقسيم مهمة طويلة إلى أجزاء يفسح المجال لرسم الشاشة بينها.',
    es: 'Dividir una tarea larga en partes deja espacio para que la pantalla se pinte entre ellas.',
    fr: "Découper une tâche longue en morceaux laisse un espace pour que l'affichage se dessine entre eux.",
    hi: 'लंबे काम को टुकड़ों में बांटने से बीच में स्क्रीन बनने का मौका मिलता है।',
    id: 'Memecah tugas panjang menjadi potongan memberi celah bagi layar untuk digambar di antaranya.',
    pt: 'Dividir uma tarefa longa em partes abre espaço para a tela ser pintada entre elas.',
  },
  algorithm: 'module:yieldToRender',
  scene: 'module:yieldToRenderScene',
  initialData,
  shuffleOnReset: false,
  messages: {
    'caption.start': {
      en: 'Script starts at t=0. DOM rows: {dom}. Screen rows: {screen}.',
      ko: '스크립트가 t=0 에 시작한다. DOM 행 수: {dom}. 화면 행 수: {screen}.',
      ja: 'スクリプトが t=0 で始まる。DOM 行数: {dom}。画面の行数: {screen}。',
      zh: '脚本在 t=0 开始。DOM 行数: {dom}。屏幕行数: {screen}。',
      ar: 'يبدأ النص عند t=0. صفوف DOM: {dom}. صفوف الشاشة: {screen}.',
      es: 'El script empieza en t=0. Filas del DOM: {dom}. Filas en pantalla: {screen}.',
      fr: 'Le script démarre à t=0. Lignes du DOM : {dom}. Lignes affichées : {screen}.',
      hi: 'स्क्रिप्ट t=0 पर शुरू होती है। DOM पंक्तियाँ: {dom}. स्क्रीन पंक्तियाँ: {screen}.',
      id: 'Skrip dimulai pada t=0. Baris DOM: {dom}. Baris layar: {screen}.',
      pt: 'O script começa em t=0. Linhas no DOM: {dom}. Linhas na tela: {screen}.',
    },
    'caption.run': {
      en: 'Runs {name}. DOM rows: {n}.',
      ko: '{name} 실행. DOM 행 수: {n}.',
      ja: '{name} を実行。DOM 行数: {n}。',
      zh: '执行 {name}。DOM 行数: {n}。',
      ar: 'تشغيل {name}. صفوف DOM: {n}.',
      es: 'Ejecuta {name}. Filas del DOM: {n}.',
      fr: 'Exécute {name}. Lignes du DOM : {n}.',
      hi: '{name} चलता है। DOM पंक्तियाँ: {n}.',
      id: 'Menjalankan {name}. Baris DOM: {n}.',
      pt: 'Executa {name}. Linhas no DOM: {n}.',
    },
    'caption.render': {
      en: 'Render cuts in. Screen rows: {n}.',
      ko: '렌더가 끼어든다. 화면 행 수: {n}.',
      ja: 'レンダーが割り込む。画面の行数: {n}。',
      zh: '渲染插了进来。屏幕行数: {n}。',
      ar: 'يتدخل العرض. صفوف الشاشة: {n}.',
      es: 'El renderizado se cuela. Filas en pantalla: {n}.',
      fr: "Le rendu s'intercale. Lignes affichées : {n}.",
      hi: 'रेंडर बीच में आता है। स्क्रीन पंक्तियाँ: {n}.',
      id: 'Render menyela. Baris layar: {n}.',
      pt: 'A renderização se intromete. Linhas na tela: {n}.',
    },
    'label.dom': {
      en: 'DOM rows: {n}',
      ko: 'DOM 행 수: {n}',
      ja: 'DOM 行数: {n}',
      zh: 'DOM 行数: {n}',
      ar: 'صفوف DOM: {n}',
      es: 'Filas del DOM: {n}',
      fr: 'Lignes du DOM : {n}',
      hi: 'DOM पंक्तियाँ: {n}',
      id: 'Baris DOM: {n}',
      pt: 'Linhas no DOM: {n}',
    },
    'label.screen': {
      en: 'Screen rows: {n}',
      ko: '화면 행 수: {n}',
      ja: '画面の行数: {n}',
      zh: '屏幕行数: {n}',
      ar: 'صفوف الشاشة: {n}',
      es: 'Filas en pantalla: {n}',
      fr: 'Lignes affichées : {n}',
      hi: 'स्क्रीन पंक्तियाँ: {n}',
      id: 'Baris layar: {n}',
      pt: 'Linhas na tela: {n}',
    },
    'label.boundaryMark': {
      en: '{n} ms',
      ko: '{n}ms',
      ja: '{n}ms',
      zh: '{n}ms',
      ar: '{n} مللي ثانية',
      es: '{n} ms',
      fr: '{n} ms',
      hi: '{n} मिसे',
      id: '{n} md',
      pt: '{n} ms',
    },
  },
  blocks: {
    stage: { type: 'yield-to-render-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
};
