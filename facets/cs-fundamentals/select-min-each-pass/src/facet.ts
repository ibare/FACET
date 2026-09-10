/**
 * selectMinEachPass facet JSON 선언.
 *
 * @piece 한 질문에만 답한다 — "견줄 때마다 뭔가 움직이는가?"
 *
 * 답: 아니다. 훑는 동안 움직이는 것은 표식뿐이고, 값이 자리를 옮기는 것은
 * 한 바퀴가 끝난 뒤 딱 한 번이다. 견줌은 많고 이동은 적다.
 *
 * 제목도 메트릭도 두지 않는다. 제목은 글의 문단이 주고, 조각은 셀 것을
 * 패널로 두지 않는다 (S-piece).
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const selectMinEachPassFacet: FacetJson = {
  id: 'facet:selectMinEachPass',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: {
    en: 'Selecting the Minimum',
    ko: '최솟값 선택',
    ja: '最小値の選択',
    zh: '选择最小值',
    ar: 'اختيار الأصغر',
    es: 'Selección del mínimo',
    fr: 'Sélection du minimum',
    hi: 'न्यूनतम का चयन',
    id: 'Memilih nilai terkecil',
    pt: 'Seleção do mínimo',
  },
  description: {
    en: 'While scanning, only a marker moves; the value itself moves once, after the pass is over',
    ko: '훑는 동안에는 표식만 움직이고, 값은 한 바퀴가 끝난 뒤에 한 번 옮겨진다',
    ja: '走査の間は目印だけが動き、値が動くのは一巡が終わったあとの一度きり',
    zh: '扫描时只有标记在动，值只在一轮结束后挪动一次',
    ar: 'أثناء المسح لا تتحرك سوى العلامة، أما القيمة فتنتقل مرة واحدة بعد انتهاء الجولة',
    es: 'Al recorrer solo se mueve una marca; el valor se mueve una vez, cuando termina la pasada',
    fr: "Pendant le parcours, seul un repère bouge ; la valeur ne se déplace qu'une fois, la passe terminée",
    hi: 'छानते समय सिर्फ़ निशान हिलता है; मान एक बार खिसकता है, वह भी चक्कर पूरा होने पर',
    id: 'Selama menyapu hanya penanda yang bergerak; nilainya pindah sekali, setelah satu putaran usai',
    pt: 'Durante a varredura só o marcador se move; o valor muda de lugar uma vez, quando a passada acaba',
  },
  algorithm: 'module:selectMinEachPass',
  projector: 'module:selectMinEachPassProjector',
  initialData: {
    type: 'select-min-each-pass',
    values: [7, 2, 9, 4],
    stepMs: 750,
  },
  blocks: {
    stage: { type: 'select-min-each-pass-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
  messages: {
    'caption.remember': {
      en: 'Remember the first cell as the smallest so far.',
      ko: '첫 자리를 지금까지 가장 작은 것으로 기억해 둔다.',
      ja: '最初のマスを、今のところ最小として覚えておく。',
      zh: '把第一格记作目前最小的。',
      ar: 'نتذكّر الخانة الأولى بوصفها الأصغر حتى الآن.',
      es: 'Recuerda la primera casilla como la más pequeña hasta ahora.',
      fr: "On retient la première case comme la plus petite jusqu'ici.",
      hi: 'पहले खाने को अब तक का सबसे छोटा मान लें।',
      id: 'Ingat sel pertama sebagai yang terkecil sejauh ini.',
      pt: 'Guarde a primeira casa como a menor até aqui.',
    },
    'caption.compare': {
      en: 'Is {value} smaller than {best}?',
      ko: '{value} 가 {best} 보다 작은가?',
      ja: '{value} は {best} より小さいか。',
      zh: '{value} 比 {best} 小吗？',
      ar: 'هل {value} أصغر من {best}؟',
      es: '¿Es {value} menor que {best}?',
      fr: '{value} est-il plus petit que {best} ?',
      hi: 'क्या {value}, {best} से छोटा है?',
      id: 'Apakah {value} lebih kecil dari {best}?',
      pt: '{value} é menor que {best}?',
    },
    'caption.keep': {
      en: 'No. The marker stays where it is.',
      ko: '아니다. 표식은 있던 자리에 그대로 있다.',
      ja: 'いいえ。目印はそのまま。',
      zh: '不。标记留在原处。',
      ar: 'لا. تبقى العلامة مكانها.',
      es: 'No. La marca se queda donde está.',
      fr: 'Non. Le repère reste où il est.',
      hi: 'नहीं। निशान जहाँ है वहीं रहता है।',
      id: 'Tidak. Penandanya tetap di tempat.',
      pt: 'Não. O marcador fica onde está.',
    },
    'caption.hop': {
      en: 'Yes. The marker hops over to {value}.',
      ko: '그렇다. 표식이 {value} 자리로 건너간다.',
      ja: 'はい。目印が {value} のところへ移る。',
      zh: '是。标记跳到 {value} 上。',
      ar: 'نعم. تقفز العلامة إلى {value}.',
      es: 'Sí. La marca salta hasta {value}.',
      fr: "Oui. Le repère saute jusqu'à {value}.",
      hi: 'हाँ। निशान {value} पर कूद जाता है।',
      id: 'Ya. Penandanya melompat ke {value}.',
      pt: 'Sim. O marcador salta para {value}.',
    },
    'caption.scanEnd': {
      en: 'Scan over: {compares} comparisons, {hops} marker hop, and not one value has moved.',
      ko: '훑기 끝 — 견줌 {compares}번, 표식 이동 {hops}번, 값은 하나도 움직이지 않았다.',
      ja: '走査終わり — 比較 {compares} 回、目印の移動 {hops} 回、値は一つも動いていない。',
      zh: '扫描结束 — 比较 {compares} 次，标记移动 {hops} 次，没有一个值动过。',
      ar: 'انتهى المسح — {compares} مقارنة و{hops} قفزة للعلامة، ولم تتحرك ولا قيمة واحدة.',
      es: 'Fin del recorrido: {compares} comparaciones, {hops} saltos de la marca, y ni un valor se movió.',
      fr: "Fin du parcours — {compares} comparaisons, {hops} sauts du repère, et pas une valeur n'a bougé.",
      hi: 'छानना खत्म — {compares} तुलनाएँ, निशान की {hops} छलाँग, और एक भी मान नहीं हिला।',
      id: 'Sapuan selesai — {compares} perbandingan, {hops} lompatan penanda, dan tak satu nilai pun bergerak.',
      pt: 'Fim da varredura — {compares} comparações, {hops} saltos do marcador, e nenhum valor se moveu.',
    },
    'caption.move': {
      en: 'Only now does anything move: the marked value goes to the front.',
      ko: '이제야 하나가 움직인다 — 표식이 가리킨 값이 맨 앞으로 간다.',
      ja: 'ここで初めて一つ動く — 目印が指した値が先頭へ行く。',
      zh: '这时才有东西动 — 被标记的值走到最前面。',
      ar: 'الآن فقط يتحرك شيء: القيمة المعلَّمة تذهب إلى المقدمة.',
      es: 'Solo ahora se mueve algo: el valor marcado va al frente.',
      fr: 'Maintenant seulement quelque chose bouge : la valeur marquée passe devant.',
      hi: 'अब जाकर कुछ हिलता है — निशान लगा मान सबसे आगे चला जाता है।',
      id: 'Barulah kini ada yang bergerak: nilai yang ditandai maju ke depan.',
      pt: 'Só agora algo se move: o valor marcado vai para a frente.',
    },
    'caption.done': {
      en: 'One pass: {compares} comparisons, {moves} value move.',
      ko: '한 바퀴에 견줌 {compares}번, 값 이동 {moves}번.',
      ja: '一巡で比較 {compares} 回、値の移動 {moves} 回。',
      zh: '一轮：比较 {compares} 次，值移动 {moves} 次。',
      ar: 'جولة واحدة: {compares} مقارنة و{moves} نقلة للقيم.',
      es: 'Una pasada: {compares} comparaciones y {moves} movimientos de valor.',
      fr: 'Une passe : {compares} comparaisons, {moves} déplacements de valeur.',
      hi: 'एक चक्कर: {compares} तुलनाएँ, मान की {moves} हलचल।',
      id: 'Satu putaran: {compares} perbandingan, {moves} perpindahan nilai.',
      pt: 'Uma passada: {compares} comparações, {moves} movimentos de valor.',
    },
  },
};
