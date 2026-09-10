/**
 * digit-by-digit facet 선언.
 *
 * @piece 조각(piece) — "한 자리만 봐서 어떻게 전체가 정렬되나" 하나에만 답한다.
 *
 * header 도 metrics 도 layout 도 두지 않는다 (S-piece). 화면에 뜨는 문안은 전부
 * 아래 messages 에 있고 코드에는 키만 남는다 (C10).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const digitByDigitFacet: FacetJson = {
  id: 'facet:digitByDigit',
  title: {
    en: 'Digit-by-digit sort',
    ko: '자릿수 정렬',
    ja: '桁ごとの整列',
    zh: '逐位排序',
    ar: 'فرز رقمًا رقمًا',
    es: 'Ordenación dígito a dígito',
    fr: 'Tri chiffre par chiffre',
    hi: 'अंक-दर-अंक छँटाई',
    id: 'Pengurutan digit demi digit',
    pt: 'Ordenação dígito a dígito',
  },
  description: {
    en: 'One digit at a time, lowest place first — and the whole row ends up sorted.',
    ko: '낮은 자리부터 한 자리씩만 본다. 그런데 마치면 줄 전체가 서 있다.',
    ja: '下の位から一桁ずつ見るだけ。それで列全体が並ぶ。',
    zh: '从最低位起，一次只看一位 — 整排却排好了序。',
    ar: 'رقم واحد في كل مرة، بدءًا من أدنى منزلة — وينتهي الصف كله مرتّبًا.',
    es: 'Un dígito por vez, empezando por la unidad: y toda la fila acaba ordenada.',
    fr: 'Un chiffre à la fois, en partant des unités — et toute la rangée finit triée.',
    hi: 'एक बार में एक अंक, सबसे नीचे के स्थान से — और पूरी पंक्ति क्रम में आ जाती है।',
    id: 'Satu digit sekali jalan, mulai dari satuan — dan seluruh barisnya jadi terurut.',
    pt: 'Um dígito de cada vez, a começar pelas unidades — e toda a fila acaba ordenada.',
  },
  algorithm: 'module:digitByDigit',
  projector: 'module:digitByDigitProjector',
  initialData: {
    type: 'digit-by-digit',
    values: [170, 45, 75, 90],
    // 걸음 사이에 두는 읽을 시간. stage 의 이동 애니메이션이 이 위에 더해진다.
    stepMs: 800,
  },
  blocks: {
    stage: { type: 'digit-by-digit-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.start': {
      en: '{count} numbers, out of order — and not one of them gets compared.',
      ko: '수 {count}개가 뒤죽박죽 — 그리고 서로 견주는 일은 한 번도 없다.',
      ja: '{count} 個の数がばらばら — そして比べることは一度もない。',
      zh: '{count} 个数乱序 — 而且一次比较也不做。',
      ar: '{count} أعداد غير مرتّبة — ولن يُقارَن أي منها.',
      es: '{count} números desordenados: y ninguno se compara con otro.',
      fr: '{count} nombres en désordre — et pas un seul ne sera comparé.',
      hi: '{count} संख्याएँ बेतरतीब — और इनमें कोई तुलना होती ही नहीं।',
      id: '{count} bilangan tak berurutan — dan tak satu pun dibandingkan.',
      pt: '{count} números fora de ordem — e nenhum deles é comparado.',
    },
    'caption.focus': {
      en: 'Pass {round} of {total} — only the {place}s digit is read.',
      ko: '{total}번 중 {round}번째 라운드 — {place}의 자리만 읽는다.',
      ja: '{total} 回中 {round} 回目 — {place} の位だけを読む。',
      zh: '第 {round} 轮，共 {total} 轮 — 只读 {place} 位。',
      ar: 'الجولة {round} من {total} — تُقرأ منزلة {place} فقط.',
      es: 'Pasada {round} de {total}: solo se lee el dígito de las {place}.',
      fr: 'Passe {round} sur {total} — seul le chiffre des {place} est lu.',
      hi: '{total} में से {round} चक्र — केवल {place} का अंक पढ़ा जाता है।',
      id: 'Putaran {round} dari {total} — hanya digit {place} yang dibaca.',
      pt: 'Passagem {round} de {total} — lê-se apenas o dígito das {place}.',
    },
    'caption.scatter': {
      en: 'Each number drops into the bin its {place}s digit names.',
      ko: '각 수가 {place}의 자리 숫자가 가리키는 통으로 내려간다.',
      ja: '各数が {place} の位の数字が指す箱へ落ちる。',
      zh: '每个数落进它 {place} 位数字所指的桶。',
      ar: 'يهبط كل عدد في السلة التي يشير إليها رقم منزلة {place}.',
      es: 'Cada número cae en el cubo que indica su dígito de las {place}.',
      fr: 'Chaque nombre tombe dans le seau que désigne son chiffre des {place}.',
      hi: 'हर संख्या उस डिब्बे में गिरती है जिसे उसका {place} का अंक बताता है।',
      id: 'Tiap bilangan jatuh ke wadah yang ditunjuk digit {place}-nya.',
      pt: 'Cada número cai no balde que o seu dígito das {place} indica.',
    },
    'caption.gather': {
      en: 'Bins are read 0 to 9; inside a bin the earlier order is kept.',
      ko: '통을 0부터 9까지 읽어 올린다. 한 통 안에서는 앞 순서를 그대로 지킨다.',
      ja: '箱を 0 から 9 まで読み上げる。箱の中では前の順を保つ。',
      zh: '从 0 到 9 依次读桶；同一桶内保持原来的先后。',
      ar: 'تُقرأ السلال من 0 إلى 9، وداخل السلة يُحفظ الترتيب السابق.',
      es: 'Los cubos se leen del 0 al 9; dentro de cada uno se conserva el orden previo.',
      fr: "Les seaux sont lus de 0 à 9 ; dans un seau, l'ordre précédent est conservé.",
      hi: 'डिब्बे 0 से 9 तक पढ़े जाते हैं; एक डिब्बे के भीतर पहले का क्रम बना रहता है।',
      id: 'Wadah dibaca dari 0 sampai 9; di dalam satu wadah urutan sebelumnya dipertahankan.',
      pt: 'Os baldes são lidos de 0 a 9; dentro de um balde mantém-se a ordem anterior.',
    },
    'caption.done': {
      en: '{rounds} passes, zero comparisons — the row is in order.',
      ko: '라운드 {rounds}회, 견줌 0회 — 줄이 다 섰다.',
      ja: '{rounds} 巡、比較 0 回 — 列が並んだ。',
      zh: '{rounds} 轮，零次比较 — 整排已然有序。',
      ar: '{rounds} جولات، صفر مقارنات — الصف مرتّب.',
      es: '{rounds} pasadas, cero comparaciones: la fila está ordenada.',
      fr: '{rounds} passes, zéro comparaison — la rangée est triée.',
      hi: '{rounds} चक्र, शून्य तुलनाएँ — पंक्ति क्रम में है।',
      id: '{rounds} putaran, nol perbandingan — barisnya sudah urut.',
      pt: '{rounds} passagens, zero comparações — a fila está ordenada.',
    },
    'label.placeTag': {
      en: '{place}s place',
      ko: '{place}의 자리',
      ja: '{place} の位',
      zh: '{place} 位',
      ar: 'منزلة {place}',
      es: 'lugar de las {place}',
      fr: 'rang des {place}',
      hi: '{place} का स्थान',
      id: 'tempat {place}',
      pt: 'casa das {place}',
    },
  },
};
