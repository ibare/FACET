/**
 * node-holds-many — 다분기 노드 조각(piece) 선언.
 *
 * @piece 한 자리가 키를 여럿 담고, 그 키들 사이의 틈마다 아래로 갈 길이
 * 하나씩 열린다. 그래서 내려갈 곳을 고르는 일이 자리 안에서 벌어진다 —
 * 자리 하나가 갈림길 여럿을 품는다. 이 한 가지만 말하고 멈춘다.
 *
 * 제목 블록도 메트릭도 두지 않는다. 제목은 글의 문단이 주고, 조각은 셀 것이
 * 없다 (S-piece). layout 은 stage 와 controls 뿐이라 러너에 맡긴다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const nodeHoldsManyFacet: FacetJson = {
  id: 'facet:nodeHoldsMany',
  title: {
    en: 'Node Holds Many',
    ko: '다분기 노드',
    ja: '一つのノードに複数の鍵',
    zh: '一个节点装多个键',
    ar: 'العقدة تحمل مفاتيح عدة',
    es: 'Un nodo guarda varias claves',
    fr: 'Un nœud contient plusieurs clés',
    hi: 'एक नोड में कई कुंजियाँ',
    id: 'Satu Node Memuat Banyak',
    pt: 'Um nó guarda várias chaves',
  },
  description: {
    en: 'One node holds several keys.',
    ko: '한 자리에 여럿을 담는다.',
    ja: '一つのノードが鍵をいくつも持つ。',
    zh: '一个节点装着好几个键。',
    ar: 'عقدة واحدة تحمل عدة مفاتيح.',
    es: 'Un solo nodo guarda varias claves.',
    fr: 'Un seul nœud contient plusieurs clés.',
    hi: 'एक ही नोड कई कुंजियाँ रखता है।',
    id: 'Satu node memuat beberapa kunci.',
    pt: 'Um único nó guarda várias chaves.',
  },
  algorithm: 'module:nodeHoldsMany',
  projector: 'module:nodeHoldsManyProjector',
  initialData: {
    type: 'node-holds-many',
    stepMs: 720,
    target: 50,
    rootId: 'root',
    nodes: {
      root: { keys: [30, 60], children: ['c1', 'c2', 'c3'] },
      c1: { keys: [10, 20] },
      c2: { keys: [40, 50] },
      c3: { keys: [70, 80, 90] },
    },
  },
  blocks: {
    stage: { type: 'node-holds-many-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
  messages: {
    'label.target': {
      en: 'target {value}',
      ko: '찾는 값 {value}',
      ja: '探す値 {value}',
      zh: '目标 {value}',
      ar: 'الهدف {value}',
      es: 'objetivo {value}',
      fr: 'cible {value}',
      hi: 'लक्ष्य {value}',
      id: 'target {value}',
      pt: 'alvo {value}',
    },
    'stat.keysInNodes': {
      en: '{keys} keys in {nodes} nodes',
      ko: '키 {keys}개, 자리 {nodes}개',
      ja: 'ノード {nodes} 個に鍵 {keys} 個',
      zh: '{nodes} 个节点里 {keys} 个键',
      ar: '{keys} مفتاحًا في {nodes} عقدة',
      es: '{keys} claves en {nodes} nodos',
      fr: '{keys} clés dans {nodes} nœuds',
      hi: '{nodes} नोड में {keys} कुंजियाँ',
      id: '{keys} kunci di {nodes} node',
      pt: '{keys} chaves em {nodes} nós',
    },
    'caption.sweepGt': {
      en: '{target} > {key} → next key',
      ko: '{target} > {key} → 다음 키로',
      ja: '{target} > {key} → 次の鍵へ',
      zh: '{target} > {key} → 下一个键',
      ar: '{target} > {key} → المفتاح التالي',
      es: '{target} > {key} → siguiente clave',
      fr: '{target} > {key} → clé suivante',
      hi: '{target} > {key} → अगली कुंजी',
      id: '{target} > {key} → kunci berikutnya',
      pt: '{target} > {key} → próxima chave',
    },
    'caption.sweepLt': {
      en: '{target} < {key} → into the gap before it',
      ko: '{target} < {key} → 그 앞의 틈으로',
      ja: '{target} < {key} → その手前の隙間へ',
      zh: '{target} < {key} → 进入它前面的间隙',
      ar: '{target} < {key} → إلى الفجوة التي قبله',
      es: '{target} < {key} → al hueco anterior',
      fr: '{target} < {key} → dans le trou juste avant',
      hi: '{target} < {key} → उससे पहले वाले अंतराल में',
      id: '{target} < {key} → ke celah sebelumnya',
      pt: '{target} < {key} → para a lacuna anterior',
    },
    'caption.sweepEq': {
      en: '{target} = {key}',
      ko: '{target} = {key}',
      ja: '{target} = {key}',
      zh: '{target} = {key}',
      ar: '{target} = {key}',
      es: '{target} = {key}',
      fr: '{target} = {key}',
      hi: '{target} = {key}',
      id: '{target} = {key}',
      pt: '{target} = {key}',
    },
    'caption.descend': {
      en: 'goes down one level',
      ko: '한 층 내려간다',
      ja: '一段下りる',
      zh: '向下走一层',
      ar: 'ينزل مستوى واحدًا',
      es: 'baja un nivel',
      fr: "descend d'un niveau",
      hi: 'एक स्तर नीचे जाता है',
      id: 'turun satu tingkat',
      pt: 'desce um nível',
    },
    'caption.found': {
      en: '{target} found',
      ko: '{target} 찾음',
      ja: '{target} を見つけた',
      zh: '找到 {target}',
      ar: 'وُجد {target}',
      es: '{target} encontrado',
      fr: '{target} trouvé',
      hi: '{target} मिल गया',
      id: '{target} ditemukan',
      pt: '{target} encontrado',
    },
  },
};
