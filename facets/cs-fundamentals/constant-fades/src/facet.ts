/**
 * ConstantFades facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "상수 배수를 왜 지우는가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범 (완결형 facet 과 다른 종류다):
 *   - 필수 조작 없음 — 아무것도 누르지 않아도 아홉 걸음을 마친다. 다시 보기와 한
 *     걸음은 놓친 사람과 곱씹는 사람을 위한 것이지 진행에 필요한 조작이 아니다.
 *   - 제목 없음 — header 를 두지 않는다. 제목은 글의 문단이 준다.
 *   - 메트릭 없음 — 셀 것이 없다.
 *   - layout 없음 — stage 와 controls 뿐이라 러너의 기본 배치로 족하다.
 *
 * **선언은 1차 데이터만 준다.** 상수 하나(100) · 배율 하나(10) · 두 식의 차수(1 과 2)
 * 뿐이고, 만나는 자리(n = 10 · 100 · 1000)도 그때의 값(100 · 10 000 · 1 000 000)도
 * 여기 적혀 있지 않다. 전부 algorithm 이 그 자리에서 셈한다 — 선언에 옮겨 적으면
 * 옮겨 적은 사람의 오타가 그대로 화면에 뜬다.
 *
 * ReactiveMechanism 이라 mount 즉시 스스로 재생한다. 걸음 간격은 `stepMs` 가 정하고,
 * 그 위에 stage 의 이동 애니메이션이 더해진다.
 *
 * title / description / messages 는 열 언어를 채웠다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const constantFadesFacet: FacetJson = {
  id: 'facet:constantFades',
  title: {
    en: 'Why Constants Are Dropped',
    ko: '상수를 지우는 까닭',
    ja: '定数を消す理由',
    zh: '为什么略去常数',
    ar: 'لماذا نحذف الثوابت',
    es: 'Por qué se descartan las constantes',
    fr: 'Pourquoi on supprime les constantes',
    hi: 'स्थिरांक क्यों हटाए जाते हैं',
    id: 'Mengapa konstanta dibuang',
    pt: 'Por que as constantes são descartadas',
  },
  description: {
    en: 'A constant only defers where two growth rates meet; it never reverses which one wins.',
    ko: '상수는 두 식이 만나는 자리를 미룰 뿐, 어느 쪽이 이기는지는 바꾸지 못한다.',
    ja: '定数は二つの増加速度が出会う場所を先送りするだけで、勝つ側を変えはしない。',
    zh: '常数只会推迟两种增长率相遇的位置，并不会改变最终谁胜出。',
    ar: 'الثابت يؤجّل فقط موضع التقاء معدّلي النمو، ولا يغيّر أيّهما يفوز.',
    es: 'Una constante solo aplaza dónde se encuentran dos ritmos de crecimiento; nunca cambia cuál gana.',
    fr: "Une constante ne fait que repousser le point de rencontre des deux croissances ; elle ne change jamais le vainqueur.",
    hi: 'स्थिरांक केवल यह टालता है कि दोनों वृद्धि दरें कहाँ मिलती हैं; कौन जीतेगा, यह नहीं बदलता।',
    id: 'Konstanta hanya menunda di mana dua laju pertumbuhan bertemu; tidak pernah mengubah siapa yang menang.',
    pt: 'Uma constante apenas adia onde duas taxas de crescimento se encontram; nunca muda qual delas vence.',
  },
  algorithm: 'module:constantFades',
  projector: 'module:constantFadesProjector',
  initialData: {
    type: 'constant-fades',
    constant: 100,
    factor: 10,
    linearDegree: 1,
    quadraticDegree: 2,
    stepMs: 800,
  },
  shuffleOnReset: false,
  messages: {
    'caption.axis': {
      en: 'Lay out the line where n grows.',
      ko: 'n 이 자라는 길을 편다.',
      ja: 'n が伸びていく道を敷く。',
      zh: '铺开 n 增长的那条线。',
      ar: 'نمدّ الخط الذي ينمو عليه n.',
      es: 'Tendemos la línea por donde crece n.',
      fr: "On déroule la ligne où n grandit.",
      hi: 'वह रेखा बिछाइए जिस पर n बढ़ता है।',
      id: 'Bentangkan garis tempat n bertumbuh.',
      pt: 'Estendemos a linha onde n cresce.',
    },
    'caption.leadLinear': {
      en: 'At n = {n}, {coefficient}·n is {ratio} times as large as n².',
      ko: 'n = {n} — {coefficient}·n 이 n² 의 {ratio} 배다.',
      ja: 'n = {n} — {coefficient}·n は n² の {ratio} 倍だ。',
      zh: 'n = {n} — {coefficient}·n 是 n² 的 {ratio} 倍。',
      ar: 'عند n = {n} تكون {coefficient}·n أكبر من n² بمقدار {ratio} أضعاف.',
      es: 'En n = {n}, {coefficient}·n es {ratio} veces n².',
      fr: "À n = {n}, {coefficient}·n vaut {ratio} fois n².",
      hi: 'n = {n} पर {coefficient}·n, n² से {ratio} गुना बड़ा है।',
      id: 'Pada n = {n}, {coefficient}·n adalah {ratio} kali n².',
      pt: 'Em n = {n}, {coefficient}·n é {ratio} vezes n².',
    },
    'caption.tie': {
      en: 'At n = {n} the two meet exactly: both are {value}.',
      ko: 'n = {n} — 두 식이 정확히 만난다. 둘 다 {value}.',
      ja: 'n = {n} — 二つはちょうど出会う。どちらも {value}。',
      zh: 'n = {n} — 两者恰好相遇，都是 {value}。',
      ar: 'عند n = {n} يلتقي الطرفان تماماً: كلاهما {value}.',
      es: 'En n = {n} ambos se encuentran exactamente: los dos valen {value}.',
      fr: "À n = {n}, les deux se rejoignent exactement : chacun vaut {value}.",
      hi: 'n = {n} पर दोनों ठीक मिलते हैं: दोनों {value}।',
      id: 'Pada n = {n} keduanya bertemu persis: sama-sama {value}.',
      pt: 'Em n = {n} os dois se encontram exatamente: ambos valem {value}.',
    },
    'caption.leadQuad': {
      en: 'At n = {n}, n² is {ratio} times as large as {coefficient}·n — and it never gives the lead back.',
      ko: 'n = {n} — 이제 n² 가 {coefficient}·n 의 {ratio} 배다. 다시는 자리를 내주지 않는다.',
      ja: 'n = {n} — 今度は n² が {coefficient}·n の {ratio} 倍だ。もう先頭を譲らない。',
      zh: 'n = {n} — 现在 n² 是 {coefficient}·n 的 {ratio} 倍，而且再也不会让出领先。',
      ar: 'عند n = {n} تصبح n² أكبر من {coefficient}·n بمقدار {ratio} أضعاف، ولا تتراجع بعدها أبداً.',
      es: 'En n = {n}, n² es {ratio} veces {coefficient}·n, y ya no devuelve la delantera.',
      fr: "À n = {n}, n² vaut {ratio} fois {coefficient}·n — et ne rend plus jamais la tête.",
      hi: 'n = {n} पर अब n², {coefficient}·n से {ratio} गुना है — और बढ़त कभी नहीं लौटाता।',
      id: 'Pada n = {n}, n² menjadi {ratio} kali {coefficient}·n — dan tidak pernah menyerahkan keunggulan lagi.',
      pt: 'Em n = {n}, n² é {ratio} vezes {coefficient}·n — e nunca mais devolve a liderança.',
    },
    'caption.boundary': {
      en: 'Left of the post {coefficient}·n leads; everything to the right belongs to n². The post stands at n = {meeting}.',
      ko: '기둥 왼쪽은 {coefficient}·n 이 앞서고 오른쪽은 전부 n² 의 땅이다. 기둥이 선 자리는 n = {meeting}.',
      ja: '柱の左では {coefficient}·n が勝ち、右はすべて n² の土地だ。柱が立つのは n = {meeting}。',
      zh: '柱子左边由 {coefficient}·n 领先，右边全是 n² 的地盘。柱子立在 n = {meeting}。',
      ar: 'يسار العمود تتقدّم {coefficient}·n، وكلّ ما على يمينه أرض n². يقف العمود عند n = {meeting}.',
      es: 'A la izquierda del poste manda {coefficient}·n; todo lo de la derecha es territorio de n². El poste está en n = {meeting}.',
      fr: "À gauche du poteau, {coefficient}·n mène ; tout ce qui est à droite appartient à n². Le poteau se dresse en n = {meeting}.",
      hi: 'खंभे के बाईं ओर {coefficient}·n आगे है; दाईं ओर सब कुछ n² का इलाका है। खंभा खड़ा है n = {meeting} पर।',
      id: 'Di kiri tiang, {coefficient}·n unggul; seluruh sisi kanan milik n². Tiang berdiri di n = {meeting}.',
      pt: 'À esquerda do poste, {coefficient}·n lidera; tudo à direita pertence a n². O poste fica em n = {meeting}.',
    },
    'caption.shrink': {
      en: 'Constant {coefficient} — the meeting point slides one tick to the left, to n = {meeting}.',
      ko: '상수 {coefficient} — 만나는 자리가 한 눈금 왼쪽으로 간다. n = {meeting}.',
      ja: '定数 {coefficient} — 出会う場所が目盛り一つ分だけ左へ動く。n = {meeting}。',
      zh: '常数 {coefficient} — 相遇的位置只往左挪一格，落在 n = {meeting}。',
      ar: 'الثابت {coefficient} — ينزلق موضع اللقاء درجة واحدة إلى اليسار، إلى n = {meeting}.',
      es: 'Constante {coefficient}: el punto de encuentro se desliza una marca a la izquierda, hasta n = {meeting}.',
      fr: "Constante {coefficient} : le point de rencontre glisse d'un cran vers la gauche, jusqu'à n = {meeting}.",
      hi: 'स्थिरांक {coefficient} — मिलन बिंदु एक निशान बाईं ओर खिसकता है, n = {meeting} पर।',
      id: 'Konstanta {coefficient} — titik temu bergeser satu tanda ke kiri, ke n = {meeting}.',
      pt: 'Constante {coefficient} — o ponto de encontro desliza uma marca para a esquerda, até n = {meeting}.',
    },
    'caption.grow': {
      en: 'Constant {coefficient} — raising it only pushes the meeting point right, to n = {meeting}.',
      ko: '상수 {coefficient} — 키워도 만나는 자리가 오른쪽으로 밀릴 뿐이다. n = {meeting}.',
      ja: '定数 {coefficient} — 大きくしても出会う場所が右へ押されるだけだ。n = {meeting}。',
      zh: '常数 {coefficient} — 调大它也只是把相遇的位置往右推，到 n = {meeting}。',
      ar: 'الثابت {coefficient} — تكبيره يدفع موضع اللقاء إلى اليمين فحسب، إلى n = {meeting}.',
      es: 'Constante {coefficient}: subirla solo empuja el punto de encuentro a la derecha, hasta n = {meeting}.',
      fr: "Constante {coefficient} : l'augmenter ne fait que pousser le point de rencontre vers la droite, jusqu'à n = {meeting}.",
      hi: 'स्थिरांक {coefficient} — इसे बढ़ाने से मिलन बिंदु केवल दाईं ओर खिसकता है, n = {meeting} पर।',
      id: 'Konstanta {coefficient} — menaikkannya hanya mendorong titik temu ke kanan, ke n = {meeting}.',
      pt: 'Constante {coefficient} — aumentá-la só empurra o ponto de encontro para a direita, até n = {meeting}.',
    },
    'caption.spacing': {
      en: 'A {factor}-fold constant buys exactly one tick. The right end stays with n² either way.',
      ko: '상수를 {factor} 배로 키우면 눈금 하나를 벌 뿐이다. 오른쪽 끝은 어느 쪽이든 n² 의 땅이다.',
      ja: '定数を {factor} 倍にしても目盛り一つ分を稼ぐだけだ。右の端はどちらにせよ n² の土地だ。',
      zh: '把常数放大 {factor} 倍，只能换来一格。右端无论如何都属于 n²。',
      ar: 'مضاعفة الثابت {factor} مرّات تشتري درجة واحدة فقط، أمّا الطرف الأيمن فيبقى لـ n² في الحالتين.',
      es: 'Multiplicar la constante por {factor} compra exactamente una marca. El extremo derecho sigue siendo de n².',
      fr: "Multiplier la constante par {factor} n'achète qu'un seul cran. L'extrémité droite reste à n² dans tous les cas.",
      hi: 'स्थिरांक को {factor} गुना करने से केवल एक निशान मिलता है। दायाँ छोर हर हाल में n² का रहता है।',
      id: 'Mengalikan konstanta {factor} kali hanya membeli satu tanda. Ujung kanan tetap milik n².',
      pt: 'Multiplicar a constante por {factor} compra exatamente uma marca. A ponta direita continua sendo de n².',
    },
    'caption.erase': {
      en: 'Erase the constants and the three say one thing: n against n². The constant only chose where they meet.',
      ko: '상수를 지우면 셋이 한 말이 된다 — n 과 n². 상수가 고른 것은 만나는 자리뿐이다.',
      ja: '定数を消すと三つは一つのことを言う — n と n²。定数が選んだのは出会う場所だけだ。',
      zh: '抹去常数，三者说的是同一件事 — n 与 n²。常数选定的只是相遇的位置。',
      ar: 'امسح الثوابت فتقول الحالات الثلاث شيئاً واحداً: n في مواجهة n². الثابت اختار موضع اللقاء فقط.',
      es: 'Borra las constantes y los tres dicen lo mismo: n frente a n². La constante solo eligió dónde se encuentran.',
      fr: "Effacez les constantes et les trois disent la même chose : n contre n². La constante n'a choisi que le lieu de la rencontre.",
      hi: 'स्थिरांक मिटा दीजिए और तीनों एक ही बात कहते हैं: n बनाम n²। स्थिरांक ने केवल मिलने की जगह चुनी थी।',
      id: 'Hapus konstantanya, dan ketiganya mengatakan satu hal: n lawan n². Konstanta hanya memilih di mana mereka bertemu.',
      pt: 'Apague as constantes e os três dizem a mesma coisa: n contra n². A constante só escolheu onde eles se encontram.',
    },
  },
  blocks: {
    stage: { type: 'constant-fades-stage' },
    controls: {
      type: 'control-bar',
      // ReactiveMechanism 의 reset() 은 끝에 ensureStarted() 를 부른다 — 되돌리는
      // 일이 곧 다시 재생하는 일이다. 그래서 action 은 reset 이고 라벨만 다르다.
      controls: CONTROL_SET.piece,
    },
  },
};
