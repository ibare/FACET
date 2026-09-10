/**
 * @piece 조각(piece) facet — 질문 하나에 답하고 멈춘다.
 *
 * 답하는 질문: **가벼운 것부터 집는데, 왜 어떤 간선은 버려지는가.**
 *
 * 무게 순으로 줄 세운 간선을 위에서부터 집고, 집어 든 간선의 양 끝이 이미 같은
 * 무리이면 버린다. 무리는 정점의 색이고, 간선을 놓을 때마다 두 무리가 하나로
 * 물든다. 버리기 직전에는 이미 이어져 있던 길이 켜지고 집어 든 간선이 그 위에
 * 놓여 고리를 닫는다 — 그것이 버리는 까닭이다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const sortEdgesAvoidCycleFacet: FacetJson = {
  id: 'facet:sortEdgesAvoidCycle',
  title: {
    en: 'Sort the edges, drop the ones that close a loop',
    ko: '간선을 무게 순으로, 고리가 되면 버리기',
    ja: '辺を軽い順に、輪になるものは捨てる',
    zh: '按权重排边，成环就丢弃',
    ar: 'رتّب الأضلاع، واستبعد ما يُغلق دورة',
    es: 'Ordena las aristas y descarta las que cierran un ciclo',
    fr: 'Trier les arêtes, écarter celles qui ferment un cycle',
    hi: 'किनारों को भार के क्रम में लगाएँ, चक्र बनाने वाले हटाएँ',
    id: 'Urutkan sisi, buang yang menutup siklus',
    pt: 'Ordene as arestas e descarte as que fecham um ciclo',
  },
  description: {
    en: 'Take edges from lightest to heaviest and drop any edge whose endpoints already sit in one group.',
    ko: '가벼운 간선부터 집되, 양 끝이 이미 한 무리인 간선은 버린다.',
    ja: '軽い辺から順に取り、両端がすでに同じ組にある辺は捨てる。',
    zh: '从最轻的边开始取，两端已在同一组的边就丢掉。',
    ar: 'خذ الأضلاع من الأخف إلى الأثقل، واستبعد كل ضلع طرفاه في المجموعة نفسها.',
    es: 'Toma las aristas de la más ligera a la más pesada y descarta la que ya tenga sus dos extremos en un mismo grupo.',
    fr: "Prendre les arêtes de la plus légère à la plus lourde et écarter celle dont les deux extrémités sont déjà dans le même groupe.",
    hi: 'सबसे हल्के किनारे से भारी की ओर लें, और जिस किनारे के दोनों सिरे पहले से एक ही समूह में हैं उसे हटा दें।',
    id: 'Ambil sisi dari yang teringan ke terberat, dan buang sisi yang kedua ujungnya sudah berada dalam satu kelompok.',
    pt: 'Pegue as arestas da mais leve à mais pesada e descarte aquela cujos extremos já estão no mesmo grupo.',
  },
  algorithm: 'module:sortEdgesAvoidCycle',
  projector: 'module:sortEdgesAvoidCycleProjector',
  initialData: {
    type: 'sort-edges-avoid-cycle',
    nodes: ['P', 'Q', 'R', 'S', 'T'],
    // 무게 순이 아닌 차례로 적는다. 줄 세우기가 크루스칼의 첫 동작인데 이미
    // 정렬해 넘기면 그 걸음이 아무것도 움직이지 않는 죽은 걸음이 된다.
    // 이 차례에서는 여섯 장이 모두 자리를 옮긴다 — 제자리에 남는 카드가 없다.
    edges: [
      { id: 'Q-R', u: 'Q', v: 'R', weight: 3 },
      { id: 'S-T', u: 'S', v: 'T', weight: 5 },
      { id: 'P-Q', u: 'P', v: 'Q', weight: 1 },
      { id: 'Q-T', u: 'Q', v: 'T', weight: 6 },
      { id: 'R-S', u: 'R', v: 'S', weight: 2 },
      { id: 'P-R', u: 'P', v: 'R', weight: 4 },
    ],
    stepMs: 800,
  },
  blocks: {
    stage: { type: 'sort-edges-avoid-cycle-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'label.queue': {
      en: 'by weight',
      ko: '무게 순',
      ja: '軽い順',
      zh: '按权重',
      ar: 'حسب الوزن',
      es: 'por peso',
      fr: 'par poids',
      hi: 'भार के क्रम में',
      id: 'menurut bobot',
      pt: 'por peso',
    },
    'label.discarded': {
      en: 'discarded',
      ko: '버린 간선',
      ja: '捨てた辺',
      zh: '已丢弃',
      ar: 'مستبعدة',
      es: 'descartadas',
      fr: 'écartées',
      hi: 'हटाए गए',
      id: 'dibuang',
      pt: 'descartadas',
    },
    'caption.start': {
      en: 'The edges stand in line, lightest first.',
      ko: '간선이 가벼운 것부터 줄을 섰다.',
      ja: '辺が軽い順に並んだ。',
      zh: '边按从轻到重排好了队。',
      ar: 'اصطفّت الأضلاع، الأخف أولًا.',
      es: 'Las aristas se ponen en fila, la más ligera primero.',
      fr: 'Les arêtes font la queue, la plus légère en tête.',
      hi: 'किनारे पंक्ति में लगे हैं, सबसे हल्का पहले।',
      id: 'Sisi-sisi berbaris, yang teringan di depan.',
      pt: 'As arestas ficam em fila, a mais leve à frente.',
    },
    'caption.pick': {
      en: 'Pick up {u}–{v}, weight {weight}.',
      ko: '{u}–{v} 를 집는다. 무게 {weight}.',
      ja: '{u}–{v} を取る。重さ {weight}。',
      zh: '取出 {u}–{v}，权重 {weight}。',
      ar: 'التقط {u}–{v}، وزنه {weight}.',
      es: 'Se toma {u}–{v}, peso {weight}.',
      fr: 'On prend {u}–{v}, poids {weight}.',
      hi: '{u}–{v} उठाएँ, भार {weight}।',
      id: 'Ambil {u}–{v}, bobot {weight}.',
      pt: 'Pega-se {u}–{v}, peso {weight}.',
    },
    'caption.keep': {
      en: '{u} and {v} are in different groups — lay the edge down, the two groups become one.',
      ko: '{u} 와 {v} 는 다른 무리다 — 간선을 놓으면 두 무리가 하나가 된다.',
      ja: '{u} と {v} は別の組だ — 辺を置けば二つの組が一つになる。',
      zh: '{u} 和 {v} 分属不同的组 — 放下这条边，两组合为一组。',
      ar: '{u} و{v} في مجموعتين مختلفتين — ضع الضلع فتصير المجموعتان واحدة.',
      es: '{u} y {v} están en grupos distintos: se coloca la arista y los dos grupos se vuelven uno.',
      fr: "{u} et {v} sont dans des groupes différents — on pose l'arête et les deux groupes n'en font plus qu'un.",
      hi: '{u} और {v} अलग-अलग समूहों में हैं — किनारा रख दें, दोनों समूह एक हो जाते हैं।',
      id: '{u} dan {v} berada di kelompok berbeda — letakkan sisinya, kedua kelompok menyatu.',
      pt: '{u} e {v} estão em grupos diferentes — assenta-se a aresta e os dois grupos viram um.',
    },
    'caption.discard': {
      en: '{u} and {v} are already in one group — this edge would close a loop, so it is dropped.',
      ko: '{u} 와 {v} 는 이미 한 무리다 — 이 간선은 고리를 닫으므로 버린다.',
      ja: '{u} と {v} はすでに同じ組だ — この辺は輪を閉じてしまうので捨てる。',
      zh: '{u} 和 {v} 已在同一组 — 这条边会闭成环，所以丢掉。',
      ar: '{u} و{v} في مجموعة واحدة أصلًا — هذا الضلع يُغلق دورة، فيُستبعد.',
      es: '{u} y {v} ya están en un mismo grupo: esta arista cerraría un ciclo, así que se descarta.',
      fr: "{u} et {v} sont déjà dans le même groupe — cette arête fermerait un cycle, on l'écarte.",
      hi: '{u} और {v} पहले से एक ही समूह में हैं — यह किनारा चक्र बना देगा, इसलिए हटा दिया जाता है।',
      id: '{u} dan {v} sudah berada dalam satu kelompok — sisi ini akan menutup siklus, jadi dibuang.',
      pt: '{u} e {v} já estão no mesmo grupo — esta aresta fecharia um ciclo, por isso é descartada.',
    },
    'caption.done': {
      en: 'Kept {kept}, dropped {discarded}. Total weight {total}.',
      ko: '{kept} 개를 놓고 {discarded} 개를 버렸다. 무게 합 {total}.',
      ja: '置いた辺 {kept}、捨てた辺 {discarded}。重さの合計 {total}。',
      zh: '保留 {kept} 条，丢弃 {discarded} 条。总权重 {total}。',
      ar: 'أُبقي على {kept} واستُبعد {discarded}. مجموع الوزن {total}.',
      es: 'Se quedan {kept} y se descartan {discarded}. Peso total {total}.',
      fr: '{kept} gardées, {discarded} écartées. Poids total {total}.',
      hi: '{kept} रखे, {discarded} हटाए। कुल भार {total}।',
      id: 'Disimpan {kept}, dibuang {discarded}. Total bobot {total}.',
      pt: 'Ficam {kept}, descartam-se {discarded}. Peso total {total}.',
    },
  },
};
