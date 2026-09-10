/**
 * parent-two-children — 이진 트리 조각(piece) 선언.
 *
 * @piece 한 자리에서 아래로 최대 둘이 뻗고, 그 둘은 이름이 달라 자리를 바꿀 수
 * 없다. 자식이 하나뿐이어도 그것이 왼쪽인지 오른쪽인지가 정해져 있다는 것 —
 * 이 한 가지만 말하고 멈춘다.
 *
 * 제목 블록도 메트릭도 두지 않는다. 제목은 글의 문단이 주고, 조각은 셀 것이
 * 없다 (S-piece). layout 은 stage 와 controls 뿐이라 러너에 맡긴다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const parentTwoChildrenFacet: FacetJson = {
  id: 'facet:parentTwoChildren',
  title: {
    en: 'One seat, two branches',
    ko: '한 자리에서 둘로',
    ja: '一つの席から、二つの枝',
    zh: '一个位置，两条分枝',
    ar: 'مقعد واحد، فرعان',
    es: 'Un asiento, dos ramas',
    fr: 'Une place, deux branches',
    hi: 'एक स्थान, दो शाखाएँ',
    id: 'Satu kursi, dua cabang',
    pt: 'Um lugar, dois ramos',
  },
  description: {
    en: 'A node reaches down to at most two children, and left and right are named seats that cannot be swapped.',
    ko: '한 자리에서 아래로 최대 둘이 뻗는다. 왼쪽과 오른쪽은 이름이 다른 자리라 바꿀 수 없다.',
    ja: '一つの節点から下へ伸びるのは多くて二つ。左と右は名の違う席で、入れ替えられない。',
    zh: '一个结点向下最多伸出两个孩子，左和右是不同名的位置，不能对调。',
    ar: 'تمتد العقدة نزولًا إلى ابنين على الأكثر، واليسار واليمين مقعدان مسمّيان لا يتبادلان.',
    es: 'Un nodo desciende hacia dos hijos como mucho, e izquierda y derecha son asientos con nombre que no se intercambian.',
    fr: "Un nœud descend vers deux enfants au plus, et gauche et droite sont des places nommées qu'on ne peut échanger.",
    hi: 'एक नोड नीचे अधिकतम दो संतानों तक जाता है, और बायाँ-दायाँ नाम वाले स्थान हैं जिन्हें बदला नहीं जा सकता।',
    id: 'Sebuah simpul menjulur ke bawah paling banyak ke dua anak, dan kiri serta kanan adalah kursi bernama yang tak bisa ditukar.',
    pt: 'Um nó desce para dois filhos no máximo, e esquerda e direita são lugares com nome que não se trocam.',
  },
  algorithm: 'module:parentTwoChildren',
  projector: 'module:parentTwoChildrenProjector',
  initialData: {
    type: 'binary-tree',
    root: 'A',
    // 가지 다섯 · 잎 셋 · 높이 둘 (뿌리를 0 으로 셈). C 는 오른쪽 자식만 갖는다 —
    // 자식이 하나여도 어느 쪽인지가 정해진다는 것을 보이는 자리다.
    nodes: [
      { id: 'A', left: 'B', right: 'C' },
      { id: 'B', left: 'D', right: 'E' },
      { id: 'C', left: null, right: 'F' },
      { id: 'D', left: null, right: null },
      { id: 'E', left: null, right: null },
      { id: 'F', left: null, right: null },
    ],
    stepMs: 640,
  },
  blocks: {
    stage: { type: 'parent-two-children-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.seat': {
      en: 'It starts with one seat.',
      ko: '자리 하나에서 시작한다.',
      ja: '席一つから始まる。',
      zh: '从一个位置开始。',
      ar: 'يبدأ الأمر بمقعد واحد.',
      es: 'Empieza con un solo asiento.',
      fr: "Tout part d'une seule place.",
      hi: 'शुरुआत एक स्थान से होती है।',
      id: 'Bermula dari satu kursi.',
      pt: 'Começa com um só lugar.',
    },
    'caption.splitRoot': {
      en: 'One seat, two branches reaching down — a left and a right.',
      ko: '한 자리에서 아래로 둘이 뻗는다. 왼쪽과 오른쪽이다.',
      ja: '一つの席から下へ二つ伸びる。左と右だ。',
      zh: '一个位置向下伸出两枝 — 一左一右。',
      ar: 'مقعد واحد وفرعان يمتدّان نزولًا — يسار ويمين.',
      es: 'Un asiento y dos ramas hacia abajo: una izquierda y una derecha.',
      fr: 'Une place, deux branches vers le bas — une gauche et une droite.',
      hi: 'एक स्थान से नीचे दो शाखाएँ — एक बाईं, एक दाईं।',
      id: 'Satu kursi, dua cabang menjulur ke bawah — kiri dan kanan.',
      pt: 'Um lugar, dois ramos para baixo — um esquerdo e um direito.',
    },
    'caption.splitAgain': {
      en: 'Each new seat splits the same way: at most two, downward.',
      ko: '새로 생긴 자리도 같은 방식으로 갈라진다. 아래로 최대 둘.',
      ja: '新しくできた席も同じように分かれる。下へ多くて二つ。',
      zh: '新出现的位置也照样分开：向下最多两个。',
      ar: 'كل مقعد جديد ينقسم بالطريقة نفسها: اثنان على الأكثر، نزولًا.',
      es: 'Cada asiento nuevo se divide igual: como mucho dos, hacia abajo.',
      fr: 'Chaque nouvelle place se divise pareil : deux au plus, vers le bas.',
      hi: 'हर नया स्थान उसी तरह बँटता है: नीचे अधिकतम दो।',
      id: 'Tiap kursi baru terbelah dengan cara sama: paling banyak dua, ke bawah.',
      pt: 'Cada lugar novo divide-se do mesmo modo: no máximo dois, para baixo.',
    },
    'caption.splitOne': {
      en: 'Even a single child has a side. The other seat opens and stays empty.',
      ko: '자식이 하나여도 어느 쪽인지가 정해진다. 남은 한 자리는 빈 채로 열린다.',
      ja: '子が一つでも、どちら側かは決まっている。もう一方の席は空いたまま開く。',
      zh: '就算只有一个孩子，也定了是哪一边。另一个位置开着，空着。',
      ar: 'حتى الابن الواحد له جهة. والمقعد الآخر يُفتح ويبقى فارغًا.',
      es: 'Aun con un solo hijo, hay un lado. El otro asiento se abre y queda vacío.',
      fr: "Même un enfant unique a un côté. L'autre place s'ouvre et reste vide.",
      hi: 'एक ही संतान हो तब भी उसका पक्ष तय है। दूसरा स्थान खुलता है और खाली रहता है।',
      id: 'Anak tunggal pun punya sisi. Kursi satunya terbuka dan tetap kosong.',
      pt: 'Mesmo um filho único tem um lado. O outro lugar abre-se e fica vazio.',
    },
    'caption.sidesFixed': {
      en: 'Left and right are different names — they cannot trade places.',
      ko: '왼쪽과 오른쪽은 이름이 다르다. 서로 자리를 바꿀 수 없다.',
      ja: '左と右は名が違う。互いに席を替えられない。',
      zh: '左和右是不同的名字 — 它们不能互换。',
      ar: 'اليسار واليمين اسمان مختلفان — لا يتبادلان المكان.',
      es: 'Izquierda y derecha son nombres distintos: no pueden cambiarse de sitio.',
      fr: 'Gauche et droite sont deux noms différents — elles ne peuvent pas échanger.',
      hi: 'बायाँ और दायाँ अलग नाम हैं — ये जगह नहीं बदल सकते।',
      id: 'Kiri dan kanan adalah nama yang berbeda — keduanya tak bisa bertukar tempat.',
      pt: 'Esquerda e direita são nomes diferentes — não podem trocar de lugar.',
    },
  },
};
