import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

/**
 * @piece
 * 퍼셉트론은 입력 몇 개로 어떻게 켜짐과 꺼짐을 정하는가.
 *
 * 입력마다 무게를 곱해 한 합에 싣는다 — 양의 무게는 합을 올리고 음의 무게는 내린다.
 * 셋이 다 실린 뒤 합을 문턱과 한 번 견주고, 넘으면 출력이 0 에서 1 로 한 번에 건너뛴다.
 */
export const weightedSumThresholdFacet: FacetJson = {
  id: 'facet:weightedSumThreshold',
  title: {
    en: 'Weighted sum, then a threshold',
    ko: '가중합, 그리고 문턱',
    ja: '重み付き和、そしてしきい値',
    zh: '加权和，然后是阈值',
    ar: 'مجموع موزون، ثم عتبة',
    es: 'Suma ponderada y luego un umbral',
    fr: 'Somme pondérée, puis un seuil',
    hi: 'भारित योग, फिर एक दहलीज़',
    id: 'Jumlah berbobot, lalu ambang',
    pt: 'Soma ponderada e depois um limiar',
  },
  description: {
    en: 'Each input is multiplied by its weight and loaded onto one sum, which rises or falls. Only at the end is the sum compared with the threshold once, and the output jumps from 0 to 1 in a single step.',
    ko: '입력마다 무게를 곱해 한 합에 싣고, 합은 오르기도 내리기도 한다. 끝에 한 번만 합을 문턱과 견주고, 출력은 0 에서 1 로 한 번에 건너뛴다.',
    ja: '各入力に重みを掛けて一つの和に載せ、和は上がったり下がったりする。最後に一度だけ和をしきい値と比べ、出力は 0 から 1 へ一気に跳ぶ。',
    zh: '每个输入乘以其权重后加到同一个和上，和会升也会降。只在最后把和与阈值比较一次，输出从 0 一下子跳到 1。',
    ar: 'يُضرب كل مُدخل في وزنه ويُضاف إلى مجموع واحد يرتفع أو ينخفض. وفي النهاية فقط يُقارَن المجموع بالعتبة مرة واحدة، فيقفز الخرج من 0 إلى 1 دفعة واحدة.',
    es: 'Cada entrada se multiplica por su peso y se carga en una sola suma, que sube o baja. Solo al final se compara la suma con el umbral una vez, y la salida salta de 0 a 1 de golpe.',
    fr: 'Chaque entrée est multipliée par son poids et chargée sur une seule somme, qui monte ou descend. À la fin seulement, la somme est comparée une fois au seuil, et la sortie saute de 0 à 1 d’un coup.',
    hi: 'हर इनपुट को उसके भार से गुणा करके एक ही योग पर लादा जाता है, और योग ऊपर या नीचे जाता है। केवल अंत में योग की दहलीज़ से एक बार तुलना होती है, और आउटपुट 0 से 1 पर एक ही छलाँग में पहुँचता है।',
    id: 'Setiap masukan dikalikan bobotnya lalu dimuat ke satu jumlah, yang naik atau turun. Hanya di akhir jumlah dibandingkan sekali dengan ambang, dan keluaran melompat dari 0 ke 1 sekaligus.',
    pt: 'Cada entrada é multiplicada pelo seu peso e carregada numa única soma, que sobe ou desce. Só no fim a soma é comparada uma vez com o limiar, e a saída salta de 0 para 1 de uma vez.',
  },
  algorithm: 'module:weightedSumThreshold',
  scene: 'module:weightedSumThresholdScene',
  initialData: {
    type: 'weighted-sum-threshold',
    inputs: [
      { id: 'x1', weightId: 'w1', value: 0.8, weight: 0.6 },
      { id: 'x2', weightId: 'w2', value: 0.5, weight: -0.4 },
      { id: 'x3', weightId: 'w3', value: 0.9, weight: 0.7 },
    ],
    theta: 0.7,
    stepMs: 1800,
  },
  shuffleOnReset: false,
  messages: {
    'label.input': {
      en: '{id} = {v}', ko: '{id} = {v}', ja: '{id} = {v}', zh: '{id} = {v}', ar: '{id} = {v}',
      es: '{id} = {v}', fr: '{id} = {v}', hi: '{id} = {v}', id: '{id} = {v}', pt: '{id} = {v}',
    },
    'label.weight': {
      en: '{id} = {v}', ko: '{id} = {v}', ja: '{id} = {v}', zh: '{id} = {v}', ar: '{id} = {v}',
      es: '{id} = {v}', fr: '{id} = {v}', hi: '{id} = {v}', id: '{id} = {v}', pt: '{id} = {v}',
    },
    'label.product': {
      en: '= {v}', ko: '= {v}', ja: '= {v}', zh: '= {v}', ar: '= {v}',
      es: '= {v}', fr: '= {v}', hi: '= {v}', id: '= {v}', pt: '= {v}',
    },
    'label.sum': {
      en: 's = {v}', ko: 's = {v}', ja: 's = {v}', zh: 's = {v}', ar: 's = {v}',
      es: 's = {v}', fr: 's = {v}', hi: 's = {v}', id: 's = {v}', pt: 's = {v}',
    },
    'label.theta': {
      en: 'θ = {v}', ko: 'θ = {v}', ja: 'θ = {v}', zh: 'θ = {v}', ar: 'θ = {v}',
      es: 'θ = {v}', fr: 'θ = {v}', hi: 'θ = {v}', id: 'θ = {v}', pt: 'θ = {v}',
    },
    'label.margin': {
      en: '{sign}{v}', ko: '{sign}{v}', ja: '{sign}{v}', zh: '{sign}{v}', ar: '{sign}{v}',
      es: '{sign}{v}', fr: '{sign}{v}', hi: '{sign}{v}', id: '{sign}{v}', pt: '{sign}{v}',
    },
    'label.output': {
      en: 'output', ko: '출력', ja: '出力', zh: '输出', ar: 'الخرج',
      es: 'salida', fr: 'sortie', hi: 'आउटपुट', id: 'keluaran', pt: 'saída',
    },
    'caption.start': {
      en: 'Nothing loaded yet. s = {s} · output = {out}',
      ko: '아직 실린 입력이 없다. s = {s} · 출력 = {out}',
      ja: 'まだ何も載っていない。s = {s} · 出力 = {out}',
      zh: '还没有加入任何输入。s = {s} · 输出 = {out}',
      ar: 'لم يُحمَّل شيء بعد. s = {s} · الخرج = {out}',
      es: 'Aún no se ha cargado nada. s = {s} · salida = {out}',
      fr: 'Rien n’est encore chargé. s = {s} · sortie = {out}',
      hi: 'अभी कुछ नहीं लादा गया। s = {s} · आउटपुट = {out}',
      id: 'Belum ada yang dimuat. s = {s} · keluaran = {out}',
      pt: 'Nada carregado ainda. s = {s} · saída = {out}',
    },
    'caption.rise': {
      en: 'Load {x}: {xv} × {wv} = {p}. s rises: {from} → {to}',
      ko: '{x} 싣기: {xv} × {wv} = {p}. s 오름: {from} → {to}',
      ja: '{x} を載せる: {xv} × {wv} = {p}。s が上がる: {from} → {to}',
      zh: '加入 {x}：{xv} × {wv} = {p}。s 上升：{from} → {to}',
      ar: 'تحميل {x}: {xv} × {wv} = {p}. يرتفع s: {from} → {to}',
      es: 'Cargar {x}: {xv} × {wv} = {p}. s sube: {from} → {to}',
      fr: 'Charger {x} : {xv} × {wv} = {p}. s monte : {from} → {to}',
      hi: '{x} लादना: {xv} × {wv} = {p}। s बढ़ा: {from} → {to}',
      id: 'Muat {x}: {xv} × {wv} = {p}. s naik: {from} → {to}',
      pt: 'Carregar {x}: {xv} × {wv} = {p}. s sobe: {from} → {to}',
    },
    'caption.fall': {
      en: 'Load {x}: {xv} × {wv} = {p}. s falls: {from} → {to}',
      ko: '{x} 싣기: {xv} × {wv} = {p}. s 내림: {from} → {to}',
      ja: '{x} を載せる: {xv} × {wv} = {p}。s が下がる: {from} → {to}',
      zh: '加入 {x}：{xv} × {wv} = {p}。s 下降：{from} → {to}',
      ar: 'تحميل {x}: {xv} × {wv} = {p}. ينخفض s: {from} → {to}',
      es: 'Cargar {x}: {xv} × {wv} = {p}. s baja: {from} → {to}',
      fr: 'Charger {x} : {xv} × {wv} = {p}. s descend : {from} → {to}',
      hi: '{x} लादना: {xv} × {wv} = {p}। s घटा: {from} → {to}',
      id: 'Muat {x}: {xv} × {wv} = {p}. s turun: {from} → {to}',
      pt: 'Carregar {x}: {xv} × {wv} = {p}. s desce: {from} → {to}',
    },
    'caption.above': {
      en: 'Compared once: s = {s} > θ = {theta}. Output: {from} → {to}',
      ko: '끝에 한 번 견준다: s = {s} > θ = {theta}. 출력: {from} → {to}',
      ja: '一度だけ比べる: s = {s} > θ = {theta}。出力: {from} → {to}',
      zh: '只比较一次：s = {s} > θ = {theta}。输出：{from} → {to}',
      ar: 'مقارنة واحدة: s = {s} > θ = {theta}. الخرج: {from} → {to}',
      es: 'Una sola comparación: s = {s} > θ = {theta}. Salida: {from} → {to}',
      fr: 'Une seule comparaison : s = {s} > θ = {theta}. Sortie : {from} → {to}',
      hi: 'एक बार तुलना: s = {s} > θ = {theta}। आउटपुट: {from} → {to}',
      id: 'Dibandingkan sekali: s = {s} > θ = {theta}. Keluaran: {from} → {to}',
      pt: 'Uma única comparação: s = {s} > θ = {theta}. Saída: {from} → {to}',
    },
    'caption.below': {
      en: 'Compared once: s = {s} ≤ θ = {theta}. Output: {from} → {to}',
      ko: '끝에 한 번 견준다: s = {s} ≤ θ = {theta}. 출력: {from} → {to}',
      ja: '一度だけ比べる: s = {s} ≤ θ = {theta}。出力: {from} → {to}',
      zh: '只比较一次：s = {s} ≤ θ = {theta}。输出：{from} → {to}',
      ar: 'مقارنة واحدة: s = {s} ≤ θ = {theta}. الخرج: {from} → {to}',
      es: 'Una sola comparación: s = {s} ≤ θ = {theta}. Salida: {from} → {to}',
      fr: 'Une seule comparaison : s = {s} ≤ θ = {theta}. Sortie : {from} → {to}',
      hi: 'एक बार तुलना: s = {s} ≤ θ = {theta}। आउटपुट: {from} → {to}',
      id: 'Dibandingkan sekali: s = {s} ≤ θ = {theta}. Keluaran: {from} → {to}',
      pt: 'Uma única comparação: s = {s} ≤ θ = {theta}. Saída: {from} → {to}',
    },
  },
  blocks: {
    stage: { type: 'weighted-sum-threshold-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
};
