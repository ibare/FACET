import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';
import type { CodeLine } from './algorithm';

/**
 * @piece
 * 질문: filter 는 목록에서 무엇을 남기는가.
 *
 * 원소가 하나씩 조건 `x > 4` 앞에 서고, 참이면 값이 바뀌지 않은 채 새 목록 끝에 빈틈 없이 붙고
 * 거짓이면 떨어진다. 개수는 줄고 값은 그대로다.
 */
const lines: CodeLine[] = [
  {
    indent: 0,
    text: 'let ages = [7, 2, 9, 4, 6, 1]',
    stmt: {
      k: 'assign',
      to: 'ages',
      declare: true,
      value: { list: [{ num: 7 }, { num: 2 }, { num: 9 }, { num: 4 }, { num: 6 }, { num: 1 }] },
    },
  },
  {
    indent: 0,
    text: 'let older = filter(ages, x => x > 4)',
    stmt: {
      k: 'assign',
      to: 'older',
      declare: true,
      value: {
        call: 'filter',
        args: [{ var: 'ages' }, { fn: { params: ['x'], body: { op: '>', l: { var: 'x' }, r: { num: 4 } } } }],
      },
    },
  },
  { indent: 0, text: 'show older', stmt: { k: 'show', value: { var: 'older' } } },
];

export const filterKeepSomeFacet: FacetJson = {
  id: 'facet:filterKeepSome',
  title: {
    en: 'filter keeps some',
    ko: 'filter 는 일부만 남긴다',
    ja: 'filter は一部だけを残す',
    zh: 'filter 只留下一部分',
    ar: 'filter يُبقي على بعض العناصر',
    es: 'filter conserva algunos',
    fr: 'filter en garde certains',
    hi: 'filter कुछ ही रखता है',
    id: 'filter menyisakan sebagian',
    pt: 'filter mantém alguns',
  },
  description: {
    en: 'Each element stands before the condition. Those that pass move to the new list unchanged; the rest drop out. The count shrinks, the values stay.',
    ko: '원소가 하나씩 조건 앞에 선다. 통과한 원소는 값 그대로 새 목록으로 넘어가고, 나머지는 떨어진다. 개수는 줄고 값은 그대로다.',
    ja: '要素が一つずつ条件の前に立つ。通った要素は値そのままで新しいリストへ移り、残りは落ちる。数は減り、値はそのままだ。',
    zh: '元素逐个站到条件前。通过的元素原样进入新列表，其余的掉落。个数变少，值不变。',
    ar: 'يقف كل عنصر أمام الشرط. ما يجتازه ينتقل إلى القائمة الجديدة دون تغيير، والباقي يسقط. يقل العدد وتبقى القيم كما هي.',
    es: 'Cada elemento se detiene ante la condición. Los que pasan van a la nueva lista sin cambiar; el resto cae. El número baja, los valores se mantienen.',
    fr: 'Chaque élément se présente devant la condition. Ceux qui passent vont dans la nouvelle liste sans changer ; les autres tombent. Le nombre diminue, les valeurs restent.',
    hi: 'हर तत्व एक-एक करके शर्त के सामने आता है। जो पार होते हैं वे बिना बदले नई सूची में जाते हैं, बाकी गिर जाते हैं। संख्या घटती है, मान वही रहते हैं।',
    id: 'Setiap elemen berdiri di depan syarat. Yang lolos pindah ke daftar baru tanpa berubah; sisanya jatuh. Jumlahnya berkurang, nilainya tetap.',
    pt: 'Cada elemento para diante da condição. Os que passam vão para a nova lista sem mudar; o resto cai. A quantidade diminui, os valores ficam.',
  },
  algorithm: 'module:filterKeepSome',
  scene: 'module:filterKeepSomeScene',
  initialData: {
    type: 'filter-keep-some',
    stepMs: 1200,
    lines,
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
      hi: 'अभी कोई पंक्ति नहीं चली है।',
      id: 'Belum ada baris yang dijalankan.',
      pt: 'Nada foi executado ainda.',
    },
    'caption.assign': {
      en: 'New list {name}. Elements: {n}.',
      ko: '새 목록 {name}. 원소 수: {n}.',
      ja: '新しいリスト {name}。要素数: {n}。',
      zh: '新列表 {name}。元素个数：{n}。',
      ar: 'قائمة جديدة {name}. عدد العناصر: {n}.',
      es: 'Nueva lista {name}. Elementos: {n}.',
      fr: 'Nouvelle liste {name}. Éléments : {n}.',
      hi: 'नई सूची {name}। तत्व: {n}।',
      id: 'Daftar baru {name}. Jumlah elemen: {n}.',
      pt: 'Nova lista {name}. Elementos: {n}.',
    },
    'caption.keep': {
      en: 'Position {i}: {test} is true. Value added to {target}: {value}.',
      ko: '자리 {i}: {test} — 참. {target} 에 들어간 값: {value}.',
      ja: '位置 {i}: {test} — 真。{target} に入った値: {value}。',
      zh: '位置 {i}：{test} 为真。进入 {target} 的值：{value}。',
      ar: 'الموضع {i}: {test} صحيح. القيمة المضافة إلى {target}: {value}.',
      es: 'Posición {i}: {test} es verdadero. Valor añadido a {target}: {value}.',
      fr: 'Position {i} : {test} est vrai. Valeur ajoutée à {target} : {value}.',
      hi: 'स्थान {i}: {test} सत्य है। {target} में गया मान: {value}।',
      id: 'Posisi {i}: {test} benar. Nilai yang masuk ke {target}: {value}.',
      pt: 'Posição {i}: {test} é verdadeiro. Valor adicionado a {target}: {value}.',
    },
    'caption.drop': {
      en: 'Position {i}: {test} is false. It drops out.',
      ko: '자리 {i}: {test} — 거짓. 떨어져 새 목록에 들지 못한다.',
      ja: '位置 {i}: {test} — 偽。落ちて新しいリストには入らない。',
      zh: '位置 {i}：{test} 为假。它掉落，进不了新列表。',
      ar: 'الموضع {i}: {test} خاطئ. يسقط خارجًا.',
      es: 'Posición {i}: {test} es falso. Se cae.',
      fr: 'Position {i} : {test} est faux. Il tombe.',
      hi: 'स्थान {i}: {test} असत्य है। यह गिर जाता है।',
      id: 'Posisi {i}: {test} salah. Ia jatuh.',
      pt: 'Posição {i}: {test} é falso. Ele cai fora.',
    },
    'caption.show': {
      en: 'Output: {out}. Length: {source} {from} → {target} {to}.',
      ko: '출력: {out}. 길이: {source} {from} → {target} {to}.',
      ja: '出力: {out}。長さ: {source} {from} → {target} {to}。',
      zh: '输出：{out}。长度：{source} {from} → {target} {to}。',
      ar: 'الناتج: {out}. الطول: {source} {from} → {target} {to}.',
      es: 'Salida: {out}. Longitud: {source} {from} → {target} {to}.',
      fr: 'Sortie : {out}. Longueur : {source} {from} → {target} {to}.',
      hi: 'आउटपुट: {out}। लंबाई: {source} {from} → {target} {to}।',
      id: 'Keluaran: {out}. Panjang: {source} {from} → {target} {to}.',
      pt: 'Saída: {out}. Comprimento: {source} {from} → {target} {to}.',
    },
    'label.dropped': {
      en: 'dropped',
      ko: '떨어짐',
      ja: '落ちた',
      zh: '掉落',
      ar: 'سقط',
      es: 'caídos',
      fr: 'tombés',
      hi: 'गिरे',
      id: 'jatuh',
      pt: 'caídos',
    },
    'label.output': {
      en: 'output',
      ko: '출력',
      ja: '出力',
      zh: '输出',
      ar: 'الناتج',
      es: 'salida',
      fr: 'sortie',
      hi: 'आउटपुट',
      id: 'keluaran',
      pt: 'saída',
    },
  },
  blocks: {
    stage: { type: 'filter-keep-some-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
};
