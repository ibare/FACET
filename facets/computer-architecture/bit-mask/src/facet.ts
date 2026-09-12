/**
 * 비트 마스크 조각.
 *
 * @piece 필요한 자리만 남긴다 — 구멍 뚫린 덮개를 씌우면 구멍 아래 자리만 남고
 * 나머지는 0 으로 덮인다.
 *
 * 1차 데이터는 값 하나와 마스크 둘뿐이다. AND 결과 · 10진값 · 16진 표기는
 * algorithm 과 stage 가 그 자리에서 셈한다 — 화면에 뜰 값을 선언에 적어 두면
 * 데이터를 바꿀 때 둘이 어긋난다 (S-piece).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const bitMaskFacet: FacetJson = {
  id: 'facet:bitMask',
  title: {
    en: 'Bit Mask',
    ko: '비트 마스크',
    ja: 'ビットマスク',
    zh: '位掩码',
    ar: 'قناع البتات',
    es: 'Máscara de bits',
    fr: 'Masque de bits',
    hi: 'बिट मास्क',
    id: 'Bit Mask',
    pt: 'Máscara de bits',
  },
  description: {
    en: 'A mask is a punched cover — only the bits under its holes come through; the rest are covered with 0.',
    ko: '마스크는 구멍 뚫린 덮개다 — 구멍 아래 자리만 통과하고 나머지는 0 으로 덮인다.',
    ja: 'マスクは穴の開いた覆いだ。穴の下のビットだけが通り、残りは 0 で覆われる。',
    zh: '掩码是一块打了孔的盖子——只有孔下面的位能透过来，其余的都被 0 盖住。',
    ar: 'القناع غطاء مثقوب — تمرّ البتات الواقعة تحت الثقوب فقط، ويُغطّى الباقي بالصفر.',
    es: 'Una máscara es una tapa perforada: solo pasan los bits bajo sus agujeros; el resto queda cubierto con 0.',
    fr: "Un masque est un couvercle percé : seuls les bits sous les trous passent, les autres sont couverts de 0.",
    hi: 'मास्क एक छेदों वाला ढक्कन है — केवल छेदों के नीचे के बिट ही दिखते हैं, बाकी 0 से ढक जाते हैं।',
    id: 'Mask adalah penutup berlubang — hanya bit di bawah lubang yang lolos, sisanya tertutup 0.',
    pt: 'Uma máscara é uma tampa furada: só passam os bits sob os furos; o resto fica coberto com 0.',
  },
  algorithm: 'module:bitMask',
  projector: 'module:bitMaskProjector',
  initialData: {
    type: 'bit-mask',
    /** 10101011 — 171, 16진 AB. */
    value: 0b10101011,
    bitCount: 8,
    /** 아래 넉 자리만(0F), 그다음 위 넉 자리만(F0). */
    masks: [0b00001111, 0b11110000],
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'bit-mask-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.mask': {
      en: 'The cover is punched: 1 is a hole, 0 is a lid.',
      ko: '덮개에 구멍이 뚫려 있다 — 1 은 구멍, 0 은 가림막.',
      ja: '覆いには穴が開いている。1 は穴、0 はふただ。',
      zh: '盖子上打了孔：1 是孔，0 是挡板。',
      ar: 'الغطاء مثقوب: كل 1 ثقب، وكل 0 ساتر.',
      es: 'La tapa está perforada: 1 es un agujero, 0 es una lámina.',
      fr: 'Le couvercle est percé : 1 est un trou, 0 est un cache.',
      hi: 'ढक्कन में छेद हैं: 1 यानी छेद, 0 यानी ढक्कन।',
      id: 'Penutupnya berlubang: 1 adalah lubang, 0 adalah tutup.',
      pt: 'A tampa é furada: 1 é um furo, 0 é uma cobertura.',
    },
    'caption.applied': {
      en: 'Only the bits under the holes come through — all eight positions decide at once.',
      ko: '구멍 아래 자리만 통과한다 — 여덟 자리가 한꺼번에 결정된다.',
      ja: '穴の下のビットだけが通る。八つの位置が同時に決まる。',
      zh: '只有孔下的位能透过来——八个位置同时决定。',
      ar: 'تمرّ البتات الواقعة تحت الثقوب فقط — وتُحسم المواضع الثمانية دفعة واحدة.',
      es: 'Solo pasan los bits bajo los agujeros: las ocho posiciones se deciden a la vez.',
      fr: "Seuls les bits sous les trous passent : les huit positions se décident d'un coup.",
      hi: 'केवल छेदों के नीचे के बिट दिखते हैं — आठों स्थान एक साथ तय होते हैं।',
      id: 'Hanya bit di bawah lubang yang lolos — kedelapan posisi diputuskan sekaligus.',
      pt: 'Só passam os bits sob os furos — as oito posições decidem de uma vez.',
    },
    'caption.lifted': {
      en: 'Take the cover off and the original value is untouched.',
      ko: '덮개를 걷으면 원래 값은 그대로다.',
      ja: '覆いを外せば、元の値はそのままだ。',
      zh: '把盖子拿开，原来的值分毫未动。',
      ar: 'ارفع الغطاء تجد القيمة الأصلية كما هي.',
      es: 'Quita la tapa y el valor original sigue intacto.',
      fr: "Retirez le couvercle : la valeur d'origine est intacte.",
      hi: 'ढक्कन हटाओ तो मूल मान ज्यों का त्यों रहता है।',
      id: 'Angkat penutupnya, nilai aslinya tetap utuh.',
      pt: 'Tire a tampa e o valor original continua intacto.',
    },
    'caption.done': {
      en: 'A mask keeps just the positions you need.',
      ko: '마스크는 필요한 자리만 남긴다.',
      ja: 'マスクは必要な位置だけを残す。',
      zh: '掩码只留下你需要的那些位。',
      ar: 'القناع يُبقي المواضع التي تحتاجها فقط.',
      es: 'Una máscara conserva solo las posiciones que necesitas.',
      fr: "Un masque ne garde que les positions dont vous avez besoin.",
      hi: 'मास्क केवल वही स्थान बचाता है जिनकी ज़रूरत है।',
      id: 'Mask hanya menyisakan posisi yang kamu perlukan.',
      pt: 'Uma máscara guarda apenas as posições de que você precisa.',
    },
    'label.read': {
      en: 'reads {dec} (0x{hex})',
      ko: '읽은 값: {dec} (0x{hex})',
      ja: '読める値: {dec} (0x{hex})',
      zh: '读出的值：{dec}（0x{hex}）',
      ar: 'القيمة المقروءة: {dec} (0x{hex})',
      es: 'se lee {dec} (0x{hex})',
      fr: 'on lit {dec} (0x{hex})',
      hi: 'पढ़ा गया मान: {dec} (0x{hex})',
      id: 'terbaca {dec} (0x{hex})',
      pt: 'lê-se {dec} (0x{hex})',
    },
  },
};
