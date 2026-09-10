/**
 * @piece 인접 교환 — 옆끼리만 견주는데도 가장 큰 것이 끝까지 밀려간다.
 *
 * 답하는 질문 하나: 가장 큰 값을 찾는 걸음이 따로 없는데 어떻게 그것이 끝에
 * 가 있는가. 답: 견줌 한 번마다 선두가 한 칸씩 오른쪽으로 옮겨 가고, 왼쪽 끝에서
 * 오른쪽 끝까지 한 번 훑으면 선두는 반드시 오른쪽 끝에 있다.
 *
 * 조각이므로 title-block 도 metrics 도 layout 도 두지 않는다. 제목은 이 조각을
 * 안은 문단이 주고, 셀 것은 견줌 횟수 하나뿐이라 패널을 세우지 않으며, 블록이
 * stage 와 controls 둘뿐이라 배치는 러너에게 맡긴다 (S-piece).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const bubbleAdjacentSwapFacet: FacetJson = {
  id: 'facet:bubbleAdjacentSwap',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: {
    en: 'Adjacent Swap',
    ko: '인접 교환',
    ja: '隣どうしの交換',
    zh: '相邻交换',
    ar: 'تبادل الجارين',
    es: 'Intercambio de vecinos',
    fr: 'Échange de voisins',
    hi: 'पड़ोसी अदला-बदली',
    id: 'Tukar tetangga',
    pt: 'Troca entre vizinhos',
  },
  description: {
    en: 'One left-to-right sweep of adjacent comparisons carries the running largest one slot at a time until it sits at the far right.',
    ko: '옆끼리 견주며 왼쪽에서 오른쪽으로 한 번 훑으면 선두가 한 칸씩 밀려가 오른쪽 끝에 닿는다.',
    ja: '隣どうしを比べながら左から右へ一度なでるだけで、その時点の最大が一マスずつ運ばれ、右端に落ち着く。',
    zh: '只把相邻的两个比一遍，从左扫到右，当前最大的就一格一格被带到最右端。',
    ar: 'مسحة واحدة من اليسار إلى اليمين بمقارنة الجارين تحمل الأكبر الجاري خانةً خانة حتى يستقر في أقصى اليمين.',
    es: 'Un solo barrido de izquierda a derecha comparando vecinos lleva al mayor de turno una casilla cada vez hasta dejarlo al extremo derecho.',
    fr: "Un seul balayage de gauche à droite, en comparant les voisins, porte le plus grand du moment case par case jusqu'à l'extrême droite.",
    hi: 'पड़ोसियों की तुलना करते हुए बाएँ से दाएँ एक ही बार बहने पर अब तक का सबसे बड़ा एक-एक खाना खिसकता हुआ दाएँ सिरे पर जा बैठता है।',
    id: 'Satu sapuan dari kiri ke kanan dengan membandingkan tetangga membawa yang terbesar sejauh ini satu petak demi satu petak sampai berhenti di ujung kanan.',
    pt: 'Uma única varredura da esquerda para a direita comparando vizinhos leva o maior do momento uma casa por vez até ele parar na ponta direita.',
  },
  algorithm: 'module:bubbleAdjacentSwap',
  projector: 'module:bubbleAdjacentSwapProjector',
  initialData: {
    type: 'bubble-adjacent-swap',
    // 한 값이 옆칸 맞바꿈을 **연달아** 하며 끝까지 가는 장면이 이 조각의 논증이다.
    // [4, 7, 2, 9, 1] 로는 그 장면이 안 나온다 — 7 도 9 도 한 칸씩만 가고 만다.
    // 여기서는 9 가 자리 1 에서 4 까지 세 번을 잇달아 밀려간다.
    values: [4, 9, 2, 7, 1],
    /** 걸음 사이에 읽을 시간 (S-piece — 간격도 저작 결정이다). */
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'bubble-adjacent-swap-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.compare': {
      en: 'Compare {a} and {b} — only these two, side by side.',
      ko: '{a} 와 {b} 를 견준다 — 나란한 이 둘만.',
      ja: '{a} と {b} を比べる — 隣り合うこの二つだけ。',
      zh: '比较 {a} 和 {b} — 只比挨着的这两个。',
      ar: 'قارن {a} و{b} — هذين الجارين فقط.',
      es: 'Compara {a} y {b}: solo estos dos, uno al lado del otro.',
      fr: 'Comparer {a} et {b} — ces deux-là seulement, côte à côte.',
      hi: '{a} और {b} की तुलना करें — बस ये दो, जो साथ-साथ हैं।',
      id: 'Bandingkan {a} dan {b} — hanya dua yang bersebelahan ini.',
      pt: 'Compare {a} e {b} — só estes dois, lado a lado.',
    },
    'caption.swap': {
      en: '{big} is larger — it rises over its neighbour, one slot right.',
      ko: '{big} 이 더 크다 — 이웃을 넘어 한 칸 오른쪽으로.',
      ja: '{big} のほうが大きい — 隣を越えて一マス右へ。',
      zh: '{big} 更大 — 越过邻居，往右挪一格。',
      ar: '{big} أكبر — يتخطى جاره خانة واحدة إلى اليمين.',
      es: '{big} es mayor: pasa por encima de su vecino, una casilla a la derecha.',
      fr: '{big} est plus grand — il passe par-dessus son voisin, une case à droite.',
      hi: '{big} बड़ा है — पड़ोसी को लाँघकर एक खाना दाएँ।',
      id: '{big} lebih besar — melewati tetangganya, satu petak ke kanan.',
      pt: '{big} é maior — passa por cima do vizinho, uma casa à direita.',
    },
    'caption.keep': {
      en: '{b} is already larger — nothing moves, and the lead is now {b}.',
      ko: '{b} 가 이미 더 크다 — 아무것도 옮기지 않고 선두만 {b} 에게 넘어간다.',
      ja: '{b} のほうがすでに大きい — 何も動かさず、先頭が {b} に移るだけ。',
      zh: '{b} 本来就更大 — 什么都不动，领先的换成 {b}。',
      ar: '{b} أكبر أصلًا — لا شيء يتحرك، والصدارة تنتقل إلى {b}.',
      es: '{b} ya es mayor: nada se mueve y la delantera pasa a {b}.',
      fr: '{b} est déjà plus grand — rien ne bouge, la tête revient à {b}.',
      hi: '{b} पहले से ही बड़ा है — कुछ नहीं हिलता, बढ़त बस {b} के पास चली जाती है।',
      id: '{b} memang sudah lebih besar — tak ada yang bergeser, pimpinan beralih ke {b}.',
      pt: '{b} já é maior — nada se move, e a dianteira passa a {b}.',
    },
    'caption.settled': {
      en: '{n} neighbour comparisons, and {max} is at the far right. No step ever went looking for it.',
      ko: '옆끼리 {n} 번 견줬을 뿐인데 {max} 가 오른쪽 끝에 와 있다. 그것을 찾아 나선 걸음은 없었다.',
      ja: '隣どうしを {n} 回比べただけなのに、{max} が右端に来ている。それを探しに行った歩みはひとつもない。',
      zh: '只把相邻的比了 {n} 次，{max} 就已经在最右端。没有哪一步是去找它的。',
      ar: '{n} مقارنة بين الجيران فحسب، و{max} في أقصى اليمين. ولم تسع خطوة واحدة للبحث عنه.',
      es: '{n} comparaciones entre vecinos y {max} está en el extremo derecho. Ningún paso salió a buscarlo.',
      fr: "{n} comparaisons entre voisins, et {max} se trouve à l'extrême droite. Aucun pas n'est allé le chercher.",
      hi: 'पड़ोसियों की सिर्फ़ {n} तुलनाएँ, और {max} दाएँ सिरे पर है। उसे ढूँढ़ने कोई कदम गया ही नहीं।',
      id: 'Hanya {n} perbandingan antartetangga, dan {max} sudah di ujung kanan. Tak ada satu langkah pun yang pergi mencarinya.',
      pt: '{n} comparações entre vizinhos, e {max} está na ponta direita. Nenhum passo saiu à procura dele.',
    },
  },
};
