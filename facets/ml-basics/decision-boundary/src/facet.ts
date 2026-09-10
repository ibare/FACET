/**
 * 결정 경계 facet JSON 선언.
 *
 * @piece — 질문 하나에 답하고 멈추는 조각 (S-piece).
 *
 * 질문: 확률로 답하는 모델은 어디서 "이쪽" 과 "저쪽" 을 가르는가.
 *
 * 선언이 담는 것은 구조뿐이다 — 고정된 무게와 치우침, 점 여덟, 질문을 던지는
 * 입력 공간의 범위, 격자 해상도. z 도 p 도 경계선의 자리도 여기 없다. 그것은
 * 전부 파생값이라 algorithm 이 셈하고, 좌표는 stage 가 캔버스에서 역산한다.
 *
 * 무게 (1, 1) 과 치우침 −5.5 는 학습의 결과가 아니라 주어진 것이다. 이 조각은
 * 학습을 보이지 않는다 — 이미 정해진 모델이 평면을 어떻게 가르는지만 보인다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

/** 점 여덟. 아래쪽 넷과 위쪽 넷이지만 조각은 그 이름표를 화면에 쓰지 않는다. */
const POINTS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 1, y: 1 },
  { x: 2, y: 1.5 },
  { x: 1.5, y: 2.5 },
  { x: 3, y: 1 },
  { x: 4, y: 3.5 },
  { x: 3, y: 4 },
  { x: 5, y: 2.5 },
  { x: 4.5, y: 4.5 },
];

export const decisionBoundaryFacet: FacetJson = {
  id: 'facet:decisionBoundary',
  title: {
    en: 'Decision Boundary — the line that shows up last',
    ko: '결정 경계 — 마지막에 나타나는 선',
    ja: '決定境界 — 最後に現れる線',
    zh: '决策边界 — 最后才出现的那条线',
    ar: 'حدّ القرار — الخط الذي يظهر أخيرًا',
    es: 'Frontera de decisión: la línea que aparece al final',
    fr: 'Frontière de décision — la ligne qui apparaît en dernier',
    hi: 'निर्णय सीमा — वह रेखा जो सबसे बाद में उभरती है',
    id: 'Batas keputusan — garis yang muncul paling akhir',
    pt: 'Fronteira de decisão — a linha que aparece por último',
  },
  description: {
    en: 'Every spot gets a probability first; the boundary is where it crosses half',
    ko: '자리마다 확률이 먼저 매겨지고, 그것이 반을 넘나드는 곳이 경계다',
    ja: 'まず場所ごとに確率が付き、それが半分をまたぐところが境界になる',
    zh: '先给每个位置一个概率，越过一半的地方才是边界',
    ar: 'كل موضع ينال احتمالًا أولًا، والحدّ هو حيث يعبر النصف',
    es: 'Primero cada punto recibe una probabilidad; la frontera está donde cruza la mitad',
    fr: "Chaque endroit reçoit d'abord une probabilité ; la frontière est là où elle franchit la moitié",
    hi: 'पहले हर जगह को एक प्रायिकता मिलती है; सीमा वहीं है जहाँ वह आधे को पार करती है',
    id: 'Tiap titik lebih dulu diberi peluang; batasnya ada di tempat peluang itu melewati setengah',
    pt: 'Cada ponto recebe primeiro uma probabilidade; a fronteira é onde ela cruza a metade',
  },
  algorithm: 'module:decisionBoundary',
  projector: 'module:decisionBoundaryProjector',
  initialData: {
    type: 'decision-boundary',
    weights: { x: 1, y: 1 },
    bias: -5.5,
    points: POINTS.map((p) => ({ ...p })),
    domain: { min: 0, max: 6 },
    grid: { cols: 24, rows: 24, waves: 3 },
    stepMs: 750,
  },
  blocks: {
    stage: { type: 'decision-boundary-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.probe': {
      en: 'Ask each point for a probability, not a side — {k} of {n}.',
      ko: '점마다 확률을 묻는다. 어느 쪽인지가 아니다 — {k} / {n}.',
      ja: '点ごとに確率を訊く。どちら側かではない — {k} / {n}。',
      zh: '逐点问概率，不是问哪一边 — {k} / {n}。',
      ar: 'اسأل كل نقطة عن احتمال، لا عن جهة — {k} من {n}.',
      es: 'A cada punto le pedimos una probabilidad, no un lado: {k} de {n}.',
      fr: 'On demande à chaque point une probabilité, pas un côté — {k} sur {n}.',
      hi: 'हर बिंदु से प्रायिकता पूछें, पक्ष नहीं — {n} में से {k}।',
      id: 'Tanyakan peluang pada tiap titik, bukan sisinya — {k} dari {n}.',
      pt: 'A cada ponto pedimos uma probabilidade, não um lado — {k} de {n}.',
    },
    'caption.spread': {
      en: 'The eight fell to the two ends. Nothing landed near half.',
      ko: '여덟은 두 끝으로 갔다. 반 근처에 앉은 것은 없다.',
      ja: '八つは両端へ寄った。半分の近くに落ちたものはない。',
      zh: '八个都落到了两端。没有一个停在一半附近。',
      ar: 'الثمانية انحازت إلى الطرفين. لم يستقر أي منها قرب النصف.',
      es: 'Los ocho cayeron a los dos extremos. Ninguno quedó cerca de la mitad.',
      fr: 'Les huit sont allés aux deux extrémités. Aucun ne se pose près de la moitié.',
      hi: 'आठों दोनों सिरों पर चले गए। आधे के पास कोई नहीं ठहरा।',
      id: 'Kedelapannya jatuh ke dua ujung. Tidak ada yang mendarat dekat setengah.',
      pt: 'Os oito foram para as duas pontas. Nenhum ficou perto da metade.',
    },
    'caption.scan': {
      en: 'So ask every spot on the plane the same question.',
      ko: '그래서 평면의 모든 자리에 같은 것을 묻는다.',
      ja: 'ならば平面のすべての場所に同じことを訊く。',
      zh: '那就向平面上的每个位置问同一个问题。',
      ar: 'إذًا اسأل كل موضع في المستوى السؤال نفسه.',
      es: 'Entonces hacemos la misma pregunta en cada punto del plano.',
      fr: 'Alors posons la même question à chaque endroit du plan.',
      hi: 'तो तल की हर जगह से वही सवाल पूछें।',
      id: 'Maka tanyakan hal yang sama ke setiap titik di bidang.',
      pt: 'Então faça a mesma pergunta a cada ponto do plano.',
    },
    'caption.crossing': {
      en: 'Light up the cells where the probability crosses half.',
      ko: '확률이 반을 넘나드는 칸에 불을 켠다.',
      ja: '確率が半分をまたぐマスに明かりをともす。',
      zh: '把概率越过一半的格子点亮。',
      ar: 'أضئ الخلايا التي يعبر فيها الاحتمال النصف.',
      es: 'Iluminamos las celdas donde la probabilidad cruza la mitad.',
      fr: 'On allume les cases où la probabilité franchit la moitié.',
      hi: 'उन कोष्ठों को जलाएँ जहाँ प्रायिकता आधे को पार करती है।',
      id: 'Nyalakan sel-sel tempat peluangnya melewati setengah.',
      pt: 'Acenda as células onde a probabilidade cruza a metade.',
    },
    'caption.boundary': {
      en: 'Join them and the boundary appears. It was never drawn first.',
      ko: '그것을 이으면 경계가 나타난다. 미리 그어 둔 선이 아니다.',
      ja: 'それをつなぐと境界が現れる。あらかじめ引いておいた線ではない。',
      zh: '把它们连起来，边界就出现了。这条线不是事先画好的。',
      ar: 'صِلها يظهر الحدّ. لم يُرسم مسبقًا قط.',
      es: 'Al unirlas aparece la frontera. Nunca se trazó de antemano.',
      fr: "En les reliant, la frontière apparaît. Elle n'a jamais été tracée d'avance.",
      hi: 'इन्हें जोड़ें तो सीमा उभर आती है। यह रेखा पहले से खींची हुई नहीं थी।',
      id: 'Hubungkan semuanya, batasnya muncul. Garis itu tidak pernah digambar lebih dulu.',
      pt: 'Ligue-as e a fronteira aparece. Ela nunca foi traçada antes.',
    },
    'caption.done': {
      en: 'The line sits where p = 0.5 — not midway between the two clumps.',
      ko: '선이 있는 곳은 p = 0.5 인 자리다. 두 무리의 한가운데가 아니다.',
      ja: '線があるのは p = 0.5 の場所だ。二つの塊の真ん中ではない。',
      zh: '这条线落在 p = 0.5 处 — 不是两团的正中间。',
      ar: 'الخط يقع حيث p = 0.5 — لا في منتصف المسافة بين الكتلتين.',
      es: 'La línea está donde p = 0.5, no a medio camino entre los dos cúmulos.',
      fr: 'La ligne se place là où p = 0.5 — pas à mi-chemin entre les deux amas.',
      hi: 'रेखा वहाँ है जहाँ p = 0.5 है — दोनों झुंडों के ठीक बीच में नहीं।',
      id: 'Garisnya berada di tempat p = 0.5 — bukan di tengah antara dua gerombolan.',
      pt: 'A linha fica onde p = 0.5 — não no meio do caminho entre os dois grupos.',
    },
  },
};
