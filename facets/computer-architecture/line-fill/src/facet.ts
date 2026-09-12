/**
 * line-fill — 한 칸을 불렀는데 줄 하나가 올라온다.
 *
 * @piece
 *
 * 선언에 두는 것은 **구조**다 — 라인 크기 · 원소 크기 · 부르는 색인, 그리고
 * 읽을 시간을 정하는 `stepMs`. 줄 번호도 딸려 오는 색인 범위도 여기 없다.
 * 그것은 algorithm 이 셈하고, 어디에 놓일지는 stage 가 캔버스에서 역산한다
 * (S-piece).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const lineFillFacet: FacetJson = {
  id: 'facet:lineFill',

  title: {
    en: 'One cell asked, a whole line arrives',
    ko: '한 칸을 불렀는데 줄 하나가 올라온다',
    ja: '1つ呼ぶと1行まるごと上がってくる',
    zh: '只要一格，整行一起上来',
    ar: 'تطلب خانة واحدة فيصعد سطر كامل',
    es: 'Pides una celda y sube una línea entera',
    fr: 'Une case demandée, une ligne entière arrive',
    hi: 'एक खाना माँगो, पूरी लाइन ऊपर आती है',
    id: 'Minta satu sel, satu baris penuh ikut naik',
    pt: 'Você pede uma célula e sobe uma linha inteira',
  },

  description: {
    en: 'A cache moves data in fixed-size lines. Touch one element and the three neighbours sharing its line come up with it.',
    ko: '캐시는 정해진 크기의 줄 단위로 옮긴다. 한 원소를 짚으면 같은 줄에 있는 이웃 셋이 함께 올라온다.',
    ja: 'キャッシュは決まった大きさの行単位で運ぶ。1つの要素に触れると、同じ行にいる隣り3つも一緒に上がってくる。',
    zh: '缓存以固定大小的行为单位搬运。碰到一个元素，同一行的另外三个邻居也会跟着上来。',
    ar: 'تنقل الذاكرة المخبئية البيانات في أسطر ثابتة الحجم. المس عنصرًا واحدًا فيصعد معه ثلاثة جيران من السطر نفسه.',
    es: 'La caché mueve los datos en líneas de tamaño fijo. Toca un elemento y suben con él los tres vecinos de su línea.',
    fr: 'Le cache déplace les données par lignes de taille fixe. Touchez un élément et les trois voisins de sa ligne montent avec lui.',
    hi: 'कैश डेटा को तय आकार की लाइनों में लाता है। एक तत्व छुओ तो उसी लाइन के तीन पड़ोसी भी साथ ऊपर आ जाते हैं।',
    id: 'Cache memindahkan data dalam baris berukuran tetap. Sentuh satu elemen dan tiga tetangga sebarisnya ikut naik.',
    pt: 'A cache move os dados em linhas de tamanho fixo. Toque em um elemento e os três vizinhos da mesma linha sobem junto.',
  },

  algorithm: 'module:lineFill',
  projector: 'module:lineFillProjector',

  initialData: {
    type: 'line-fill',
    /** 캐시 라인 하나가 덮는 바이트 수. */
    lineSize: 16,
    /** 원소 하나가 차지하는 바이트 수. 16 을 4 로 나눠 한 줄에 넷이 든다. */
    elemSize: 4,
    /** 차례로 부르는 색인. 셋 다 서로 다른 줄에 있다. */
    requests: [1, 5, 9],
    stepMs: 700,
  },

  blocks: {
    stage: { type: 'line-fill-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },

  messages: {
    'caption.ask': {
      en: 'You name one cell: a[{i}], at byte {addr}.',
      ko: '짚은 칸은 하나 — a[{i}], 주소는 {addr}.',
      ja: '呼んだのは1つだけ — a[{i}]、アドレスは {addr}。',
      zh: '你只点了一格：a[{i}]，地址 {addr}。',
      ar: 'طلبت خانة واحدة فقط: a[{i}]، العنوان {addr}.',
      es: 'Pides una sola celda: a[{i}], en el byte {addr}.',
      fr: 'Vous demandez une seule case : a[{i}], à l\'octet {addr}.',
      hi: 'तुमने सिर्फ़ एक खाना माँगा: a[{i}], बाइट {addr}.',
      id: 'Kamu meminta satu sel saja: a[{i}], di byte {addr}.',
      pt: 'Você pede uma única célula: a[{i}], no byte {addr}.',
    },
    'caption.rise': {
      en: 'The whole line comes — bytes {lo}–{hi}. Three neighbours tag along.',
      ko: '줄 하나가 통째로 — 바이트 {lo}–{hi}. 딸려 온 이웃은 셋.',
      ja: '行がまるごと上がる — バイト {lo}–{hi}。ついてきた隣りは3つ。',
      zh: '整行一起上来 — 字节 {lo}–{hi}。跟着来的邻居有三个。',
      ar: 'يصعد السطر كاملًا — البايتات {lo}–{hi}. وثلاثة جيران يأتون معه.',
      es: 'Sube la línea entera: bytes {lo}–{hi}. Tres vecinos vienen de propina.',
      fr: 'La ligne entière monte : octets {lo}–{hi}. Trois voisins suivent.',
      hi: 'पूरी लाइन ऊपर आती है — बाइट {lo}–{hi}. तीन पड़ोसी साथ चले आते हैं.',
      id: 'Satu baris penuh naik — byte {lo}–{hi}. Tiga tetangga ikut terbawa.',
      pt: 'A linha inteira sobe — bytes {lo}–{hi}. Três vizinhos vêm junto.',
    },
    'caption.tally': {
      en: 'Cells named: {asked}. Cells arrived: {arrived}.',
      ko: '부른 것은 {asked}. 올라온 것은 {arrived}.',
      ja: '呼んだのは {asked}。上がってきたのは {arrived}。',
      zh: '点名的格子：{asked}。上来的格子：{arrived}。',
      ar: 'الخانات المطلوبة: {asked}. الخانات التي صعدت: {arrived}.',
      es: 'Celdas pedidas: {asked}. Celdas que subieron: {arrived}.',
      fr: 'Cases demandées : {asked}. Cases arrivées : {arrived}.',
      hi: 'माँगे गए खाने: {asked}. ऊपर आए खाने: {arrived}.',
      id: 'Sel yang diminta: {asked}. Sel yang naik: {arrived}.',
      pt: 'Células pedidas: {asked}. Células que subiram: {arrived}.',
    },
  },
};
