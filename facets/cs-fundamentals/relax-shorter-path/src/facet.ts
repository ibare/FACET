/**
 * relaxShorterPath facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "더 짧은 길을 찾았을 때, 정점이 이고 있던 수는 어떻게 되는가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 제목 없음 / 메트릭 없음 / layout 없음 / 캔버스 폭 620 /
 * 컨트롤은 다시 보기와 한 걸음 둘뿐이며 눌러야 완성되는 화면이 아니다.
 *
 * 데이터는 구조만 적는다. 화면에 뜨는 수 — 7 이 5 로, 11 이 6 으로 내려가는
 * 그 수들 — 은 하나도 여기 없다. 전부 algorithm 이 이 구조를 순회하며 셈한다.
 *
 * 간선 여섯은 한 번의 순회에서 세 사건이 모두 나오도록 골랐다 — 처음 적히는 것,
 * 내려가는 것, 그리고 **더 짧지 않아 그대로 두는 것**. 셋째가 없으면 "더 짧은 길을
 * 찾으면" 의 조건이 화면에서 늘 참으로만 보인다.
 *
 * `scaleMax` 는 세로 자의 위 끝이다. 이 데이터에서 화면에 오르는 가장 큰 수는
 * 버려지는 후보 11 (= 2 + 9) 이고 12 는 그보다 크므로 어떤 수도 자 밖으로 나가지
 * 않는다. 눈금을 어디까지 그릴지는 화면을 읽는 속도를 정하는 저작 결정이라 선언에 둔다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const relaxShorterPathFacet: FacetJson = {
  id: 'facet:relaxShorterPath',
  title: {
    en: 'Relaxation',
    ko: '완화',
    ja: '緩和',
    zh: '松弛',
    ar: 'الإرخاء',
    es: 'Relajación',
    fr: 'Relâchement',
    hi: 'रिलैक्सेशन',
    id: 'Relaksasi',
    pt: 'Relaxamento',
  },
  description: {
    en: 'A recorded distance is erased and rewritten lower when a shorter way turns up. It never goes back up.',
    ko: '더 짧은 길을 찾으면 적어 둔 거리를 지우고 낮은 수로 다시 적는다. 다시 올라가는 일은 없다.',
    ja: '短い道が見つかれば、書いてあった距離を消して小さい数に書き直す。上がることは決してない。',
    zh: '一旦出现更短的路，就擦掉写好的距离，改写成更小的数。它从不回升。',
    ar: 'حين يظهر طريق أقصر، تُمحى المسافة المكتوبة وتُكتب أصغر. ولا تعود للارتفاع أبدًا.',
    es: 'Cuando aparece un camino más corto, se borra la distancia anotada y se escribe una menor. Nunca vuelve a subir.',
    fr: 'Quand un chemin plus court apparaît, la distance notée est effacée et réécrite plus basse. Elle ne remonte jamais.',
    hi: 'छोटा रास्ता मिलते ही लिखी हुई दूरी मिटाकर छोटी संख्या लिख दी जाती है। वह कभी नहीं बढ़ती।',
    id: 'Begitu ada jalan yang lebih pendek, jarak yang tercatat dihapus dan ditulis lebih kecil. Ia tidak pernah naik lagi.',
    pt: 'Quando aparece um caminho mais curto, a distância anotada é apagada e reescrita menor. Nunca volta a subir.',
  },
  algorithm: 'module:relaxShorterPath',
  projector: 'module:relaxShorterPathProjector',
  initialData: {
    type: 'relax-shorter-path',
    vertices: ['S', 'A', 'B', 'C'],
    edges: [
      { from: 'S', to: 'A', weight: 7 },
      { from: 'S', to: 'B', weight: 2 },
      { from: 'S', to: 'C', weight: 8 },
      { from: 'B', to: 'A', weight: 3 },
      { from: 'A', to: 'C', weight: 1 },
      { from: 'B', to: 'C', weight: 9 },
    ],
    source: 'S',
    scaleMax: 12,
    stepMs: 950,
  },
  blocks: {
    stage: { type: 'relax-shorter-path-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'label.axis': {
      en: 'distance from {source}',
      ko: '{source} 에서의 거리',
      ja: '{source} からの距離',
      zh: '离 {source} 的距离',
      ar: 'المسافة من {source}',
      es: 'distancia desde {source}',
      fr: 'distance depuis {source}',
      hi: '{source} से दूरी',
      id: 'jarak dari {source}',
      pt: 'distância desde {source}',
    },
    'caption.start': {
      en: 'Only the start is known — {source} is 0, the rest have nothing written.',
      ko: '아는 것은 출발점뿐 — {source} 는 0, 나머지는 아직 적힌 수가 없다.',
      ja: '分かっているのは出発点だけ — {source} は 0、ほかはまだ何も書かれていない。',
      zh: '已知的只有起点 — {source} 是 0，其余还什么都没写。',
      ar: 'المعلوم هو نقطة البداية فقط — {source} تساوي 0، والباقي بلا رقم مكتوب.',
      es: 'Solo se conoce el inicio: {source} vale 0, en el resto no hay nada escrito.',
      fr: 'On ne connaît que le départ — {source} vaut 0, le reste est vierge.',
      hi: 'पता सिर्फ़ शुरुआत का है — {source} शून्य है, बाकी पर कुछ लिखा नहीं।',
      id: 'Yang diketahui hanya titik awal — {source} bernilai 0, sisanya belum tertulis apa pun.',
      pt: 'Só se conhece o ponto de partida — {source} vale 0, o resto está por escrever.',
    },
    'caption.settle': {
      en: '{vertex} holds the smallest number written so far ({dist}). Open the edges that leave it.',
      ko: '지금까지 적힌 수 가운데 {vertex} 가 가장 작다 ({dist}). 여기서 나가는 간선을 편다.',
      ja: '今まで書かれた数のうち {vertex} が最も小さい ({dist})。ここから出る辺を開く。',
      zh: '已写下的数里 {vertex} 最小（{dist}）。展开从这里出去的边。',
      ar: '{vertex} يحمل أصغر رقم كُتب حتى الآن ({dist}). افتح الحواف الخارجة منه.',
      es: '{vertex} tiene el número más pequeño escrito hasta ahora ({dist}). Se abren sus aristas de salida.',
      fr: "{vertex} porte le plus petit nombre écrit jusqu'ici ({dist}). On ouvre les arêtes qui en partent.",
      hi: 'अब तक लिखी संख्याओं में {vertex} सबसे छोटी है ({dist})। यहाँ से निकलने वाले किनारे खोलो।',
      id: '{vertex} memegang angka terkecil yang tertulis sejauh ini ({dist}). Buka sisi-sisi yang keluar darinya.',
      pt: '{vertex} tem o menor número escrito até agora ({dist}). Abrem-se as arestas que dele saem.',
    },
    'caption.write': {
      en: 'Nothing is written at {vertex} yet — the way through {from} puts {value} there.',
      ko: '{vertex} 에는 아직 적힌 수가 없다. {from} 를 거쳐 온 수를 처음 적는다 ({value}).',
      ja: '{vertex} にはまだ何も書かれていない — {from} を経た数 {value} を初めて書く。',
      zh: '{vertex} 上还没有数 — 经过 {from} 的 {value} 第一次写上去。',
      ar: 'لا شيء مكتوب عند {vertex} بعد — الطريق عبر {from} يضع {value} هناك.',
      es: 'En {vertex} no hay nada escrito: el camino por {from} pone allí {value}.',
      fr: "Rien n'est écrit à {vertex} — le passage par {from} y inscrit {value}.",
      hi: '{vertex} पर अभी कुछ नहीं लिखा — {from} से होकर आया {value} पहली बार लिखा जाता है।',
      id: 'Belum ada angka di {vertex} — lewat {from}, {value} ditulis untuk pertama kali.',
      pt: 'Em {vertex} não há nada escrito — o caminho por {from} inscreve lá {value}.',
    },
    'caption.probe': {
      en: 'Going through {from} costs {candidate}. {to} has {current} written.',
      ko: '{from} 를 거치면 {candidate}. 지금 {to} 에 적힌 수는 {current}.',
      ja: '{from} を経ると {candidate}。いま {to} に書かれている数は {current}。',
      zh: '经过 {from} 要 {candidate}。{to} 上写的是 {current}。',
      ar: 'المرور عبر {from} يكلّف {candidate}. و{to} مكتوب عليها {current}.',
      es: 'Pasar por {from} cuesta {candidate}. En {to} está escrito {current}.',
      fr: 'Passer par {from} coûte {candidate}. {to} porte {current}.',
      hi: '{from} से जाने पर {candidate} लगता है। {to} पर {current} लिखा है।',
      id: 'Lewat {from} biayanya {candidate}. Di {to} tertulis {current}.',
      pt: 'Passar por {from} custa {candidate}. Em {to} está escrito {current}.',
    },
    'caption.descend': {
      en: '{toValue} is shorter than {fromValue} — erase what was written and write the lower number.',
      ko: '{toValue} < {fromValue} — 적어 둔 수를 지우고 낮은 수로 다시 적는다.',
      ja: '{toValue} は {fromValue} より短い — 書いてあった数を消して小さい数を書く。',
      zh: '{toValue} 比 {fromValue} 短 — 擦掉写好的数，改写成更小的。',
      ar: '{toValue} أقصر من {fromValue} — امحُ المكتوب واكتب الرقم الأصغر.',
      es: '{toValue} es menor que {fromValue}: se borra lo escrito y se anota el número menor.',
      fr: '{toValue} est plus court que {fromValue} — on efface et on écrit le nombre plus petit.',
      hi: '{toValue}, {fromValue} से छोटा है — लिखा हुआ मिटाकर छोटी संख्या लिखो।',
      id: '{toValue} lebih pendek dari {fromValue} — hapus yang tertulis dan tulis angka yang lebih kecil.',
      pt: '{toValue} é menor que {fromValue} — apaga-se o escrito e anota-se o número menor.',
    },
    'caption.keep': {
      en: '{candidate} is not shorter than {current} — nothing is erased, the number stays where it is.',
      ko: '{candidate} ≥ {current} — 더 짧지 않다. 적어 둔 수를 지우지 않는다.',
      ja: '{candidate} は {current} より短くない — 何も消さず、数はそのまま。',
      zh: '{candidate} 并不比 {current} 短 — 什么都不擦，数保持原样。',
      ar: '{candidate} ليس أقصر من {current} — لا يُمحى شيء، ويبقى الرقم كما هو.',
      es: '{candidate} no es menor que {current}: no se borra nada, el número se queda.',
      fr: "{candidate} n'est pas plus court que {current} — rien n'est effacé, le nombre reste.",
      hi: '{candidate}, {current} से छोटा नहीं — कुछ नहीं मिटता, संख्या वहीं रहती है।',
      id: '{candidate} tidak lebih pendek dari {current} — tak ada yang dihapus, angkanya tetap.',
      pt: '{candidate} não é menor que {current} — nada se apaga, o número fica.',
    },
    'caption.done': {
      en: 'Every number that changed moved down. Not one of them ever went up.',
      ko: '바뀐 수는 모두 아래로 갔다. 한 번도 올라간 적이 없다.',
      ja: '変わった数はすべて下がった。上がったものは一つもない。',
      zh: '变过的数都往下走。没有一个回升。',
      ar: 'كل رقم تغيّر نزل. ولم يصعد أيٌّ منها قط.',
      es: 'Todo número que cambió bajó. Ninguno subió jamás.',
      fr: "Tout nombre qui a changé est descendu. Aucun n'est jamais remonté.",
      hi: 'जो भी संख्या बदली, नीचे ही गई। कोई कभी ऊपर नहीं गई।',
      id: 'Setiap angka yang berubah turun. Tidak satu pun pernah naik.',
      pt: 'Todo número que mudou desceu. Nenhum subiu alguma vez.',
    },
  },
};
