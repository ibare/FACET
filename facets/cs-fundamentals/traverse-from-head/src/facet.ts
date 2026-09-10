/**
 * traverse-from-head — 순차 접근 조각(piece) 선언.
 *
 * @piece 한 주장만 말한다 — "처음부터 따라가야 닿는다".
 *
 * 제목 블록도 메트릭도 두지 않는다 (S-piece). 제목은 글의 문단이 주고, 조각은
 * 셀 것이 없다. 컨트롤은 다시 보기와 한 걸음 둘뿐이며 둘 다 눌러야 완성되는
 * 조작이 아니다 — 자동 재생만 보고 지나가도 화면은 할 말을 마친다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const traverseFromHeadFacet: FacetJson = {
  id: 'facet:traverseFromHead',
  title: {
    en: 'Reaching the fourth node',
    ko: '네 번째 노드에 닿기',
    ja: '四番目のノードに届くまで',
    zh: '走到第四个节点',
    ar: 'الوصول إلى العقدة الرابعة',
    es: 'Llegar al cuarto nodo',
    fr: 'Atteindre le quatrième nœud',
    hi: 'चौथे नोड तक पहुँचना',
    id: 'Mencapai node keempat',
    pt: 'Chegar ao quarto nó',
  },
  description: {
    en: 'To reach a node you follow the links from the head, one at a time.',
    ko: '노드에 닿으려면 head 에서부터 링크를 하나씩 따라가는 수밖에 없다.',
    ja: 'ノードに届くには、head からリンクを一つずつたどるしかない。',
    zh: '要到某个节点，只能从 head 开始一条一条地跟着链接走。',
    ar: 'للوصول إلى عقدة لا بد من تتبع الروابط من head واحدًا تلو الآخر.',
    es: 'Para llegar a un nodo hay que seguir los enlaces desde head, uno a uno.',
    fr: "Pour atteindre un nœud, il faut suivre les liens depuis head, un par un.",
    hi: 'किसी नोड तक पहुँचने के लिए head से एक-एक कर लिंक पकड़ते जाना ही पड़ता है।',
    id: 'Untuk mencapai sebuah node, tautan harus diikuti dari head, satu per satu.',
    pt: 'Para chegar a um nó é preciso seguir os elos a partir do head, um a um.',
  },
  algorithm: 'module:traverseFromHead',
  projector: 'module:traverseFromHeadProjector',
  initialData: {
    type: 'traverse-from-head',
    /** 다섯 노드. 값은 화면에 그대로 쓰인다. */
    values: [3, 8, 1, 6, 4],
    /** 찾아갈 자리 — 값 6 이 든 네 번째 노드. 옮김 3회. */
    targetIndex: 3,
    /** 걸음 사이 읽을 시간. */
    stepMs: 900,
  },
  blocks: {
    stage: { type: 'traverse-from-head-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.want': {
      en: 'We need the node at index {i}.',
      ko: '필요한 것은 인덱스 {i} 의 노드다.',
      ja: '必要なのはインデックス {i} のノードだ。',
      zh: '我们要的是索引 {i} 处的节点。',
      ar: 'نحتاج العقدة عند الفهرس {i}.',
      es: 'Necesitamos el nodo del índice {i}.',
      fr: "Il nous faut le nœud d'indice {i}.",
      hi: 'हमें इंडेक्स {i} वाला नोड चाहिए।',
      id: 'Yang dibutuhkan adalah node pada indeks {i}.',
      pt: 'Precisamos do nó no índice {i}.',
    },
    'caption.noJump': {
      en: 'No address to compute, so the jump has nowhere to land.',
      ko: '셈할 주소가 없으니 건너뛸 자리도 없다.',
      ja: '計算できる番地がないので、飛び先もない。',
      zh: '没有可计算的地址，跳过去也无处落脚。',
      ar: 'لا عنوان يُحسب، فلا مكان يهبط فيه القفز.',
      es: 'No hay dirección que calcular, así que el salto no tiene dónde caer.',
      fr: "Aucune adresse à calculer : le saut n'a nulle part où atterrir.",
      hi: 'गणना करने को कोई पता ही नहीं, इसलिए छलाँग के उतरने की जगह भी नहीं।',
      id: 'Tak ada alamat untuk dihitung, jadi lompatan tak punya tempat mendarat.',
      pt: 'Não há endereço a calcular, então o salto não tem onde pousar.',
    },
    'caption.follow': {
      en: 'Follow one link. That is the only move there is.',
      ko: '링크를 하나 따라간다. 할 수 있는 것은 그것뿐이다.',
      ja: 'リンクを一つたどる。できるのはそれだけだ。',
      zh: '跟着一条链接走。能做的只有这个。',
      ar: 'اتبع رابطًا واحدًا. هذه هي الحركة الوحيدة الممكنة.',
      es: 'Sigue un enlace. Es lo único que se puede hacer.',
      fr: "On suit un lien. C'est le seul mouvement possible.",
      hi: 'एक लिंक पकड़कर चलें। बस यही किया जा सकता है।',
      id: 'Ikuti satu tautan. Hanya itu yang bisa dilakukan.',
      pt: 'Segue-se um elo. É o único movimento possível.',
    },
    'caption.arrived': {
      en: 'Index {i} took {n} moves through {v} nodes.',
      ko: '인덱스 {i} 까지 {n} 번 옮겼고 노드 {v} 개를 거쳤다.',
      ja: 'インデックス {i} まで {n} 回動き、ノード {v} 個を通った。',
      zh: '到索引 {i} 走了 {n} 步，经过 {v} 个节点。',
      ar: 'استغرق الفهرس {i} عدد {n} حركة عبر {v} عقدة.',
      es: 'Llegar al índice {i} costó {n} movimientos por {v} nodos.',
      fr: "L'indice {i} a demandé {n} déplacements à travers {v} nœuds.",
      hi: 'इंडेक्स {i} तक {n} चालें लगीं, {v} नोड से होकर।',
      id: 'Indeks {i} butuh {n} langkah melewati {v} node.',
      pt: 'O índice {i} exigiu {n} movimentos por {v} nós.',
    },
    'label.moves': {
      en: 'moves {n}',
      ko: '옮김 {n} 회',
      ja: '移動 {n} 回',
      zh: '移动 {n} 次',
      ar: 'حركات {n}',
      es: 'movimientos {n}',
      fr: 'déplacements {n}',
      hi: 'चालें {n}',
      id: 'langkah {n}',
      pt: 'movimentos {n}',
    },
    'label.target': {
      en: 'want this one',
      ko: '찾을 것',
      ja: '探すもの',
      zh: '要找的就是它',
      ar: 'هذه هي المطلوبة',
      es: 'este es el buscado',
      fr: "c'est celui-ci",
      hi: 'यही चाहिए',
      id: 'yang dicari',
      pt: 'é este',
    },
  },
};
