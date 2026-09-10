/**
 * @piece 최근접 이웃 투표 — 이름표 없는 새 점의 부류를 어떻게 정하는가.
 *
 * 가까운 순으로 다섯이 하나씩 불려 나와 자기 쪽에 표를 놓는다. 나머지는 아무
 * 말도 하지 못한다 — 멀다는 이유 하나로. 답은 표를 더 많이 받은 쪽이다.
 *
 * 선언에 두는 것은 구조뿐이다 — 점의 좌표와 이름표, 부를 수 k, 걸음 간격.
 * 거리 · 순위 · 표 수 · 승자는 algorithm 이 좌표에서 셈하고, 화면의 자리는
 * stage 가 캔버스에서 역산한다 (S-piece).
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const voteByNeighborsFacet: FacetJson = {
  id: 'facet:voteByNeighbors',
  title: {
    en: 'Vote by neighbors',
    ko: '최근접 이웃 투표',
    ja: '近い隣人の投票',
    zh: '近邻投票',
    ar: 'تصويت الجيران',
    es: 'Voto de los vecinos',
    fr: 'Vote des voisins',
    hi: 'पड़ोसियों का मतदान',
    id: 'Pemungutan suara tetangga',
    pt: 'Voto dos vizinhos',
  },
  description: {
    en: 'The five nearest neighbors are called out one by one and each drops a vote.',
    ko: '가까운 다섯이 하나씩 불려 나와 각자 자기 쪽에 표를 놓는다.',
    ja: '近い五つが一つずつ呼ばれ、それぞれ自分の側に票を入れる。',
    zh: '最近的五个被一个个叫出来，各自投下一票。',
    ar: 'يُنادى أقرب خمسة واحدًا تلو الآخر، ويضع كل منهم صوتًا.',
    es: 'Los cinco vecinos más cercanos son llamados uno a uno y cada uno deja un voto.',
    fr: 'Les cinq voisins les plus proches sont appelés un à un et chacun dépose une voix.',
    hi: 'सबसे नज़दीक के पाँच एक-एक कर बुलाए जाते हैं और हर कोई एक वोट डालता है।',
    id: 'Lima tetangga terdekat dipanggil satu per satu dan masing-masing menaruh satu suara.',
    pt: 'Os cinco vizinhos mais próximos são chamados um a um e cada um deixa um voto.',
  },
  algorithm: 'module:voteByNeighbors',
  projector: 'module:voteByNeighborsProjector',
  initialData: {
    type: 'vote-by-neighbors',
    query: { x: 4, y: 4 },
    points: [
      { x: 2.9, y: 4.2, label: 'A' },
      { x: 4.1, y: 2.55, label: 'A' },
      { x: 1.2, y: 1.4, label: 'A' },
      { x: 1.6, y: 6.6, label: 'A' },
      { x: 6.9, y: 6.8, label: 'A' },
      { x: 4.8, y: 4.3, label: 'B' },
      { x: 3.4, y: 3.2, label: 'B' },
      { x: 4.5, y: 5.2, label: 'B' },
      { x: 6.7, y: 1.3, label: 'B' },
    ],
    k: 5,
    stepMs: 850,
  },
  blocks: {
    stage: { type: 'vote-by-neighbors-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'label.seats': {
      en: 'Neighbors',
      ko: '이웃',
      ja: '隣人',
      zh: '邻居',
      ar: 'الجيران',
      es: 'Vecinos',
      fr: 'Voisins',
      hi: 'पड़ोसी',
      id: 'Tetangga',
      pt: 'Vizinhos',
    },
    'label.votes': {
      en: 'Ballot boxes',
      ko: '표 상자',
      ja: '投票箱',
      zh: '票箱',
      ar: 'صناديق الاقتراع',
      es: 'Urnas',
      fr: 'Urnes',
      hi: 'मतपेटियाँ',
      id: 'Kotak suara',
      pt: 'Urnas',
    },

    'caption.arrive': {
      en: 'A new point arrives with no label of its own.',
      ko: '이름표 없는 점 하나가 들어왔다.',
      ja: '名札のない点が一つやって来た。',
      zh: '来了一个没有标签的新点。',
      ar: 'وصلت نقطة جديدة بلا تسمية خاصة بها.',
      es: 'Llega un punto nuevo sin etiqueta propia.',
      fr: 'Un nouveau point arrive sans étiquette.',
      hi: 'बिना अपने लेबल वाला एक नया बिंदु आया।',
      id: 'Sebuah titik baru datang tanpa label sendiri.',
      pt: 'Chega um ponto novo sem rótulo próprio.',
    },
    'caption.ranked': {
      en: 'Every neighbor is measured and lined up, nearest first.',
      ko: '이웃까지의 거리를 재어 가까운 순으로 줄 세운다.',
      ja: '隣までの距離を測り、近い順に並べる。',
      zh: '量出到每个邻居的距离，按由近到远排好。',
      ar: 'تُقاس المسافة إلى كل جار ويُصفّون من الأقرب.',
      es: 'Se mide cada vecino y se ordenan del más cercano.',
      fr: 'On mesure chaque voisin et on les range du plus proche au plus loin.',
      hi: 'हर पड़ोसी की दूरी नापकर नज़दीक से क्रम में लगाया जाता है।',
      id: 'Jarak ke tiap tetangga diukur lalu dibariskan dari yang terdekat.',
      pt: 'Mede-se cada vizinho e alinham-se do mais próximo ao mais distante.',
    },
    'caption.call': {
      en: 'Neighbor #{rank} is called out and drops a vote into box {label}.',
      ko: '{rank}번째로 가까운 이웃이 불려 나와 {label} 상자에 표를 넣는다.',
      ja: '{rank} 番目に近い隣人が呼ばれ、{label} の箱に票を入れる。',
      zh: '第 {rank} 近的邻居被叫出来，把票投进 {label} 箱。',
      ar: 'يُنادى الجار رقم {rank} فيضع صوته في صندوق {label}.',
      es: 'Se llama al vecino n.º {rank} y deja un voto en la urna {label}.',
      fr: "Le voisin n° {rank} est appelé et dépose une voix dans l'urne {label}.",
      hi: '{rank}वाँ नज़दीकी पड़ोसी बुलाया जाता है और {label} पेटी में वोट डालता है।',
      id: 'Tetangga ke-{rank} dipanggil dan memasukkan suara ke kotak {label}.',
      pt: 'O vizinho n.º {rank} é chamado e deixa um voto na urna {label}.',
    },
    'caption.silenced': {
      en: 'The rest cast nothing — for being far, and nothing else.',
      ko: '남은 이웃은 표를 내지 못한다 — 멀다는 이유 하나로.',
      ja: '残りは票を出せない — 遠い、ただそれだけの理由で。',
      zh: '其余的一票也投不了 — 只因为远，别无他故。',
      ar: 'أما البقية فلا يصوّتون — لأنهم بعيدون، لا لشيء آخر.',
      es: 'Los demás no votan: por lejanos, y por nada más.',
      fr: "Les autres ne votent pas — parce qu'ils sont loin, rien d'autre.",
      hi: 'बाक़ी कुछ नहीं डाल पाते — बस दूर होने के कारण।',
      id: 'Sisanya tak memberi suara — hanya karena jauh.',
      pt: 'Os restantes não votam — por estarem longe, e nada mais.',
    },
    'caption.verdict': {
      en: 'Box {winner} holds more votes. The new point is labeled {winner}.',
      ko: '표가 더 많은 쪽은 {winner}. 새 점의 이름표가 된다.',
      ja: '票が多いのは {winner} の箱。新しい点の名札はこれになる。',
      zh: '票更多的是 {winner} 箱。新点就被标为 {winner}。',
      ar: 'صندوق {winner} يحوي أصواتًا أكثر. النقطة الجديدة تُسمّى {winner}.',
      es: 'La urna {winner} tiene más votos. El punto nuevo se etiqueta {winner}.',
      fr: "L'urne {winner} a le plus de voix. Le nouveau point est étiqueté {winner}.",
      hi: '{winner} पेटी में ज़्यादा वोट हैं। नए बिंदु का लेबल {winner} हुआ।',
      id: 'Kotak {winner} punya suara terbanyak. Titik baru diberi label {winner}.',
      pt: 'A urna {winner} tem mais votos. O ponto novo fica rotulado como {winner}.',
    },
  },
};
