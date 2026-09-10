/**
 * circular-buffer-wrap facet JSON.
 *
 * @piece 끝에 닿으면 앞으로 돌아온다 — 마지막 칸 다음이 첫 칸이다. 칸은 늘어나지
 * 않고 자리만 다시 쓴다.
 *
 * 조각이므로 header / metrics / layout 을 두지 않는다. 배치는 러너가
 * `column · gap 8 · blocks 키 순서` 로 만든다 (S-piece).
 */

import { CONTROL } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const circularBufferWrapFacet: FacetJson = {
  id: 'facet:circularBufferWrap',
  title: {
    en: 'Circular buffer: coming back around',
    ko: '원형 버퍼: 되돌아오기',
    ja: '循環バッファ: 一周して戻る',
    zh: '环形缓冲区: 绕回来',
    ar: 'المخزن الحلقي: العودة من البداية',
    es: 'Búfer circular: volver al principio',
    fr: 'Tampon circulaire : le retour au début',
    hi: 'सर्कुलर बफर: घूमकर वापस',
    id: 'Buffer melingkar: kembali berputar',
    pt: 'Buffer circular: dar a volta',
  },
  description: {
    en: 'The last slot is followed by the first one. Slots are reused, never added.',
    ko: '마지막 칸 다음은 첫 칸이다. 칸은 늘어나지 않고 자리만 다시 쓴다.',
    ja: '最後のマスの次は最初のマスだ。マスは増えず、場所を使い回すだけ。',
    zh: '最后一格之后就是第一格。格子不会增加，只是重复使用。',
    ar: 'بعد آخر خانة تأتي الأولى. الخانات يُعاد استعمالها ولا تُضاف.',
    es: 'Tras la última casilla viene la primera. Las casillas se reutilizan, nunca se añaden.',
    fr: 'Après la dernière case vient la première. Les cases sont réutilisées, jamais ajoutées.',
    hi: 'आखिरी खाने के बाद पहला खाना आता है। खाने बढ़ते नहीं, बस दोबारा इस्तेमाल होते हैं।',
    id: 'Setelah slot terakhir datang slot pertama. Slot dipakai ulang, tidak pernah ditambah.',
    pt: 'Depois da última casa vem a primeira. As casas são reaproveitadas, nunca acrescentadas.',
  },
  algorithm: 'module:circularBufferWrap',
  projector: 'module:circularBufferWrapProjector',

  initialData: {
    type: 'circular-buffer-wrap',
    // 칸 다섯 중 둘이 차 있고, tail 은 이미 한 바퀴 감겨 0 번 칸을 가리킨다.
    slots: [null, null, null, 8, 2],
    head: 3,
    tail: 0,
    // 이 차례로 넣는다. 자리와 감김 여부는 알고리즘이 (i + 1) % 칸수 로 셈한다.
    incoming: [5, 9],
    stepMs: 700,
  },

  blocks: {
    stage: { type: 'circular-buffer-wrap-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },

  messages: {
    'caption.start': {
      en: '{count} slots. head reads at {head}, tail writes at {tail}.',
      ko: '칸은 {count}개. head 는 {head}번 칸에서 빼고, tail 은 {tail}번 칸에 넣는다.',
      ja: 'マスは {count} 個。head は {head} 番から取り出し、tail は {tail} 番に入れる。',
      zh: '共 {count} 格。head 在 {head} 号取出，tail 在 {tail} 号写入。',
      ar: '{count} خانة. head يقرأ عند {head}، وtail يكتب عند {tail}.',
      es: '{count} casillas. head lee en {head}, tail escribe en {tail}.',
      fr: '{count} cases. head lit en {head}, tail écrit en {tail}.',
      hi: '{count} खाने। head {head} से पढ़ता है, tail {tail} पर लिखता है।',
      id: '{count} slot. head membaca di {head}, tail menulis di {tail}.',
      pt: '{count} casas. head lê em {head}, tail escreve em {tail}.',
    },
    'caption.put': {
      en: '{value} is written into slot {slot}; tail moves on to {to}.',
      ko: '{value} → {slot}번 칸. 다음 tail 은 {to}번 칸.',
      ja: '{value} を {slot} 番のマスへ。tail は {to} 番へ進む。',
      zh: '{value} 写入 {slot} 号格；tail 前进到 {to} 号。',
      ar: 'يُكتب {value} في الخانة {slot}؛ وينتقل tail إلى {to}.',
      es: '{value} se escribe en la casilla {slot}; tail pasa a {to}.',
      fr: '{value} est écrit dans la case {slot} ; tail passe à {to}.',
      hi: '{value} खाने {slot} में लिखा जाता है; tail {to} पर बढ़ जाता है।',
      id: '{value} ditulis ke slot {slot}; tail berpindah ke {to}.',
      pt: '{value} é escrito na casa {slot}; tail avança para {to}.',
    },
    'caption.take': {
      en: 'Slot {slot} gives up {value}; head moves on to {to}.',
      ko: '{slot}번 칸 → {value} 나감. 다음 head 는 {to}번 칸.',
      ja: '{slot} 番のマスから {value} が出る。head は {to} 番へ進む。',
      zh: '{slot} 号格交出 {value}；head 前进到 {to} 号。',
      ar: 'الخانة {slot} تُخرج {value}؛ وينتقل head إلى {to}.',
      es: 'La casilla {slot} entrega {value}; head pasa a {to}.',
      fr: 'La case {slot} rend {value} ; head passe à {to}.',
      hi: 'खाना {slot} {value} छोड़ता है; head {to} पर बढ़ जाता है।',
      id: 'Slot {slot} melepas {value}; head berpindah ke {to}.',
      pt: 'A casa {slot} entrega {value}; head avança para {to}.',
    },
    'caption.takeWrap': {
      en: 'Slot {slot} was the last one, so head comes back around to {to}.',
      ko: '{slot}번 칸이 마지막이라 head 는 다시 {to}번 칸으로 돌아온다.',
      ja: '{slot} 番が最後のマスなので、head は一周して {to} 番へ戻る。',
      zh: '{slot} 号是最后一格，所以 head 绕回到 {to} 号。',
      ar: 'الخانة {slot} كانت الأخيرة، فيعود head إلى {to}.',
      es: 'La casilla {slot} era la última, así que head vuelve a {to}.',
      fr: 'La case {slot} était la dernière, donc head revient à {to}.',
      hi: 'खाना {slot} आखिरी था, इसलिए head घूमकर {to} पर आ जाता है।',
      id: 'Slot {slot} yang terakhir, jadi head berputar kembali ke {to}.',
      pt: 'A casa {slot} era a última, então head dá a volta para {to}.',
    },
    'caption.done': {
      en: 'Still {count} slots — nothing grew.',
      ko: '연산 넷을 거쳐도 칸은 {count}개 그대로다. 늘어난 자리는 없다.',
      ja: 'マスは {count} 個のまま — 増えたものはない。',
      zh: '仍然是 {count} 格 — 什么都没有增加。',
      ar: 'ما زالت {count} خانة — لم يزد شيء.',
      es: 'Siguen siendo {count} casillas: no creció nada.',
      fr: "Toujours {count} cases — rien ne s'est agrandi.",
      hi: 'अब भी {count} खाने — कुछ नहीं बढ़ा।',
      id: 'Tetap {count} slot — tidak ada yang bertambah.',
      pt: 'Ainda {count} casas — nada cresceu.',
    },
  },
};
