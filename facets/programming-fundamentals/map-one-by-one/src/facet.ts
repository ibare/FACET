import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

/**
 * @piece
 * 질문: map 은 목록에 무엇을 하는가.
 *
 * 원소마다 같은 함수를 지나 바뀐 값이 같은 차례의 자리에 선다. 개수는 그대로다.
 */
export const mapOneByOneFacet: FacetJson = {
  id: 'facet:mapOneByOne',
  title: {
    en: 'map changes each item, one by one',
    ko: 'map 은 하나씩 바꾼다',
    ja: 'map は要素を一つずつ変える',
    zh: 'map 逐个改变元素',
    ar: 'map تغيّر كل عنصر واحدًا تلو الآخر',
    es: 'map cambia cada elemento, uno a uno',
    fr: 'map transforme chaque élément, un par un',
    hi: 'map हर तत्व को एक-एक करके बदलता है',
    id: 'map mengubah setiap elemen, satu per satu',
    pt: 'map muda cada elemento, um de cada vez',
  },
  description: {
    en: 'Each item passes through the same function and the new value takes the same position in a new list. The count stays the same.',
    ko: '원소마다 같은 함수를 지나고, 바뀐 값이 새 목록의 같은 차례 자리에 선다. 개수는 그대로다.',
    ja: '要素はそれぞれ同じ関数を通り、変わった値が新しいリストの同じ位置に並ぶ。個数は変わらない。',
    zh: '每个元素都经过同一个函数，变化后的值落在新列表的同一位置。数量不变。',
    ar: 'يمرّ كل عنصر عبر الدالة نفسها، وتأخذ القيمة الجديدة الموضع نفسه في قائمة جديدة. يبقى العدد كما هو.',
    es: 'Cada elemento pasa por la misma función y el nuevo valor ocupa la misma posición en una lista nueva. La cantidad no cambia.',
    fr: 'Chaque élément passe par la même fonction et la nouvelle valeur prend la même position dans une nouvelle liste. Le nombre reste le même.',
    hi: 'हर तत्व एक ही फ़ंक्शन से गुज़रता है और नया मान नई सूची में उसी स्थान पर आता है। गिनती वही रहती है।',
    id: 'Setiap elemen melewati fungsi yang sama dan nilai barunya menempati posisi yang sama di daftar baru. Jumlahnya tetap.',
    pt: 'Cada elemento passa pela mesma função e o novo valor ocupa a mesma posição numa lista nova. A quantidade não muda.',
  },
  algorithm: 'module:mapOneByOne',
  scene: 'module:mapOneByOneScene',
  initialData: {
    type: 'map-one-by-one',
    stepMs: 1400,
    lines: [
      {
        indent: 0,
        text: 'let nums = [3, 1, 4, 2]',
        stmt: { k: 'assign', to: 'nums', declare: true, value: { list: [{ num: 3 }, { num: 1 }, { num: 4 }, { num: 2 }] } },
      },
      {
        indent: 0,
        text: 'let tens = map(nums, x => x * 10)',
        stmt: {
          k: 'assign',
          to: 'tens',
          declare: true,
          value: {
            call: 'map',
            args: [{ var: 'nums' }, { fn: { params: ['x'], body: { op: '*', l: { var: 'x' }, r: { num: 10 } } } }],
          },
        },
      },
      { indent: 0, text: 'show tens', stmt: { k: 'show', value: { var: 'tens' } } },
    ],
  },
  shuffleOnReset: false,
  messages: {
    'caption.start': {
      en: 'Nothing has run yet.',
      ko: '아직 아무 줄도 실행하지 않았다.',
      ja: 'まだどの行も実行していない。',
      zh: '还没有执行任何一行。',
      ar: 'لم يُنفَّذ أي سطر بعد.',
      es: 'Aún no se ha ejecutado nada.',
      fr: "Rien n'a encore été exécuté.",
      hi: 'अभी तक कुछ नहीं चला है।',
      id: 'Belum ada yang dijalankan.',
      pt: 'Nada foi executado ainda.',
    },
    'caption.assign': {
      en: 'List {name}, length {count}.',
      ko: '목록 {name}, 길이 {count}.',
      ja: 'リスト {name}、長さ {count}。',
      zh: '列表 {name}，长度 {count}。',
      ar: 'القائمة {name}، الطول {count}.',
      es: 'Lista {name}, longitud {count}.',
      fr: 'Liste {name}, longueur {count}.',
      hi: 'सूची {name}, लंबाई {count}।',
      id: 'Daftar {name}, panjang {count}.',
      pt: 'Lista {name}, comprimento {count}.',
    },
    'caption.item': {
      en: 'Position {index}: in {input}, out {output} → {into}[{index}]',
      ko: '자리 {index}: 들어간 값 {input}, 나온 값 {output} → {into}[{index}]',
      ja: '位置 {index}: 入る値 {input}、出る値 {output} → {into}[{index}]',
      zh: '位置 {index}：进 {input}，出 {output} → {into}[{index}]',
      ar: 'الموضع {index}: يدخل {input}، يخرج {output} ← {into}[{index}]',
      es: 'Posición {index}: entra {input}, sale {output} → {into}[{index}]',
      fr: 'Position {index} : entre {input}, sort {output} → {into}[{index}]',
      hi: 'स्थान {index}: अंदर {input}, बाहर {output} → {into}[{index}]',
      id: 'Posisi {index}: masuk {input}, keluar {output} → {into}[{index}]',
      pt: 'Posição {index}: entra {input}, sai {output} → {into}[{index}]',
    },
    'caption.show': {
      en: 'Items in: {inCount} · items out: {outCount}',
      ko: '들어간 원소: {inCount} · 나온 원소: {outCount}',
      ja: '入った要素: {inCount} · 出た要素: {outCount}',
      zh: '进入的元素：{inCount} · 出来的元素：{outCount}',
      ar: 'العناصر الداخلة: {inCount} · العناصر الخارجة: {outCount}',
      es: 'Elementos que entran: {inCount} · que salen: {outCount}',
      fr: 'Éléments entrés : {inCount} · sortis : {outCount}',
      hi: 'अंदर गए तत्व: {inCount} · बाहर आए तत्व: {outCount}',
      id: 'Elemen masuk: {inCount} · elemen keluar: {outCount}',
      pt: 'Elementos que entram: {inCount} · que saem: {outCount}',
    },
    'label.output': {
      en: 'Output',
      ko: '출력',
      ja: '出力',
      zh: '输出',
      ar: 'المُخرَج',
      es: 'Salida',
      fr: 'Sortie',
      hi: 'आउटपुट',
      id: 'Keluaran',
      pt: 'Saída',
    },
  },
  blocks: {
    stage: { type: 'map-one-by-one-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
};
