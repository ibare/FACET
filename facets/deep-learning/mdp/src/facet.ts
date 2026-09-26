import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

/** 처음 데이터 — 격자 구조 · 상 · 사다리가 1 차 자료다. 값 · 화살표 · 길은 알고리즘이 셈한다 */
export type MdpInitialData = {
  type: 'mdp';
  stepMs: number;
  rows: number;
  cols: number;
  cells: number[];
  start: number;
  rewards: number[];
  sweeps: number;
  pathLimit: number;
  gammaLadder: number[];
  slipLadder: number[];
  gamma: number;
  slip: number;
};

const initialData: MdpInitialData = {
  type: 'mdp',
  stepMs: 1000,
  rows: 3,
  cols: 5,
  // 0 빈 칸 · 1 작은 목표 · 2 큰 목표 · 3 구덩이 (행 0 이 위)
  cells: [0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1, 3, 3, 3, 0],
  start: 5,
  rewards: [0, 3, 10, -10],
  sweeps: 12,
  pathLimit: 12,
  gammaLadder: [0.6, 0.8, 0.96],
  slipLadder: [0, 0.1, 0.2],
  gamma: 0.96,
  slip: 0.1,
};

export const mdpFacet: FacetJson = {
  id: 'facet:mdp',
  title: {
    en: 'Markov decision process: value iteration',
    ko: '마르코프 결정 과정과 가치 반복',
    ja: 'マルコフ決定過程と価値反復',
    zh: '马尔可夫决策过程与价值迭代',
    ar: 'عملية ماركوف للقرار وتكرار القيمة',
    es: 'Proceso de decisión de Markov e iteración de valores',
    fr: 'Processus de décision markovien et itération sur les valeurs',
    hi: 'मार्कोव निर्णय प्रक्रिया और मान पुनरावृत्ति',
    id: 'Proses keputusan Markov dan iterasi nilai',
    pt: 'Processo de decisão de Markov e iteração de valor',
  },
  description: {
    en: 'A planner that knows the model fills the value table sweep by sweep. Change the discount γ and the slip and watch the arrows turn and the path from the start move.',
    ko: '모형을 아는 계획자가 바퀴마다 값 표를 채운다. 할인율 γ 와 미끄러짐을 바꾸면 화살표가 돌아서고 출발에서의 길이 옮겨 간다.',
    ja: 'モデルを知る計画者が一巡ごとに価値表を埋めていく。割引率 γ と滑りを変えると矢印が向きを変え、出発点からの道が移る。',
    zh: '知道模型的规划者一轮一轮地填满价值表。改变折扣率 γ 和打滑，箭头会转向，从起点出发的路径会移动。',
    ar: 'مخطِّط يعرف النموذج يملأ جدول القيم دورةً بعد دورة. غيّر معامل الخصم γ والانزلاق وشاهد الأسهم تستدير والمسار من البداية ينتقل.',
    es: 'Un planificador que conoce el modelo llena la tabla de valores barrido a barrido. Cambia el descuento γ y el deslizamiento y mira cómo giran las flechas y se mueve el camino desde la salida.',
    fr: 'Un planificateur qui connaît le modèle remplit la table des valeurs balayage après balayage. Changez l’escompte γ et le glissement : les flèches tournent et le chemin depuis le départ se déplace.',
    hi: 'मॉडल जानने वाला योजनाकार हर चक्कर में मान-तालिका भरता है। छूट γ और फिसलन बदलें, तीर मुड़ते हैं और शुरुआत से रास्ता खिसकता है।',
    id: 'Perencana yang mengetahui model mengisi tabel nilai putaran demi putaran. Ubah diskon γ dan selip, lalu lihat panah berbalik dan jalur dari awal berpindah.',
    pt: 'Um planejador que conhece o modelo preenche a tabela de valores varredura a varredura. Mude o desconto γ e o deslize e veja as setas girarem e o caminho a partir da largada mudar.',
  },
  algorithm: 'module:mdp',
  projector: 'module:mdpProjector',
  initialData,
  layout: {
    type: 'column',
    gap: 12,
    children: [{ ref: 'header' }, { ref: 'stage' }, { ref: 'controls' }, { ref: 'codePanel' }],
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'mdp-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        ...CONTROL_SET.playback,
        {
          widget: 'segmented-slider',
          action: 'gamma',
          name: 'gamma',
          label: {
            en: 'discount γ',
            ko: '할인율 γ',
            ja: '割引率 γ',
            zh: '折扣率 γ',
            ar: 'معامل الخصم γ',
            es: 'descuento γ',
            fr: 'escompte γ',
            hi: 'छूट γ',
            id: 'diskon γ',
            pt: 'desconto γ',
          },
          segments: [
            { value: 0.6, label: '0.6' },
            { value: 0.8, label: '0.8' },
            { value: 0.96, label: '0.96', default: true },
          ],
        },
        {
          widget: 'segmented-slider',
          action: 'slip',
          name: 'slip',
          label: {
            en: 'slip',
            ko: '미끄러짐',
            ja: '滑り',
            zh: '打滑',
            ar: 'الانزلاق',
            es: 'deslizamiento',
            fr: 'glissement',
            hi: 'फिसलन',
            id: 'selip',
            pt: 'deslize',
          },
          segments: [
            { value: 0, label: '0' },
            { value: 0.1, label: '0.1', default: true },
            { value: 0.2, label: '0.2' },
          ],
        },
      ],
      metrics: [
        {
          name: 'sweeps',
          label: {
            en: 'sweeps', ko: '바퀴', ja: '巡回', zh: '轮次', ar: 'الدورات',
            es: 'barridos', fr: 'balayages', hi: 'चक्कर', id: 'putaran', pt: 'varreduras',
          },
          initial: 0,
        },
        {
          name: 'arrows-turned',
          label: {
            en: 'arrows turned', ko: '바뀐 화살표', ja: '変わった矢印', zh: '转向的箭头', ar: 'أسهم استدارت',
            es: 'flechas giradas', fr: 'flèches tournées', hi: 'मुड़े तीर', id: 'panah berbalik', pt: 'setas giradas',
          },
          initial: 0,
        },
        {
          name: 'path-moves',
          label: {
            en: 'path moves', ko: '길 이동', ja: '道の移動', zh: '路径步数', ar: 'حركات المسار',
            es: 'movimientos', fr: 'déplacements', hi: 'रास्ते की चालें', id: 'langkah jalur', pt: 'movimentos',
          },
          initial: 0,
        },
      ],
    },
    codePanel: {
      type: 'code-view',
      ir: 'ir:mdp-imperative',
      label: {
        en: 'Value iteration',
        ko: '가치 반복',
        ja: '価値反復',
        zh: '价值迭代',
        ar: 'تكرار القيمة',
        es: 'Iteración de valores',
        fr: 'Itération sur les valeurs',
        hi: 'मान पुनरावृत्ति',
        id: 'Iterasi nilai',
        pt: 'Iteração de valor',
      },
    },
  },
  messages: {
    'label.condition': {
      en: 'γ {gamma} · slip {slip}',
      ko: 'γ {gamma} · 미끄러짐 {slip}',
      ja: 'γ {gamma} · 滑り {slip}',
      zh: 'γ {gamma} · 打滑 {slip}',
      ar: 'γ {gamma} · الانزلاق {slip}',
      es: 'γ {gamma} · deslizamiento {slip}',
      fr: 'γ {gamma} · glissement {slip}',
      hi: 'γ {gamma} · फिसलन {slip}',
      id: 'γ {gamma} · selip {slip}',
      pt: 'γ {gamma} · deslize {slip}',
    },
    'label.sweepOf': {
      en: 'sweep {n}/{total}',
      ko: '바퀴 {n}/{total}',
      ja: '巡回 {n}/{total}',
      zh: '第 {n}/{total} 轮',
      ar: 'الدورة {n}/{total}',
      es: 'barrido {n}/{total}',
      fr: 'balayage {n}/{total}',
      hi: 'चक्कर {n}/{total}',
      id: 'putaran {n}/{total}',
      pt: 'varredura {n}/{total}',
    },
    'label.start': {
      en: 'start', ko: '출발', ja: '出発', zh: '起点', ar: 'البداية',
      es: 'salida', fr: 'départ', hi: 'शुरुआत', id: 'awal', pt: 'largada',
    },
    'label.kind.small': {
      en: 'small goal', ko: '작은 목표', ja: '小さな目標', zh: '小目标', ar: 'هدف صغير',
      es: 'meta pequeña', fr: 'petit but', hi: 'छोटा लक्ष्य', id: 'tujuan kecil', pt: 'meta pequena',
    },
    'label.kind.big': {
      en: 'big goal', ko: '큰 목표', ja: '大きな目標', zh: '大目标', ar: 'هدف كبير',
      es: 'meta grande', fr: 'grand but', hi: 'बड़ा लक्ष्य', id: 'tujuan besar', pt: 'meta grande',
    },
    'label.kind.pit': {
      en: 'pit', ko: '구덩이', ja: '穴', zh: '陷坑', ar: 'حفرة',
      es: 'pozo', fr: 'fosse', hi: 'गड्ढा', id: 'lubang', pt: 'buraco',
    },
    'caption.start': {
      en: 'Every value starts at 0 · no arrows yet',
      ko: '모든 칸의 값이 0 에서 시작한다 · 화살표 없음',
      ja: 'すべての値は 0 から始まる · 矢印はまだない',
      zh: '所有值从 0 开始 · 还没有箭头',
      ar: 'كل القيم تبدأ من 0 · لا أسهم بعد',
      es: 'Todos los valores empiezan en 0 · aún sin flechas',
      fr: 'Toutes les valeurs partent de 0 · pas encore de flèches',
      hi: 'सभी मान 0 से शुरू · अभी कोई तीर नहीं',
      id: 'Semua nilai mulai dari 0 · belum ada panah',
      pt: 'Todos os valores começam em 0 · ainda sem setas',
    },
    'caption.sweep': {
      en: 'sweep {n} · nonzero cells {nonZero} · arrows turned {turned}',
      ko: '바퀴 {n} · 값이 0 아닌 칸 {nonZero} · 화살표가 바뀐 칸 {turned}',
      ja: '巡回 {n} · 値が 0 でないマス {nonZero} · 向きが変わった矢印 {turned}',
      zh: '第 {n} 轮 · 值非 0 的格子 {nonZero} · 转向的箭头 {turned}',
      ar: 'الدورة {n} · خلايا غير صفرية {nonZero} · أسهم استدارت {turned}',
      es: 'barrido {n} · celdas no nulas {nonZero} · flechas giradas {turned}',
      fr: 'balayage {n} · cases non nulles {nonZero} · flèches tournées {turned}',
      hi: 'चक्कर {n} · शून्य से भिन्न खाने {nonZero} · मुड़े तीर {turned}',
      id: 'putaran {n} · sel tak nol {nonZero} · panah berbalik {turned}',
      pt: 'varredura {n} · células não nulas {nonZero} · setas giradas {turned}',
    },
    'caption.sweepValue': {
      en: 'V(S) after sweep {n}: {v} · largest change {d}',
      ko: '바퀴 {n} 뒤 V(S): {v} · 가장 큰 바뀜 {d}',
      ja: '巡回 {n} 後の V(S): {v} · 最大の変化 {d}',
      zh: '第 {n} 轮后 V(S): {v} · 最大变化 {d}',
      ar: 'V(S) بعد الدورة {n}: {v} · أكبر تغيّر {d}',
      es: 'V(S) tras el barrido {n}: {v} · mayor cambio {d}',
      fr: 'V(S) après le balayage {n} : {v} · plus grand changement {d}',
      hi: 'चक्कर {n} के बाद V(S): {v} · सबसे बड़ा बदलाव {d}',
      id: 'V(S) setelah putaran {n}: {v} · perubahan terbesar {d}',
      pt: 'V(S) após a varredura {n}: {v} · maior mudança {d}',
    },
    'caption.path': {
      en: 'Following the arrows as intended: {arrows}',
      ko: '화살표를 뜻대로 따라간 길: {arrows}',
      ja: '矢印を意図どおりにたどった道: {arrows}',
      zh: '按箭头本意走的路径: {arrows}',
      ar: 'اتباع الأسهم كما قُصدت: {arrows}',
      es: 'Siguiendo las flechas según lo previsto: {arrows}',
      fr: 'En suivant les flèches comme prévu : {arrows}',
      hi: 'तीरों को इच्छित दिशा में चलने पर: {arrows}',
      id: 'Mengikuti panah sesuai niat: {arrows}',
      pt: 'Seguindo as setas como pretendido: {arrows}',
    },
    'caption.pathEnd': {
      en: 'reaches: {end} · moves {moves} · V(S) after sweep {n}: {v}',
      ko: '닿는 칸: {end} · 이동 {moves} · 바퀴 {n} 뒤 V(S): {v}',
      ja: '着くマス: {end} · 移動 {moves} · 巡回 {n} 後の V(S): {v}',
      zh: '到达: {end} · 移动 {moves} · 第 {n} 轮后 V(S): {v}',
      ar: 'يصل إلى: {end} · حركات {moves} · V(S) بعد الدورة {n}: {v}',
      es: 'llega a: {end} · movimientos {moves} · V(S) tras el barrido {n}: {v}',
      fr: 'arrive à : {end} · déplacements {moves} · V(S) après le balayage {n} : {v}',
      hi: 'पहुँच: {end} · चालें {moves} · चक्कर {n} के बाद V(S): {v}',
      id: 'sampai di: {end} · langkah {moves} · V(S) setelah putaran {n}: {v}',
      pt: 'chega a: {end} · movimentos {moves} · V(S) após a varredura {n}: {v}',
    },
  },
};
