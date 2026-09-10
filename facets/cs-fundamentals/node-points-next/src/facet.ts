/**
 * @piece 조각(piece) facet — 질문 하나에 답하고 멈춘다 (S-piece).
 *
 * 질문: 메모리에 흩어져 있는 노드들에 어떻게 순서가 생기는가?
 * 답:   노드가 값 옆에 다음 노드의 주소를 함께 쥐고 있고, 그 주소가 가리킨다.
 *
 * 제목 블록도 메트릭도 두지 않는다 — 제목은 글의 문단이 주고, 조각은 셀 것이
 * 없다. 컨트롤은 다시 보기와 한 걸음 둘뿐이며 둘 다 눌러야 완성되는 조작이
 * 아니다. 알고리즘은 reactive 로 등록되어 mount 시 스스로 재생한다
 * (index.ts 의 registerAlgorithm 옵션).
 */

import { CONTROL } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const nodePointsNextFacet: FacetJson = {
  id: 'facet:nodePointsNext',
  title: {
    en: 'A node points to the next',
    ko: '노드가 다음을 가리킨다',
    ja: 'ノードが次を指す',
    zh: '节点指向下一个',
    ar: 'العقدة تشير إلى التالية',
    es: 'Un nodo apunta al siguiente',
    fr: 'Un nœud pointe vers le suivant',
    hi: 'एक नोड अगले की ओर इशारा करता है',
    id: 'Sebuah simpul menunjuk ke berikutnya',
    pt: 'Um nó aponta para o próximo',
  },
  description: {
    en: 'Nodes lie scattered in memory, yet they have an order — the address each node holds beside its value.',
    ko: '노드는 메모리에 흩어져 있지만 순서가 있다. 그 순서를 만드는 것은 노드가 값 옆에 쥐고 있는 주소다.',
    ja: 'ノードはメモリに散らばっているのに順序がある — その順序を作るのは、値の横に持っているアドレスだ。',
    zh: '节点散落在内存各处，却有顺序 — 顺序来自每个节点在值旁边握着的那个地址。',
    ar: 'العقد متناثرة في الذاكرة ومع ذلك لها ترتيب — العنوان الذي تحمله كل عقدة إلى جوار قيمتها.',
    es: 'Los nodos están dispersos en memoria y aun así tienen un orden: la dirección que cada nodo guarda junto a su valor.',
    fr: "Les nœuds sont éparpillés en mémoire et pourtant ils ont un ordre — l'adresse que chacun garde à côté de sa valeur.",
    hi: 'नोड मेमोरी में बिखरे पड़े हैं, फिर भी उनका एक क्रम है — वह पता जो हर नोड अपने मान के बगल में रखता है।',
    id: 'Simpul-simpul tersebar di memori, namun punya urutan — alamat yang dipegang tiap simpul di samping nilainya.',
    pt: 'Os nós estão espalhados na memória e ainda assim têm uma ordem — o endereço que cada nó guarda ao lado do seu valor.',
  },
  algorithm: 'module:nodePointsNext',
  projector: 'module:nodePointsNextProjector',
  initialData: {
    type: 'node-points-next',
    /** 걸음 간격. 한 걸음마다 읽을 시간을 준다. */
    stepMs: 760,
    head: '0x0100',
    /** 노드 하나의 크기. int32 값 4바이트 + 주소 4바이트. */
    nodeBytes: 8,
    valueBytes: 4,
    addressBytes: 4,
    /** 논리 순서 (head 부터) 로 적었다. 메모리 순서는 0x0100 · 0x0180 · 0x0240 다. */
    nodes: [
      { addr: '0x0100', value: 12, next: '0x0240' },
      { addr: '0x0240', value: 5, next: '0x0180' },
      { addr: '0x0180', value: 8, next: null },
    ],
  },
  blocks: {
    stage: { type: 'node-points-next-stage' },
    controls: { type: 'control-bar', controls: [CONTROL.replay, CONTROL.advance] },
  },
  messages: {
    'caption.scattered': {
      en: 'Three nodes lie apart in memory. Their places say nothing about which comes first.',
      ko: '세 노드는 메모리에서 떨어져 있다. 놓인 자리만 봐서는 무엇이 먼저인지 알 수 없다.',
      ja: '三つのノードはメモリ上で離れている。置かれた場所からは、どれが先かわからない。',
      zh: '三个节点在内存里彼此分开。看它们所在的位置，看不出谁在前。',
      ar: 'ثلاث عقد متباعدة في الذاكرة. مواضعها لا تقول شيئًا عن أيّها أوّل.',
      es: 'Tres nodos separados en memoria. Sus posiciones no dicen cuál va primero.',
      fr: "Trois nœuds séparés en mémoire. Leur emplacement ne dit pas lequel vient d'abord.",
      hi: 'तीन नोड मेमोरी में अलग-अलग पड़े हैं। उनकी जगहें यह नहीं बतातीं कि पहले कौन आता है।',
      id: 'Tiga simpul terpisah di memori. Letaknya tidak memberi tahu mana yang lebih dulu.',
      pt: 'Três nós separados na memória. Onde estão não diz qual vem primeiro.',
    },
    'caption.holdsAddress': {
      en: 'Beside its value every node holds one more thing — the address of the next node.',
      ko: '노드는 값 옆에 하나를 더 쥐고 있다 — 다음 노드의 주소다.',
      ja: 'ノードは値の横にもう一つ持っている — 次のノードのアドレスだ。',
      zh: '每个节点在值旁边还握着一样东西 — 下一个节点的地址。',
      ar: 'إلى جوار قيمتها تحمل كل عقدة شيئًا آخر — عنوان العقدة التالية.',
      es: 'Junto a su valor, cada nodo guarda una cosa más: la dirección del nodo siguiente.',
      fr: "À côté de sa valeur, chaque nœud garde une chose de plus — l'adresse du nœud suivant.",
      hi: 'हर नोड अपने मान के बगल में एक चीज़ और रखता है — अगले नोड का पता।',
      id: 'Di samping nilainya, tiap simpul memegang satu hal lagi — alamat simpul berikutnya.',
      pt: 'Ao lado do seu valor, cada nó guarda mais uma coisa — o endereço do nó seguinte.',
    },
    'caption.orderExists': {
      en: 'Follow the held addresses and an order appears: 12, 5, 8 — not the order they lie in.',
      ko: '쥔 주소를 따라가면 순서가 드러난다 — 12, 5, 8. 메모리에 놓인 차례가 아니다.',
      ja: '持っているアドレスをたどると順序が現れる — 12, 5, 8。メモリに置かれた並びではない。',
      zh: '顺着握着的地址走，顺序就出现了：12, 5, 8 — 不是它们在内存里排列的次序。',
      ar: 'اتبع العناوين المحمولة فيظهر الترتيب: 12 و5 و8 — لا ترتيب مواضعها.',
      es: 'Sigue las direcciones guardadas y aparece un orden: 12, 5, 8; no el orden en que están colocados.',
      fr: "Suivez les adresses gardées et un ordre apparaît : 12, 5, 8 — pas celui de leur emplacement.",
      hi: 'रखे हुए पतों का पीछा करें और क्रम सामने आता है: 12, 5, 8 — वह नहीं जिसमें वे पड़े हैं।',
      id: 'Ikuti alamat yang dipegang, urutannya muncul: 12, 5, 8 — bukan urutan letaknya.',
      pt: 'Siga os endereços guardados e uma ordem aparece: 12, 5, 8 — não a ordem em que estão dispostos.',
    },
    'label.order': {
      en: 'order',
      ko: '순서',
      ja: '順序',
      zh: '顺序',
      ar: 'الترتيب',
      es: 'orden',
      fr: 'ordre',
      hi: 'क्रम',
      id: 'urutan',
      pt: 'ordem',
    },
  },
};
