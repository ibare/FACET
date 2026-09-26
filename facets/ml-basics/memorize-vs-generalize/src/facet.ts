import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

/**
 * @piece
 * 질문: 본 문제를 다 맞히는 쪽이 새 문제도 잘 맞히는가?
 *
 * 같은 여섯 예를 받은 두 답안자 — 외운 쪽(가장 가까운 예의 답)과 배운 쪽(문턱 하나) — 에게
 * 본 문제 여섯을 먼저, 새 문제 다섯을 뒤에 묻는다. 앞선 쪽이 위 자리에 서고, 새 문제에서 자리가 뒤바뀐다.
 */
export const memorizeVsGeneralizeFacet: FacetJson = {
  id: 'facet:memorizeVsGeneralize',
  title: {
    en: 'Memorize vs. generalize',
    ko: '외우기와 일반화',
    ja: '暗記と汎化',
    zh: '死记与泛化',
    ar: 'الحفظ مقابل التعميم',
    es: 'Memorizar frente a generalizar',
    fr: 'Mémoriser ou généraliser',
    hi: 'रटना बनाम सामान्यीकरण',
    id: 'Menghafal vs. menggeneralisasi',
    pt: 'Memorizar vs. generalizar',
  },
  description: {
    en: 'Two answerers get the same six examples: one memorizes them, one learns a single threshold. Asked the seen questions and then new ones, they trade places.',
    ko: '같은 여섯 예를 받은 두 답안자 — 하나는 예를 외우고 하나는 문턱 하나를 배운다. 본 문제와 새 문제를 차례로 물으면 둘의 자리가 뒤바뀐다.',
    ja: '同じ六つの例を受け取った二人の回答者 — 一人は例を暗記し、一人はしきい値を一つ学ぶ。見た問題、続いて新しい問題を尋ねると、二人の順位が入れ替わる。',
    zh: '两位答题者拿到同样的六个例子——一位把例子背下来，一位学会一个阈值。先问见过的题，再问新题，两人的位置互换。',
    ar: 'مُجيبان يتلقّيان الأمثلة الستة نفسها: أحدهما يحفظها والآخر يتعلّم عتبة واحدة. عند سؤالهما الأسئلة المرئية ثم الجديدة يتبادلان المكان.',
    es: 'Dos personas reciben los mismos seis ejemplos: una los memoriza y otra aprende un solo umbral. Al preguntarles lo visto y luego lo nuevo, intercambian posiciones.',
    fr: 'Deux répondants reçoivent les mêmes six exemples : l’un les mémorise, l’autre apprend un seul seuil. Interrogés sur les questions vues puis sur de nouvelles, ils échangent leurs places.',
    hi: 'दो उत्तरदाताओं को वही छह उदाहरण मिलते हैं: एक उन्हें रट लेता है, दूसरा एक सीमा सीखता है। देखे गए और फिर नए प्रश्न पूछने पर उनकी जगह बदल जाती है।',
    id: 'Dua penjawab menerima enam contoh yang sama: satu menghafalnya, satu mempelajari satu ambang. Ditanya soal yang dilihat lalu soal baru, posisi mereka bertukar.',
    pt: 'Dois respondentes recebem os mesmos seis exemplos: um os memoriza, o outro aprende um único limiar. Perguntados sobre o que viram e depois sobre o novo, trocam de lugar.',
  },
  algorithm: 'module:memorizeVsGeneralize',
  scene: 'module:memorizeVsGeneralizeScene',
  initialData: {
    type: 'memorize-vs-generalize',
    stepMs: 1000,
    seen: [
      { x: 1.2, y: 0 },
      { x: 3.1, y: 0 },
      { x: 5.3, y: 1 },
      { x: 6.4, y: 1 },
      { x: 7.3, y: 0 },
      { x: 8.5, y: 1 },
    ],
    fresh: [
      { x: 2.2, y: 0 },
      { x: 5.9, y: 1 },
      { x: 7.0, y: 1 },
      { x: 7.6, y: 1 },
      { x: 9.1, y: 1 },
    ],
  },
  shuffleOnReset: false,
  messages: {
    'label.memo': {
      en: 'Memorizer', ko: '외운 쪽', ja: '暗記する側', zh: '死记的一方', ar: 'الحافظ',
      es: 'Memorizador', fr: 'Mémoriseur', hi: 'रटने वाला', id: 'Penghafal', pt: 'Memorizador',
    },
    'label.rule': {
      en: 'Learner', ko: '배운 쪽', ja: '規則を学ぶ側', zh: '学规律的一方', ar: 'المتعلّم',
      es: 'Aprendiz', fr: 'Apprenant', hi: 'सीखने वाला', id: 'Pembelajar', pt: 'Aprendiz',
    },
    'label.seen': {
      en: 'Seen questions', ko: '본 문제', ja: '見た問題', zh: '见过的题', ar: 'أسئلة سبق رؤيتها',
      es: 'Preguntas vistas', fr: 'Questions vues', hi: 'देखे गए प्रश्न', id: 'Soal yang dilihat', pt: 'Questões vistas',
    },
    'label.fresh': {
      en: 'New questions', ko: '새 문제', ja: '新しい問題', zh: '新题', ar: 'أسئلة جديدة',
      es: 'Preguntas nuevas', fr: 'Questions nouvelles', hi: 'नए प्रश्न', id: 'Soal baru', pt: 'Questões novas',
    },
    'label.threshold': {
      en: 't = {t}', ko: 't = {t}', ja: 't = {t}', zh: 't = {t}', ar: 't = {t}',
      es: 't = {t}', fr: 't = {t}', hi: 't = {t}', id: 't = {t}', pt: 't = {t}',
    },
    'label.question': {
      en: 'x = {x}', ko: 'x = {x}', ja: 'x = {x}', zh: 'x = {x}', ar: 'x = {x}',
      es: 'x = {x}', fr: 'x = {x}', hi: 'x = {x}', id: 'x = {x}', pt: 'x = {x}',
    },
    'label.score': {
      en: '{n}/{total}', ko: '{n}/{total}', ja: '{n}/{total}', zh: '{n}/{total}', ar: '{n}/{total}',
      es: '{n}/{total}', fr: '{n}/{total}', hi: '{n}/{total}', id: '{n}/{total}', pt: '{n}/{total}',
    },
    'label.right': {
      en: 'Right', ko: '맞음', ja: '正解', zh: '对', ar: 'صحيح',
      es: 'Acierto', fr: 'Juste', hi: 'सही', id: 'Benar', pt: 'Certo',
    },
    'label.wrong': {
      en: 'Wrong', ko: '틀림', ja: '不正解', zh: '错', ar: 'خطأ',
      es: 'Fallo', fr: 'Faux', hi: 'गलत', id: 'Salah', pt: 'Errado',
    },
    'label.ahead': {
      en: 'Ahead', ko: '앞섬', ja: 'リード', zh: '领先', ar: 'متقدّم',
      es: 'Delante', fr: 'En tête', hi: 'आगे', id: 'Unggul', pt: 'À frente',
    },
    'caption.ready': {
      en: 'Both answerers studied the same seen questions. Learned threshold: t = {t}',
      ko: '두 답안자가 같은 본 문제로 익혔다. 배운 문턱: t = {t}',
      ja: '二人の回答者が同じ見た問題で学んだ。学んだしきい値: t = {t}',
      zh: '两位答题者用同样的见过的题学习。学到的阈值：t = {t}',
      ar: 'درس المُجيبان الأسئلة نفسها التي سبق رؤيتها. العتبة المتعلَّمة: t = {t}',
      es: 'Ambos estudiaron las mismas preguntas vistas. Umbral aprendido: t = {t}',
      fr: 'Les deux ont étudié les mêmes questions vues. Seuil appris : t = {t}',
      hi: 'दोनों ने वही देखे गए प्रश्न पढ़े। सीखी गई सीमा: t = {t}',
      id: 'Keduanya mempelajari soal yang dilihat yang sama. Ambang yang dipelajari: t = {t}',
      pt: 'Ambos estudaram as mesmas questões vistas. Limiar aprendido: t = {t}',
    },
    'caption.seen': {
      en: 'Seen question {i} — x = {x} · true answer: {y}',
      ko: '본 문제 {i} — x = {x} · 정답: {y}',
      ja: '見た問題 {i} — x = {x} · 正答: {y}',
      zh: '见过的题 {i} — x = {x} · 正确答案：{y}',
      ar: 'سؤال سبق رؤيته {i} — x = {x} · الإجابة الصحيحة: {y}',
      es: 'Pregunta vista {i} — x = {x} · respuesta correcta: {y}',
      fr: 'Question vue {i} — x = {x} · bonne réponse : {y}',
      hi: 'देखा गया प्रश्न {i} — x = {x} · सही उत्तर: {y}',
      id: 'Soal yang dilihat {i} — x = {x} · jawaban benar: {y}',
      pt: 'Questão vista {i} — x = {x} · resposta certa: {y}',
    },
    'caption.fresh': {
      en: 'New question {i} — x = {x} · true answer: {y}',
      ko: '새 문제 {i} — x = {x} · 정답: {y}',
      ja: '新しい問題 {i} — x = {x} · 正答: {y}',
      zh: '新题 {i} — x = {x} · 正确答案：{y}',
      ar: 'سؤال جديد {i} — x = {x} · الإجابة الصحيحة: {y}',
      es: 'Pregunta nueva {i} — x = {x} · respuesta correcta: {y}',
      fr: 'Nouvelle question {i} — x = {x} · bonne réponse : {y}',
      hi: 'नया प्रश्न {i} — x = {x} · सही उत्तर: {y}',
      id: 'Soal baru {i} — x = {x} · jawaban benar: {y}',
      pt: 'Questão nova {i} — x = {x} · resposta certa: {y}',
    },
  },
  blocks: {
    stage: { type: 'memorize-vs-generalize-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
};
