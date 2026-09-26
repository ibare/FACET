import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';
import type { QueryInsideQueryFacetData } from './algorithm.js';

/**
 * @piece
 * 괄호 안 질의의 답은 바깥 질의에서 어떻게 쓰이는가.
 *
 * @notation native
 * 화면의 질의는 SQL 그대로 둔다 — SQL 문장 속 괄호 자리에 값이 들어앉는 것이 곧 주장이라 가상 표기로 옮길 수 없다.
 */
const initialData: QueryInsideQueryFacetData = {
  type: 'query-inside-query',
  stepMs: 1800,
  table: 'students',
  columns: ['name', 'score'],
  rows: [
    ['Ann', 72],
    ['Bo', 85],
    ['Cy', 64],
    ['Di', 90],
    ['Eve', 78],
    ['Fay', 61],
  ],
  inner: { agg: 'AVG', column: 'score' },
  outer: { column: 'score', op: '>' },
  sql: {
    head: ['SELECT name, score', 'FROM students'],
    lead: 'WHERE score > ',
    inner: '(SELECT AVG(score) FROM students)',
    tail: ';',
  },
};

export const queryInsideQueryFacet: FacetJson = {
  id: 'facet:queryInsideQuery',
  title: {
    en: 'The inner answer goes into the outer query',
    ko: '안쪽 답을 바깥이 쓴다',
    ja: '内側の答えを外側が使う',
    zh: '外层查询使用内层的答案',
    ar: 'الاستعلام الخارجي يستخدم جواب الاستعلام الداخلي',
    es: 'La consulta exterior usa la respuesta interior',
    fr: 'La requête externe utilise la réponse interne',
    hi: 'बाहरी क्वेरी भीतरी उत्तर का उपयोग करती है',
    id: 'Kueri luar memakai jawaban kueri dalam',
    pt: 'A consulta externa usa a resposta interna',
  },
  description: {
    en: 'The query in parentheses runs first and becomes one value; that value takes the place of the parentheses, and only then does the outer query filter rows.',
    ko: '괄호 안 질의가 먼저 돌아 값 하나가 되고, 그 값이 괄호 자리에 들어앉은 뒤에야 바깥 질의가 줄을 거른다.',
    ja: '括弧内のクエリが先に実行されて一つの値になり、その値が括弧の位置に入ってから、外側のクエリが行を絞り込む。',
    zh: '括号内的查询先执行并变成一个值，这个值替换括号所在的位置，然后外层查询才筛选行。',
    ar: 'يعمل الاستعلام بين القوسين أولًا فيصبح قيمة واحدة، تحل هذه القيمة محل القوسين، وبعدها فقط يرشّح الاستعلام الخارجي الصفوف.',
    es: 'La consulta entre paréntesis se ejecuta primero y se convierte en un valor; ese valor ocupa el lugar de los paréntesis y solo entonces la consulta exterior filtra las filas.',
    fr: 'La requête entre parenthèses s’exécute d’abord et devient une seule valeur ; cette valeur prend la place des parenthèses, et alors seulement la requête externe filtre les lignes.',
    hi: 'कोष्ठक के भीतर की क्वेरी पहले चलकर एक मान बनती है; वह मान कोष्ठक की जगह ले लेता है, और उसके बाद ही बाहरी क्वेरी पंक्तियाँ छाँटती है।',
    id: 'Kueri di dalam kurung berjalan lebih dulu dan menjadi satu nilai; nilai itu menggantikan tempat kurung, baru kemudian kueri luar menyaring baris.',
    pt: 'A consulta entre parênteses é executada primeiro e vira um único valor; esse valor ocupa o lugar dos parênteses, e só então a consulta externa filtra as linhas.',
  },
  algorithm: 'module:queryInsideQuery',
  scene: 'module:queryInsideQueryScene',
  initialData,
  shuffleOnReset: false,
  messages: {
    'caption.start': {
      en: 'The query in parentheses sits inside the outer WHERE.',
      ko: '괄호 안 질의가 바깥 WHERE 속에 들어 있다.',
      ja: '括弧内のクエリが外側の WHERE の中にある。',
      zh: '括号内的查询位于外层 WHERE 之中。',
      ar: 'الاستعلام بين القوسين موجود داخل WHERE الخارجي.',
      es: 'La consulta entre paréntesis está dentro del WHERE exterior.',
      fr: 'La requête entre parenthèses se trouve dans le WHERE externe.',
      hi: 'कोष्ठक वाली क्वेरी बाहरी WHERE के भीतर बैठी है।',
      id: 'Kueri dalam kurung berada di dalam WHERE luar.',
      pt: 'A consulta entre parênteses está dentro do WHERE externo.',
    },
    'caption.inner': {
      en: 'The inner query runs first, just once, and shrinks the table to one value: {value}',
      ko: '안쪽 질의가 먼저, 한 번만 돌아 표를 값 하나로 줄인다: {value}',
      ja: '内側のクエリが先に一度だけ実行され、表を一つの値に縮める: {value}',
      zh: '内层查询先执行，且只执行一次，把表缩成一个值：{value}',
      ar: 'يعمل الاستعلام الداخلي أولًا، مرة واحدة فقط، ويختصر الجدول إلى قيمة واحدة: {value}',
      es: 'La consulta interior se ejecuta primero, una sola vez, y reduce la tabla a un valor: {value}',
      fr: 'La requête interne s’exécute d’abord, une seule fois, et réduit la table à une valeur : {value}',
      hi: 'भीतरी क्वेरी पहले, केवल एक बार चलती है और तालिका को एक मान में समेट देती है: {value}',
      id: 'Kueri dalam berjalan lebih dulu, sekali saja, dan menyusutkan tabel menjadi satu nilai: {value}',
      pt: 'A consulta interna roda primeiro, uma única vez, e reduz a tabela a um valor: {value}',
    },
    'caption.substitute': {
      en: 'That value takes the place of the parentheses. The outer WHERE now compares with: {value}',
      ko: '그 값이 괄호가 있던 자리에 들어앉는다. 바깥 WHERE 가 견줄 값: {value}',
      ja: 'その値が括弧のあった位置に入る。外側の WHERE が比べる値: {value}',
      zh: '这个值取代了括号的位置。外层 WHERE 现在比较的值：{value}',
      ar: 'تحل هذه القيمة محل القوسين. القيمة التي يقارن بها WHERE الخارجي الآن: {value}',
      es: 'Ese valor ocupa el lugar de los paréntesis. El WHERE exterior ahora compara con: {value}',
      fr: 'Cette valeur prend la place des parenthèses. Le WHERE externe compare désormais avec : {value}',
      hi: 'वह मान कोष्ठक की जगह ले लेता है। बाहरी WHERE अब इससे तुलना करता है: {value}',
      id: 'Nilai itu menggantikan tempat kurung. WHERE luar kini membandingkan dengan: {value}',
      pt: 'Esse valor ocupa o lugar dos parênteses. O WHERE externo agora compara com: {value}',
    },
    'caption.filter': {
      en: 'Only now does the outer query filter the rows. Result rows: {kept}',
      ko: '이제야 바깥 질의가 줄을 거른다. 결과 줄: {kept}',
      ja: 'ここで初めて外側のクエリが行を絞り込む。結果の行: {kept}',
      zh: '直到现在外层查询才筛选行。结果行数：{kept}',
      ar: 'الآن فقط يرشّح الاستعلام الخارجي الصفوف. صفوف النتيجة: {kept}',
      es: 'Solo ahora la consulta exterior filtra las filas. Filas del resultado: {kept}',
      fr: 'Ce n’est que maintenant que la requête externe filtre les lignes. Lignes du résultat : {kept}',
      hi: 'अब जाकर बाहरी क्वेरी पंक्तियाँ छाँटती है। परिणाम की पंक्तियाँ: {kept}',
      id: 'Baru sekarang kueri luar menyaring baris. Baris hasil: {kept}',
      pt: 'Só agora a consulta externa filtra as linhas. Linhas do resultado: {kept}',
    },
    'label.result': {
      en: 'result',
      ko: '결과',
      ja: '結果',
      zh: '结果',
      ar: 'النتيجة',
      es: 'resultado',
      fr: 'résultat',
      hi: 'परिणाम',
      id: 'hasil',
      pt: 'resultado',
    },
  },
  blocks: {
    stage: { type: 'query-inside-query-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
};
