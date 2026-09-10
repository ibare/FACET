/**
 * hashToBucket — 값을 자리 번호로 바꾼다.
 *
 * @piece 길이도 종류도 제각각인 키가 정해진 개수의 자리 중 하나로 접혀 들어간다는
 * 한 가지만 말하고 멈춘다. 해시 함수가 키를 하나의 정수로 접고, 나머지 연산이
 * 그 정수를 자리 수만큼으로 다시 접는다 — 두 번의 접힘이 전부다.
 *
 * header · metrics · layout 없음 (S-piece). 걸음 간격은 저작 결정이라
 * `initialData.stepMs` 로 선언한다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const hashToBucketFacet: FacetJson = {
  id: 'facet:hashToBucket',
  title: {
    en: 'Folding a key into a bucket',
    ko: '키를 자리로 접기',
    ja: 'キーをバケットへ畳む',
    zh: '把键折进桶里',
    ar: 'طيّ المفتاح إلى سلة',
    es: 'Plegar una clave en un cubo',
    fr: 'Replier une clé dans un seau',
    hi: 'कुंजी को बकेट में मोड़ना',
    id: 'Melipat kunci ke dalam bucket',
    pt: 'Dobrar uma chave num balde',
  },
  description: {
    en: 'A hash function folds any key into one integer, and the remainder folds that integer into one of a fixed number of slots.',
    ko: '해시 함수가 어떤 키든 하나의 정수로 접고, 나머지 연산이 그 정수를 정해진 개수의 자리 중 하나로 다시 접는다.',
    ja: 'ハッシュ関数がどんなキーも一つの整数に畳み、剰余がその整数を決まった数の枠のどれか一つに畳み直す。',
    zh: '哈希函数把任何键折成一个整数，取余再把这个整数折进固定数目的槽位之一。',
    ar: 'دالة التجزئة تطوي أي مفتاح إلى عدد صحيح واحد، وباقي القسمة يطوي ذلك العدد إلى واحدة من خانات عددها ثابت.',
    es: 'Una función hash pliega cualquier clave en un entero, y el resto pliega ese entero en una de un número fijo de casillas.',
    fr: "Une fonction de hachage replie n'importe quelle clé en un entier, et le reste replie cet entier dans l'une des cases, en nombre fixe.",
    hi: 'हैश फलन किसी भी कुंजी को एक पूर्णांक में मोड़ देता है, और शेषफल उस पूर्णांक को तय संख्या के खानों में से एक में मोड़ देता है।',
    id: 'Fungsi hash melipat kunci apa pun menjadi satu bilangan bulat, lalu sisa bagi melipat bilangan itu ke salah satu slot yang jumlahnya tetap.',
    pt: 'Uma função hash dobra qualquer chave num inteiro, e o resto dobra esse inteiro numa de um número fixo de casas.',
  },
  algorithm: 'module:hashToBucket',
  projector: 'module:hashToBucketProjector',
  initialData: {
    type: 'hash-to-bucket',
    // 길이 4 · 3 · 5 · 6. "banana" 는 hashCode 가 음수라 부호 비트를 떨어뜨리는
    // 걸음이 눈에 보인다. 값은 algorithm 이 실제로 계산한다.
    keys: ['kiwi', 'fig', 'apple', 'banana'],
    bucketCount: 8,
    stepMs: 720,
  },
  blocks: {
    stage: { type: 'hash-to-bucket-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.key': {
      en: 'Keys differ in length — "{key}" has {len} characters.',
      ko: '키마다 길이가 다르다 — "{key}" 는 {len} 글자.',
      ja: 'キーは長さがまちまち — "{key}" は {len} 文字。',
      zh: '键的长度各不相同 — "{key}" 有 {len} 个字符。',
      ar: 'المفاتيح تختلف في الطول — "{key}" فيه {len} حرفًا.',
      es: 'Las claves tienen distinta longitud: "{key}" tiene {len} caracteres.',
      fr: 'Les clés ont des longueurs différentes — "{key}" fait {len} caractères.',
      hi: 'कुंजियों की लंबाई अलग-अलग होती है — "{key}" में {len} अक्षर हैं।',
      id: 'Panjang kunci berbeda-beda — "{key}" punya {len} karakter.',
      pt: 'As chaves têm comprimentos diferentes — "{key}" tem {len} caracteres.',
    },
    'caption.fold': {
      en: 'The hash function folds it into one integer: {hash}',
      ko: '해시 함수가 그것을 하나의 정수로 접는다: {hash}',
      ja: 'ハッシュ関数がそれを一つの整数に畳む: {hash}',
      zh: '哈希函数把它折成一个整数：{hash}',
      ar: 'دالة التجزئة تطويه إلى عدد صحيح واحد: {hash}',
      es: 'La función hash lo pliega en un entero: {hash}',
      fr: 'La fonction de hachage la replie en un entier : {hash}',
      hi: 'हैश फलन उसे एक पूर्णांक में मोड़ देता है: {hash}',
      id: 'Fungsi hash melipatnya menjadi satu bilangan bulat: {hash}',
      pt: 'A função hash a dobra num inteiro: {hash}',
    },
    'caption.mask': {
      en: 'Drop the sign bit: {hash} & 0x7FFFFFFF = {masked}',
      ko: '부호 비트를 떨어뜨린다: {hash} & 0x7FFFFFFF = {masked}',
      ja: '符号ビットを落とす: {hash} & 0x7FFFFFFF = {masked}',
      zh: '去掉符号位：{hash} & 0x7FFFFFFF = {masked}',
      ar: 'أسقط بت الإشارة: {hash} & 0x7FFFFFFF = {masked}',
      es: 'Quita el bit de signo: {hash} & 0x7FFFFFFF = {masked}',
      fr: 'On enlève le bit de signe : {hash} & 0x7FFFFFFF = {masked}',
      hi: 'चिह्न बिट हटाएँ: {hash} & 0x7FFFFFFF = {masked}',
      id: 'Buang bit tanda: {hash} & 0x7FFFFFFF = {masked}',
      pt: 'Descarte o bit de sinal: {hash} & 0x7FFFFFFF = {masked}',
    },
    'caption.bucket': {
      en: '{masked} mod {count} = slot {slot}',
      ko: '{masked} mod {count} = {slot}번 자리',
      ja: '{masked} mod {count} = {slot} 番の枠',
      zh: '{masked} mod {count} = 第 {slot} 槽',
      ar: '{masked} mod {count} = الخانة {slot}',
      es: '{masked} mod {count} = casilla {slot}',
      fr: '{masked} mod {count} = case {slot}',
      hi: '{masked} mod {count} = खाना {slot}',
      id: '{masked} mod {count} = slot {slot}',
      pt: '{masked} mod {count} = casa {slot}',
    },
    'caption.done': {
      en: 'Whatever the key, it folds into one of the {count} slots.',
      ko: '어떤 키든 {count}개 자리 중 하나로 접혀 들어간다.',
      ja: 'どんなキーでも、{count} 個の枠のどれか一つに畳まれる。',
      zh: '不管什么键，都会折进这 {count} 个槽位之一。',
      ar: 'أيًّا كان المفتاح، فإنه ينطوي في واحدة من الخانات الـ{count}.',
      es: 'Sea cual sea la clave, se pliega en una de las {count} casillas.',
      fr: "Quelle que soit la clé, elle se replie dans l'une des {count} cases.",
      hi: 'कुंजी कोई भी हो, वह इन {count} खानों में से एक में मुड़ जाती है।',
      id: 'Apa pun kuncinya, ia terlipat ke salah satu dari {count} slot.',
      pt: 'Seja qual for a chave, ela se dobra numa das {count} casas.',
    },
  },
};
