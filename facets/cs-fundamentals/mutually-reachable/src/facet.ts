/**
 * 서로 오갈 수 있는 무리 — 조각.
 *
 * @piece
 *
 * 답하는 질문: **한쪽으로만 갈 수 있는 사이도 한 무리인가?**
 *
 * 아니다. 오갈 수 있어야 한 무리다. 그것을 화면에서 확인시키려고 두 정점을 짚어
 * 한쪽으로 가 보고 반대쪽으로도 가 본 뒤에 판정한다. 갈린 자리는 그 판정의
 * 결과이지 미리 칠해 둔 색이 아니다.
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const mutuallyReachableFacet: FacetJson = {
  id: 'facet:mutuallyReachable',
  title: {
    en: 'Mutually reachable',
    ko: '서로 오갈 수 있는 무리',
    ja: '互いに行き来できる仲間',
    zh: '能互相到达的一群',
    ar: 'يمكن بلوغ كل منهما الآخر',
    es: 'Mutuamente alcanzables',
    fr: 'Mutuellement accessibles',
    hi: 'आपस में पहुँच योग्य',
    id: 'Saling terjangkau',
    pt: 'Mutuamente alcançáveis',
  },
  description: {
    en: 'One-way is not enough. A group holds only when travel works both ways.',
    ko: '한쪽으로만 갈 수 있으면 한 무리가 아니다 — 오갈 수 있어야 한 무리다.',
    ja: '片道だけでは仲間にならない — 行き来できてこそ一つの群れだ。',
    zh: '只能单向到达还不算一群 — 能来能回才是一群。',
    ar: 'الاتجاه الواحد لا يكفي. لا تتكوّن المجموعة إلا إذا سار السفر في الاتجاهين.',
    es: 'Un solo sentido no basta: solo hay grupo si se puede ir y volver.',
    fr: "Un seul sens ne suffit pas : il n'y a groupe que si l'on peut aller et revenir.",
    hi: 'एकतरफ़ा पहुँच काफ़ी नहीं। समूह तभी बनता है जब आना-जाना दोनों हो।',
    id: 'Satu arah tidak cukup. Kelompok terbentuk hanya bila bisa pergi dan kembali.',
    pt: 'Só de ida não basta. Só há grupo quando dá para ir e voltar.',
  },
  algorithm: 'module:mutuallyReachable',
  projector: 'module:mutuallyReachableProjector',

  initialData: {
    type: 'mutually-reachable',
    nodes: ['a', 'b', 'c', 'd', 'e'],
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'a' },
      { from: 'c', to: 'd' },
      { from: 'd', to: 'e' },
      { from: 'e', to: 'd' },
    ],
    stepMs: 850,
  },

  blocks: {
    stage: { type: 'mutually-reachable-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },

  messages: {
    'caption.intro': {
      en: 'Pick two vertices and ask: can each one reach the other?',
      ko: '두 정점을 짚어 서로에게 갈 수 있는지 묻는다.',
      ja: '頂点を二つ選び、互いに行けるかを問う。',
      zh: '挑两个顶点，问：彼此都能到达对方吗？',
      ar: 'اختر رأسين واسأل: هل يبلغ كل منهما الآخر؟',
      es: 'Elige dos vértices y pregunta: ¿llega cada uno al otro?',
      fr: "Choisis deux sommets et demande : chacun atteint-il l'autre ?",
      hi: 'दो शीर्ष चुनें और पूछें: क्या हर एक दूसरे तक पहुँच सकता है?',
      id: 'Pilih dua simpul lalu tanya: apakah masing-masing bisa mencapai yang lain?',
      pt: 'Escolha dois vértices e pergunte: cada um alcança o outro?',
    },
    'caption.ask': {
      en: 'Take {u} and {v}.',
      ko: '{u} 와 {v} 를 짚는다.',
      ja: '{u} と {v} を選ぶ。',
      zh: '选出 {u} 和 {v}。',
      ar: 'خذ {u} و{v}.',
      es: 'Tomamos {u} y {v}.',
      fr: 'On prend {u} et {v}.',
      hi: '{u} और {v} को लें।',
      id: 'Ambil {u} dan {v}.',
      pt: 'Pegamos {u} e {v}.',
    },
    'caption.reached': {
      en: '{from} to {to}: there is a way, and this is it.',
      ko: '{from} 에서 {to} 로 가는 길이 있다. 이 길이다.',
      ja: '{from} から {to} への道はある。これがその道だ。',
      zh: '从 {from} 到 {to} 有路，就是这一条。',
      ar: 'من {from} إلى {to} يوجد طريق، وهذا هو.',
      es: 'De {from} a {to} sí hay camino, y es este.',
      fr: 'De {from} à {to}, il y a un chemin — le voici.',
      hi: '{from} से {to} तक रास्ता है, और यही वह है।',
      id: 'Dari {from} ke {to} ada jalan, dan inilah jalannya.',
      pt: 'De {from} a {to} há caminho, e é este.',
    },
    'caption.blocked': {
      en: 'No way from {from} to {to}. From {from} you only ever reach {region}.',
      ko: '{from} 에서 {to} 로 갈 길이 없다. {from} 가 닿는 곳은 {region} 뿐이다.',
      ja: '{from} から {to} へ行く道はない。{from} が届くのは {region} だけだ。',
      zh: '从 {from} 到 {to} 没有路。{from} 能到的只有 {region}。',
      ar: 'لا سبيل من {from} إلى {to}. من {from} لا تبلغ إلا {region}.',
      es: 'No hay forma de ir de {from} a {to}. Desde {from} solo se llega a {region}.',
      fr: 'Aucun chemin de {from} à {to}. Depuis {from} on ne touche que {region}.',
      hi: '{from} से {to} तक कोई रास्ता नहीं। {from} से केवल {region} तक पहुँचा जा सकता है।',
      id: 'Tidak ada jalan dari {from} ke {to}. Dari {from} hanya {region} yang terjangkau.',
      pt: 'Não há como ir de {from} a {to}. De {from} só se alcança {region}.',
    },
    'caption.mutual': {
      en: 'Both ways work, so {u} and {v} belong together.',
      ko: '양쪽 다 통한다. {u} 와 {v} 는 한 무리다.',
      ja: '両方向とも通る。{u} と {v} は同じ仲間だ。',
      zh: '两个方向都通，{u} 和 {v} 是一群的。',
      ar: 'الاتجاهان يعملان، إذن {u} و{v} في مجموعة واحدة.',
      es: 'Funcionan los dos sentidos: {u} y {v} van juntos.',
      fr: 'Les deux sens passent : {u} et {v} vont ensemble.',
      hi: 'दोनों दिशाएँ चलती हैं, इसलिए {u} और {v} एक ही समूह में हैं।',
      id: 'Kedua arah jalan, jadi {u} dan {v} satu kelompok.',
      pt: 'Os dois sentidos funcionam, então {u} e {v} ficam juntos.',
    },
    'caption.oneWay': {
      en: 'Only one way, so {u} and {v} are not one group.',
      ko: '한 방향뿐이다. {u} 와 {v} 는 한 무리가 아니다.',
      ja: '一方向だけだ。{u} と {v} は同じ仲間ではない。',
      zh: '只有一个方向，{u} 和 {v} 不是一群。',
      ar: 'اتجاه واحد فقط، فليس {u} و{v} مجموعة واحدة.',
      es: 'Solo un sentido: {u} y {v} no forman un grupo.',
      fr: 'Un seul sens : {u} et {v} ne forment pas un groupe.',
      hi: 'सिर्फ़ एक दिशा, इसलिए {u} और {v} एक समूह नहीं हैं।',
      id: 'Hanya satu arah, jadi {u} dan {v} bukan satu kelompok.',
      pt: 'Só um sentido: {u} e {v} não são um grupo.',
    },
    'caption.settled': {
      en: '{members} form one group of {count}.',
      ko: '{members} 는 {count} 짜리 한 무리다.',
      ja: '{members} は {count} 個からなる一つの仲間だ。',
      zh: '{members} 组成一个 {count} 个成员的群。',
      ar: '{members} تكوّن مجموعة واحدة من {count}.',
      es: '{members} forman un grupo de {count}.',
      fr: '{members} forment un groupe de {count}.',
      hi: '{members} मिलकर {count} का एक समूह बनाते हैं।',
      id: '{members} membentuk satu kelompok berisi {count}.',
      pt: '{members} formam um grupo de {count}.',
    },
    'caption.split': {
      en: '{groupCount} groups. Links between them: {bridgeCount}, one way only: {oneWayCount}. Cross and there is no way back.',
      ko: '무리는 {groupCount} 개. 사이를 잇는 간선은 {bridgeCount} 개이고 그중 {oneWayCount} 개가 한 방향뿐이라, 건너가면 돌아올 길이 없다.',
      ja: '仲間は {groupCount} 組。あいだをつなぐ辺は {bridgeCount} 本、うち {oneWayCount} 本は一方通行なので、渡ると戻る道がない。',
      zh: '一共 {groupCount} 群。群间的连线有 {bridgeCount} 条，其中 {oneWayCount} 条是单向的 — 过去了就回不来。',
      ar: '{groupCount} مجموعات. الروابط بينها {bridgeCount}، منها {oneWayCount} باتجاه واحد فقط. إن عبرت فلا طريق للعودة.',
      es: '{groupCount} grupos. Enlaces entre ellos: {bridgeCount}, de un solo sentido: {oneWayCount}. Si cruzas, no hay vuelta.',
      fr: '{groupCount} groupes. Liens entre eux : {bridgeCount}, à sens unique : {oneWayCount}. Une fois passé, pas de retour.',
      hi: '{groupCount} समूह। उनके बीच की कड़ियाँ: {bridgeCount}, केवल एकतरफ़ा: {oneWayCount}। पार कर गए तो लौटने का रास्ता नहीं।',
      id: '{groupCount} kelompok. Tautan di antaranya: {bridgeCount}, satu arah saja: {oneWayCount}. Sekali menyeberang, tak ada jalan pulang.',
      pt: '{groupCount} grupos. Ligações entre eles: {bridgeCount}, só de mão única: {oneWayCount}. Atravessou, não há volta.',
    },
  },
};
