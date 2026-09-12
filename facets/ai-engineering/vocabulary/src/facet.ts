/**
 * 어휘 사전 facet 선언.
 *
 * 진행 모델은 reactive 다 (선언 자리는 `index.ts`). 마운트 직후 첫 말뭉치로 여섯
 * 낱말을 한 번 자르고, 그 뒤로는 말뭉치 손잡이를 기다린다. 재생 · 멈춤 · 한 걸음 ·
 * 되감기는 메커니즘이 진다.
 *
 * **코드 패널을 두지 않는다.** 까닭은 `irs.ts` 머리말에 적었다.
 *
 * ── 말뭉치 셋
 *
 * 셋 다 병합 40 회로 학습한다. 낱말과 빈도는 선언에 있어야 stage 가 마운트
 * 순간부터 시험 낱말을 그릴 수 있고, 저작자가 말뭉치를 갈아 볼 수도 있다 (원칙 2).
 * 여기 적힌 수로 실제 BPE 를 돌려 나온 값은 `algorithm.ts` 머리말의 표이고,
 * `test/vocabulary.test.ts` 가 그것을 잠근다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

/** 흔한 말 — 낱말 열넷. 짧고 자주 쓰이는 것뿐이다. */
const EVERYDAY: Record<string, number> = {
  the: 30,
  and: 22,
  you: 18,
  have: 14,
  they: 12,
  what: 10,
  when: 9,
  this: 16,
  that: 20,
  with: 13,
  from: 11,
  here: 8,
  there: 7,
  some: 6,
};

/** 생물학 글 — 낱말 열다섯. 어간이 겹치는 것이 많다. */
const BIOLOGY: Record<string, number> = {
  cell: 18,
  cells: 9,
  cellular: 5,
  protein: 14,
  proteins: 7,
  gene: 12,
  genes: 6,
  genetic: 8,
  organ: 10,
  organism: 6,
  tissue: 9,
  growth: 8,
  growing: 5,
  blood: 11,
  bone: 7,
};

/** 코드 — 낱말 열다섯. 복수형 `s` 와 식별자 조각이 되풀이된다. */
const CODE: Record<string, number> = {
  value: 16,
  values: 8,
  index: 12,
  indexed: 5,
  array: 14,
  arrays: 6,
  string: 13,
  strings: 6,
  number: 15,
  numbers: 7,
  object: 11,
  return: 12,
  function: 9,
  length: 10,
  count: 8,
};

/** 세 어휘에 똑같이 들이대는 낱말 여섯. 어느 말뭉치에도 그대로 들어 있지 않다. */
const TEST_WORDS = ['cellular', 'genetic', 'indexed', 'strings', 'organism', 'numbers'];

export const vocabularyFacet: FacetJson = {
  id: 'facet:vocabulary',
  title: {
    en: 'Vocabulary — what it holds decides what it cuts well',
    ko: '어휘 사전 — 무엇을 담았느냐가 무엇을 잘 자르는지 정한다',
    ja: '語彙辞書 — 何を入れたかが、何をうまく切れるかを決める',
    zh: '词表 — 装了什么，决定了它能把什么切得好',
    ar: 'المعجم — ما يحتويه يقرر ما الذي يقطعه جيدًا',
    es: 'Vocabulario: lo que contiene decide lo que corta bien',
    fr: "Vocabulaire — ce qu'il contient décide de ce qu'il découpe bien",
    hi: 'शब्दकोश — उसमें क्या है, यही तय करता है कि वह क्या अच्छे से काटेगा',
    id: 'Kosakata — apa yang dimuatnya menentukan apa yang dipotongnya dengan baik',
    pt: 'Vocabulário — o que ele contém decide o que ele corta bem',
  },
  description: {
    en: 'Three corpora train the same BPE and the same six words split differently — biology and code tie at 32 pieces yet cut opposite words well',
    ko: '같은 BPE 를 말뭉치 셋으로 학습하면 같은 여섯 낱말이 다르게 갈린다 — biology 와 code 는 합계 32 로 같은데 잘 자르는 낱말이 정반대다',
    ja: '同じ BPE を三つのコーパスで学習すると、同じ六つの単語が違う形に割れる — biology と code は合計 32 で並ぶのに、うまく切れる単語は正反対だ',
    zh: '同一套 BPE 在三份语料上训练，同样的六个词被切成不同的样子 — biology 与 code 的总数同为 32，切得好的词却正好相反',
    ar: 'ثلاث مدونات تدرّب الخوارزمية نفسها فتنقسم الكلمات الست نفسها بشكل مختلف — تتعادل biology و code عند 32 قطعة لكن كلًّا منهما يجيد قطع كلمات مختلفة',
    es: 'Tres corpus entrenan el mismo BPE y las mismas seis palabras se parten distinto: biology y code empatan en 32 piezas pero cortan bien palabras opuestas',
    fr: "Trois corpus entraînent le même BPE et les mêmes six mots se découpent autrement : biology et code totalisent 32 morceaux mais découpent bien des mots opposés",
    hi: 'तीन कोश एक ही BPE को सिखाते हैं और वही छह शब्द अलग-अलग टूटते हैं — biology और code दोनों 32 टुकड़ों पर बराबर हैं, पर जिन शब्दों को वे अच्छे से काटते हैं वे उलटे हैं',
    id: 'Tiga korpus melatih BPE yang sama dan enam kata yang sama terpotong berbeda — biology dan code sama-sama 32 keping tetapi kata yang terpotong rapi justru berlawanan',
    pt: 'Três corpora treinam o mesmo BPE e as mesmas seis palavras se partem de formas diferentes: biology e code empatam em 32 peças mas cortam bem palavras opostas',
  },
  algorithm: 'module:vocabulary',
  projector: 'module:vocabularyProjector',
  initialData: {
    type: 'vocabulary',
    corpora: [
      { name: 'everyday', words: EVERYDAY },
      { name: 'biology', words: BIOLOGY },
      { name: 'code', words: CODE },
    ],
    testWords: TEST_WORDS,
    merges: 40,
    endMark: '</w>',
    initialCorpus: 0,
    stepMs: 520,
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'header' }, { ref: 'stage', padding: '8px 0' }, { ref: 'controls' }],
  },
  messages: {
    'caption.start': {
      en: 'No vocabulary yet — every letter stands on its own.',
      ko: '아직 어휘가 없다 — 글자가 저마다 홀로 선다.',
      ja: 'まだ語彙がない — 文字が一つずつ立っている。',
      zh: '还没有词表 — 每个字母各自独立。',
      ar: 'لا معجم بعد — كل حرف يقف وحده.',
      es: 'Todavía no hay vocabulario: cada letra va por su cuenta.',
      fr: "Pas encore de vocabulaire — chaque lettre reste seule.",
      hi: 'अभी कोई शब्दकोश नहीं — हर अक्षर अकेला खड़ा है।',
      id: 'Belum ada kosakata — setiap huruf berdiri sendiri.',
      pt: 'Ainda sem vocabulário — cada letra fica sozinha.',
    },
    'caption.corpus': {
      en: 'Vocabulary learned from this corpus: {corpus}. Cutting the same six words again.',
      ko: '어휘를 학습한 말뭉치: {corpus}. 같은 여섯 낱말을 다시 자른다.',
      ja: '語彙を学んだコーパス: {corpus}。同じ六つの単語をもう一度切る。',
      zh: '学到词表的语料: {corpus}。把同样的六个词重新切一遍。',
      ar: 'المدونة التي تعلّم منها المعجم: {corpus}. نقطع الكلمات الست نفسها من جديد.',
      es: 'Corpus del que se aprendió el vocabulario: {corpus}. Cortamos otra vez las mismas seis palabras.',
      fr: "Corpus dont le vocabulaire a été appris : {corpus}. On redécoupe les mêmes six mots.",
      hi: 'जिस कोश से शब्दकोश सीखा गया: {corpus}. उन्हीं छह शब्दों को फिर से काटा जा रहा है।',
      id: 'Korpus tempat kosakata dipelajari: {corpus}. Enam kata yang sama dipotong lagi.',
      pt: 'Corpus de onde o vocabulário foi aprendido: {corpus}. Cortamos de novo as mesmas seis palavras.',
    },
    'caption.cut': {
      en: 'Word just cut: {word}. Pieces: {n}.',
      ko: '방금 자른 낱말: {word}. 조각 수: {n}.',
      ja: 'いま切った単語: {word}。断片の数: {n}。',
      zh: '刚切开的词: {word}。碎片数: {n}。',
      ar: 'الكلمة التي قُطعت للتو: {word}. عدد القطع: {n}.',
      es: 'Palabra recién cortada: {word}. Piezas: {n}.',
      fr: "Mot qui vient d'être découpé : {word}. Morceaux : {n}.",
      hi: 'अभी काटा गया शब्द: {word}. टुकड़े: {n}.',
      id: 'Kata yang baru dipotong: {word}. Keping: {n}.',
      pt: 'Palavra recém-cortada: {word}. Peças: {n}.',
    },
    'caption.settled': {
      en: 'Vocabulary {corpus} — six words in {total} pieces, vocabulary size {size}.',
      ko: '어휘 {corpus} — 여섯 낱말의 조각 합계: {total}. 어휘 크기: {size}.',
      ja: '語彙 {corpus} — 六つの単語の断片の合計: {total}。語彙の大きさ: {size}。',
      zh: '词表 {corpus} — 六个词的碎片合计: {total}。词表大小: {size}。',
      ar: 'المعجم {corpus} — مجموع قطع الكلمات الست: {total}. حجم المعجم: {size}.',
      es: 'Vocabulario {corpus}: seis palabras en {total} piezas, tamaño del vocabulario {size}.',
      fr: "Vocabulaire {corpus} — six mots en {total} morceaux, taille du vocabulaire {size}.",
      hi: 'शब्दकोश {corpus} — छह शब्दों के टुकड़ों का योग: {total}. शब्दकोश का आकार: {size}.',
      id: 'Kosakata {corpus} — enam kata menjadi {total} keping, ukuran kosakata {size}.',
      pt: 'Vocabulário {corpus} — seis palavras em {total} peças, tamanho do vocabulário {size}.',
    },
    'caption.tie': {
      en: 'Same piece total as this vocabulary: {other} — {total}. Yet the words each one cuts well are opposite.',
      ko: '합계가 같은 어휘: {other} — {total}. 그런데 각자 잘 자르는 낱말은 정반대다.',
      ja: '合計が同じ語彙: {other} — {total}。しかし、それぞれがうまく切る単語は正反対だ。',
      zh: '合计相同的词表: {other} — {total}。可它们各自切得好的词正好相反。',
      ar: 'المعجم الذي يساويه المجموع: {other} — {total}. لكن الكلمات التي يجيد كل منهما قطعها متعاكسة.',
      es: 'Vocabulario con el mismo total: {other} — {total}. Pero las palabras que cada uno corta bien son opuestas.',
      fr: "Vocabulaire au même total : {other} — {total}. Pourtant les mots que chacun découpe bien sont opposés.",
      hi: 'समान योग वाला शब्दकोश: {other} — {total}. पर दोनों जिन शब्दों को अच्छे से काटते हैं वे उलटे हैं।',
      id: 'Kosakata dengan total sama: {other} — {total}. Namun kata yang masing-masing potong rapi justru berlawanan.',
      pt: 'Vocabulário com o mesmo total: {other} — {total}. Mas as palavras que cada um corta bem são opostas.',
    },
    'label.aria': {
      en: 'Vocabulary visualization: six test words cut by the vocabulary learned from the chosen corpus, one row each',
      ko: '어휘 사전 시각화 — 고른 말뭉치로 학습한 어휘가 시험 낱말 여섯을 자른 모습을 한 줄씩 놓는다',
      ja: '語彙辞書の可視化 — 選んだコーパスで学んだ語彙が六つのテスト単語を切った姿を一行ずつ並べる',
      zh: '词表可视化 — 用所选语料学到的词表切开六个测试词，每行一个',
      ar: 'تصور المعجم: ست كلمات اختبار مقطوعة بالمعجم المتعلَّم من المدونة المختارة، كل واحدة في سطر',
      es: 'Visualización del vocabulario: seis palabras de prueba cortadas por el vocabulario aprendido del corpus elegido, una por fila',
      fr: "Visualisation du vocabulaire : six mots de test découpés par le vocabulaire appris du corpus choisi, un par ligne",
      hi: 'शब्दकोश दृश्यीकरण: चुने हुए कोश से सीखे शब्दकोश द्वारा काटे गए छह परीक्षण शब्द, हर एक अपनी पंक्ति में',
      id: 'Visualisasi kosakata: enam kata uji yang dipotong oleh kosakata hasil belajar dari korpus terpilih, satu per baris',
      pt: 'Visualização do vocabulário: seis palavras de teste cortadas pelo vocabulário aprendido do corpus escolhido, uma por linha',
    },
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'vocabulary-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        ...CONTROL_SET.playback,
        {
          widget: 'segmented-slider',
          action: 'corpus',
          name: 'corpus',
          label: {
            en: 'Corpus',
            ko: '말뭉치',
            ja: 'コーパス',
            zh: '语料',
            ar: 'المدونة',
            es: 'Corpus',
            fr: 'Corpus',
            hi: 'कोश',
            id: 'Korpus',
            pt: 'Corpus',
          },
          segments: [
            { value: 0, label: 'everyday', default: true },
            { value: 1, label: 'biology' },
            { value: 2, label: 'code' },
          ],
        },
      ],
      metrics: [
        {
          name: 'piece-sum',
          label: {
            en: 'piece total',
            ko: '조각 합계',
            ja: '断片の合計',
            zh: '碎片合计',
            ar: 'مجموع القطع',
            es: 'total de piezas',
            fr: 'total des morceaux',
            hi: 'टुकड़ों का योग',
            id: 'total keping',
            pt: 'total de peças',
          },
          initial: 0,
        },
        {
          name: 'vocabulary-size',
          label: {
            en: 'vocabulary size',
            ko: '어휘 크기',
            ja: '語彙の大きさ',
            zh: '词表大小',
            ar: 'حجم المعجم',
            es: 'tamaño del vocabulario',
            fr: 'taille du vocabulaire',
            hi: 'शब्दकोश का आकार',
            id: 'ukuran kosakata',
            pt: 'tamanho do vocabulário',
          },
          initial: 0,
        },
      ],
    },
  },
};
