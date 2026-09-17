/**
 * signedWraparound facet JSON 선언.
 *
 * @piece 한 질문에 답하고 멈추는 조각 — "가장 큰 수 다음은 무엇인가".
 *
 * 진행 모델은 reactive (mechanismKind 는 index.ts 의 registerAlgorithm 에서 준다).
 * 선언에 두는 것은 구조와 읽을 시간뿐이다 — 비트 폭 · 시작값 · 걸음 간격.
 * 양 끝 값도 비트열도 algorithm 이 셈하고, 자리는 stage 가 캔버스에서 역산한다
 * (S-piece).
 *
 * 화면은 걸음마다 오는 이벤트를 **장면(Scene)** 으로 이어 붙여 만든다. 어느
 * 걸음의 화면이든 셈으로 얻으므로 띠(timeline)를 단다 — 장면 방식과 띠는 한
 * 몸이다 (S-scene · S-piece).
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const signedWraparoundFacet: FacetJson = {
  id: 'facet:signedWraparound',
  title: {
    en: 'Two ends of the number range',
    ko: '수의 끝과 끝',
    ja: '数の端と端',
    zh: '数的两端',
    ar: 'طرفا مدى الأعداد',
    es: 'Los dos extremos del rango',
    fr: 'Les deux bouts de la plage',
    hi: 'संख्या परिसर के दोनों सिरे',
    id: 'Dua ujung rentang bilangan',
    pt: 'As duas pontas do intervalo',
  },
  description: {
    en: 'In 8-bit signed arithmetic the largest value is followed by the smallest — the range is a ring, not a line',
    ko: '8비트 부호 있는 수에서는 가장 큰 수 다음이 가장 작은 수다 — 직선이 아니라 고리다',
    ja: '8ビット符号つきでは、最大の数の次が最小の数になる — 直線ではなく輪だ',
    zh: '在 8 位有符号运算里，最大的数之后就是最小的数 — 它是环，不是直线',
    ar: 'في الحساب ذي الإشارة بثمانية بتات يأتي بعد أكبر عدد أصغرُ عدد — المدى حلقة لا خط',
    es: 'En aritmética con signo de 8 bits, al mayor valor le sigue el menor: el rango es un anillo, no una recta',
    fr: 'En arithmétique signée sur 8 bits, la plus grande valeur est suivie de la plus petite — la plage est un anneau, pas une droite',
    hi: '8-बिट सचिह्न अंकगणित में सबसे बड़े मान के बाद सबसे छोटा आता है — परिसर एक वलय है, रेखा नहीं',
    id: 'Dalam aritmetika bertanda 8 bit, nilai terbesar diikuti nilai terkecil — rentangnya cincin, bukan garis',
    pt: 'Na aritmética com sinal de 8 bits, o maior valor é seguido pelo menor — o intervalo é um anel, não uma reta',
  },
  algorithm: 'module:signedWraparound',
  scene: 'module:signedWraparoundScene',
  initialData: {
    type: 'signed-wraparound',
    bitWidth: 8,
    start: 125,
    stepMs: 700,
  },
  messages: {
    'caption.step': {
      en: 'Add one — the marker steps one cell right: {to}',
      ko: '1 더하면 한 칸 오른쪽 — 지금 값은 {to}',
      ja: '1 を足すと 1 マス右へ — 今の値は {to}',
      zh: '加一就向右挪一格 — 当前值为 {to}',
      ar: 'أضف واحدًا فتنتقل العلامة خانة إلى اليمين: {to}',
      es: 'Suma uno y la marca avanza una casilla a la derecha: {to}',
      fr: "Ajoutez un et le repère avance d'une case vers la droite : {to}",
      hi: 'एक जोड़ें — निशान एक खाना दाईं ओर बढ़ता है: {to}',
      id: 'Tambah satu — penanda bergeser satu sel ke kanan: {to}',
      pt: 'Some um — a marca avança uma casa à direita: {to}',
    },
    'caption.atMax': {
      en: 'The right end — the largest signed value {bits} bits hold is {to}',
      ko: '오른쪽 끝에 닿았다 — {bits}비트가 담는 가장 큰 수는 {to}',
      ja: '右端に届いた — {bits}ビットが表せる最大の数は {to}',
      zh: '到了右端 — {bits} 位能表示的最大数是 {to}',
      ar: 'بلغنا الطرف الأيمن — أكبر عدد تحمله {bits} بتات هو {to}',
      es: 'Extremo derecho: el mayor valor con signo que cabe en {bits} bits es {to}',
      fr: 'Bout droit — la plus grande valeur signée sur {bits} bits est {to}',
      hi: 'दायाँ सिरा — {bits} बिट में समाने वाला सबसे बड़ा सचिह्न मान है {to}',
      id: 'Ujung kanan — nilai bertanda terbesar yang muat dalam {bits} bit adalah {to}',
      pt: 'Ponta direita — o maior valor com sinal que cabe em {bits} bits é {to}',
    },
    'caption.wrap': {
      en: 'One more — the carry runs into the sign bit, and past the right end the marker comes out at the left: {to}',
      ko: '한 번 더 — 자리올림이 부호 자리까지 번지고, 오른쪽 끝을 지나 왼쪽 끝에서 나온 값은 {to}',
      ja: 'もう一度 — 桁上がりが符号ビットまで届き、右端を越えて左端から現れた値は {to}',
      zh: '再加一 — 进位一路蔓延到符号位，越过右端后从左端冒出来：{to}',
      ar: 'مرة أخرى — يمتد الحمل حتى بتة الإشارة، وبعد الطرف الأيمن تظهر العلامة عند الأيسر: {to}',
      es: 'Una vez más: el acarreo llega al bit de signo y, tras el extremo derecho, la marca sale por la izquierda: {to}',
      fr: 'Encore un — la retenue atteint le bit de signe et, passé le bout droit, le repère ressort à gauche : {to}',
      hi: 'एक बार और — हासिल चिह्न बिट तक फैलता है, और दायाँ सिरा पार करते ही निशान बाएँ से निकलता है: {to}',
      id: 'Sekali lagi — simpanan merambat sampai bit tanda, dan setelah ujung kanan penanda muncul di kiri: {to}',
      pt: 'Mais um — o transporte chega ao bit de sinal e, passada a ponta direita, a marca sai pela esquerda: {to}',
    },
    'caption.afterWrap': {
      en: 'From here it walks right again: {to}',
      ko: '여기서부터 다시 오른쪽으로 — 지금 값은 {to}',
      ja: 'ここからまた右へ — 今の値は {to}',
      zh: '从这里又往右走 — 当前值为 {to}',
      ar: 'ومن هنا تمضي يمينًا من جديد: {to}',
      es: 'Desde aquí vuelve a caminar hacia la derecha: {to}',
      fr: "D'ici, il repart vers la droite : {to}",
      hi: 'यहाँ से फिर दाईं ओर चलता है: {to}',
      id: 'Dari sini ia berjalan ke kanan lagi: {to}',
      pt: 'Daqui ele volta a andar para a direita: {to}',
    },
    'caption.conclusion': {
      en: 'Not a line but a ring — the largest value is followed by the smallest',
      ko: '직선이 아니라 고리였다 — 가장 큰 수 바로 다음이 가장 작은 수',
      ja: '直線ではなく輪だった — 最大の数のすぐ次が最小の数',
      zh: '不是直线而是环 — 最大的数之后紧跟着最小的数',
      ar: 'ليس خطًا بل حلقة — يلي أكبرَ عدد أصغرُ عدد',
      es: 'No es una recta sino un anillo: al mayor valor le sigue el menor',
      fr: 'Pas une droite mais un anneau — la plus grande valeur est suivie de la plus petite',
      hi: 'रेखा नहीं, वलय — सबसे बड़े मान के ठीक बाद सबसे छोटा',
      id: 'Bukan garis melainkan cincin — nilai terbesar diikuti yang terkecil',
      pt: 'Não é uma reta, é um anel — ao maior valor segue-se o menor',
    },
    'label.smallest': {
      en: 'smallest',
      ko: '가장 작은 수',
      ja: '最小',
      zh: '最小',
      ar: 'الأصغر',
      es: 'el menor',
      fr: 'le plus petit',
      hi: 'सबसे छोटा',
      id: 'terkecil',
      pt: 'o menor',
    },
    'label.largest': {
      en: 'largest',
      ko: '가장 큰 수',
      ja: '最大',
      zh: '最大',
      ar: 'الأكبر',
      es: 'el mayor',
      fr: 'le plus grand',
      hi: 'सबसे बड़ा',
      id: 'terbesar',
      pt: 'o maior',
    },
  },
  blocks: {
    stage: { type: 'signed-wraparound-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
};
