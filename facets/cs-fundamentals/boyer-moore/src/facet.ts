/**
 * boyerMoore — 뒤에서 견주면 어긋남 한 번이 여러 칸을 벌어 준다.
 *
 * 손잡이 하나가 패턴 길이다. 나쁜 문자 규칙이 한 번에 미는 거리의 상한이 곧
 * 패턴 길이라, 길어질수록 한 번에 더 멀리 뛴다.
 *
 * `initialData` 에는 **1차 데이터만** 둔다 — 글 하나와 패턴 넷. 나쁜 문자 표도
 * 점프 거리도 안 본 글자 수도 algorithm 이 직접 셈한다. 여기 적어 두면 데이터를
 * 고칠 때 화면이 조용히 거짓을 말하게 된다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const boyerMooreFacet: FacetJson = {
  id: 'facet:boyerMoore',

  title: {
    en: 'Boyer-Moore',
    ko: 'Boyer-Moore',
    ja: 'Boyer-Moore',
    zh: 'Boyer-Moore',
    ar: 'Boyer-Moore',
    es: 'Boyer-Moore',
    fr: 'Boyer-Moore',
    hi: 'Boyer-Moore',
    id: 'Boyer-Moore',
    pt: 'Boyer-Moore',
  },

  description: {
    en: 'Comparing from the back turns one mismatch into a jump of many cells, and the letter that mismatched decides how many. A longer pattern jumps further.',
    ko: '뒤에서부터 견주면 어긋남 한 번이 여러 칸을 벌어 주고, 얼마나 벌지는 어긋난 그 글자가 정한다. 패턴이 길수록 한 번에 더 멀리 뛴다.',
    ja: '後ろから照合すると、一度の不一致が何マス分もの跳躍になり、跳ぶ距離は不一致だったその文字が決める。パターンが長いほど遠くまで跳ぶ。',
    zh: '从末尾开始比较，一次失配就能换来跨越多格，跨多远由那个失配的字符决定。模式越长，一次跳得越远。',
    ar: 'المقارنة من النهاية تحوّل عدم تطابق واحد إلى قفزة بعدّة خانات، والحرف غير المطابق هو من يحدد عددها. النمط الأطول يقفز أبعد.',
    es: 'Comparar desde el final convierte un solo fallo en un salto de varias casillas, y la letra que falló decide cuántas. Un patrón más largo salta más lejos.',
    fr: "Comparer depuis la fin transforme un seul échec en un bond de plusieurs cases, et c'est la lettre en échec qui décide combien. Un motif plus long bondit plus loin.",
    hi: 'पीछे से मिलान करने पर एक बार का बेमेल कई खानों की छलांग बन जाता है, और कितने खाने — यह वही बेमेल अक्षर तय करता है। पैटर्न जितना लंबा, छलांग उतनी दूर।',
    id: 'Membandingkan dari belakang mengubah satu ketidakcocokan menjadi lompatan beberapa kotak, dan huruf yang tidak cocok itulah yang menentukan berapa. Pola yang lebih panjang melompat lebih jauh.',
    pt: 'Comparar a partir do fim transforma uma única falha num salto de várias casas, e a letra que falhou decide quantas. Um padrão mais longo salta mais longe.',
  },

  algorithm: 'module:boyerMoore',
  projector: 'module:boyerMooreProjector',

  initialData: {
    type: 'boyer-moore',
    /** 자연어 77자. 되풀이가 적어 나쁜 문자 규칙이 제 일을 한다. */
    text: 'strange machines hummed inside the workshop where nobody had walked for years',
    /** 길이 2·4·6·8. 손잡이가 이 중 하나를 고른다. */
    patterns: ['he', 'here', 'nobody', 'workshop'],
    /** 손잡이의 처음 자리. 되돌리면 control-bar 가 슬라이더도 이 값으로 돌린다. */
    patternLength: 6,
    /** 걸음 사이에 쉬는 시간. 읽을 틈을 주는 저작 결정이다. */
    stepMs: 320,
  },

  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      { ref: 'stage', padding: '8px 0' },
      { ref: 'controls' },
      { ref: 'codePanel' },
    ],
  },

  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'boyer-moore-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        ...CONTROL_SET.playback,
        {
          widget: 'segmented-slider',
          action: 'pattern-length',
          name: 'patternLength',
          label: {
            en: 'Pattern length',
            ko: '패턴 길이',
            ja: 'パターンの長さ',
            zh: '模式长度',
            ar: 'طول النمط',
            es: 'Largo del patrón',
            fr: 'Longueur du motif',
            hi: 'पैटर्न की लंबाई',
            id: 'Panjang pola',
            pt: 'Tamanho do padrão',
          },
          segments: [
            { value: 2, label: '2' },
            { value: 4, label: '4' },
            { value: 6, label: '6', default: true },
            { value: 8, label: '8' },
          ],
        },
      ],
      metrics: [
        {
          name: 'jump-count',
          label: {
            en: 'Jumps',
            ko: '점프',
            ja: '跳躍',
            zh: '跳跃',
            ar: 'القفزات',
            es: 'Saltos',
            fr: 'Bonds',
            hi: 'छलांगें',
            id: 'Lompatan',
            pt: 'Saltos',
          },
          initial: 0,
        },
        {
          name: 'jump-sum',
          label: {
            en: 'Cells jumped',
            ko: '뛴 칸',
            ja: '跳んだマス',
            zh: '跳过的格数',
            ar: 'الخانات المقفوزة',
            es: 'Casillas saltadas',
            fr: 'Cases franchies',
            hi: 'कूदे गए खाने',
            id: 'Kotak dilompati',
            pt: 'Casas saltadas',
          },
          initial: 0,
        },
        {
          name: 'compare-count',
          label: {
            en: 'Comparisons',
            ko: '견줌',
            ja: '比較',
            zh: '比较',
            ar: 'المقارنات',
            es: 'Comparaciones',
            fr: 'Comparaisons',
            hi: 'तुलनाएँ',
            id: 'Perbandingan',
            pt: 'Comparações',
          },
          initial: 0,
        },
        {
          name: 'unread-count',
          label: {
            en: 'Unread',
            ko: '안 본 글자',
            ja: '未読の文字',
            zh: '未读字符',
            ar: 'حروف لم تُقرأ',
            es: 'Sin leer',
            fr: 'Non lues',
            hi: 'बिना पढ़े',
            id: 'Tak terbaca',
            pt: 'Não lidas',
          },
          initial: 0,
        },
      ],
    },
    codePanel: {
      type: 'code-view',
      ir: 'ir:boyer-moore-imperative',
      label: {
        en: 'Table and sweep',
        ko: '표와 훑기',
        ja: '表と走査',
        zh: '表与扫描',
        ar: 'الجدول والمسح',
        es: 'Tabla y barrido',
        fr: 'Table et balayage',
        hi: 'तालिका और बहाव',
        id: 'Tabel dan sapuan',
        pt: 'Tabela e varredura',
      },
    },
  },

  messages: {
    'caption.start': {
      en: 'Pattern "{pattern}" is {m} letters long. Comparing starts at its last letter.',
      ko: '패턴 {pattern} 은 {m} 글자다. 견줌은 그 마지막 글자에서 시작한다.',
      ja: 'パターン {pattern} は {m} 文字。照合はその最後の文字から始まる。',
      zh: '模式 {pattern} 有 {m} 个字符。比较从它的最后一个字符开始。',
      ar: 'النمط "{pattern}" من {m} حروف. تبدأ المقارنة من حرفه الأخير.',
      es: 'El patrón "{pattern}" tiene {m} letras. La comparación empieza por su última letra.',
      fr: 'Le motif « {pattern} » fait {m} lettres. La comparaison commence par sa dernière lettre.',
      hi: 'पैटर्न "{pattern}" {m} अक्षरों का है। मिलान उसके आखिरी अक्षर से शुरू होता है।',
      id: 'Pola "{pattern}" panjangnya {m} huruf. Perbandingan dimulai dari huruf terakhirnya.',
      pt: 'O padrão "{pattern}" tem {m} letras. A comparação começa pela última letra.',
    },

    'caption.land': {
      en: 'The pattern stands at {at}.',
      ko: '패턴이 선 자리: {at}.',
      ja: 'パターンが立つ位置: {at}。',
      zh: '模式所站的位置：{at}。',
      ar: 'موضع وقوف النمط: {at}.',
      es: 'El patrón se sitúa en {at}.',
      fr: 'Le motif se place en {at}.',
      hi: 'पैटर्न जहाँ खड़ा है: {at}।',
      id: 'Pola berdiri di {at}.',
      pt: 'O padrão fica em {at}.',
    },

    'caption.missAtEnd': {
      en: 'The last letter already differs: "{ch}".',
      ko: '끝 글자부터 어긋난다: {ch}.',
      ja: '末尾の文字からもう一致しない: {ch}。',
      zh: '从末尾字符起就不匹配：{ch}。',
      ar: 'الحرف الأخير مختلف بالفعل: "{ch}".',
      es: 'La última letra ya no coincide: "{ch}".',
      fr: 'La dernière lettre diffère déjà : « {ch} ».',
      hi: 'आखिरी अक्षर ही अलग है: "{ch}"।',
      id: 'Huruf terakhir sudah berbeda: "{ch}".',
      pt: 'A última letra já difere: "{ch}".',
    },

    'caption.missAfter': {
      en: '{n} letters match from the right, then "{ch}" breaks it.',
      ko: '오른쪽부터 {n} 글자가 맞다가 {ch} 에서 어긋난다.',
      ja: '右から {n} 文字が一致し、そこで {ch} が食い違う。',
      zh: '从右侧起有 {n} 个字符匹配，然后 {ch} 断开。',
      ar: 'تتطابق {n} حروف من اليمين، ثم يكسرها "{ch}".',
      es: '{n} letras coinciden por la derecha y luego "{ch}" lo rompe.',
      fr: '{n} lettres correspondent depuis la droite, puis « {ch} » casse tout.',
      hi: 'दाईं ओर से {n} अक्षर मिलते हैं, फिर "{ch}" पर टूट जाता है।',
      id: '{n} huruf cocok dari kanan, lalu "{ch}" memutusnya.',
      pt: '{n} letras coincidem pela direita e então "{ch}" quebra.',
    },

    'caption.skipKnown': {
      en: '"{ch}" last stands in the pattern at {last}, so the pattern slides {n}.',
      ko: '패턴 안 {ch} 가 마지막으로 선 자리는 {last}. 그래서 {n} 칸만 민다.',
      ja: 'パターン内で {ch} が最後に立つ位置は {last}。だから {n} マスだけずらす。',
      zh: '{ch} 在模式中最后出现的位置是 {last}，所以只移动 {n} 格。',
      ar: 'آخر موضع للحرف "{ch}" في النمط هو {last}، لذا ينزلق النمط {n} خانة.',
      es: '"{ch}" ocupa por última vez la posición {last} del patrón, así que este se desliza {n}.',
      fr: '« {ch} » occupe en dernier la position {last} du motif, qui glisse donc de {n}.',
      hi: 'पैटर्न में "{ch}" का अंतिम स्थान {last} है, इसलिए पैटर्न {n} खिसकता है।',
      id: '"{ch}" terakhir berdiri di posisi {last} pada pola, jadi pola bergeser {n}.',
      pt: '"{ch}" ocupa pela última vez a posição {last} do padrão, então ele desliza {n}.',
    },

    'caption.skipNone': {
      en: '"{ch}" is nowhere in the pattern, so the pattern clears it in one slide of {n}.',
      ko: '{ch} 는 패턴에 아예 없다. 그래서 {n} 칸을 한 번에 뛰어 그 글자를 지나친다.',
      ja: '{ch} はパターンに存在しない。だから {n} マスを一度に跳んでその文字を越える。',
      zh: '{ch} 根本不在模式中，于是一次跳过 {n} 格越过那个字符。',
      ar: 'الحرف "{ch}" غير موجود في النمط، فيتجاوزه النمط بانزلاقة واحدة من {n}.',
      es: '"{ch}" no está en el patrón, así que este lo deja atrás en un solo salto de {n}.',
      fr: "« {ch} » est absente du motif, qui la dépasse donc d'un seul bond de {n}.",
      hi: '"{ch}" पैटर्न में है ही नहीं, इसलिए पैटर्न {n} की एक ही छलांग में उसे पार कर जाता है।',
      id: '"{ch}" sama sekali tidak ada di pola, jadi pola melewatinya dalam satu lompatan {n}.',
      pt: '"{ch}" não está no padrão, então ele a ultrapassa num único salto de {n}.',
    },

    'caption.found': {
      en: 'Every letter matches. The pattern sits at {at}.',
      ko: '모든 글자가 맞는다. 패턴이 앉은 자리: {at}.',
      ja: 'すべての文字が一致する。パターンの位置: {at}。',
      zh: '所有字符都匹配。模式所在的位置：{at}。',
      ar: 'تتطابق كل الحروف. موضع النمط: {at}.',
      es: 'Todas las letras coinciden. El patrón está en {at}.',
      fr: 'Toutes les lettres correspondent. Le motif est en {at}.',
      hi: 'सभी अक्षर मेल खाते हैं। पैटर्न का स्थान: {at}।',
      id: 'Semua huruf cocok. Pola berada di {at}.',
      pt: 'Todas as letras coincidem. O padrão está em {at}.',
    },

    'caption.verdict': {
      en: 'Length {m}: {jumps} jumps of {avg} on average, and {unread} of {total} letters were never read.',
      ko: '길이 {m} — 점프 {jumps} 번, 평균 {avg} 칸. {total} 글자 가운데 {unread} 는 한 번도 읽지 않았다.',
      ja: '長さ {m} — 跳躍 {jumps} 回、平均 {avg} マス。{total} 文字のうち {unread} は一度も読まなかった。',
      zh: '长度 {m} —— 跳跃 {jumps} 次，平均 {avg} 格。{total} 个字符中有 {unread} 个从未读取。',
      ar: 'الطول {m}: {jumps} قفزة بمتوسط {avg}، و{unread} من {total} حرفًا لم تُقرأ إطلاقًا.',
      es: 'Largo {m}: {jumps} saltos de {avg} de media, y {unread} de {total} letras no se leyeron nunca.',
      fr: 'Longueur {m} : {jumps} bonds de {avg} en moyenne, et {unread} lettres sur {total} ne sont jamais lues.',
      hi: 'लंबाई {m}: {jumps} छलांगें, औसत {avg}, और {total} में से {unread} अक्षर कभी नहीं पढ़े गए।',
      id: 'Panjang {m}: {jumps} lompatan rata-rata {avg}, dan {unread} dari {total} huruf tak pernah dibaca.',
      pt: 'Tamanho {m}: {jumps} saltos de {avg} em média, e {unread} de {total} letras nunca foram lidas.',
    },

    'caption.waiting': {
      en: 'Move the pattern length to run the same text again.',
      ko: '패턴 길이를 밀면 같은 글을 다시 훑는다.',
      ja: 'パターンの長さを動かすと同じ文章をもう一度走査する。',
      zh: '拨动模式长度，就再扫描一遍同样的文本。',
      ar: 'حرّك طول النمط لمسح النص نفسه من جديد.',
      es: 'Mueve el largo del patrón para recorrer el mismo texto otra vez.',
      fr: 'Déplacez la longueur du motif pour reparcourir le même texte.',
      hi: 'पैटर्न की लंबाई बदलें और वही पाठ फिर से बहाया जाएगा।',
      id: 'Geser panjang pola untuk menyapu teks yang sama lagi.',
      pt: 'Mova o tamanho do padrão para percorrer o mesmo texto de novo.',
    },

    'label.avgJump': {
      en: 'average jump',
      ko: '평균 점프',
      ja: '平均の跳躍',
      zh: '平均跳跃',
      ar: 'متوسط القفزة',
      es: 'salto medio',
      fr: 'bond moyen',
      hi: 'औसत छलांग',
      id: 'lompatan rata-rata',
      pt: 'salto médio',
    },

    'label.length': {
      en: 'pattern length',
      ko: '패턴 길이',
      ja: 'パターンの長さ',
      zh: '模式长度',
      ar: 'طول النمط',
      es: 'largo del patrón',
      fr: 'longueur du motif',
      hi: 'पैटर्न की लंबाई',
      id: 'panjang pola',
      pt: 'tamanho do padrão',
    },

    'label.unread': {
      en: 'never read',
      ko: '한 번도 안 본 글자',
      ja: '一度も読まない文字',
      zh: '从未读取',
      ar: 'لم تُقرأ إطلاقًا',
      es: 'nunca leídas',
      fr: 'jamais lues',
      hi: 'कभी न पढ़े',
      id: 'tak pernah dibaca',
      pt: 'nunca lidas',
    },

    'label.trail': {
      en: 'where the pattern stood',
      ko: '패턴이 섰던 자리',
      ja: 'パターンが立った位置',
      zh: '模式站过的位置',
      ar: 'المواضع التي وقف فيها النمط',
      es: 'dónde estuvo el patrón',
      fr: 'où le motif s\'est posé',
      hi: 'पैटर्न कहाँ-कहाँ खड़ा हुआ',
      id: 'tempat pola pernah berdiri',
      pt: 'onde o padrão esteve',
    },

    'label.absent': {
      en: 'not in the pattern',
      ko: '패턴에 없는 글자',
      ja: 'パターンにない文字',
      zh: '模式中没有的字符',
      ar: 'غير موجود في النمط',
      es: 'no está en el patrón',
      fr: 'absente du motif',
      hi: 'पैटर्न में नहीं',
      id: 'tidak ada di pola',
      pt: 'não está no padrão',
    },
  },
};
