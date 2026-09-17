/**
 * @piece 위층에서 내려오기.
 *
 * 답하는 질문 하나: **층을 여러 겹 쌓으면 무엇이 달라지는가.**
 * 성긴 위층에서 크게 건너뛰어 자리를 잡고 그 자리를 아래층에 물려주면, 같은
 * 답에 닿는 데 본 점이 절반이다 (8 대 15).
 *
 * 1차 데이터는 점 열여섯의 정수 좌표 · 질의 좌표 · 층별 구성원 · 층별 이웃
 * 수뿐이다. 거리도 이웃 목록도 algorithm 이 셈하고, 본 점 수는 그 판정을 모아
 * 장면이 센다 — 화면에 켜진 점을 세면 캡션의 수가 나온다 (`scene.ts`).
 *
 * 화면을 명령이 아니라 **장면**으로 만든다 (`scene:`) — 어느 걸음의 화면이든 셈으로
 * 얻으므로 띠로 임의의 자리에 갈 수 있다 (S-scene).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const coarseThenFineFacet: FacetJson = {
  id: 'facet:coarseThenFine',
  title: {
    en: 'Coarse first, then fine',
    ko: '성긴 층에서 크게, 아래층에서 촘촘히',
    ja: '粗い層で大きく、下の層で細かく',
    zh: '先在稀疏层大步走，再到下层细找',
    ar: 'الخشن أولًا ثم الدقيق',
    es: 'Primero grueso, luego fino',
    fr: "D'abord grossier, ensuite fin",
    hi: 'पहले मोटे स्तर पर, फिर बारीक',
    id: 'Kasar dulu, lalu halus',
    pt: 'Primeiro grosso, depois fino',
  },
  description: {
    en: 'A sparse top layer settles the spot with long jumps; each layer below inherits that spot and narrows it down.',
    ko: '점이 몇 개뿐인 위층에서 크게 건너뛰어 자리를 잡고, 아래층이 그 자리를 물려받아 더 촘촘히 좁힌다.',
    ja: '点の少ない上の層で大きく跳んで場所を決め、下の層がその場所を受け継いでさらに細かく絞る。',
    zh: '在点很少的顶层用大步跳跃定下位置，下面的层继承这个位置并进一步收窄。',
    ar: 'طبقة عليا قليلة النقاط تحدد الموضع بقفزات كبيرة، وكل طبقة أدنى ترث ذلك الموضع وتضيّقه أكثر.',
    es: 'Una capa superior escasa fija el sitio con saltos largos; cada capa inferior hereda ese sitio y lo afina.',
    fr: "Une couche supérieure clairsemée fixe la position par grands sauts ; chaque couche inférieure hérite de cette position et l'affine.",
    hi: 'विरल ऊपरी परत लंबी छलांगों से जगह तय करती है; नीचे की हर परत उसी जगह को पाकर उसे और बारीक करती है।',
    id: 'Lapisan atas yang jarang menetapkan posisi lewat lompatan panjang; tiap lapisan di bawahnya mewarisi posisi itu dan mempersempitnya.',
    pt: 'Uma camada superior esparsa fixa a posição com saltos longos; cada camada abaixo herda essa posição e a refina.',
  },
  algorithm: 'module:coarseThenFine',
  scene: 'module:coarseThenFineScene',
  initialData: {
    type: 'coarse-then-fine',
    points: [
      { id: 'n0', x: 1, y: 2 },
      { id: 'n1', x: 3, y: 1 },
      { id: 'n2', x: 2, y: 5 },
      { id: 'n3', x: 5, y: 3 },
      { id: 'n4', x: 4, y: 6 },
      { id: 'n5', x: 7, y: 2 },
      { id: 'n6', x: 6, y: 5 },
      { id: 'n7', x: 8, y: 6 },
      { id: 'n8', x: 9, y: 3 },
      { id: 'n9', x: 10, y: 7 },
      { id: 'n10', x: 2, y: 9 },
      { id: 'n11', x: 5, y: 9 },
      { id: 'n12', x: 7, y: 9 },
      { id: 'n13', x: 9, y: 10 },
      { id: 'n14', x: 11, y: 5 },
      { id: 'n15', x: 11, y: 9 },
    ],
    query: { x: 10, y: 8 },
    layers: [
      { id: 'L2', members: ['n0', 'n5', 'n10', 'n15'], degree: 2 },
      { id: 'L1', members: ['n0', 'n3', 'n5', 'n7', 'n9', 'n10', 'n13', 'n15'], degree: 3 },
      {
        id: 'L0',
        members: [
          'n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7',
          'n8', 'n9', 'n10', 'n11', 'n12', 'n13', 'n14', 'n15',
        ],
        degree: 4,
      },
    ],
    stepMs: 850,
  },
  blocks: {
    stage: { type: 'coarse-then-fine-stage' },
    controls: {
      type: 'control-bar',
      // 장면 방식이라 띠(timeline)를 단다 — 어느 걸음의 화면이든 계산으로 얻으므로
      // 임의의 자리로 끌 수 있다 (S-piece 의 조작 표). 다시 보기의 action 은
      // reset 인데, ReactiveMechanism 의 reset() 이 끝에 ensureStarted() 를 부르므로
      // reset 이 곧 다시 재생이다.
      controls: CONTROL_SET.pieceScrub,
    },
  },
  messages: {
    'caption.enter': {
      en: 'The top layer holds only a few points. The cross is the target; start at {node}.',
      ko: '위층에는 점이 몇 개뿐이다. 십자가 찾는 자리, 출발은 {node}.',
      ja: '上の層には点がわずかしかない。十字が探す場所、出発は {node}。',
      zh: '顶层只有少数几个点。十字是目标，从 {node} 出发。',
      ar: 'الطبقة العليا تضم نقاطًا قليلة فقط. الصليب هو الهدف؛ ابدأ من {node}.',
      es: 'La capa superior tiene solo unos pocos puntos. La cruz es el objetivo; empieza en {node}.',
      fr: 'La couche du haut ne contient que quelques points. La croix est la cible ; on part de {node}.',
      hi: 'ऊपरी परत में कुछ ही बिंदु हैं। क्रॉस लक्ष्य है; शुरुआत {node} से।',
      id: 'Lapisan teratas hanya punya sedikit titik. Tanda silang adalah targetnya; mulai dari {node}.',
      pt: 'A camada superior tem apenas alguns pontos. A cruz é o alvo; comece em {node}.',
    },
    'caption.hop': {
      en: 'A neighbor sits nearer the cross. Move {from} to {to}.',
      ko: '이웃 가운데 십자에 더 가까운 곳이 있다. 옮긴다: {from} → {to}.',
      ja: '隣の中に十字へより近い場所がある。{from} から {to} へ。',
      zh: '邻居中有更靠近十字的点。从 {from} 移到 {to}。',
      ar: 'أحد الجيران أقرب إلى الصليب. انتقل من {from} إلى {to}.',
      es: 'Un vecino está más cerca de la cruz. Muévete de {from} a {to}.',
      fr: 'Un voisin est plus proche de la croix. On passe de {from} à {to}.',
      hi: 'एक पड़ोसी क्रॉस के अधिक पास है। {from} से {to} पर जाएँ।',
      id: 'Ada tetangga yang lebih dekat ke tanda silang. Pindah dari {from} ke {to}.',
      pt: 'Um vizinho está mais perto da cruz. Vá de {from} para {to}.',
    },
    'caption.handDown': {
      en: 'No neighbor here is nearer. Hand the spot down to {layer}. Seen so far: {n}.',
      ko: '여기서는 더 가까운 이웃이 없다. 이 자리를 {layer} 에 물려준다. 여기까지 본 점: {n}.',
      ja: 'ここには近い隣がない。この場所を {layer} に受け渡す。ここまで見た点: {n}。',
      zh: '这里没有更近的邻居。把这个位置交给 {layer}。已看过的点: {n}。',
      ar: 'لا يوجد جار أقرب هنا. سلّم الموضع إلى {layer}. النقاط المقيسة حتى الآن: {n}.',
      es: 'Aquí ningún vecino está más cerca. Pasa el sitio a {layer}. Puntos medidos: {n}.',
      fr: "Ici aucun voisin n'est plus proche. On transmet la position à {layer}. Points mesurés : {n}.",
      hi: 'यहाँ कोई पड़ोसी अधिक पास नहीं है। यह जगह {layer} को सौंप दें। अब तक मापे गए बिंदु: {n}।',
      id: 'Di sini tidak ada tetangga yang lebih dekat. Serahkan posisi ke {layer}. Titik terukur: {n}.',
      pt: 'Aqui nenhum vizinho está mais perto. Passe a posição para {layer}. Pontos medidos: {n}.',
    },
    'caption.stop': {
      en: 'The bottom layer has no nearer neighbor either. Seen so far: {n}.',
      ko: '맨 아래층에서도 더 가까운 이웃이 없다. 여기까지 본 점: {n}.',
      ja: '一番下の層でも近い隣がない。ここまで見た点: {n}。',
      zh: '最底层也没有更近的邻居。已看过的点: {n}。',
      ar: 'الطبقة السفلى أيضًا لا تحوي جارًا أقرب. النقاط المقيسة: {n}.',
      es: 'La capa inferior tampoco tiene un vecino más cerca. Puntos medidos: {n}.',
      fr: "La couche du bas n'a pas non plus de voisin plus proche. Points mesurés : {n}.",
      hi: 'सबसे निचली परत में भी कोई पड़ोसी अधिक पास नहीं है। मापे गए बिंदु: {n}।',
      id: 'Lapisan paling bawah pun tak punya tetangga yang lebih dekat. Titik terukur: {n}.',
      pt: 'A camada de baixo também não tem vizinho mais perto. Pontos medidos: {n}.',
    },
    'caption.found': {
      en: 'Nearest is {node}. Points measured: {n} of {total}.',
      ko: '가장 가까운 것은 {node}. 잰 점 {n} / 전수 {total}.',
      ja: '最も近いのは {node}。測った点 {n} / 全体 {total}。',
      zh: '最近的是 {node}。测量的点 {n} / 全部 {total}。',
      ar: 'الأقرب هو {node}. النقاط المقيسة {n} من {total}.',
      es: 'El más cercano es {node}. Puntos medidos {n} de {total}.',
      fr: 'Le plus proche est {node}. Points mesurés {n} sur {total}.',
      hi: 'सबसे पास {node} है। मापे गए बिंदु {n} / कुल {total}।',
      id: 'Yang terdekat adalah {node}. Titik terukur {n} dari {total}.',
      pt: 'O mais próximo é {node}. Pontos medidos {n} de {total}.',
    },
    'caption.flat': {
      en: 'One layer alone lands on the same {node}, measuring {n} of {total}.',
      ko: '한 층만 쓰면 같은 {node} 에 닿지만 잰 점 {n} / 전수 {total}.',
      ja: '一層だけでも同じ {node} に着くが、測った点は {n} / 全体 {total}。',
      zh: '只用一层也到达同一个 {node}，但测量的点是 {n} / 全部 {total}。',
      ar: 'طبقة واحدة وحدها تصل إلى {node} نفسه، لكنها تقيس {n} من {total}.',
      es: 'Una sola capa llega al mismo {node}, pero mide {n} de {total}.',
      fr: 'Une seule couche atteint le même {node}, mais elle mesure {n} sur {total}.',
      hi: 'केवल एक परत भी उसी {node} तक पहुँचती है, पर मापती है {n} / कुल {total}।',
      id: 'Satu lapisan saja juga sampai ke {node} yang sama, tetapi mengukur {n} dari {total}.',
      pt: 'Uma única camada chega ao mesmo {node}, mas mede {n} de {total}.',
    },
  },
};
