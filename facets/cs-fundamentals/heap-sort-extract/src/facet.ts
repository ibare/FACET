/**
 * HeapSortExtract facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "정렬된 결과를 담을 자리를 따로 빌려야 하는가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 · 한 걸음) / 제목 없음 / 한 주장 /
 * 메트릭 없음 / layout 선언 없음 / 캔버스 폭은 러너가 정한다.
 *
 * 데이터는 이미 최대 힙인 [9, 7, 8, 3, 4] 하나뿐이다. 꺼내는 순서도, 새 꼭대기도,
 * 끝난 줄도 알고리즘이 이 배열에서 셈한다 — 화면에 박아 둔 값이 없다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const heapSortExtractFacet: FacetJson = {
  id: 'facet:heapSortExtract',
  title: {
    en: 'Heap Extract',
    ko: '힙 추출',
    ja: 'ヒープの取り出し',
    zh: '堆的取出',
    ar: 'الاستخراج من الكومة',
    es: 'Extracción del heap',
    fr: 'Extraction du tas',
    hi: 'हीप से निकालना',
    id: 'Pengambilan dari heap',
    pt: 'Extração do heap',
  },
  description: {
    en: 'Taking the top out frees the last slot of the heap, and that is where the result goes',
    ko: '꼭대기를 꺼내면 힙의 마지막 칸이 비고, 결과는 바로 그 칸에 앉는다',
    ja: '頂点を取り出すとヒープの最後のマスが空き、結果はまさにそこに収まる',
    zh: '取走顶端后堆的最后一格空出来，结果就落在那一格',
    ar: 'إخراج القمة يفرّغ آخر خانة في الكومة، وهناك بالضبط تستقر النتيجة',
    es: 'Sacar la cima libera la última casilla del heap, y ahí es donde va el resultado',
    fr: "Retirer le sommet libère la dernière case du tas, et c'est là que va le résultat",
    hi: 'शीर्ष निकालते ही हीप की आख़िरी खाना खाली हो जाती है, और नतीजा वहीं बैठता है',
    id: 'Mengambil puncaknya mengosongkan slot terakhir heap, dan di situlah hasilnya duduk',
    pt: 'Tirar o topo libera a última casa do heap, e é exatamente aí que o resultado fica',
  },
  algorithm: 'module:heapSortExtract',
  projector: 'module:heapSortExtractProjector',
  initialData: {
    type: 'heap-sort-extract',
    // 이미 최대 힙이다: 9 위에 7·8, 7 아래에 3·4.
    values: [9, 7, 8, 3, 4],
    // 걸음 하나는 여기에 stage 의 이동 애니메이션이 더해진다 (S-piece).
    stepMs: 750,
  },
  shuffleOnReset: false,
  messages: {
    'caption.heap': {
      en: 'A max heap laid out in one row — the biggest value sits on top.',
      ko: '한 줄에 늘어놓은 최대 힙 — 가장 큰 값이 꼭대기에 있다.',
      ja: '一列に並べた最大ヒープ — いちばん大きな値が頂点にある。',
      zh: '排成一行的最大堆 — 最大的值在顶端。',
      ar: 'كومة عظمى مصفوفة في صف واحد — أكبر قيمة في القمة.',
      es: 'Un max heap dispuesto en una fila: el valor mayor está en la cima.',
      fr: 'Un tas max aligné sur une rangée — la plus grande valeur est au sommet.',
      hi: 'एक पंक्ति में सजा मैक्स हीप — सबसे बड़ा मान शीर्ष पर है।',
      id: 'Max heap yang dijajarkan dalam satu baris — nilai terbesar ada di puncak.',
      pt: 'Um max heap disposto numa só linha — o maior valor fica no topo.',
    },
    'caption.take': {
      en: 'Take out the top — {value}.',
      ko: '꼭대기를 꺼낸다 — {value}.',
      ja: '頂点を取り出す — {value}。',
      zh: '取出顶端 — {value}。',
      ar: 'نخرج القمة — {value}.',
      es: 'Saca la cima: {value}.',
      fr: 'On retire le sommet — {value}.',
      hi: 'शीर्ष निकालें — {value}।',
      id: 'Ambil puncaknya — {value}.',
      pt: 'Tire o topo — {value}.',
    },
    'caption.place': {
      en: 'The heap hands back its last slot, and that is exactly where {value} sits down.',
      ko: '힙이 마지막 칸을 내놓고, 꺼낸 {value} 가 바로 그 칸에 앉는다.',
      ja: 'ヒープが最後のマスを手放し、取り出した {value} がちょうどそこに座る。',
      zh: '堆交还最后一格，取出的 {value} 正好坐在那里。',
      ar: 'تتخلّى الكومة عن آخر خانة، وفيها بالضبط يجلس {value}.',
      es: 'El heap devuelve su última casilla, y justo ahí se sienta {value}.',
      fr: "Le tas rend sa dernière case, et c'est exactement là que {value} s'assoit.",
      hi: 'हीप अपनी आख़िरी खाना छोड़ देता है, और ठीक वहीं {value} बैठ जाता है।',
      id: 'Heap menyerahkan slot terakhirnya, dan persis di situlah {value} duduk.',
      pt: 'O heap devolve sua última casa, e é exatamente aí que {value} se senta.',
    },
    'caption.done': {
      en: 'Sorted inside the same row — not one extra slot was borrowed.',
      ko: '같은 줄 안에서 정렬이 끝났다 — 자리를 하나도 빌리지 않았다.',
      ja: '同じ列の中で並べ替えが終わった — マスを一つも借りていない。',
      zh: '就在同一行里排好了 — 一格额外空间也没借。',
      ar: 'تم الترتيب داخل الصف نفسه — دون استعارة خانة واحدة إضافية.',
      es: 'Ordenado dentro de la misma fila: no se pidió prestada ni una casilla extra.',
      fr: 'Trié dans la même rangée — pas une case supplémentaire empruntée.',
      hi: 'उसी पंक्ति के भीतर क्रम बन गया — एक भी अतिरिक्त खाना उधार नहीं ली।',
      id: 'Terurut di dalam baris yang sama — tanpa meminjam satu slot pun.',
      pt: 'Ordenado dentro da mesma linha — sem tomar emprestada nenhuma casa extra.',
    },
    'label.heap': {
      en: 'heap',
      ko: '힙',
      ja: 'ヒープ',
      zh: '堆',
      ar: 'كومة',
      es: 'heap',
      fr: 'tas',
      hi: 'हीप',
      id: 'heap',
      pt: 'heap',
    },
    'label.done': {
      en: 'sorted',
      ko: '정렬 끝',
      ja: '整列済み',
      zh: '已排好',
      ar: 'مرتَّب',
      es: 'ordenado',
      fr: 'trié',
      hi: 'क्रमित',
      id: 'terurut',
      pt: 'ordenado',
    },
  },
  blocks: {
    stage: { type: 'heap-sort-extract-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
