/**
 * depth-doubles-count 선언.
 *
 * @piece 조각 — "깊이가 하나 늘면 자리는 두 배" 라는 주장 하나에만 답한다.
 * 제목은 글의 문단이 주므로 title-block 을 두지 않고, 셀 것이 없으므로
 * metrics 도 두지 않는다 (S-piece).
 */

import { CONTROL } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const depthDoublesCountFacet: FacetJson = {
  id: 'facet:depthDoublesCount',
  title: {
    en: 'Depth doubles the count',
    ko: '깊이가 늘면 자리는 두 배',
    ja: '深さが一つ増えると席は倍',
    zh: '深一层，位置翻倍',
    ar: 'العمق يضاعف العدد',
    es: 'La profundidad duplica el número',
    fr: 'La profondeur double le nombre',
    hi: 'गहराई गिनती को दुगुना कर देती है',
    id: 'Kedalaman melipatgandakan jumlahnya',
    pt: 'A profundidade duplica a contagem',
  },
  description: {
    en: 'One level deeper doubles how many slots a tree can hold.',
    ko: '한 층 내려갈 때마다 트리가 담을 수 있는 자리가 두 배가 된다.',
    ja: '一段下がるごとに、木が抱えられる席の数は倍になる。',
    zh: '每往下一层，树能容纳的位置就翻一倍。',
    ar: 'كل مستوى إضافي يضاعف عدد المواضع التي تسعها الشجرة.',
    es: 'Un nivel más abajo duplica cuántos huecos puede tener un árbol.',
    fr: "Un niveau de plus double le nombre de places que peut tenir un arbre.",
    hi: 'एक स्तर नीचे जाते ही पेड़ की जगहें दुगुनी हो जाती हैं।',
    id: 'Satu tingkat lebih dalam melipatgandakan jumlah tempat yang bisa ditampung pohon.',
    pt: 'Um nível mais abaixo duplica quantos lugares uma árvore comporta.',
  },
  algorithm: 'module:depthDoublesCount',
  projector: 'module:depthDoublesCountProjector',
  initialData: {
    type: 'depth-doubles-count',
    /** 0층부터 9층까지. 합이 2^10 - 1 = 1023 이 되는 깊이다. */
    maxDepth: 9,
    /** 걸음 간격. 한 층이 벌어지는 것을 읽을 시간을 준다. */
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'depth-doubles-count-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.root': {
      en: 'Depth 0 holds one slot.',
      ko: '0층에는 자리가 하나다.',
      ja: '深さ 0 の席は一つ。',
      zh: '第 0 层只有一个位置。',
      ar: 'العمق 0 يحوي موضعًا واحدًا.',
      es: 'La profundidad 0 tiene un hueco.',
      fr: 'La profondeur 0 tient une place.',
      hi: 'गहराई 0 पर एक जगह है।',
      id: 'Kedalaman 0 punya satu tempat.',
      pt: 'A profundidade 0 tem um lugar.',
    },
    'caption.split': {
      en: 'One level down: every slot splits in two — {count} slots.',
      ko: '한 층 내려가면 자리마다 둘로 갈라진다 — 자리 {count}개.',
      ja: '一段下がると、席ごとに二つに分かれる — 席 {count} 個。',
      zh: '往下一层：每个位置一分为二 — 共 {count} 个位置。',
      ar: 'مستوى واحد للأسفل: كل موضع ينقسم إلى اثنين — {count} موضعًا.',
      es: 'Un nivel abajo: cada hueco se parte en dos — {count} huecos.',
      fr: 'Un niveau plus bas : chaque place se scinde en deux — {count} places.',
      hi: 'एक स्तर नीचे: हर जगह दो में बँटती है — {count} जगहें।',
      id: 'Turun satu tingkat: tiap tempat terbelah dua — {count} tempat.',
      pt: 'Um nível abaixo: cada lugar parte-se em dois — {count} lugares.',
    },
    'caption.total': {
      en: 'Only {depth} levels down, and already {total} slots.',
      ko: '{depth}층까지 내려갔을 뿐인데 자리는 모두 {total}개다.',
      ja: 'まだ {depth} 段下がっただけで、席はもう {total} 個。',
      zh: '才往下 {depth} 层，位置就已经有 {total} 个。',
      ar: '{depth} مستويات فقط للأسفل، وبالفعل {total} موضعًا.',
      es: 'Solo {depth} niveles abajo, y ya hay {total} huecos.',
      fr: 'Seulement {depth} niveaux plus bas, et déjà {total} places.',
      hi: 'सिर्फ़ {depth} स्तर नीचे, और जगहें पहले ही {total}।',
      id: 'Baru {depth} tingkat turun, tempatnya sudah {total}.',
      pt: 'Apenas {depth} níveis abaixo, e já {total} lugares.',
    },
  },
};
