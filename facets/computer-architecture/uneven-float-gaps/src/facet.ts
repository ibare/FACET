/**
 * 고르지 않은 눈금 — @piece
 *
 * 답하는 질문 하나: **수가 클수록 바로 다음 수까지가 얼마나 멀어지는가.**
 *
 * 선언에 두는 것은 구조뿐이다 — 볼 지점과 읽을 틈(stepMs). 사이 거리도 개수도
 * 좌표도 여기 없다. 거리는 algorithm 의 자(`gapAt`)가 재고, 한 구간에 드는 값의
 * 개수도 그 잰 거리에서 나오며(한때 여기 있던 `mantissaBits` 는 그림과 다른
 * 출처였다), 어디에 무엇을 놓을지는 stage 가 캔버스에서 역산한다 (S-piece).
 *
 * 화면을 명령이 아니라 **장면**으로 만들므로 (`scene:`) 어느 걸음의 화면이든
 * 셈으로 얻는다 — 그래서 재생 위치를 끌어 보는 띠를 단다 (S-scene).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const unevenFloatGapsFacet: FacetJson = {
  id: 'facet:unevenFloatGaps',
  title: {
    en: 'Uneven notches',
    ko: '고르지 않은 눈금',
    ja: '均一でない目盛り',
    zh: '不均匀的刻度',
    ar: 'درجات غير متساوية',
    es: 'Muescas desiguales',
    fr: 'Des crans inégaux',
    hi: 'असमान निशान',
    id: 'Takik yang tidak seragam',
    pt: 'Entalhes desiguais',
  },
  description: {
    en: 'Each step to the right doubles the distance to the next float32.',
    ko: '오른쪽으로 갈수록 이웃한 두 수 사이가 배로 멀어진다.',
    ja: '右へ進むほど、隣り合う二つの数の間隔が倍になる。',
    zh: '越往右，相邻两个数之间的距离就翻一倍。',
    ar: 'كلما اتجهنا يميناً تضاعفت المسافة إلى العدد التالي.',
    es: 'Cada paso hacia la derecha duplica la distancia hasta el siguiente float32.',
    fr: 'Chaque pas vers la droite double la distance au float32 suivant.',
    hi: 'दाईं ओर हर कदम अगले float32 तक की दूरी को दोगुना कर देता है।',
    id: 'Setiap langkah ke kanan menggandakan jarak ke float32 berikutnya.',
    pt: 'Cada passo para a direita dobra a distância até o próximo float32.',
  },
  algorithm: 'module:unevenFloatGaps',
  scene: 'module:unevenFloatGapsScene',
  initialData: {
    type: 'uneven-float-gaps',
    samples: [1, 2, 16, 1024, 65536],
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'uneven-float-gaps-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
  messages: {
    'caption.anchor': {
      en: 'The next float32 after 1 lands here. Call this gap one notch.',
      ko: '1 바로 다음 수가 여기. 이 칸을 한 눈금으로 삼는다.',
      ja: '1 の次の float32 はここ。この幅を 1 目盛りとする。',
      zh: '1 之后的下一个 float32 落在这里。把这段距离当作一格。',
      ar: 'العدد التالي بعد 1 يقع هنا. اعتبر هذه المسافة درجة واحدة.',
      es: 'El siguiente float32 después de 1 cae aquí. Llamemos a esta distancia una muesca.',
      fr: 'Le float32 suivant après 1 tombe ici. Appelons cet écart un cran.',
      hi: '1 के बाद अगला float32 यहाँ आता है। इस दूरी को एक निशान मानें।',
      id: 'float32 berikutnya setelah 1 jatuh di sini. Sebut jarak ini satu takik.',
      pt: 'O próximo float32 depois de 1 cai aqui. Chame esta distância de um entalhe.',
    },
    'caption.widen': {
      en: 'At {value}: the neighbour is {k} notches away.',
      ko: '{value} 자리: 이웃까지는 앞 눈금 {k} 개 거리.',
      ja: '{value} の位置: 隣までは前の目盛り {k} 個分。',
      zh: '在 {value} 处：到邻居有 {k} 格。',
      ar: 'عند {value}: الجار يبعد {k} درجة.',
      es: 'En {value}: el vecino está a {k} muescas.',
      fr: 'À {value} : le voisin est à {k} crans.',
      hi: '{value} पर: पड़ोसी {k} निशान दूर है।',
      id: 'Di {value}: tetangganya berjarak {k} takik.',
      pt: 'Em {value}: o vizinho está a {k} entalhes.',
    },
    'caption.count': {
      en: 'Every span from a number to its double holds the same count: {count}.',
      ko: '어느 구간이든 담는 값의 개수는 같다: {count}.',
      ja: 'どの区間でも入る値の個数は同じ: {count}。',
      zh: '每个区间容纳的值的个数都相同：{count}。',
      ar: 'كل مجال يحتوي على العدد نفسه من القيم: {count}.',
      es: 'Cada tramo contiene la misma cantidad de valores: {count}.',
      fr: 'Chaque intervalle contient le même nombre de valeurs : {count}.',
      hi: 'हर अंतराल में मानों की संख्या समान है: {count}।',
      id: 'Setiap rentang memuat jumlah nilai yang sama: {count}.',
      pt: 'Cada intervalo contém a mesma quantidade de valores: {count}.',
    },
    'caption.done': {
      en: 'The bigger the number, the farther its neighbour. The notches are not even.',
      ko: '수가 클수록 이웃이 멀다. 눈금은 고르지 않다.',
      ja: '数が大きいほど隣は遠い。目盛りは均一ではない。',
      zh: '数越大，邻居越远。刻度并不均匀。',
      ar: 'كلما كبر العدد ابتعد جاره. الدرجات ليست متساوية.',
      es: 'Cuanto mayor es el número, más lejos está su vecino. Las muescas no son uniformes.',
      fr: 'Plus le nombre est grand, plus son voisin est loin. Les crans ne sont pas réguliers.',
      hi: 'संख्या जितनी बड़ी, पड़ोसी उतना दूर। निशान एक समान नहीं हैं।',
      id: 'Makin besar bilangannya, makin jauh tetangganya. Takiknya tidak seragam.',
      pt: 'Quanto maior o número, mais longe fica o vizinho. Os entalhes não são uniformes.',
    },
    'label.notches': {
      en: '{k} × the previous notch',
      ko: '앞 눈금 {k} 개',
      ja: '前の目盛り {k} 個分',
      zh: '前一格的 {k} 倍',
      ar: '{k} × الدرجة السابقة',
      es: '{k} × la muesca anterior',
      fr: '{k} × le cran précédent',
      hi: 'पिछले निशान का {k} गुना',
      id: '{k} × takik sebelumnya',
      pt: '{k} × o entalhe anterior',
    },
    'label.times': {
      en: 'vs. the first notch',
      ko: '처음 눈금과 견주면',
      ja: '最初の目盛りと比べて',
      zh: '与第一格相比',
      ar: 'مقارنة بالدرجة الأولى',
      es: 'frente a la primera muesca',
      fr: 'par rapport au premier cran',
      hi: 'पहले निशान की तुलना में',
      id: 'dibanding takik pertama',
      pt: 'em relação ao primeiro entalhe',
    },
    'label.octave': {
      en: '{count} such gaps fill one span: {from} to {to}',
      ko: '이런 칸 {count} 개가 한 구간을 채운다: {from} ~ {to}',
      ja: 'この幅 {count} 個で一区間: {from} ~ {to}',
      zh: '{count} 个这样的间隔填满一个区间：{from} ~ {to}',
      ar: '{count} من هذه الفجوات تملأ مجالاً واحداً: {from} ~ {to}',
      es: '{count} huecos como este llenan un tramo: {from} a {to}',
      fr: '{count} écarts comme celui-ci remplissent un intervalle : {from} à {to}',
      hi: 'ऐसे {count} अंतराल एक खंड भरते हैं: {from} ~ {to}',
      id: '{count} celah seperti ini mengisi satu rentang: {from} ~ {to}',
      pt: '{count} lacunas como esta preenchem um intervalo: {from} a {to}',
    },
  },
};
