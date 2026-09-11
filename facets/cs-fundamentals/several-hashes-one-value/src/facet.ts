/**
 * 한 값이 해시 수만큼의 자리를 켠다.
 *
 * @piece 블룸 필터에 값을 넣는 일. 한 값이 갈래 셋으로 갈라져 비트 배열의 서로
 * 다른 칸 셋을 켠다는 주장 하나에만 답하고 멈춘다. 질의도 지우기도 이 조각의
 * 일이 아니다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const severalHashesOneValueFacet: FacetJson = {
  id: 'facet:severalHashesOneValue',
  title: {
    en: 'One value, several hashes',
    ko: '한 값, 해시 여럿',
    ja: '1 つの値と複数のハッシュ',
    zh: '一个值，多个哈希',
    ar: 'قيمة واحدة، عدة دوال تجزئة',
    es: 'Un valor, varios hashes',
    fr: 'Une valeur, plusieurs hachages',
    hi: 'एक मान, कई हैश',
    id: 'Satu nilai, beberapa hash',
    pt: 'Um valor, vários hashes',
  },
  description: {
    en: 'Inserting into a Bloom filter: one value splits into three hash branches and lights three slots in the bit array.',
    ko: '블룸 필터에 값을 넣는 일 — 한 값이 해시 갈래 셋으로 갈라져 비트 배열의 자리 셋을 켠다.',
    ja: 'ブルームフィルタへの挿入 — 1 つの値が 3 つのハッシュに分かれ、ビット配列の 3 か所を点灯させる。',
    zh: '向布隆过滤器插入值：一个值分成三条哈希分支，点亮位数组中的三个位置。',
    ar: 'الإدراج في مرشّح بلوم: قيمة واحدة تتفرّع إلى ثلاث دوال تجزئة وتضيء ثلاثة مواضع في مصفوفة البتات.',
    es: 'Insertar en un filtro de Bloom: un valor se divide en tres ramas de hash y enciende tres posiciones del arreglo de bits.',
    fr: 'Insertion dans un filtre de Bloom : une valeur se divise en trois branches de hachage et allume trois positions du tableau de bits.',
    hi: 'ब्लूम फ़िल्टर में सम्मिलन: एक मान तीन हैश शाखाओं में बँटकर बिट सरणी के तीन स्थान जलाता है।',
    id: 'Menyisipkan ke filter Bloom: satu nilai bercabang menjadi tiga hash dan menyalakan tiga posisi pada larik bit.',
    pt: 'Inserção em um filtro de Bloom: um valor se divide em três ramos de hash e acende três posições no arranjo de bits.',
  },
  algorithm: 'module:severalHashesOneValue',
  projector: 'module:severalHashesOneValueProjector',
  initialData: {
    type: 'several-hashes-one-value',
    bitCount: 16,
    hashCount: 3,
    keys: ['fig', 'kiwi', 'mango'],
    stepMs: 620,
  },
  blocks: {
    stage: { type: 'several-hashes-one-value-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.key': {
      en: 'Inserting {key}. Two base hashes set the slots.',
      ko: '넣을 값: {key}. 바탕 해시 둘이 자리를 정한다.',
      ja: '挿入する値: {key}。2 つの基本ハッシュが位置を決める。',
      zh: '插入的值：{key}。两个基础哈希决定位置。',
      ar: 'القيمة المُدرجة: {key}. دالتا تجزئة أساسيتان تحددان المواضع.',
      es: 'Valor a insertar: {key}. Dos hashes base fijan las posiciones.',
      fr: 'Valeur insérée : {key}. Deux hachages de base fixent les positions.',
      hi: 'डाला जा रहा मान: {key}. दो आधार हैश स्थान तय करते हैं।',
      id: 'Nilai yang dimasukkan: {key}. Dua hash dasar menentukan posisi.',
      pt: 'Valor inserido: {key}. Dois hashes base definem as posições.',
    },
    'caption.split': {
      en: 'One value splits. Branches: {k}. Slots lit: {slots}.',
      ko: '한 값이 갈라진다. 갈래는 {k}. 켜는 자리: {slots}.',
      ja: '1 つの値が分かれる。枝は {k}。点灯する位置: {slots}。',
      zh: '一个值分成多路。分支：{k}。点亮的位置：{slots}。',
      ar: 'قيمة واحدة تتفرّع. عدد الفروع: {k}. المواضع المضاءة: {slots}.',
      es: 'Un valor se divide. Ramas: {k}. Posiciones encendidas: {slots}.',
      fr: 'Une valeur se divise. Branches : {k}. Positions allumées : {slots}.',
      hi: 'एक मान बँट जाता है। शाखाएँ: {k}. जलने वाले स्थान: {slots}.',
      id: 'Satu nilai bercabang. Cabang: {k}. Posisi yang menyala: {slots}.',
      pt: 'Um valor se divide. Ramos: {k}. Posições acesas: {slots}.',
    },
    'caption.shared': {
      en: 'Slot already at 1: {slot}. It stays 1.',
      ko: '이미 1 이던 자리: {slot}. 1 에서 1 로 갈 뿐이다.',
      ja: 'すでに 1 だった位置: {slot}。1 のまま変わらない。',
      zh: '已经是 1 的位置：{slot}。它仍然是 1。',
      ar: 'موضع كان بالفعل عند 1: {slot}. يبقى 1.',
      es: 'Posición que ya estaba en 1: {slot}. Sigue en 1.',
      fr: 'Position déjà à 1 : {slot}. Elle reste à 1.',
      hi: 'पहले से 1 वाला स्थान: {slot}. वह 1 ही रहता है।',
      id: 'Posisi yang sudah 1: {slot}. Tetap 1.',
      pt: 'Posição que já estava em 1: {slot}. Continua 1.',
    },
    'caption.done': {
      en: 'Bits on: {on} of {total}.',
      ko: '켜진 자리는 {on}/{total}.',
      ja: '点灯した位置は {on}/{total}。',
      zh: '点亮的位置为 {on}/{total}。',
      ar: 'المواضع المضاءة: {on} من {total}.',
      es: 'Posiciones encendidas: {on} de {total}.',
      fr: 'Positions allumées : {on} sur {total}.',
      hi: 'जले हुए स्थान: {on}/{total}.',
      id: 'Posisi menyala: {on} dari {total}.',
      pt: 'Posições acesas: {on} de {total}.',
    },
    'caption.rewind': {
      en: 'Back to an empty array.',
      ko: '빈 배열로 되돌아간다.',
      ja: '空の配列に戻る。',
      zh: '回到空数组。',
      ar: 'العودة إلى مصفوفة فارغة.',
      es: 'Volvemos al arreglo vacio.',
      fr: 'Retour au tableau vide.',
      hi: 'खाली सरणी पर वापस।',
      id: 'Kembali ke larik kosong.',
      pt: 'De volta ao arranjo vazio.',
    },
  },
};
