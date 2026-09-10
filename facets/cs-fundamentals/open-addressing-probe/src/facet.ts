/**
 * open-addressing-probe facet 선언.
 *
 * @piece 조각(piece) facet — 한 주장만 말하고 멈춘다 (S-piece).
 *   질문: 자리가 차 있으면 열쇠는 어디에 앉는가?
 *   답:   사슬을 달지 않고 한 칸씩 옆으로 밀려가 빈 자리에 앉는다.
 *
 * hash 값은 Java String.hashCode 실측값이다. 자리는 알고리즘이
 * (h & 0x7FFFFFFF) % size 로 직접 구하므로 선언에 적힌 수는 hash 뿐이다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const openAddressingProbeFacet: FacetJson = {
  id: 'facet:openAddressingProbe',
  title: {
    en: 'Open addressing: probing for the next seat',
    ko: '개방 주소법 — 다음 자리를 본다',
    ja: 'オープンアドレス法 — 次の席を探る',
    zh: '开放定址法 — 探查下一个座位',
    ar: 'العنونة المفتوحة: البحث عن المقعد التالي',
    es: 'Direccionamiento abierto: sondear el siguiente asiento',
    fr: 'Adressage ouvert : sonder la place suivante',
    hi: 'ओपन एड्रेसिंग: अगली सीट की जाँच',
    id: 'Pengalamatan terbuka: menyelidik kursi berikutnya',
    pt: 'Endereçamento aberto: sondar o próximo assento',
  },
  description: {
    en: 'When a bucket is taken, the key walks sideways to the next one until it finds an empty seat.',
    ko: '자리가 차 있으면 열쇠는 한 칸씩 옆으로 밀려가 빈 자리를 찾는다.',
    ja: '席が埋まっていると、鍵は空いた席が見つかるまで横へ一つずつずれていく。',
    zh: '桶被占了，键就一格一格往旁边挪，直到找到空位。',
    ar: 'إذا كانت السلة مشغولة، يزحف المفتاح جانبًا إلى التي تليها حتى يجد مقعدًا فارغًا.',
    es: 'Si el cubo está ocupado, la clave se corre de lado al siguiente hasta encontrar un asiento libre.',
    fr: "Si le seau est occupé, la clé glisse de côté vers le suivant jusqu'à trouver une place libre.",
    hi: 'बकेट भरी हो तो कुंजी बग़ल की अगली बकेट की ओर खिसकती जाती है, जब तक ख़ाली सीट न मिले।',
    id: 'Kalau embernya terisi, kunci bergeser ke samping ke ember berikutnya sampai menemukan kursi kosong.',
    pt: 'Se o balde está ocupado, a chave desliza de lado para o seguinte até achar um assento vazio.',
  },
  algorithm: 'module:openAddressingProbe',
  projector: 'module:openAddressingProbeProjector',
  initialData: {
    type: 'open-addressing-probe',
    size: 8,
    stepMs: 680,
    keys: [
      { key: 'apple', hash: 93029210 },
      { key: 'elder', hash: 96592394 },
      { key: 'mango', hash: 103662530 },
      { key: 'fig', hash: 101380 },
    ],
  },
  blocks: {
    stage: { type: 'open-addressing-probe-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'label.hashLine': {
      en: '{key} · hashCode {hash} · (h & 0x7FFFFFFF) % {size} = {home}',
      ko: '{key} · hashCode {hash} · (h & 0x7FFFFFFF) % {size} = {home}',
      ja: '{key} · hashCode {hash} · (h & 0x7FFFFFFF) % {size} = {home}',
      zh: '{key} · hashCode {hash} · (h & 0x7FFFFFFF) % {size} = {home}',
      ar: '{key} · hashCode {hash} · (h & 0x7FFFFFFF) % {size} = {home}',
      es: '{key} · hashCode {hash} · (h & 0x7FFFFFFF) % {size} = {home}',
      fr: '{key} · hashCode {hash} · (h & 0x7FFFFFFF) % {size} = {home}',
      hi: '{key} · hashCode {hash} · (h & 0x7FFFFFFF) % {size} = {home}',
      id: '{key} · hashCode {hash} · (h & 0x7FFFFFFF) % {size} = {home}',
      pt: '{key} · hashCode {hash} · (h & 0x7FFFFFFF) % {size} = {home}',
    },
    'caption.arrive': {
      en: '{key} belongs in slot {home}.',
      ko: '{key} — 제 자리는 {home} 번이다.',
      ja: '{key} の本来の席は {home} 番だ。',
      zh: '{key} 本该在第 {home} 格。',
      ar: 'مكان {key} هو الخانة {home}.',
      es: 'El sitio de {key} es la casilla {home}.',
      fr: 'La place de {key} est la case {home}.',
      hi: '{key} की जगह खाना {home} है।',
      id: 'Tempat {key} adalah kotak {home}.',
      pt: 'O lugar de {key} é a casa {home}.',
    },
    'caption.probe': {
      en: 'Slot {from} is taken by {holder} — look one slot over.',
      ko: '{from} 번은 이미 차 있다 ({holder}) — 한 칸 옆 {to} 번을 본다.',
      ja: '{from} 番は {holder} が使っている — 一つ隣を見る。',
      zh: '第 {from} 格已被 {holder} 占了 — 看旁边一格。',
      ar: 'الخانة {from} يشغلها {holder} — ننظر إلى الخانة التالية.',
      es: 'La casilla {from} la ocupa {holder}: miramos una casilla más allá.',
      fr: 'La case {from} est occupée par {holder} — on regarde la case suivante.',
      hi: 'खाना {from} पर {holder} बैठा है — एक खाना आगे देखते हैं।',
      id: 'Kotak {from} sudah dipakai {holder} — lihat satu kotak di sebelahnya.',
      pt: 'A casa {from} está ocupada por {holder} — olhamos uma casa adiante.',
    },
    'caption.seat': {
      en: 'Slot {slot} is empty — {key} sits down here.',
      ko: '{key} — {slot} 번이 비어 있어 여기 앉는다.',
      ja: '{slot} 番は空いている — {key} はここに座る。',
      zh: '第 {slot} 格是空的 — {key} 就坐在这里。',
      ar: 'الخانة {slot} فارغة — يجلس {key} هنا.',
      es: 'La casilla {slot} está libre: {key} se sienta aquí.',
      fr: "La case {slot} est libre — {key} s'y installe.",
      hi: 'खाना {slot} ख़ाली है — {key} यहीं बैठ जाता है।',
      id: 'Kotak {slot} kosong — {key} duduk di sini.',
      pt: 'A casa {slot} está vazia — {key} senta-se aqui.',
    },
    'caption.spill': {
      en: 'Slot {home} belongs to {key}, but {blocker} had already been pushed into it — so {key} slid on to {slot}.',
      ko: '{key} 의 자리는 {home} 번이다. 그런데 남의 충돌에 밀려온 {blocker} 가 거기 앉아 있어, 결국 {slot} 번까지 밀려간다.',
      ja: '{home} 番は {key} の席だが、はじき出された {blocker} が先に座っていた — それで {key} は {slot} 番まで押し流された。',
      zh: '第 {home} 格本是 {key} 的位子，可被挤过来的 {blocker} 先占了 — 于是 {key} 一路滑到第 {slot} 格。',
      ar: 'الخانة {home} هي مكان {key}، لكن {blocker} كان قد دُفع إليها قبله — فانزلق {key} حتى الخانة {slot}.',
      es: 'La casilla {home} es de {key}, pero {blocker} ya había sido empujado allí, así que {key} se deslizó hasta la {slot}.',
      fr: "La case {home} revient à {key}, mais {blocker} y avait déjà été poussé — {key} a donc glissé jusqu'à la case {slot}.",
      hi: 'खाना {home} {key} का है, पर धकेला हुआ {blocker} पहले से वहाँ बैठा था — इसलिए {key} खिसककर {slot} तक चला गया।',
      id: 'Kotak {home} milik {key}, tetapi {blocker} sudah terdorong ke sana lebih dulu — jadi {key} tergeser sampai kotak {slot}.',
      pt: 'A casa {home} é de {key}, mas {blocker} já tinha sido empurrado para lá — então {key} deslizou até a casa {slot}.',
    },
    'caption.done': {
      en: 'No chains anywhere — every key found a seat inside the table itself.',
      ko: '사슬은 어디에도 없다 — 모든 열쇠가 표 안에서 자리를 찾았다.',
      ja: '鎖はどこにもない — どの鍵も表そのものの中に席を見つけた。',
      zh: '哪里都没有链 — 每个键都在表内部找到了座位。',
      ar: 'لا سلاسل في أي مكان — كل مفتاح وجد مقعده داخل الجدول نفسه.',
      es: 'No hay cadenas por ninguna parte: cada clave encontró asiento dentro de la propia tabla.',
      fr: 'Aucune chaîne nulle part — chaque clé a trouvé sa place dans la table elle-même.',
      hi: 'कहीं कोई शृंखला नहीं — हर कुंजी ने तालिका के भीतर ही जगह पा ली।',
      id: 'Tidak ada rantai di mana pun — setiap kunci menemukan kursi di dalam tabel itu sendiri.',
      pt: 'Nenhuma cadeia em lugar nenhum — cada chave achou assento dentro da própria tabela.',
    },
  },
};
