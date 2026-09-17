/**
 * union-by-rank — FacetJson 선언. 로직 없음, 선언만 (S-facet).
 *
 * 랭크 기반 합집합의 "고르기" 질문 하나에 답한다: 두 무리를 합칠 때 어느 쪽 뿌리를
 * 아래로 넣을지 고르면 나무가 길어지지 않는다는 것.
 *
 * 화면은 **장면**에서 만들어진다 (`scene.ts`) — projector 가 stage 메서드를 부르는
 * 대신, 이벤트가 장면이 되고 `render` 가 그 장면의 화면을 통째로 세운다. 그래서 띠를
 * 끌어 어느 걸음으로 가도 같은 화면이 선다 (S-scene).
 *
 * 캡션에 뜨는 랭크는 여기 선언에 없고 장면이 숲에서 센다 — 배지의 수와 같은 함수를
 * 지나야 두 항이 갈리지 않는다. 그래서 인자는 자리 번호뿐이다.
 *
 * @piece
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const unionByRankFacet: FacetJson = {
  id: 'facet:unionByRank',
  title: {
    en: 'Union by Rank',
    ko: '랭크 기반 합집합',
    ja: 'ランクによる併合',
    zh: '按秩合并',
    ar: 'الدمج حسب الرتبة',
    es: 'Unión por rango',
    fr: 'Union par rang',
    hi: 'रैंक से यूनियन',
    id: 'Union berdasarkan rank',
    pt: 'União por rank',
  },
  description: {
    en: 'Put the shorter tree under the taller one and the height holds; only a tie makes it grow.',
    ko: '낮은 쪽을 높은 쪽 밑에 넣으면 키가 그대로다. 둘이 같을 때만 하나 는다.',
    ja: '低い方を高い方の下に入れれば高さは変わらない。同じときだけ一つ伸びる。',
    zh: '把矮的接到高的下面，高度不变；只有一样高时才会长一层。',
    ar: 'ضع الشجرة الأقصر تحت الأطول فيبقى الارتفاع كما هو؛ ولا يزيد إلا عند التساوي.',
    es: 'Cuelga el árbol más bajo del más alto y la altura no cambia; solo crece en un empate.',
    fr: "Place l'arbre le plus court sous le plus haut et la hauteur tient ; elle ne croît qu'à égalité.",
    hi: 'छोटे पेड़ को बड़े के नीचे जोड़ें तो ऊँचाई वही रहती है; बराबरी पर ही एक बढ़ती है।',
    id: 'Taruh pohon yang lebih pendek di bawah yang lebih tinggi, tingginya tetap; hanya seri yang menambahnya.',
    pt: 'Ponha a árvore mais baixa sob a mais alta e a altura se mantém; só um empate a faz crescer.',
  },
  algorithm: 'module:unionByRank',
  scene: 'module:unionByRankScene',
  initialData: {
    type: 'unionByRank',
    n: 5,
    unions: [
      [0, 1],
      [2, 3],
      [0, 2],
      [4, 0],
    ],
    stepMs: 720,
  },
  blocks: {
    stage: { type: 'union-by-rank-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.pieceScrub,
    },
  },
  messages: {
    'caption.compare': {
      en: 'Compare rank: node {a} (rank {rankA}) vs node {b} (rank {rankB})',
      ko: '랭크를 견준다: {a}번(랭크 {rankA}) 대 {b}번(랭크 {rankB})',
      ja: 'ランクを比べる: ノード {a}（ランク {rankA}）対 ノード {b}（ランク {rankB}）',
      zh: '比较秩：节点 {a}（秩 {rankA}）对 节点 {b}（秩 {rankB}）',
      ar: 'نقارن الرتبة: العقدة {a} (رتبة {rankA}) مقابل العقدة {b} (رتبة {rankB})',
      es: 'Compara el rango: nodo {a} (rango {rankA}) frente al nodo {b} (rango {rankB})',
      fr: 'On compare les rangs : nœud {a} (rang {rankA}) contre nœud {b} (rang {rankB})',
      hi: 'रैंक की तुलना: नोड {a} (रैंक {rankA}) बनाम नोड {b} (रैंक {rankB})',
      id: 'Bandingkan rank: simpul {a} (rank {rankA}) lawan simpul {b} (rank {rankB})',
      pt: 'Compare o rank: nó {a} (rank {rankA}) contra o nó {b} (rank {rankB})',
    },
    'caption.attachDiffer': {
      en: 'Ranks differ — node {loser} goes under the taller node {winner}. The height stays the same.',
      ko: '랭크가 다르다 — 낮은 {loser}번을 높은 {winner}번 밑에 넣는다. 키는 그대로다.',
      ja: 'ランクが違う — 低いノード {loser} を高いノード {winner} の下に入れる。高さはそのまま。',
      zh: '秩不同 — 把较矮的节点 {loser} 接到较高的节点 {winner} 下面。高度不变。',
      ar: 'الرتبتان مختلفتان — تدخل العقدة {loser} تحت العقدة الأطول {winner}. يبقى الارتفاع كما هو.',
      es: 'Los rangos difieren: el nodo {loser} cuelga del nodo más alto {winner}. La altura no cambia.',
      fr: 'Les rangs diffèrent — le nœud {loser} passe sous le nœud plus haut {winner}. La hauteur ne bouge pas.',
      hi: 'रैंक अलग हैं — नोड {loser} ऊँचे नोड {winner} के नीचे जाता है। ऊँचाई वही रहती है।',
      id: 'Rank berbeda — simpul {loser} masuk di bawah simpul yang lebih tinggi {winner}. Tingginya tetap.',
      pt: 'Os ranks diferem — o nó {loser} vai sob o nó mais alto {winner}. A altura se mantém.',
    },
    'caption.attachTie': {
      en: 'Ranks tie — node {loser} goes under node {winner}. Height must grow by one.',
      ko: '랭크가 같다 — {loser}번을 {winner}번 밑에 넣는다. 키가 하나 는다.',
      ja: 'ランクが同じ — ノード {loser} をノード {winner} の下に入れる。高さが一つ伸びる。',
      zh: '秩相同 — 把节点 {loser} 接到节点 {winner} 下面。高度必然长一层。',
      ar: 'الرتبتان متساويتان — العقدة {loser} تدخل تحت العقدة {winner}. لا بد أن يزيد الارتفاع واحدًا.',
      es: 'Los rangos empatan: el nodo {loser} cuelga del nodo {winner}. La altura tiene que crecer en uno.',
      fr: 'Les rangs sont égaux — le nœud {loser} passe sous le nœud {winner}. La hauteur doit croître de un.',
      hi: 'रैंक बराबर हैं — नोड {loser} नोड {winner} के नीचे जाता है। ऊँचाई एक बढ़नी ही है।',
      id: 'Rank seri — simpul {loser} masuk di bawah simpul {winner}. Tingginya mesti bertambah satu.',
      pt: 'Os ranks empatam — o nó {loser} vai sob o nó {winner}. A altura precisa crescer um.',
    },
    'caption.grow': {
      en: "Node {root}'s rank rises by one — now {rank}.",
      ko: '{root}번의 랭크가 하나 오른다 — 이제 {rank}.',
      ja: 'ノード {root} のランクが一つ上がる — いまは {rank}。',
      zh: '节点 {root} 的秩长了一层 — 现在是 {rank}。',
      ar: 'ترتفع رتبة العقدة {root} واحدًا — الآن {rank}.',
      es: 'El rango del nodo {root} sube en uno: ahora es {rank}.',
      fr: 'Le rang du nœud {root} monte de un — il vaut maintenant {rank}.',
      hi: 'नोड {root} की रैंक एक बढ़ती है — अब {rank}।',
      id: 'Rank simpul {root} naik satu — sekarang {rank}.',
      pt: 'O rank do nó {root} sobe em um — agora é {rank}.',
    },
    'caption.rewind': {
      en: 'Replaying from the start.',
      ko: '처음부터 다시 본다.',
      ja: '最初から見直す。',
      zh: '从头重放。',
      ar: 'نعيد التشغيل من البداية.',
      es: 'Reproduciendo desde el principio.',
      fr: 'On rejoue depuis le début.',
      hi: 'शुरू से फिर से चला रहे हैं।',
      id: 'Diputar lagi dari awal.',
      pt: 'Repetindo desde o início.',
    },
    'caption.done': {
      en: 'All unions done.',
      ko: '합치기를 모두 마쳤다.',
      ja: '併合をすべて終えた。',
      zh: '所有合并都完成了。',
      ar: 'انتهت جميع عمليات الدمج.',
      es: 'Todas las uniones están hechas.',
      fr: 'Toutes les unions sont faites.',
      hi: 'सभी यूनियन पूरे हो गए।',
      id: 'Semua penggabungan selesai.',
      pt: 'Todas as uniões concluídas.',
    },
  },
};
