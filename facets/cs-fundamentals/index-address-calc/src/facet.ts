/**
 * indexAddressCalc — 번호로 자리를 셈한다.
 *
 * @piece 한 질문에만 답한다: "번호로 자리를 어떻게 셈하는가."
 *
 * 답은 곱셈 한 번과 덧셈 한 번이다. 칸을 훑지 않으므로 번호가 멀어도 셈은
 * 길어지지 않는다 — 그래서 두 번째 번호를 한 번 더 넣어 같은 길이를 보인다.
 * 제목은 이 조각이 놓일 문단이 준다 (title-block 없음). 셀 것이 없으므로
 * metrics 도 없다 (S-piece).
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const indexAddressCalcFacet: FacetJson = {
  id: 'facet:indexAddressCalc',
  title: {
    en: 'Index to address',
    ko: '번호에서 주소로',
    ja: '添字からアドレスへ',
    zh: '从下标到地址',
    ar: 'من الفهرس إلى العنوان',
    es: 'Del índice a la dirección',
    fr: "De l'indice à l'adresse",
    hi: 'सूचकांक से पते तक',
    id: 'Dari indeks ke alamat',
    pt: 'Do índice ao endereço',
  },
  description: {
    en: 'One multiply and one add turn an index into an address.',
    ko: '번호는 곱셈 한 번과 덧셈 한 번을 거쳐 주소가 된다.',
    ja: '掛け算ひとつと足し算ひとつで、添字がアドレスになる。',
    zh: '一次乘法和一次加法，下标就变成地址。',
    ar: 'ضربة واحدة وجمعة واحدة تحوّلان الفهرس إلى عنوان.',
    es: 'Una multiplicación y una suma convierten un índice en una dirección.',
    fr: 'Une multiplication et une addition transforment un indice en adresse.',
    hi: 'एक गुणा और एक जोड़ — सूचकांक पता बन जाता है।',
    id: 'Satu perkalian dan satu penjumlahan mengubah indeks menjadi alamat.',
    pt: 'Uma multiplicação e uma soma transformam um índice em endereço.',
  },
  algorithm: 'module:indexAddressCalc',
  projector: 'module:indexAddressCalcProjector',
  initialData: {
    type: 'index-address-calc',
    /** 0x1000 — 배열이 할당된 자리. 재지 않고 선언한 값이며 각주가 그렇게 밝힌다. */
    base: 4096,
    /** int32 이므로 4바이트. 크기는 자료형이 정한다. */
    unit: 4,
    values: [42, 7, 13, 99, 5, 61],
    /** 0x1000 + 3 × 4 = 0x100C → 99. */
    probeA: 3,
    /** 0x1000 + 5 × 4 = 0x1014 → 61. 멀어도 셈은 그대로 한 번이다. */
    probeB: 5,
    stepMs: 520,
  },
  blocks: {
    stage: { type: 'address-calc-stage' },
    controls: { type: 'control-bar', controls: [CONTROL.replay, CONTROL.advance] },
  },
  messages: {
    'caption.memory': {
      en: 'The array sits in memory: {unit} bytes per slot from {base}.',
      ko: '배열은 {base} 부터 {unit} 바이트씩 이어 놓인다.',
      ja: '配列はメモリ上にある — {base} から 1 枠 {unit} バイトずつ。',
      zh: '数组就在内存里：从 {base} 起，每格 {unit} 字节。',
      ar: 'المصفوفة في الذاكرة: {unit} بايت لكل خانة ابتداءً من {base}.',
      es: 'El arreglo está en memoria: {unit} bytes por casilla desde {base}.',
      fr: 'Le tableau est en mémoire : {unit} octets par case à partir de {base}.',
      hi: 'सरणी मेमोरी में है: {base} से हर खाना {unit} बाइट।',
      id: 'Array ada di memori: {unit} byte per petak mulai dari {base}.',
      pt: 'O arranjo está na memória: {unit} bytes por casa a partir de {base}.',
    },
    'caption.ask': {
      en: 'Where is arr[{index}]?',
      ko: 'arr[{index}] 은 어디에 있나.',
      ja: 'arr[{index}] はどこにあるか。',
      zh: 'arr[{index}] 在哪里？',
      ar: 'أين arr[{index}]؟',
      es: '¿Dónde está arr[{index}]?',
      fr: 'Où se trouve arr[{index}] ?',
      hi: 'arr[{index}] कहाँ है?',
      id: 'Di mana arr[{index}]?',
      pt: 'Onde está arr[{index}]?',
    },
    'caption.scale': {
      en: 'Index times element size: {index} × {unit} = {offset}.',
      ko: '번호 × 원소 크기: {index} × {unit} = {offset}.',
      ja: '添字 × 要素の大きさ: {index} × {unit} = {offset}。',
      zh: '下标乘元素大小：{index} × {unit} = {offset}。',
      ar: 'الفهرس × حجم العنصر: {index} × {unit} = {offset}.',
      es: 'Índice por tamaño de elemento: {index} × {unit} = {offset}.',
      fr: "Indice × taille d'un élément : {index} × {unit} = {offset}.",
      hi: 'सूचकांक × तत्व का आकार: {index} × {unit} = {offset}।',
      id: 'Indeks kali ukuran elemen: {index} × {unit} = {offset}.',
      pt: 'Índice vezes o tamanho do elemento: {index} × {unit} = {offset}.',
    },
    'caption.add': {
      en: 'Add the base address: {base} + {offset} = {addr}.',
      ko: '기준 주소를 더한다: {base} + {offset} = {addr}.',
      ja: '基準アドレスを足す: {base} + {offset} = {addr}。',
      zh: '加上基地址：{base} + {offset} = {addr}。',
      ar: 'أضف العنوان الأساسي: {base} + {offset} = {addr}.',
      es: 'Suma la dirección base: {base} + {offset} = {addr}.',
      fr: "Ajouter l'adresse de base : {base} + {offset} = {addr}.",
      hi: 'आधार पता जोड़ें: {base} + {offset} = {addr}।',
      id: 'Tambahkan alamat basis: {base} + {offset} = {addr}.',
      pt: 'Some o endereço base: {base} + {offset} = {addr}.',
    },
    'caption.reach': {
      en: 'One multiply, one add: {addr} holds arr[{index}] = {value}.',
      ko: '곱셈 한 번, 덧셈 한 번 — {addr} 에 arr[{index}] = {value}.',
      ja: '掛け算ひとつ、足し算ひとつ — {addr} に arr[{index}] = {value}。',
      zh: '一次乘法，一次加法 — {addr} 里放着 arr[{index}] = {value}。',
      ar: 'ضربة واحدة وجمعة واحدة: {addr} يحمل arr[{index}] = {value}.',
      es: 'Una multiplicación, una suma: en {addr} está arr[{index}] = {value}.',
      fr: 'Une multiplication, une addition : {addr} contient arr[{index}] = {value}.',
      hi: 'एक गुणा, एक जोड़: {addr} पर arr[{index}] = {value}।',
      id: 'Satu perkalian, satu penjumlahan: {addr} berisi arr[{index}] = {value}.',
      pt: 'Uma multiplicação, uma soma: {addr} guarda arr[{index}] = {value}.',
    },
    'caption.done': {
      en: 'Any index, the same one calculation. Nothing in between is read.',
      ko: '어느 번호를 넣어도 셈은 똑같이 한 번. 사이의 칸은 읽지 않는다.',
      ja: 'どの添字でも計算はいつも一度きり。あいだの枠は読まない。',
      zh: '无论哪个下标，计算都只有一次。中间的格子一个也不读。',
      ar: 'أي فهرس كان، الحساب نفسه مرة واحدة. ولا يُقرأ ما بينهما.',
      es: 'Sea cual sea el índice, el mismo cálculo único. No se lee nada de por medio.',
      fr: "Quel que soit l'indice, le même calcul unique. Rien entre les deux n'est lu.",
      hi: 'कोई भी सूचकांक हो, गणना वही एक। बीच का कुछ भी नहीं पढ़ा जाता।',
      id: 'Indeks mana pun, hitungannya tetap satu kali. Yang di antaranya tidak dibaca.',
      pt: 'Qualquer índice, o mesmo cálculo único. Nada no meio é lido.',
    },
  },
};
