/**
 * 되짚어 나오기 — 조각(piece).
 *
 * @piece 한 줄기를 끝까지 파고들었다가 막히면 왔던 길을 거슬러 나오는 걸음이,
 *        "다음 자리로 넘어가는 걸음" 과 어떻게 다른가.
 *
 * 조각이므로 header · metrics · layout · code-view 를 두지 않는다 (S-piece).
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const diveThenBacktrackFacet: FacetJson = {
  id: 'facet:diveThenBacktrack',
  title: {
    en: 'Dive, then back out',
    ko: '파고들었다 되짚어 나오기',
    ja: '潜って、たどって戻る',
    zh: '一头扎下去，再原路退回',
    ar: 'اغطس ثم عُد أدراجك',
    es: 'Bajar y luego retroceder',
    fr: 'Plonger, puis ressortir',
    hi: 'गहरे उतरें, फिर लौटें',
    id: 'Menyelam, lalu mundur kembali',
    pt: 'Mergulhar e depois voltar',
  },
  description: {
    en: 'A depth-first walk spends as many moves backing out as it spends going in.',
    ko: '깊이 우선 답사는 파고드는 걸음만큼 되짚어 나오는 걸음을 쓴다.',
    ja: '深さ優先の探索は、潜る歩数と同じだけ、戻る歩数を使う。',
    zh: '深度优先的走法，退回来花的步数和扎进去一样多。',
    ar: 'المسير بالعمق أولًا ينفق في العودة عدد الخطوات نفسه الذي أنفقه في الدخول.',
    es: 'Un recorrido en profundidad gasta tantos pasos en volver como en entrar.',
    fr: "Un parcours en profondeur dépense autant de pas à ressortir qu'à entrer.",
    hi: 'गहराई-पहले चलने में लौटने के उतने ही कदम लगते हैं जितने अंदर जाने में।',
    id: 'Penelusuran mendalam menghabiskan langkah mundur sebanyak langkah majunya.',
    pt: 'Um percurso em profundidade gasta tantos passos a voltar quanto a entrar.',
  },
  algorithm: 'module:diveThenBacktrack',
  projector: 'module:diveThenBacktrackProjector',
  initialData: {
    type: 'dive-then-backtrack',
    vertices: ['A', 'B', 'C', 'D', 'E', 'F'],
    edges: [
      ['A', 'B'],
      ['B', 'D'],
      ['B', 'E'],
      ['A', 'C'],
      ['C', 'F'],
    ],
    start: 'A',
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'dive-then-backtrack-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.start': {
      en: 'Start at {node} and take one branch as far as it goes.',
      ko: '{node} 에서 출발해 한 줄기를 끝까지 따라간다.',
      ja: '{node} から出発し、一本の枝を行けるところまでたどる。',
      zh: '从 {node} 出发，沿一条支路一直走到底。',
      ar: 'ابدأ من {node} واتبع فرعًا واحدًا إلى منتهاه.',
      es: 'Empieza en {node} y sigue una rama hasta donde llegue.',
      fr: "Partir de {node} et suivre une branche jusqu'au bout.",
      hi: '{node} से शुरू करें और एक शाखा को जहाँ तक जाए वहाँ तक चलें।',
      id: 'Mulai dari {node} dan ikuti satu cabang sejauh mungkin.',
      pt: 'Começa em {node} e segue um ramo até onde der.',
    },
    'caption.dive': {
      en: 'Dig one step deeper into {node}.',
      ko: '{node} 로 한 칸 더 파고든다.',
      ja: '{node} へもう一段深く潜る。',
      zh: '再往 {node} 深入一步。',
      ar: 'اغطس خطوة أعمق إلى {node}.',
      es: 'Baja un paso más hasta {node}.',
      fr: "Descendre d'un cran jusqu'à {node}.",
      hi: '{node} में एक कदम और गहरे उतरें।',
      id: 'Turun satu langkah lebih dalam ke {node}.',
      pt: 'Desce mais um passo até {node}.',
    },
    'caption.deadEnd': {
      en: 'Nowhere left to go from {node}.',
      ko: '{node} 에서는 더 갈 곳이 없다.',
      ja: '{node} からはもう行き先がない。',
      zh: '从 {node} 已经无路可走。',
      ar: 'لا مكان يُقصد من {node}.',
      es: 'Desde {node} ya no hay a dónde ir.',
      fr: "Depuis {node}, il n'y a plus où aller.",
      hi: '{node} से आगे कहीं जाने को नहीं बचा।',
      id: 'Dari {node} tidak ada lagi tujuan.',
      pt: 'De {node} não há mais para onde ir.',
    },
    'caption.retreat': {
      en: 'Back out to {node} along the way we came.',
      ko: '왔던 길을 되짚어 {node} 로 물러난다.',
      ja: '来た道をたどって {node} まで戻る。',
      zh: '沿原路退回到 {node}。',
      ar: 'ارجع إلى {node} على الطريق الذي جئنا منه.',
      es: 'Retrocede hasta {node} por el camino de ida.',
      fr: "Revenir jusqu'à {node} par le chemin parcouru.",
      hi: 'जिस रास्ते आए थे, उसी से {node} तक लौटें।',
      id: 'Mundur ke {node} lewat jalan yang tadi ditempuh.',
      pt: 'Volta até {node} pelo mesmo caminho.',
    },
    'caption.done': {
      en: 'All {visited} reached — and {backtracks} of the moves were retreats back up.',
      ko: '{visited} 곳을 모두 밟았다 — 그 걸음 가운데 {backtracks} 번은 되짚어 나온 걸음이다.',
      ja: '{visited} か所すべてを踏んだ — そのうち {backtracks} 歩は戻る歩みだった。',
      zh: '{visited} 处全都走到了 — 其中 {backtracks} 步是往回退的。',
      ar: 'بُلغت كل الـ{visited} — ومن الخطوات {backtracks} كانت تراجعًا إلى الوراء.',
      es: 'Se llegó a los {visited}, y {backtracks} de los movimientos fueron de vuelta atrás.',
      fr: 'Les {visited} ont tous été atteints — et {backtracks} des pas étaient des retours en arrière.',
      hi: 'सभी {visited} तक पहुँच हुई — और उनमें से {backtracks} कदम पीछे लौटने के थे।',
      id: 'Semua {visited} tercapai — dan {backtracks} dari langkahnya adalah langkah mundur.',
      pt: 'Todos os {visited} foram alcançados — e {backtracks} dos passos foram de recuo.',
    },
  },
};
