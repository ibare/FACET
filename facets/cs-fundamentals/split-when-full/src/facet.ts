/**
 * SplitWhenFull facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "노드가 꽉 찬 채로 하나가 더 들어오면 무슨 일이 일어나는가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 하나 + 되짚기 하나) / 제목 없음 /
 * 메트릭 없음 / 캔버스 폭 620.
 *
 * 데이터: 자식 하나가 이미 셋(용량)을 채운 상태에서 25 를 넣는다. 넘친 자리의
 * 가운데(넷 중 둘째, 20)가 부모로 올라가 부모 키가 1→2 로, 자식이 2→3 으로
 * 는다. 층수는 그대로다 — algorithm.ts 가 이 전부를 계산하지 결과를 미리
 * 적어 두지 않는다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const splitWhenFullFacet: FacetJson = {
  id: 'facet:splitWhenFull',
  title: {
    en: 'Split When Full',
    ko: '꽉 차면 쪼갠다',
    ja: '満杯なら分ける',
    zh: '满了就分裂',
    ar: 'الانقسام عند الامتلاء',
    es: 'Partir cuando se llena',
    fr: "Scinder quand c'est plein",
    hi: 'भर जाए तो बाँटो',
    id: 'Pecah saat penuh',
    pt: 'Dividir quando cheio',
  },
  description: {
    en: 'A full node overflows, its middle key rises to the parent, and the rest splits in two',
    ko: '꽉 찬 노드가 넘치면 가운데 키가 부모로 올라가고 나머지는 둘로 갈라진다',
    ja: '満杯のノードがあふれると、真ん中のキーが親へ上がり、残りは二つに分かれる',
    zh: '满了的节点一溢出，中间的键就升到父节点，剩下的一分为二',
    ar: 'تفيض العقدة الممتلئة، فيصعد مفتاحها الأوسط إلى الأب، وينقسم الباقي إلى اثنين',
    es: 'Un nodo lleno se desborda, su clave del medio sube al padre y el resto se parte en dos',
    fr: 'Un nœud plein déborde, sa clé du milieu monte vers le parent, et le reste se scinde en deux',
    hi: 'भरा नोड छलकता है, उसकी बीच वाली कुंजी जनक तक चढ़ती है, और बाकी दो में बँट जाता है',
    id: 'Simpul yang penuh meluap, kunci tengahnya naik ke induk, dan sisanya terbelah dua',
    pt: 'Um nó cheio transborda, sua chave do meio sobe ao pai, e o resto se parte em dois',
  },
  algorithm: 'module:splitWhenFull',
  projector: 'module:splitWhenFullProjector',
  initialData: {
    type: 'split-when-full',
    capacity: 3,
    parent: { keys: [40] },
    children: [{ keys: [10, 20, 30] }, { keys: [50, 60] }],
    insertKey: 25,
    stepMs: 780,
  },
  shuffleOnReset: false,
  messages: {
    'caption.descend': {
      en: '{key} is less than {compared}, so it heads into this child.',
      ko: '{key} 는 {compared} 보다 작아 이 자식으로 내려간다.',
      ja: '{key} は {compared} より小さいので、この子へ下りる。',
      zh: '{key} 小于 {compared}，于是往这个子节点走。',
      ar: '{key} أصغر من {compared}، فينزل إلى هذا الابن.',
      es: '{key} es menor que {compared}, así que baja a este hijo.',
      fr: '{key} est inférieur à {compared}, il descend donc dans cet enfant.',
      hi: '{key}, {compared} से छोटा है, इसलिए यह इसी संतान में उतरता है।',
      id: '{key} lebih kecil dari {compared}, jadi ia turun ke anak ini.',
      pt: '{key} é menor que {compared}, então desce para este filho.',
    },
    'caption.overflow': {
      en: 'This slot already holds {capacity} keys — adding one overflows it to {count}.',
      ko: '이 자리는 이미 {capacity}개가 차 있다 — 하나가 더 들어와 {count}개로 넘친다.',
      ja: 'この場所にはすでにキーが {capacity} 個ある — もう一つ入って {count} 個にあふれる。',
      zh: '这个位置已经有 {capacity} 个键 — 再进一个就溢出到 {count} 个。',
      ar: 'هذا الموضع يحمل أصلًا {capacity} مفاتيح — وبإضافة واحد يفيض إلى {count}.',
      es: 'Esta casilla ya tiene {capacity} claves: al añadir una se desborda a {count}.',
      fr: 'Cette case contient déjà {capacity} clés — en ajouter une la fait déborder à {count}.',
      hi: 'इस जगह पहले से {capacity} कुंजियाँ हैं — एक और आते ही यह {count} पर छलक जाती है।',
      id: 'Slot ini sudah memuat {capacity} kunci — satu lagi membuatnya meluap jadi {count}.',
      pt: 'Esta casa já tem {capacity} chaves — mais uma a faz transbordar para {count}.',
    },
    'caption.promote': {
      en: 'The middle key {key} rises into the parent.',
      ko: '가운데 키 {key} 가 부모로 올라간다.',
      ja: '真ん中のキー {key} が親へ上がる。',
      zh: '中间的键 {key} 升到父节点。',
      ar: 'يصعد المفتاح الأوسط {key} إلى الأب.',
      es: 'La clave del medio {key} sube al padre.',
      fr: 'La clé du milieu {key} monte dans le parent.',
      hi: 'बीच वाली कुंजी {key} जनक में चढ़ जाती है।',
      id: 'Kunci tengah {key} naik ke induk.',
      pt: 'A chave do meio {key} sobe para o pai.',
    },
    'caption.divide': {
      en: 'What remains splits in two — {left} and {right}.',
      ko: '남은 것이 둘로 갈라진다 — {left} 와 {right}.',
      ja: '残ったものが二つに分かれる — {left} と {right}。',
      zh: '剩下的一分为二 — {left} 和 {right}。',
      ar: 'ينقسم ما تبقّى إلى اثنين — {left} و{right}.',
      es: 'Lo que queda se parte en dos: {left} y {right}.',
      fr: 'Ce qui reste se scinde en deux — {left} et {right}.',
      hi: 'जो बचा वह दो में बँट जाता है — {left} और {right}।',
      id: 'Sisanya terbelah dua — {left} dan {right}.',
      pt: 'O que resta se parte em dois — {left} e {right}.',
    },
  },
  blocks: {
    stage: { type: 'split-when-full-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
