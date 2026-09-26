import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

/**
 * @piece
 * 한 줄에서 만든 값은 어느 줄들이 읽는가 — 같은 이름을 다시 넣으면?
 *
 * @notation native
 * 세 주소 코드는 컴파일러 내부 표기이고 그 표기 자체가 주장이다 (tasks/pseudo-notation.md "쓰지 않는다").
 */
export const valueFlowsToUseFacet: FacetJson = {
  id: 'facet:valueFlowsToUse',
  title: {
    en: 'A value flows to its uses',
    ko: '만든 자리에서 쓰는 자리로',
    ja: '作った場所から使う場所へ',
    zh: '从定义处流向使用处',
    ar: 'من موضع التعريف إلى مواضع الاستخدام',
    es: 'Del lugar donde se crea al lugar donde se usa',
    fr: 'Du lieu de définition aux lieux d’utilisation',
    hi: 'बनने की जगह से इस्तेमाल की जगह तक',
    id: 'Dari tempat dibuat ke tempat dipakai',
    pt: 'Do lugar onde é criado ao lugar onde é usado',
  },
  description: {
    en: 'Each assignment’s value reaches down to the reads that use it — and stops where the same name is assigned again.',
    ko: '넣은 값은 그것을 읽는 자리들로 뻗어 가고, 같은 이름을 다시 넣는 줄에서 끊긴다.',
    ja: '代入した値はそれを読む場所へ伸びていき、同じ名前に再び代入する行で途切れる。',
    zh: '赋入的值延伸到读取它的各处，并在同名再次赋值的那一行被截断。',
    ar: 'تمتد قيمة كل إسناد إلى مواضع القراءة التي تستخدمها، وتنقطع حيث يُسند إلى الاسم نفسه من جديد.',
    es: 'El valor de cada asignación llega a las lecturas que lo usan y se corta donde el mismo nombre se vuelve a asignar.',
    fr: 'La valeur de chaque affectation s’étend jusqu’aux lectures qui l’utilisent, et s’arrête là où le même nom est réaffecté.',
    hi: 'हर असाइनमेंट का मान उसे पढ़ने वाली जगहों तक फैलता है, और जहाँ वही नाम फिर से असाइन होता है वहाँ रुक जाता है।',
    id: 'Nilai tiap penugasan menjangkau pembacaan yang memakainya, dan terputus di baris tempat nama yang sama ditugaskan lagi.',
    pt: 'O valor de cada atribuição chega às leituras que o usam e para onde o mesmo nome é atribuído de novo.',
  },
  algorithm: 'module:valueFlowsToUse',
  scene: 'module:valueFlowsToUseScene',
  initialData: {
    type: 'value-flows-to-use',
    stepMs: 1600,
    code: [
      { label: null, k: 'bin', dst: 'x', l: { var: 'a' }, op: '*', r: { num: 2 } },
      { label: null, k: 'bin', dst: 'y', l: { var: 'x' }, op: '+', r: { var: 'b' } },
      { label: null, k: 'bin', dst: 'z', l: { var: 'x' }, op: '*', r: { var: 'y' } },
      { label: null, k: 'bin', dst: 'x', l: { var: 'z' }, op: '-', r: { var: 'x' } },
      { label: null, k: 'bin', dst: 'w', l: { var: 'x' }, op: '+', r: { var: 'y' } },
      { label: null, k: 'return', value: { var: 'w' } },
    ],
  },
  shuffleOnReset: false,
  messages: {
    'caption.start': {
      en: 'Lines: {lines} · Lines that assign: {defs}',
      ko: '줄: {lines} · 넣는 줄: {defs}',
      ja: '行: {lines} · 代入する行: {defs}',
      zh: '行数: {lines} · 赋值的行: {defs}',
      ar: 'الأسطر: {lines} · أسطر الإسناد: {defs}',
      es: 'Líneas: {lines} · Líneas que asignan: {defs}',
      fr: 'Lignes : {lines} · Lignes qui affectent : {defs}',
      hi: 'पंक्तियाँ: {lines} · असाइन करने वाली पंक्तियाँ: {defs}',
      id: 'Baris: {lines} · Baris yang menugaskan: {defs}',
      pt: 'Linhas: {lines} · Linhas que atribuem: {defs}',
    },
    'caption.flow': {
      en: 'Line {line} assigns {name} → reads reached: {n}',
      ko: '줄 {line} 에서 넣은 {name} → 닿은 읽기: {n}',
      ja: '行 {line} で代入した {name} → 届いた読み取り: {n}',
      zh: '第 {line} 行赋值的 {name} → 到达的读取: {n}',
      ar: 'السطر {line} يُسند {name} ← القراءات التي بلغها: {n}',
      es: 'La línea {line} asigna {name} → lecturas alcanzadas: {n}',
      fr: 'La ligne {line} affecte {name} → lectures atteintes : {n}',
      hi: 'पंक्ति {line} {name} असाइन करती है → पहुँची पढ़ाइयाँ: {n}',
      id: 'Baris {line} menugaskan {name} → pembacaan yang dicapai: {n}',
      pt: 'A linha {line} atribui {name} → leituras alcançadas: {n}',
    },
    'caption.cut': {
      en: 'Line {cut} assigns {name} again — this value stops there',
      ko: '줄 {cut} 에서 {name} 에 다시 넣는다 — 이 값은 거기서 끊긴다',
      ja: '行 {cut} で {name} に再び代入する — この値はそこで途切れる',
      zh: '第 {cut} 行再次给 {name} 赋值 — 这个值在那里被截断',
      ar: 'السطر {cut} يُسند {name} من جديد — تتوقف هذه القيمة هناك',
      es: 'La línea {cut} vuelve a asignar {name}: este valor se corta ahí',
      fr: 'La ligne {cut} réaffecte {name} — cette valeur s’arrête là',
      hi: 'पंक्ति {cut} {name} को फिर असाइन करती है — यह मान वहीं रुक जाता है',
      id: 'Baris {cut} menugaskan {name} lagi — nilai ini terputus di sana',
      pt: 'A linha {cut} atribui {name} de novo — este valor para ali',
    },
    'caption.total': {
      en: 'Chains: {chains} · Reads of outside values: {outside}',
      ko: '사슬: {chains} · 바깥 값 읽기: {outside}',
      ja: '連鎖: {chains} · 外の値の読み取り: {outside}',
      zh: '链: {chains} · 外部值的读取: {outside}',
      ar: 'السلاسل: {chains} · قراءات القيم الخارجية: {outside}',
      es: 'Cadenas: {chains} · Lecturas de valores externos: {outside}',
      fr: 'Chaînes : {chains} · Lectures de valeurs extérieures : {outside}',
      hi: 'शृंखलाएँ: {chains} · बाहरी मानों की पढ़ाइयाँ: {outside}',
      id: 'Rantai: {chains} · Pembacaan nilai luar: {outside}',
      pt: 'Cadeias: {chains} · Leituras de valores externos: {outside}',
    },
  },
  blocks: {
    stage: { type: 'value-flows-to-use-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
};
