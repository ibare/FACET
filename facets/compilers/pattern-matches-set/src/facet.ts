import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

/**
 * @piece
 * @notation native 컴파일러 내부 표기 — 정규 표현식
 *
 * 질문: 정규 표현식 하나는 무엇을 뜻하는가 — 글줄 하나인가, 여럿인가?
 *
 * 무늬 `(<|>|=)=?` 위의 길을 하나씩 골라 끝까지 따라가면 길마다 글줄 하나가 떨어져 모임에 든다.
 * 무늬는 그대로이고, 다른 길을 고를 때마다 모임이 하나씩 불어난다.
 */
export const patternMatchesSetFacet: FacetJson = {
  id: 'facet:patternMatchesSet',
  title: {
    en: 'One pattern, many strings',
    ko: '무늬 하나, 글줄 여럿',
    ja: '一つのパターン、多くの文字列',
    zh: '一个模式，多个字符串',
    ar: 'نمط واحد، سلاسل كثيرة',
    es: 'Un patrón, muchas cadenas',
    fr: 'Un motif, plusieurs chaînes',
    hi: 'एक पैटर्न, कई स्ट्रिंग',
    id: 'Satu pola, banyak string',
    pt: 'Um padrão, muitas cadeias',
  },
  description: {
    en: 'Every path through a regular expression spells one string; the pattern means the set of all of them.',
    ko: '정규 표현식 위의 길마다 글줄 하나가 나온다. 무늬가 뜻하는 것은 그 글줄 모두의 모임이다.',
    ja: '正規表現の上の道はそれぞれ一つの文字列を綴る。パターンが意味するのはそのすべての集合だ。',
    zh: '正则表达式上的每条路径拼出一个字符串；模式所表示的是所有这些字符串的集合。',
    ar: 'كل مسار عبر التعبير النمطي يكتب سلسلة واحدة؛ والنمط يعني مجموعة كل هذه السلاسل.',
    es: 'Cada camino por una expresión regular forma una cadena; el patrón significa el conjunto de todas ellas.',
    fr: 'Chaque chemin dans une expression régulière forme une chaîne ; le motif désigne l’ensemble de toutes ces chaînes.',
    hi: 'रेगुलर एक्सप्रेशन के हर रास्ते से एक स्ट्रिंग बनती है; पैटर्न का अर्थ उन सबका समुच्चय है।',
    id: 'Setiap jalur melalui ekspresi reguler mengeja satu string; pola itu berarti himpunan semuanya.',
    pt: 'Cada caminho por uma expressão regular forma uma cadeia; o padrão significa o conjunto de todas elas.',
  },
  algorithm: 'module:patternMatchesSet',
  scene: 'module:patternMatchesSetScene',
  initialData: {
    type: 'pattern-matches-set',
    stepMs: 1600,
    pattern: {
      kind: 'seq',
      items: [
        {
          kind: 'alt',
          options: [
            { kind: 'lit', ch: '<' },
            { kind: 'lit', ch: '>' },
            { kind: 'lit', ch: '=' },
          ],
        },
        { kind: 'opt', item: { kind: 'lit', ch: '=' } },
      ],
    },
  },
  shuffleOnReset: false,
  messages: {
    'label.pattern': {
      en: 'Pattern',
      ko: '무늬',
      ja: 'パターン',
      zh: '模式',
      ar: 'النمط',
      es: 'Patrón',
      fr: 'Motif',
      hi: 'पैटर्न',
      id: 'Pola',
      pt: 'Padrão',
    },
    'label.skip': {
      en: 'skip',
      ko: '건너뜀',
      ja: '省略',
      zh: '跳过',
      ar: 'تخطٍّ',
      es: 'omitir',
      fr: 'sauter',
      hi: 'छोड़ें',
      id: 'lewati',
      pt: 'pular',
    },
    'label.set': {
      en: 'Strings the pattern means',
      ko: '무늬가 뜻하는 글줄',
      ja: 'パターンが意味する文字列',
      zh: '模式所表示的字符串',
      ar: 'السلاسل التي يعنيها النمط',
      es: 'Cadenas que significa el patrón',
      fr: 'Chaînes que désigne le motif',
      hi: 'पैटर्न जिन स्ट्रिंग का अर्थ रखता है',
      id: 'String yang dimaksud pola',
      pt: 'Cadeias que o padrão significa',
    },
    'label.size': {
      en: 'Size: {n}',
      ko: '크기: {n}',
      ja: '大きさ: {n}',
      zh: '大小：{n}',
      ar: 'الحجم: {n}',
      es: 'Tamaño: {n}',
      fr: 'Taille : {n}',
      hi: 'आकार: {n}',
      id: 'Ukuran: {n}',
      pt: 'Tamanho: {n}',
    },
    'caption.start': {
      en: 'Only the pattern for now. No string has been gathered.',
      ko: '지금은 무늬뿐이다. 모인 글줄은 아직 없다.',
      ja: '今はパターンだけ。集まった文字列はまだない。',
      zh: '现在只有模式，还没有收集到字符串。',
      ar: 'لا يوجد الآن سوى النمط. لم تُجمع أي سلسلة بعد.',
      es: 'Por ahora solo está el patrón. Aún no se ha reunido ninguna cadena.',
      fr: 'Pour l’instant, seulement le motif. Aucune chaîne n’a encore été recueillie.',
      hi: 'अभी सिर्फ़ पैटर्न है। कोई स्ट्रिंग अभी इकट्ठी नहीं हुई।',
      id: 'Untuk sekarang hanya ada pola. Belum ada string yang terkumpul.',
      pt: 'Por enquanto só há o padrão. Nenhuma cadeia foi reunida ainda.',
    },
    'caption.path': {
      en: 'This path spells {text}.',
      ko: '이 길이 떨군 글줄: {text}',
      ja: 'この道が綴る文字列: {text}',
      zh: '这条路径拼出的字符串：{text}',
      ar: 'هذا المسار يكتب: {text}',
      es: 'Este camino forma: {text}',
      fr: 'Ce chemin forme : {text}',
      hi: 'यह रास्ता बनाता है: {text}',
      id: 'Jalur ini mengeja: {text}',
      pt: 'Este caminho forma: {text}',
    },
    'caption.last': {
      en: 'The last path spells {text}. No path is left.',
      ko: '마지막 길이 떨군 글줄: {text}. 남은 길은 없다.',
      ja: '最後の道が綴る文字列: {text}。残る道はない。',
      zh: '最后一条路径拼出的字符串：{text}。没有剩下的路径了。',
      ar: 'آخر مسار يكتب: {text}. لم يبقَ أي مسار.',
      es: 'El último camino forma: {text}. No queda ningún camino.',
      fr: 'Le dernier chemin forme : {text}. Il ne reste aucun chemin.',
      hi: 'आख़िरी रास्ता बनाता है: {text}। कोई रास्ता नहीं बचा।',
      id: 'Jalur terakhir mengeja: {text}. Tidak ada jalur tersisa.',
      pt: 'O último caminho forma: {text}. Não resta nenhum caminho.',
    },
  },
  blocks: {
    stage: { type: 'pattern-matches-set-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
};
