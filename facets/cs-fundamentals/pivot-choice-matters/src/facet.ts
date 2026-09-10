/**
 * pivot-choice-matters facet JSON.
 *
 * @piece 조각 — 질문 하나에 답하고 멈춘다 (S-piece).
 *   "기준을 어디서 고르느냐가 남는 일의 크기를 정하는가?"
 *
 * 같은 값들을 두 가지 기준으로 각각 한 번씩 가르고, 두 결과를 한 화면에 남겨
 * 견주게 한다. 컨트롤은 다시 보기와 한 걸음 — 둘 다 눌러야 완성되는 조작이
 * 아니다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const pivotChoiceMattersFacet: FacetJson = {
  id: 'facet:pivotChoiceMatters',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: {
    en: 'Pivot choice',
    ko: '피벗 선택',
    ja: 'ピボットの選び方',
    zh: '基准值的选择',
    ar: 'اختيار المحور',
    es: 'Elección del pivote',
    fr: 'Choix du pivot',
    hi: 'पिवट का चुनाव',
    id: 'Pemilihan pivot',
    pt: 'Escolha do pivô',
  },
  description: {
    en: 'Splitting the same sorted values twice: the middle value halves the work, the first value removes one.',
    ko: '이미 줄이 선 같은 값들을 두 번 가른다. 가운데 값은 일을 반으로 줄이고, 맨 앞 값은 하나만 줄인다.',
    ja: '同じ並んだ値を二通りに割る。真ん中の値は仕事を半分にし、先頭の値はひとつ減らすだけだ。',
    zh: '把同一组已排好的值切两次：取中间值可把工作量减半，取第一个值只减少一个。',
    ar: 'نقسم القيم المرتَّبة نفسها مرتين: القيمة الوسطى تنصّف العمل، والقيمة الأولى تزيل واحدة فقط.',
    es: 'Se parten dos veces los mismos valores ordenados: el valor central reduce el trabajo a la mitad, el primero solo quita uno.',
    fr: "On découpe deux fois les mêmes valeurs triées : la valeur du milieu divise le travail par deux, la première n'en retire qu'une.",
    hi: 'एक ही क्रमित मानों को दो बार बाँटना: बीच का मान काम आधा कर देता है, पहला मान केवल एक घटाता है।',
    id: 'Memecah nilai terurut yang sama dua kali: nilai tengah memangkas separuh pekerjaan, nilai pertama hanya mengurangi satu.',
    pt: 'Partir duas vezes os mesmos valores ordenados: o valor do meio reduz o trabalho à metade, o primeiro tira apenas um.',
  },
  algorithm: 'module:pivotChoiceMatters',
  projector: 'module:pivotChoiceMattersProjector',
  initialData: {
    type: 'pivot-choice-matters',
    // 이미 줄이 선 입력. 셔플하면 이 조각의 전제가 사라지므로 shuffleOnReset 은 켜지 않는다.
    values: [1, 2, 3, 4, 5, 6, 7],
    // 같은 값들을 두 가지 기준으로 — 가운데 값(4), 그다음 맨 앞 값(1).
    trials: [{ pivotIndex: 3 }, { pivotIndex: 0 }],
    stepMs: 850,
  },
  blocks: {
    stage: { type: 'pivot-choice-matters-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
  messages: {
    'caption.pickMiddle': {
      en: 'Take the middle value {pivot} as the pivot.',
      ko: '가운데 값 {pivot} 을 기준으로 삼는다.',
      ja: '真ん中の値 {pivot} をピボットにする。',
      zh: '取中间的值 {pivot} 作为基准。',
      ar: 'اتخذ القيمة الوسطى {pivot} محورًا.',
      es: 'Toma el valor central {pivot} como pivote.',
      fr: 'Prendre la valeur du milieu {pivot} comme pivot.',
      hi: 'बीच के मान {pivot} को पिवट बनाएँ।',
      id: 'Ambil nilai tengah {pivot} sebagai pivot.',
      pt: 'Toma o valor do meio {pivot} como pivô.',
    },
    'caption.pickFirst': {
      en: 'Now take the first value {pivot} as the pivot — the input is already sorted.',
      ko: '이번엔 맨 앞 값 {pivot} 을 기준으로 삼는다. 입력은 이미 줄이 서 있다.',
      ja: '今度は先頭の値 {pivot} をピボットにする — 入力はすでに並んでいる。',
      zh: '这次取第一个值 {pivot} 作为基准 — 输入本来就已排好序。',
      ar: 'والآن اتخذ القيمة الأولى {pivot} محورًا — المدخلات مرتَّبة أصلًا.',
      es: 'Ahora toma el primer valor {pivot} como pivote: la entrada ya viene ordenada.',
      fr: "Maintenant, prendre la première valeur {pivot} comme pivot — l'entrée est déjà triée.",
      hi: 'अब पहले मान {pivot} को पिवट बनाएँ — इनपुट पहले से ही क्रमित है।',
      id: 'Sekarang ambil nilai pertama {pivot} sebagai pivot — masukannya sudah terurut.',
      pt: 'Agora toma o primeiro valor {pivot} como pivô — a entrada já está ordenada.',
    },
    'caption.splitEven': {
      en: '{left} slide left, {right} slide right. The beam stays level.',
      ko: '{left} 개는 왼쪽, {right} 개는 오른쪽. 저울대가 수평으로 멎는다.',
      ja: '{left} 個が左へ、{right} 個が右へ。天秤は水平のまま止まる。',
      zh: '{left} 个滑向左边，{right} 个滑向右边。横梁保持水平。',
      ar: '{left} تنزلق يسارًا و{right} يمينًا. تبقى الكفّة متوازنة.',
      es: '{left} se van a la izquierda, {right} a la derecha. La barra queda nivelada.',
      fr: '{left} glissent à gauche, {right} à droite. Le fléau reste horizontal.',
      hi: '{left} बाएँ सरकते हैं, {right} दाएँ। तराजू सीधा टिका रहता है।',
      id: '{left} meluncur ke kiri, {right} ke kanan. Lengannya tetap datar.',
      pt: '{left} deslizam para a esquerda, {right} para a direita. A barra fica nivelada.',
    },
    'caption.pileOneSide': {
      en: 'Nothing is smaller than {pivot} — all {loaded} pile onto one side.',
      ko: '{pivot} 보다 작은 값이 없다. {loaded} 개가 모두 한쪽으로 쏠린다.',
      ja: '{pivot} より小さい値がない — {loaded} 個すべてが片側に積み上がる。',
      zh: '没有比 {pivot} 更小的值 — {loaded} 个全都堆到一边。',
      ar: 'لا شيء أصغر من {pivot} — تتكدّس {loaded} كلها في جهة واحدة.',
      es: 'Nada es menor que {pivot}: los {loaded} se amontonan en un solo lado.',
      fr: "Rien n'est plus petit que {pivot} — les {loaded} s'entassent d'un seul côté.",
      hi: '{pivot} से छोटा कुछ नहीं — सभी {loaded} एक ही तरफ ढेर हो जाते हैं।',
      id: 'Tidak ada yang lebih kecil dari {pivot} — semua {loaded} menumpuk di satu sisi.',
      pt: 'Nada é menor que {pivot} — os {loaded} amontoam-se todos de um lado.',
    },
    'caption.workHalved': {
      en: 'The biggest part left holds {remaining} of {total} — the work halved.',
      ko: '남는 일은 {total} 중 {remaining}. 일이 반으로 줄었다.',
      ja: '残る最大の塊は {total} のうち {remaining} — 仕事が半分になった。',
      zh: '剩下最大的一块是 {total} 中的 {remaining} — 工作量减半了。',
      ar: 'أكبر جزء متبقٍّ يضم {remaining} من {total} — انخفض العمل إلى النصف.',
      es: 'La parte mayor que queda tiene {remaining} de {total}: el trabajo se redujo a la mitad.',
      fr: 'La plus grande part restante contient {remaining} sur {total} — le travail est divisé par deux.',
      hi: 'बचा सबसे बड़ा हिस्सा {total} में से {remaining} है — काम आधा रह गया।',
      id: 'Bagian tersisa terbesar berisi {remaining} dari {total} — pekerjaan berkurang separuh.',
      pt: 'A maior parte restante tem {remaining} de {total} — o trabalho caiu pela metade.',
    },
    'caption.workBarelySmaller': {
      en: 'The biggest part left holds {remaining} of {total} — only the pivot is gone.',
      ko: '남는 일은 {total} 중 {remaining}. 기준 하나가 빠졌을 뿐이다.',
      ja: '残る最大の塊は {total} のうち {remaining} — ピボットひとつが抜けただけだ。',
      zh: '剩下最大的一块是 {total} 中的 {remaining} — 只少了基准那一个。',
      ar: 'أكبر جزء متبقٍّ يضم {remaining} من {total} — لم يخرج سوى المحور.',
      es: 'La parte mayor que queda tiene {remaining} de {total}: solo se fue el pivote.',
      fr: 'La plus grande part restante contient {remaining} sur {total} — seul le pivot a disparu.',
      hi: 'बचा सबसे बड़ा हिस्सा {total} में से {remaining} है — सिर्फ़ पिवट निकला है।',
      id: 'Bagian tersisa terbesar berisi {remaining} dari {total} — hanya pivotnya yang hilang.',
      pt: 'A maior parte restante tem {remaining} de {total} — só o pivô saiu.',
    },
  },
};
