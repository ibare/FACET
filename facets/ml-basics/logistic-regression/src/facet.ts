/**
 * 로지스틱 회귀 facet JSON 선언.
 *
 * 진행 모델: ReactiveMechanism. 마운트 직후 스스로 학습을 재생하고, 다 배운
 * 뒤에도 결정 문턱 입력을 계속 받는다.
 *
 * 컨트롤: `CONTROL_SET.playback` (재생 · 한 걸음 · 멈춤 · 되감기 · 속도) 위에
 * **결정 문턱 segmented-slider** 를 얹는다. 그것이 이 완제품의 논증을 진다 —
 * 문턱을 올릴수록 헛짚음이 줄고 놓침이 늘며, 그 맞바꿈은 학습이 끝난 뒤에도
 * 독자가 고르는 값이다.
 *
 * 데이터: 점 열아홉. 이름표 0 은 아래쪽, 1 은 위쪽이며 (4.6, 4.2) 과
 * (3.4, 4.0) 에서 조금 겹친다. 겹침이 없으면 무게가 끝없이 커지고 문턱 조작이
 * 뜻을 잃는다.
 *
 * `thresholdIndex: 1` 은 아래 segmented-slider 의 `default: true` 와 같은
 * 자리를 가리켜야 한다 — 처음 화면과 슬라이더 손잡이가 어긋나지 않도록.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

/** 이름표 0 열, 이름표 1 아홉. 마지막 둘이 서로의 영역에 발을 걸친다. */
const POINTS = [
  { x: 1.0, y: 1.0, label: 0 },
  { x: 2.0, y: 1.2, label: 0 },
  { x: 1.2, y: 2.2, label: 0 },
  { x: 2.6, y: 2.0, label: 0 },
  { x: 1.8, y: 3.0, label: 0 },
  { x: 3.2, y: 1.6, label: 0 },
  { x: 3.0, y: 3.2, label: 0 },
  { x: 2.2, y: 4.0, label: 0 },
  { x: 4.0, y: 2.4, label: 0 },
  { x: 4.6, y: 4.2, label: 0 },
  { x: 4.6, y: 4.4, label: 1 },
  { x: 5.4, y: 3.6, label: 1 },
  { x: 3.8, y: 5.4, label: 1 },
  { x: 6.0, y: 4.8, label: 1 },
  { x: 4.8, y: 6.0, label: 1 },
  { x: 6.4, y: 4.0, label: 1 },
  { x: 5.6, y: 6.4, label: 1 },
  { x: 6.8, y: 5.4, label: 1 },
  { x: 3.4, y: 4.0, label: 1 },
];

/**
 * 600 걸음을 다 보이지 않는다. 앞은 촘촘하고 뒤는 성기다 — 경사하강은 앞이
 * 빠르고 뒤가 느려서, 같은 간격으로 짚으면 뒤쪽 열다섯 마디가 같은 그림이 된다.
 * 사양의 대조가 짚은 1 · 5 · 20 · 60 · 150 · 300 · 600 이 모두 들어 있다.
 */
const CHECKPOINTS = [1, 2, 3, 5, 8, 12, 20, 30, 45, 60, 90, 120, 150, 200, 250, 300, 380, 460, 530, 600];

export const logisticRegressionFacet: FacetJson = {
  id: 'facet:logisticRegression',
  title: {
    en: 'Logistic Regression — Learning a Probability, Choosing a Line',
    ko: '로지스틱 회귀 — 확률을 배우고, 선을 고른다',
    ja: 'ロジスティック回帰 — 確率を学び、線を選ぶ',
    zh: '逻辑回归 — 学出概率，选定一条线',
    ar: 'الانحدار اللوجستي — تعلّم احتمال واختيار خط',
    es: 'Regresión logística: aprender una probabilidad y elegir una línea',
    fr: 'Régression logistique — apprendre une probabilité, choisir une ligne',
    hi: 'लॉजिस्टिक प्रतिगमन — प्रायिकता सीखना, रेखा चुनना',
    id: 'Regresi logistik — mempelajari peluang, memilih garis',
    pt: 'Regressão logística — aprender uma probabilidade, escolher uma linha',
  },
  description: {
    en: 'The weights are learned; the threshold is chosen. Raise it and false alarms fall while misses rise.',
    ko: '무게는 배우고 문턱은 고른다. 올릴수록 헛짚음이 줄고 놓침이 는다.',
    ja: '重みは学び、しきい値は選ぶ。上げれば空振りが減り、見落としが増える。',
    zh: '权重是学出来的，阈值是选出来的。调高它，误报变少，漏报变多。',
    ar: 'الأوزان تُتعلَّم والعتبة تُختار. ارفعها فتقلّ الإنذارات الكاذبة ويزيد ما يفوتك.',
    es: 'Los pesos se aprenden; el umbral se elige. Súbelo y bajan las falsas alarmas mientras suben los fallos.',
    fr: 'Les poids s\'apprennent, le seuil se choisit. En le montant, les fausses alertes baissent et les oublis augmentent.',
    hi: 'भार सीखे जाते हैं, सीमा चुनी जाती है। इसे बढ़ाइए तो झूठे संकेत घटते हैं और चूक बढ़ती है।',
    id: 'Bobot dipelajari, ambang dipilih. Naikkan ambangnya: alarm palsu turun, yang terlewat bertambah.',
    pt: 'Os pesos são aprendidos; o limiar é escolhido. Suba-o e os alarmes falsos caem enquanto as omissões sobem.',
  },
  algorithm: 'module:logisticRegression',
  projector: 'module:logisticRegressionProjector',
  initialData: {
    type: 'logistic-regression',
    points: POINTS,
    eta: 0.2,
    checkpoints: CHECKPOINTS,
    thresholds: [0.3, 0.5, 0.8],
    thresholdIndex: 1,
    timings: { phaseMs: 70, frameMs: 220 },
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'stage', padding: '8px 0' }, { ref: 'controls' }, { ref: 'codePanel' }],
  },
  messages: {
    'panel.plane': {
      en: 'the plane, and where the line lands',
      ko: '평면, 그리고 선이 놓이는 자리',
      ja: '平面と、線が落ち着く場所',
      zh: '平面，以及线落在哪里',
      ar: 'المستوى، وأين يقع الخط',
      es: 'el plano y dónde cae la línea',
      fr: 'le plan, et où la ligne se pose',
      hi: 'तल, और रेखा कहाँ पड़ती है',
      id: 'bidangnya, dan di mana garis itu jatuh',
      pt: 'o plano e onde a linha cai',
    },
    'panel.ribbon': {
      en: 'the 0–1 ribbon that every z folds into',
      ko: '모든 z 가 접혀 드는 0~1 띠',
      ja: 'あらゆる z が畳み込まれる 0–1 の帯',
      zh: '每个 z 都折进去的 0–1 色带',
      ar: 'شريط 0–1 الذي ينطوي إليه كل z',
      es: 'la banda 0–1 en la que se pliega cada z',
      fr: 'le ruban 0–1 dans lequel chaque z se replie',
      hi: '0–1 की वह पट्टी जिसमें हर z मुड़ जाता है',
      id: 'pita 0–1 tempat setiap z terlipat',
      pt: 'a faixa 0–1 em que todo z se dobra',
    },
    'label.threshold': {
      en: 'threshold {th}',
      ko: '문턱 {th}',
      ja: 'しきい値 {th}',
      zh: '阈值 {th}',
      ar: 'العتبة {th}',
      es: 'umbral {th}',
      fr: 'seuil {th}',
      hi: 'सीमा {th}',
      id: 'ambang {th}',
      pt: 'limiar {th}',
    },
    'readout.params': {
      en: 'step {step} · w = ({w0}, {w1}) · b = {b} · log-loss {loss}',
      ko: '걸음 {step} · w = ({w0}, {w1}) · b = {b} · 로그손실 {loss}',
      ja: 'ステップ {step} · w = ({w0}, {w1}) · b = {b} · 対数損失 {loss}',
      zh: '第 {step} 步 · w = ({w0}, {w1}) · b = {b} · 对数损失 {loss}',
      ar: 'الخطوة {step} · w = ({w0}, {w1}) · b = {b} · الخسارة اللوغاريتمية {loss}',
      es: 'paso {step} · w = ({w0}, {w1}) · b = {b} · log-loss {loss}',
      fr: 'pas {step} · w = ({w0}, {w1}) · b = {b} · log-loss {loss}',
      hi: 'चरण {step} · w = ({w0}, {w1}) · b = {b} · लॉग-हानि {loss}',
      id: 'langkah {step} · w = ({w0}, {w1}) · b = {b} · log-loss {loss}',
      pt: 'passo {step} · w = ({w0}, {w1}) · b = {b} · log-loss {loss}',
    },
    'tally.hit': {
      en: 'right {n}',
      ko: '맞힘 {n}',
      ja: '正解 {n}',
      zh: '命中 {n}',
      ar: 'صحيح {n}',
      es: 'aciertos {n}',
      fr: 'justes {n}',
      hi: 'सही {n}',
      id: 'benar {n}',
      pt: 'acertos {n}',
    },
    'tally.miss': {
      en: 'missed {n}',
      ko: '놓침 {n}',
      ja: '見落とし {n}',
      zh: '漏报 {n}',
      ar: 'فائت {n}',
      es: 'fallos {n}',
      fr: 'manqués {n}',
      hi: 'चूक {n}',
      id: 'terlewat {n}',
      pt: 'omissões {n}',
    },
    'tally.falseAlarm': {
      en: 'false alarm {n}',
      ko: '헛짚음 {n}',
      ja: '空振り {n}',
      zh: '误报 {n}',
      ar: 'إنذار كاذب {n}',
      es: 'falsas alarmas {n}',
      fr: 'fausses alertes {n}',
      hi: 'झूठे संकेत {n}',
      id: 'alarm palsu {n}',
      pt: 'alarmes falsos {n}',
    },
    'caption.start': {
      en: 'The weights start at zero, so every point is still a coin flip.',
      ko: '무게가 0 에서 시작하니 아직 모든 점이 반반이다.',
      ja: '重みはゼロから始まるので、どの点もまだ五分五分だ。',
      zh: '权重从零开始，所以每个点还都是掷硬币。',
      ar: 'تبدأ الأوزان من الصفر، فكل نقطة ما تزال رمية عملة.',
      es: 'Los pesos empiezan en cero, así que cada punto sigue siendo cara o cruz.',
      fr: 'Les poids partent de zéro : chaque point est encore un pile ou face.',
      hi: 'भार शून्य से शुरू होते हैं, इसलिए हर बिंदु अभी भी सिक्का उछाल है।',
      id: 'Bobot mulai dari nol, jadi setiap titik masih seperti lempar koin.',
      pt: 'Os pesos começam em zero, então cada ponto ainda é um cara ou coroa.',
    },
    'caption.training': {
      en: 'The weights move, and the line and the ribbon move with them.',
      ko: '무게가 움직인다. 선과 띠가 그것을 따라 움직인다.',
      ja: '重みが動き、線と帯もそれについて動く。',
      zh: '权重在动，线和色带跟着一起动。',
      ar: 'تتحرك الأوزان، ويتحرك معها الخط والشريط.',
      es: 'Los pesos se mueven, y con ellos la línea y la banda.',
      fr: 'Les poids bougent, et la ligne et le ruban bougent avec eux.',
      hi: 'भार चलते हैं, और उनके साथ रेखा तथा पट्टी भी चलती है।',
      id: 'Bobotnya bergerak, dan garis serta pita ikut bergerak.',
      pt: 'Os pesos se movem, e a linha e a faixa se movem com eles.',
    },
    'caption.threshold': {
      en: 'The weights did not move. Only the place where you say "this one" did.',
      ko: '무게는 그대로다. 움직인 것은 "이쪽" 이라 말하는 자리뿐이다.',
      ja: '重みは動いていない。動いたのは「こっちだ」と言う場所だけだ。',
      zh: '权重没有动。动的只是你说「就是它」的那个位置。',
      ar: 'لم تتحرك الأوزان. تحرّك فقط الموضع الذي تقول عنده "هذه".',
      es: 'Los pesos no se movieron. Solo se movió el lugar donde dices "este".',
      fr: 'Les poids n\'ont pas bougé. Seul l\'endroit où vous dites "celui-ci" a bougé.',
      hi: 'भार नहीं हिले। हिला केवल वह जगह जहाँ आप कहते हैं "यह वाला"।',
      id: 'Bobotnya tidak bergerak. Yang bergerak hanya tempat Anda berkata "yang ini".',
      pt: 'Os pesos não se moveram. Moveu-se apenas o lugar onde você diz "este".',
    },
    'caption.done': {
      en: 'Learning is over. Where to draw the line is still yours to pick.',
      ko: '학습은 끝났다. 어디서 선을 그을지는 여전히 읽는 이가 고른다.',
      ja: '学習は終わった。どこで線を引くかは、なお読み手が選ぶ。',
      zh: '学习结束了。线画在哪里，仍然由你来选。',
      ar: 'انتهى التعلّم. أما أين تُرسم الحدود فما زال اختيارك.',
      es: 'El aprendizaje terminó. Dónde trazar la línea sigue siendo tu elección.',
      fr: 'L\'apprentissage est fini. Où tracer la ligne reste votre choix.',
      hi: 'सीखना समाप्त। रेखा कहाँ खींचनी है, यह अब भी आपका चुनाव है।',
      id: 'Pembelajaran selesai. Di mana garis ditarik tetap pilihan Anda.',
      pt: 'O aprendizado acabou. Onde traçar a linha ainda é escolha sua.',
    },
  },
  blocks: {
    stage: { type: 'logistic-regression-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        ...CONTROL_SET.playback,
        {
          widget: 'segmented-slider',
          action: 'threshold',
          name: 'threshold',
          label: {
            en: 'Decision threshold',
            ko: '결정 문턱', ja: '判定のしきい値', zh: '决策阈值',
            ar: 'عتبة القرار',
            es: 'Umbral de decisión',
            fr: 'Seuil de décision',
            hi: 'निर्णय सीमा',
            id: 'Ambang keputusan',
            pt: 'Limiar de decisão',
          },
          segments: [
            { value: 0.3, label: '0.3' },
            { value: 0.5, label: '0.5', default: true },
            { value: 0.8, label: '0.8' },
          ],
        },
      ],
      metrics: [
        {
          name: 'step-count',
          label: {
            en: 'steps',
            ko: '걸음', ja: '歩', zh: '步',
            ar: 'خطوات',
            es: 'pasos',
            fr: 'pas',
            hi: 'चरण',
            id: 'langkah',
            pt: 'passos',
          },
          initial: 0,
        },
        {
          name: 'log-loss',
          label: {
            en: 'avg log-loss',
            ko: '평균 로그손실', ja: '平均対数損失', zh: '平均对数损失',
            ar: 'متوسط الخسارة اللوغاريتمية',
            es: 'log-loss medio',
            fr: 'log-loss moyen',
            hi: 'औसत लॉग-हानि',
            id: 'rata-rata log-loss',
            pt: 'log-loss médio',
          },
          initial: 0,
        },
        {
          name: 'correct-count',
          label: {
            en: 'right at this threshold',
            ko: '이 문턱에서 맞힌 수', ja: 'このしきい値で当てた数', zh: '此阈值下答对数',
            ar: 'الصحيح عند هذه العتبة',
            es: 'aciertos con este umbral',
            fr: 'justes à ce seuil',
            hi: 'इस सीमा पर सही',
            id: 'benar pada ambang ini',
            pt: 'acertos neste limiar',
          },
          initial: 0,
        },
      ],
    },
    codePanel: {
      type: 'code-view',
      label: {
        en: 'one training step',
        ko: '학습 한 판', ja: '学習ひと回し', zh: '一轮训练',
        ar: 'خطوة تدريب واحدة',
        es: 'un paso de entrenamiento',
        fr: 'un pas d\'entraînement',
        hi: 'एक प्रशिक्षण चरण',
        id: 'satu langkah pelatihan',
        pt: 'um passo de treino',
      },
      ir: 'ir:logistic-regression',
    },
  },
};
