/**
 * 커널 트릭 조각 facet JSON 선언.
 *
 * @piece — 질문 하나에 답하고 멈추는 조각 (S-piece).
 *
 * 질문: 직선으로 도저히 못 가르는 것은 어떻게 하는가.
 *
 * 선언이 담는 것은 구조뿐이다 — 한 줄 위의 자리 일곱과 그 이름표, 그리고 올리는
 * 법(제곱). 자름 자리도 · 오르는 높이도 · 가르는 높이 2.5 도 여기 없다. 전부
 * 파생값이라 algorithm 이 셈하고, 좌표는 stage 가 캔버스에서 역산한다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

/**
 * 한 줄 위의 일곱. 가운데 셋이 A, 바깥 넷이 B 라 A 가 B 사이에 끼어 있다 —
 * 그래서 한 줄 위에서는 어느 자리를 잘라도 갈리지 않는다.
 */
const POINTS: ReadonlyArray<{ x: number; label: string }> = [
  { x: -3, label: 'B' },
  { x: -2, label: 'B' },
  { x: -1, label: 'A' },
  { x: 0, label: 'A' },
  { x: 1, label: 'A' },
  { x: 2, label: 'B' },
  { x: 3, label: 'B' },
];

export const kernelLiftsFacet: FacetJson = {
  id: 'facet:kernelLifts',
  title: {
    en: 'Kernel Trick — lift it until a straight line will do',
    ko: '커널 트릭 — 곧은 선으로 될 때까지 들어올린다',
    ja: 'カーネルトリック — まっすぐな線で足りるまで持ち上げる',
    zh: '核技巧 — 抬到一条直线就够为止',
    ar: 'حيلة النواة — ارفعه حتى يكفي خط مستقيم',
    es: 'Truco del kernel: elévalo hasta que baste una recta',
    fr: "Astuce du noyau — soulever jusqu'à ce qu'une droite suffise",
    hi: 'कर्नेल ट्रिक — तब तक ऊपर उठाएँ जब तक एक सीधी रेखा काफ़ी न हो जाए',
    id: 'Trik kernel — angkat sampai garis lurus pun cukup',
    pt: 'Truque do kernel — eleve até que uma reta baste',
  },
  description: {
    en: 'A line that cannot be split can become one that can, one dimension up',
    ko: '못 가르던 것이 차원을 하나 올리면 갈린다',
    ja: '分けられなかったものも、次元をひとつ上げれば分けられる',
    zh: '分不开的，升一个维度就分得开',
    ar: 'ما لا يمكن فصله يصبح قابلًا للفصل ببُعد إضافي واحد',
    es: 'Lo que no se puede separar se separa con una dimensión más',
    fr: 'Ce qui ne peut pas être séparé le devient avec une dimension de plus',
    hi: 'जो बँट नहीं सकता, एक आयाम ऊपर जाकर बँट जाता है',
    id: 'Yang tak terbelah jadi terbelah begitu naik satu dimensi',
    pt: 'O que não se pode separar passa a separar-se com uma dimensão a mais',
  },
  algorithm: 'module:kernelLifts',
  projector: 'module:kernelLiftsProjector',
  initialData: {
    type: 'kernel-lifts',
    points: POINTS.map((p) => ({ ...p })),
    lift: { power: 2 },
    stepMs: 850,
  },
  blocks: {
    stage: { type: 'kernel-lifts-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.line': {
      en: 'They all sit on one line — A in the middle, B outside.',
      ko: '모두 한 줄 위에 있다. 가운데는 A, 바깥은 B.',
      ja: 'すべてが一本の線の上にある — 真ん中が A、外側が B。',
      zh: '它们都在同一条线上 — 中间是 A，外面是 B。',
      ar: 'كلها تقع على خط واحد — A في الوسط وB في الخارج.',
      es: 'Todos están sobre una misma recta: A en el medio, B fuera.',
      fr: "Ils sont tous sur une seule droite — A au milieu, B à l'extérieur.",
      hi: 'सब एक ही रेखा पर हैं — बीच में A, बाहर B।',
      id: 'Semuanya berada pada satu garis — A di tengah, B di luar.',
      pt: 'Todos estão numa mesma reta — A no meio, B por fora.',
    },
    'caption.cut': {
      en: 'Cut here — one side still holds both. ({k}/{n})',
      ko: '여기서 잘라도 한쪽에 A 와 B 가 함께 남는다. ({k}/{n})',
      ja: 'ここで切っても、片側に A と B が一緒に残る。({k}/{n})',
      zh: '在这里切，也总有一侧同时留着 A 和 B。({k}/{n})',
      ar: 'اقطع هنا — ما زال أحد الجانبين يضم الاثنين. ({k}/{n})',
      es: 'Corta aquí: un lado sigue teniendo los dos. ({k}/{n})',
      fr: 'Coupe ici — un côté contient encore les deux. ({k}/{n})',
      hi: 'यहाँ काटें — फिर भी एक ओर दोनों बचे रहते हैं। ({k}/{n})',
      id: 'Potong di sini — satu sisi masih memuat keduanya. ({k}/{n})',
      pt: 'Corte aqui — um lado ainda fica com os dois. ({k}/{n})',
    },
    'caption.noCut': {
      en: 'Every cut on the line has been tried. None works.',
      ko: '자를 수 있는 자리를 다 해 봤다. 되는 것이 없다.',
      ja: '線の上で切れる場所はすべて試した。うまくいくものはない。',
      zh: '线上能切的地方都试过了。没有一处行得通。',
      ar: 'جُرِّبت كل نقاط القطع على الخط. لا واحدة تنفع.',
      es: 'Se han probado todos los cortes de la recta. Ninguno sirve.',
      fr: 'Toutes les coupes possibles sur la droite ont été essayées. Aucune ne marche.',
      hi: 'रेखा पर काटने की हर जगह आज़मा ली। कोई काम नहीं करती।',
      id: 'Semua titik potong pada garis sudah dicoba. Tidak ada yang berhasil.',
      pt: 'Todos os cortes possíveis na reta foram tentados. Nenhum funciona.',
    },
    'caption.open': {
      en: 'So open a direction that was not there — up.',
      ko: '그래서 없던 쪽을 연다 — 위로.',
      ja: 'だから、なかった方向を開く — 上へ。',
      zh: '那就打开一个原本没有的方向 — 向上。',
      ar: 'إذًا افتح اتجاهًا لم يكن موجودًا — إلى الأعلى.',
      es: 'Entonces abre una dirección que no existía: hacia arriba.',
      fr: "Alors ouvre une direction qui n'existait pas — vers le haut.",
      hi: 'तो एक ऐसी दिशा खोलें जो थी ही नहीं — ऊपर की ओर।',
      id: 'Maka bukalah arah yang tadinya tidak ada — ke atas.',
      pt: 'Então abra uma direção que não existia — para cima.',
    },
    'caption.rise': {
      en: 'Each rises by its own value squared — height {h}.',
      ko: '제 자리를 제곱한 만큼 오른다. 오른 높이: {h}.',
      ja: 'それぞれ自分の値の二乗だけ上がる。上がった高さは {h}。',
      zh: '各自按自身值的平方上升 — 高度 {h}。',
      ar: 'يرتفع كلٌّ بمقدار مربع قيمته — الارتفاع {h}.',
      es: 'Cada uno sube el cuadrado de su propio valor: altura {h}.',
      fr: 'Chacun monte du carré de sa propre valeur — hauteur {h}.',
      hi: 'हर एक अपने मान के वर्ग जितना ऊपर उठता है — ऊँचाई {h}।',
      id: 'Masing-masing naik sebesar kuadrat nilainya — tinggi {h}.',
      pt: 'Cada um sobe o quadrado do próprio valor — altura {h}.',
    },
    'caption.curve': {
      en: 'Where they landed is not flat. It curves.',
      ko: '앉은 자리는 평평하지 않다. 굽어 있다.',
      ja: '着いた先は平らではない。曲がっている。',
      zh: '它们落下的地方并不平。是弯的。',
      ar: 'حيث استقرّت ليس مستويًا. إنه منحنٍ.',
      es: 'Donde han caído no es plano. Se curva.',
      fr: "Là où ils se posent, ce n'est pas plat. Ça se courbe.",
      hi: 'जहाँ वे बैठे, वह समतल नहीं है। वह मुड़ा हुआ है।',
      id: 'Tempat mereka mendarat tidak datar. Ia melengkung.',
      pt: 'Onde pousaram não é plano. Faz uma curva.',
    },
    'caption.place': {
      en: 'Now one straight line comes down — height {h}.',
      ko: '이제 곧은 선 하나가 내려온다. 멈춘 높이: {h}.',
      ja: 'いま、まっすぐな線が一本下りてくる。止まった高さは {h}。',
      zh: '现在一条直线落下来 — 停在高度 {h}。',
      ar: 'الآن ينزل خط مستقيم واحد — عند الارتفاع {h}.',
      es: 'Ahora baja una sola recta: altura {h}.',
      fr: 'Maintenant une seule droite descend — hauteur {h}.',
      hi: 'अब एक सीधी रेखा नीचे आती है — ऊँचाई {h}।',
      id: 'Kini satu garis lurus turun — pada tinggi {h}.',
      pt: 'Agora desce uma reta — altura {h}.',
    },
    'caption.verify': {
      en: 'All {below} below, all {above} above — nothing mixed.',
      ko: '아래는 모두 {below}, 위는 모두 {above}. 섞인 것이 없다.',
      ja: '下はすべて {below}、上はすべて {above}。混ざっているものはない。',
      zh: '下面全是 {below}，上面全是 {above} — 没有混在一起的。',
      ar: 'الأسفل كله {below} والأعلى كله {above} — لا شيء مختلط.',
      es: 'Abajo todos {below}, arriba todos {above}: nada mezclado.',
      fr: 'En bas tous {below}, en haut tous {above} — rien de mélangé.',
      hi: 'नीचे सब {below}, ऊपर सब {above} — कुछ भी मिला-जुला नहीं।',
      id: 'Di bawah semua {below}, di atas semua {above} — tidak ada yang tercampur.',
      pt: 'Embaixo todos {below}, em cima todos {above} — nada misturado.',
    },
    'caption.done': {
      en: 'It was never unsplittable. The room was too small.',
      ko: '가를 수 없던 것이 아니다. 자리가 좁았던 것이다.',
      ja: '分けられなかったのではない。場所が狭かったのだ。',
      zh: '并不是分不开。是地方太窄了。',
      ar: 'لم يكن غير قابل للفصل قط. المكان كان ضيقًا.',
      es: 'Nunca fue inseparable. El espacio era demasiado pequeño.',
      fr: "Ce n'était pas inséparable. C'est la place qui manquait.",
      hi: 'यह कभी अविभाज्य था ही नहीं। जगह ही छोटी थी।',
      id: 'Ia tidak pernah tak terbelah. Ruangnya yang terlalu sempit.',
      pt: 'Nunca foi indivisível. O espaço é que era pequeno demais.',
    },
  },
};
