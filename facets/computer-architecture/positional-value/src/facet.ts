/**
 * 자리값과 진법 — `@piece`
 *
 * 한 수가 켜진 자리들의 합으로 쪼개지고, 같은 비트를 셋씩·넷씩 다르게 끊으면
 * 밑이 바뀐다. 그래도 길이는 그대로다 — 같은 수이기 때문이다.
 *
 * 조각이므로 머리말도, 메트릭도, 배치 선언도 두지 않는다 (S-piece). 그림의
 * 좌표는 stage 가 캔버스에서 역산한다. 여기 두는 것은 구조뿐이다 — 어떤 수를
 * 몇 자리로 적는가, 그리고 읽을 시간을 얼마나 주는가.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const positionalValueFacet: FacetJson = {
  id: 'facet:positionalValue',

  title: {
    en: 'Place value and base',
    ko: '자리값과 진법',
    ja: '位取りと基数',
    zh: '位值与进制',
    ar: 'القيمة المكانية والأساس',
    es: 'Valor posicional y base',
    fr: 'Valeur de position et base',
    hi: 'स्थानीय मान और आधार',
    id: 'Nilai tempat dan basis',
    pt: 'Valor posicional e base',
  },

  description: {
    en: 'The same number, written in another base.',
    ko: '같은 수를 다른 밑으로 적는다.',
    ja: '同じ数を別の基数で書く。',
    zh: '同一个数，用另一种进制来写。',
    ar: 'العدد نفسه، مكتوبًا بأساس آخر.',
    es: 'El mismo número, escrito en otra base.',
    fr: 'Le même nombre, écrit dans une autre base.',
    hi: 'वही संख्या, दूसरे आधार में लिखी गई।',
    id: 'Bilangan yang sama, ditulis dalam basis lain.',
    pt: 'O mesmo número, escrito em outra base.',
  },

  algorithm: 'module:positionalValue',
  projector: 'module:positionalValueProjector',

  initialData: {
    type: 'positional-value',
    /** 화면이 보이는 수. 자리값·합·8진/16진 표기는 algorithm 이 여기서 셈한다. */
    value: 45,
    bitWidth: 8,
    /** 걸음 사이의 정지 시간. 애니메이션이 끝난 뒤의 쉼이다 (S-piece). */
    stepMs: 700,
  },

  blocks: {
    stage: { type: 'positional-value-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },

  messages: {
    'caption.one': {
      en: 'A single number: {value}.',
      ko: '수 하나: {value}.',
      ja: 'ひとつの数: {value}.',
      zh: '一个数：{value}。',
      ar: 'عدد واحد: {value}.',
      es: 'Un solo número: {value}.',
      fr: 'Un seul nombre : {value}.',
      hi: 'एक अकेली संख्या: {value}.',
      id: 'Satu bilangan: {value}.',
      pt: 'Um único número: {value}.',
    },
    'caption.places': {
      en: 'Cut it into places — each place is worth twice the one on its right.',
      ko: '자리로 쪼갠다. 한 자리는 오른쪽 자리의 두 배다.',
      ja: '位に切り分ける。ある位は右隣の二倍。',
      zh: '把它切成数位——每一位是右边一位的两倍。',
      ar: 'نقطّعه إلى منازل — كل منزلة تساوي ضعف التي على يمينها.',
      es: 'Se corta en posiciones: cada una vale el doble que la de su derecha.',
      fr: 'On le découpe en positions : chacune vaut le double de celle à sa droite.',
      hi: 'इसे स्थानों में काटो — हर स्थान अपने दाएँ वाले से दोगुना है।',
      id: 'Potong menjadi tempat-tempat — tiap tempat bernilai dua kali tempat di kanannya.',
      pt: 'Corte-o em posições — cada uma vale o dobro da que está à direita.',
    },
    'caption.on': {
      en: 'The places that are on: {places}.',
      ko: '켜진 자리: {places}.',
      ja: '立っている位: {places}.',
      zh: '亮着的位：{places}。',
      ar: 'المنازل المضاءة: {places}.',
      es: 'Las posiciones encendidas: {places}.',
      fr: 'Les positions allumées : {places}.',
      hi: 'चालू स्थान: {places}.',
      id: 'Tempat yang menyala: {places}.',
      pt: 'As posições acesas: {places}.',
    },
    'caption.sum': {
      en: 'Add the on places and the number comes back: {sum}.',
      ko: '켜진 자리를 더하면 그 수로 돌아온다: {sum}.',
      ja: '立っている位を足すと元の数に戻る: {sum}.',
      zh: '把亮着的位相加，就回到原来的数：{sum}。',
      ar: 'بجمع المنازل المضاءة يعود العدد نفسه: {sum}.',
      es: 'Al sumar las posiciones encendidas vuelve el número: {sum}.',
      fr: 'En additionnant les positions allumées, le nombre revient : {sum}.',
      hi: 'चालू स्थानों को जोड़ो और वही संख्या लौट आती है: {sum}.',
      id: 'Jumlahkan tempat yang menyala, bilangannya kembali: {sum}.',
      pt: 'Somando as posições acesas o número volta: {sum}.',
    },
    'caption.three': {
      en: 'Cut the same bits three at a time — base 8 reads {reading}.',
      ko: '같은 비트를 셋씩 끊으면 8진 표기: {reading}.',
      ja: '同じビットを三つずつ切ると八進表記: {reading}.',
      zh: '把同样的位每三个一切，八进制读作 {reading}。',
      ar: 'نقطّع البتات نفسها ثلاثة ثلاثة — الأساس 8 يُقرأ {reading}.',
      es: 'Corta los mismos bits de tres en tres: en base 8 se lee {reading}.',
      fr: 'On coupe les mêmes bits par trois : en base 8, cela se lit {reading}.',
      hi: 'उन्हीं बिट्स को तीन-तीन में काटो — आधार 8 में यह {reading} पढ़ा जाता है।',
      id: 'Potong bit yang sama tiga-tiga — basis 8 terbaca {reading}.',
      pt: 'Corte os mesmos bits de três em três — em base 8 lê-se {reading}.',
    },
    'caption.four': {
      en: 'Cut them four at a time — base 16 reads {reading}.',
      ko: '넷씩 끊으면 16진 표기: {reading}.',
      ja: '四つずつ切ると十六進表記: {reading}.',
      zh: '每四个一切，十六进制读作 {reading}。',
      ar: 'ونقطّعها أربعة أربعة — الأساس 16 يُقرأ {reading}.',
      es: 'Córtalos de cuatro en cuatro: en base 16 se lee {reading}.',
      fr: 'On les coupe par quatre : en base 16, cela se lit {reading}.',
      hi: 'उन्हें चार-चार में काटो — आधार 16 में यह {reading} पढ़ा जाता है।',
      id: 'Potong empat-empat — basis 16 terbaca {reading}.',
      pt: 'Corte-os de quatro em quatro — em base 16 lê-se {reading}.',
    },
    'caption.same': {
      en: 'Three notations, one length, one number: {value}.',
      ko: '표기는 셋, 길이도 수도 하나: {value}.',
      ja: '表記は三つ、長さも数もひとつ: {value}.',
      zh: '三种写法，同一个长度，同一个数：{value}。',
      ar: 'ثلاثة تدوينات، طول واحد، عدد واحد: {value}.',
      es: 'Tres notaciones, una misma longitud, un mismo número: {value}.',
      fr: 'Trois notations, une même longueur, un même nombre : {value}.',
      hi: 'तीन संकेतन, एक ही लंबाई, एक ही संख्या: {value}.',
      id: 'Tiga notasi, satu panjang, satu bilangan: {value}.',
      pt: 'Três notações, um mesmo comprimento, um mesmo número: {value}.',
    },
  },
};
