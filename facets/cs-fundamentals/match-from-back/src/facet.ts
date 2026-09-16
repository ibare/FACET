/**
 * match-from-back — 뒤에서부터 견주면 앞을 안 봐도 된다.
 *
 * @piece 질문 하나에 답하고 멈추는 조각 (S-piece).
 *
 * 화면에 뜨는 수는 전부 실측이다. 글 `here is a simple example` 스물넷과 패턴
 * `example` 일곱을 다섯 자리에서 견주면 비교가 열다섯 번이고, 스물넷 가운데
 * 열하나는 한 번도 읽히지 않는다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const matchFromBackFacet: FacetJson = {
  id: 'facet:matchFromBack',
  title: {
    en: 'Matching from the back',
    ko: '뒤에서부터 견주기',
    ja: '後ろから照合する',
    zh: '从末尾开始比较',
    ar: 'المطابقة من النهاية',
    es: 'Comparar desde el final',
    fr: 'Comparer depuis la fin',
    hi: 'पीछे से मिलान',
    id: 'Mencocokkan dari belakang',
    pt: 'Comparar a partir do fim',
  },
  description: {
    en: 'Comparing a pattern from its last character rules out whole positions without reading the front.',
    ko: '패턴을 마지막 글자부터 견주면 앞을 읽지 않고도 자리 하나가 통째로 걸러진다.',
    ja: 'パターンを最後の文字から照合すると、前を読まずに位置ごと除外できる。',
    zh: '从模式的最后一个字符开始比较，无需读取前面就能整体排除一个位置。',
    ar: 'مقارنة النمط بدءًا من حرفه الأخير تستبعد مواضع كاملة دون قراءة أولها.',
    es: 'Comparar el patrón desde su último carácter descarta posiciones enteras sin leer el principio.',
    fr: "Comparer le motif à partir de son dernier caractère écarte des positions entières sans lire le début.",
    hi: 'पैटर्न को उसके अंतिम अक्षर से मिलाने पर आगे का हिस्सा पढ़े बिना पूरी स्थिति हट जाती है।',
    id: 'Membandingkan pola dari karakter terakhirnya menyingkirkan posisi utuh tanpa membaca bagian depan.',
    pt: 'Comparar o padrão a partir do último caractere descarta posições inteiras sem ler o começo.',
  },
  algorithm: 'module:matchFromBack',
  scene: 'module:matchFromBackScene',
  initialData: {
    type: 'match-from-back',
    text: 'here is a simple example',
    pattern: 'example',
    // 밟아 볼 자리. 어긋난 뒤 얼마나 뛸지는 이 조각이 답하는 질문이 아니라
    // (그것은 이웃 조각의 몫이다) 어느 자리를 보일지가 저작 결정이다.
    shifts: [0, 7, 9, 12, 17],
    stepMs: 780,
  },
  blocks: {
    stage: { type: 'match-from-back-stage' },
    controls: {
      type: 'control-bar',
      // 스크럽 띠. 장면 방식이라 어느 걸음이든 셈으로 얻으므로 끌어 볼 수 있다.
      controls: CONTROL_SET.pieceScrub,
    },
  },
  messages: {
    'caption.land': {
      en: 'The pattern is lined up at position {shift}.',
      ko: '패턴을 맞춰 놓은 자리: {shift}.',
      ja: 'パターンを合わせた位置: {shift}。',
      zh: '模式对齐的位置：{shift}。',
      ar: 'موضع محاذاة النمط: {shift}.',
      es: 'Posición donde se alinea el patrón: {shift}.',
      fr: 'Position où le motif est aligné : {shift}.',
      hi: 'पैटर्न जहाँ रखा गया है वह स्थान: {shift}।',
      id: 'Posisi tempat pola disejajarkan: {shift}.',
      pt: 'Posição onde o padrão foi alinhado: {shift}.',
    },
    'caption.killedAtOnce': {
      en: 'One comparison at the back rules this position out. Characters left unread: {unread}.',
      ko: '뒤에서 한 번 견주자 이 자리가 통째로 날아간다. 읽지 않은 글자: {unread}.',
      ja: '後ろで一度照合しただけでこの位置が丸ごと消える。読まなかった文字: {unread}。',
      zh: '在末尾比较一次，这个位置就整体排除。没有读取的字符：{unread}。',
      ar: 'مقارنة واحدة في النهاية تستبعد هذا الموضع بأكمله. الحروف التي لم تُقرأ: {unread}.',
      es: 'Una comparación al final descarta toda esta posición. Caracteres sin leer: {unread}.',
      fr: 'Une seule comparaison à la fin élimine toute cette position. Caractères non lus : {unread}.',
      hi: 'पीछे एक बार मिलान करते ही यह पूरी स्थिति हट जाती है। बिना पढ़े रह गए अक्षर: {unread}।',
      id: 'Satu perbandingan di belakang menyingkirkan seluruh posisi ini. Karakter yang tidak dibaca: {unread}.',
      pt: 'Uma comparação no fim descarta toda esta posição. Caracteres não lidos: {unread}.',
    },
    'caption.brokeAfterTail': {
      en: 'The back matches for a while, then breaks. Characters matched: {matched}.',
      ko: '뒤에서부터 맞다가 어긋난다. 맞은 글자: {matched}.',
      ja: '後ろからしばらく一致してから外れる。一致した文字: {matched}。',
      zh: '从末尾一路匹配，然后失配。匹配的字符：{matched}。',
      ar: 'تتطابق النهاية لبعض الحروف ثم تختلف. الحروف المتطابقة: {matched}.',
      es: 'El final coincide un tramo y luego falla. Caracteres coincidentes: {matched}.',
      fr: 'La fin correspond un moment, puis échoue. Caractères concordants : {matched}.',
      hi: 'पीछे से कुछ अक्षर मिलते हैं, फिर मेल टूट जाता है। मिले अक्षर: {matched}।',
      id: 'Bagian belakang cocok sejenak, lalu meleset. Karakter yang cocok: {matched}.',
      pt: 'O fim coincide por um trecho e depois falha. Caracteres coincidentes: {matched}.',
    },
    'caption.found': {
      en: 'Every character matches from the back. The pattern sits at position {shift}.',
      ko: '뒤에서부터 전부 맞는다. 패턴이 앉은 자리: {shift}.',
      ja: '後ろから全部一致する。パターンの位置: {shift}。',
      zh: '从末尾一路全部匹配。模式所在的位置：{shift}。',
      ar: 'تتطابق كل الحروف من النهاية. موضع النمط: {shift}.',
      es: 'Todo coincide desde el final. Posición del patrón: {shift}.',
      fr: 'Tout correspond depuis la fin. Position du motif : {shift}.',
      hi: 'पीछे से सभी अक्षर मिल जाते हैं। पैटर्न का स्थान: {shift}।',
      id: 'Semua cocok dari belakang. Posisi pola: {shift}.',
      pt: 'Tudo coincide a partir do fim. Posição do padrão: {shift}.',
    },
    'caption.tally': {
      en: 'Comparisons made: {comparisons}. Characters never looked at: {never}.',
      ko: '견줌: {comparisons}. 한 번도 안 본 글자: {never}.',
      ja: '比較の回数: {comparisons}。一度も見なかった文字: {never}。',
      zh: '比较次数：{comparisons}。从未查看的字符：{never}。',
      ar: 'عدد المقارنات: {comparisons}. الحروف التي لم يُنظر إليها إطلاقًا: {never}.',
      es: 'Comparaciones realizadas: {comparisons}. Caracteres nunca mirados: {never}.',
      fr: 'Comparaisons effectuées : {comparisons}. Caractères jamais regardés : {never}.',
      hi: 'कुल तुलनाएँ: {comparisons}। कभी न देखे गए अक्षर: {never}।',
      id: 'Jumlah perbandingan: {comparisons}. Karakter yang tak pernah dilihat: {never}.',
      pt: 'Comparações feitas: {comparisons}. Caracteres nunca observados: {never}.',
    },
  },
};
