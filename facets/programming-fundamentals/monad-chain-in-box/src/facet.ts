/**
 * @piece
 * 질문: 값이 없을 수도 있는 상자를 함수 여럿에 차례로 이어 넘기면 무슨 일이 일어나는가.
 *
 * 찬 상자는 이음(`then`)에서 열려 값이 함수로 넘어가고, 함수가 돌려준 새 상자가 다음 이름에 선다.
 * 한 번 빈 상자가 되면 뒤의 이음은 함수를 부르지 않고 빈 상자를 그대로 넘긴다.
 */
import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';
import type { CodeLine, Expr } from './algorithm';

const num = (n: number): Expr => ({ num: n });
const v = (name: string): Expr => ({ var: name });

const lines: CodeLine[] = [
  { indent: 0, text: 'function half(n)', stmt: { k: 'function', name: 'half', params: ['n'] } },
  {
    indent: 1,
    text: 'if n mod 2 == 1',
    stmt: { k: 'if', cond: { op: '==', l: { op: 'mod', l: v('n'), r: num(2) }, r: num(1) } },
  },
  { indent: 2, text: 'return empty', stmt: { k: 'return', value: { const: 'empty' } } },
  {
    indent: 1,
    text: 'return box(n div 2)',
    stmt: { k: 'return', value: { call: 'box', args: [{ op: 'div', l: v('n'), r: num(2) }] } },
  },
  {
    indent: 0,
    text: 'let a = box(20)',
    stmt: { k: 'assign', to: 'a', value: { call: 'box', args: [num(20)] }, declare: true },
  },
  {
    indent: 0,
    text: 'let b = then(a, half)',
    stmt: { k: 'assign', to: 'b', value: { call: 'then', args: [v('a'), v('half')] }, declare: true },
  },
  {
    indent: 0,
    text: 'let c = then(b, half)',
    stmt: { k: 'assign', to: 'c', value: { call: 'then', args: [v('b'), v('half')] }, declare: true },
  },
  {
    indent: 0,
    text: 'let d = then(c, half)',
    stmt: { k: 'assign', to: 'd', value: { call: 'then', args: [v('c'), v('half')] }, declare: true },
  },
  {
    indent: 0,
    text: 'let e = then(d, half)',
    stmt: { k: 'assign', to: 'e', value: { call: 'then', args: [v('d'), v('half')] }, declare: true },
  },
  { indent: 0, text: 'show e', stmt: { k: 'show', value: v('e') } },
];

export const monadChainInBoxFacet: FacetJson = {
  id: 'facet:monadChainInBox',
  title: {
    en: 'Passing a box along a chain',
    ko: '상자째로 이어 넘기기',
    ja: '箱のままつないで渡す',
    zh: '装在盒子里沿链传递',
    ar: 'تمرير صندوق عبر سلسلة',
    es: 'Pasar una caja a lo largo de una cadena',
    fr: 'Passer une boîte le long d’une chaîne',
    hi: 'डिब्बे को कड़ी-दर-कड़ी आगे बढ़ाना',
    id: 'Mengoper kotak di sepanjang rantai',
    pt: 'Passar uma caixa ao longo de uma cadeia',
  },
  description: {
    en: 'A box that may be empty is passed through several functions with then. A full box is opened and its value handed on; once the box is empty, no later function is called.',
    ko: '비어 있을 수도 있는 상자를 then 으로 함수 여럿에 이어 넘긴다. 찬 상자는 열려 값이 넘어가고, 한 번 빈 상자가 되면 뒤의 함수는 불리지 않는다.',
    ja: '空かもしれない箱を then でいくつもの関数につないで渡す。中身のある箱は開かれて値が渡り、一度空の箱になると後の関数は呼ばれない。',
    zh: '把可能为空的盒子用 then 依次传给多个函数。有值的盒子被打开,值传下去;盒子一旦变空,后面的函数都不再被调用。',
    ar: 'صندوق قد يكون فارغًا يُمرَّر عبر عدة دوال باستخدام then. الصندوق الممتلئ يُفتح وتُسلَّم قيمته، وما إن يصبح فارغًا لا تُستدعى أي دالة بعده.',
    es: 'Una caja que puede estar vacía pasa por varias funciones con then. Una caja llena se abre y su valor sigue adelante; una vez vacía, ya no se llama a ninguna función posterior.',
    fr: 'Une boîte peut-être vide passe par plusieurs fonctions avec then. Une boîte pleine est ouverte et sa valeur transmise ; une fois vide, aucune fonction suivante n’est appelée.',
    hi: 'जो डिब्बा ख़ाली भी हो सकता है, उसे then से कई फ़ंक्शनों से गुज़ारा जाता है। भरा डिब्बा खुलकर अपना मान आगे देता है; डिब्बा एक बार ख़ाली हो जाए तो आगे का कोई फ़ंक्शन नहीं बुलाया जाता।',
    id: 'Kotak yang mungkin kosong dioper melewati beberapa fungsi dengan then. Kotak berisi dibuka dan nilainya diteruskan; begitu kotak kosong, fungsi berikutnya tidak dipanggil lagi.',
    pt: 'Uma caixa que pode estar vazia passa por várias funções com then. Uma caixa cheia é aberta e seu valor segue adiante; depois de vazia, nenhuma função seguinte é chamada.',
  },
  algorithm: 'module:monadChainInBox',
  scene: 'module:monadChainInBoxScene',
  initialData: {
    type: 'monad-chain-in-box',
    stepMs: 1800,
    lines,
  },
  shuffleOnReset: false,
  messages: {
    'caption.start': {
      en: 'No line has run yet.',
      ko: '아직 아무 줄도 실행하지 않았다.',
      ja: 'まだどの行も実行していない。',
      zh: '还没有执行任何一行。',
      ar: 'لم يُنفَّذ أي سطر بعد.',
      es: 'Todavía no se ha ejecutado nada.',
      fr: 'Rien n’a encore été exécuté.',
      hi: 'अभी तक कुछ भी नहीं चला है।',
      id: 'Belum ada yang dijalankan.',
      pt: 'Nada foi executado ainda.',
    },
    'caption.bind': {
      en: 'A value goes into a box: {name} = {code}',
      ko: '값을 상자에 담는다: {name} = {code}',
      ja: '値を箱に入れる: {name} = {code}',
      zh: '把值装进盒子:{name} = {code}',
      ar: 'تدخل قيمة في صندوق: {name} = {code}',
      es: 'Un valor entra en una caja: {name} = {code}',
      fr: 'Une valeur entre dans une boîte : {name} = {code}',
      hi: 'एक मान डिब्बे में जाता है: {name} = {code}',
      id: 'Sebuah nilai masuk ke kotak: {name} = {code}',
      pt: 'Um valor entra numa caixa: {name} = {code}',
    },
    'caption.call': {
      en: 'then opens {from} and hands {n} to {fn}. A new box comes back: {name} = {code}',
      ko: 'then 이 {from} 상자를 열어 {fn} 에 넘긴다 (값 {n}). 돌아온 새 상자: {name} = {code}',
      ja: 'then が箱 {from} を開けて {fn} に渡す (値 {n})。戻ってきた新しい箱: {name} = {code}',
      zh: 'then 打开盒子 {from},把 {n} 交给 {fn}。返回一个新盒子:{name} = {code}',
      ar: 'تفتح then الصندوق {from} وتسلّم {n} إلى {fn}. يعود صندوق جديد: {name} = {code}',
      es: 'then abre {from} y pasa {n} a {fn}. Vuelve una caja nueva: {name} = {code}',
      fr: 'then ouvre {from} et passe {n} à {fn}. Une nouvelle boîte revient : {name} = {code}',
      hi: 'then डिब्बा {from} खोलकर {n} को {fn} को देता है। नया डिब्बा लौटता है: {name} = {code}',
      id: 'then membuka {from} dan memberikan {n} ke {fn}. Kotak baru kembali: {name} = {code}',
      pt: 'then abre {from} e entrega {n} a {fn}. Volta uma caixa nova: {name} = {code}',
    },
    'caption.skip': {
      en: '{from} is empty, so then skips {fn}. The empty box passes on: {name} = {code}',
      ko: '{from} 상자가 비었다 — then 은 {fn} 부르기를 건너뛴다. 빈 상자가 그대로 넘어간다: {name} = {code}',
      ja: '箱 {from} は空 — then は {fn} を呼ばずに飛ばす。空の箱がそのまま渡る: {name} = {code}',
      zh: '盒子 {from} 是空的,then 跳过 {fn}。空盒子原样传下去:{name} = {code}',
      ar: 'الصندوق {from} فارغ، فتتخطى then الدالة {fn}. يمر الصندوق الفارغ كما هو: {name} = {code}',
      es: '{from} está vacía, así que then se salta {fn}. La caja vacía pasa tal cual: {name} = {code}',
      fr: '{from} est vide, donc then saute {fn}. La boîte vide passe telle quelle : {name} = {code}',
      hi: '{from} ख़ाली है, इसलिए then {fn} को नहीं बुलाता। ख़ाली डिब्बा वैसे ही आगे जाता है: {name} = {code}',
      id: '{from} kosong, jadi then melewati {fn}. Kotak kosong diteruskan apa adanya: {name} = {code}',
      pt: '{from} está vazia, então then pula {fn}. A caixa vazia segue como está: {name} = {code}',
    },
    'caption.show': {
      en: 'Output: {code} · {fn} called: {calls} · then links: {links}',
      ko: '출력: {code} · {fn} 부른 횟수: {calls} · then 이음: {links}',
      ja: '出力: {code} · {fn} を呼んだ回数: {calls} · then のつなぎ: {links}',
      zh: '输出:{code} · 调用 {fn} 的次数:{calls} · then 连接:{links}',
      ar: 'الناتج: {code} · مرات استدعاء {fn}: {calls} · وصلات then: {links}',
      es: 'Salida: {code} · llamadas a {fn}: {calls} · enlaces then: {links}',
      fr: 'Sortie : {code} · appels à {fn} : {calls} · liens then : {links}',
      hi: 'आउटपुट: {code} · {fn} कितनी बार बुलाया: {calls} · then कड़ियाँ: {links}',
      id: 'Keluaran: {code} · {fn} dipanggil: {calls} · sambungan then: {links}',
      pt: 'Saída: {code} · chamadas a {fn}: {calls} · elos then: {links}',
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
    'label.notCalled': {
      en: 'not called',
      ko: '부르지 않음',
      ja: '呼ばれない',
      zh: '未调用',
      ar: 'لم تُستدعَ',
      es: 'no se llama',
      fr: 'non appelée',
      hi: 'नहीं बुलाया',
      id: 'tidak dipanggil',
      pt: 'não chamada',
    },
  },
  blocks: {
    stage: { type: 'monad-chain-in-box-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
};
