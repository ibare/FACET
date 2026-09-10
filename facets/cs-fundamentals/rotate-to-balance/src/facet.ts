/**
 * rotate-to-balance — 회전 조각(piece) 선언.
 *
 * @piece 한쪽으로 기운 자리에서 축이 내려가고 그 자식이 올라온다. 그 사이
 * 가지 하나가 손을 바꿔 내려간 축에 가서 붙고, 그것이 회전의 전부다. 중위
 * 순회 결과는 회전 전후가 같다 — 순서는 그대로고 모양만 바뀐다는 것이
 * 회전이 허용되는 이유다. 이 한 가지만 말하고 멈춘다.
 *
 * 제목 블록도 메트릭도 두지 않는다. 제목은 글의 문단이 주고, 조각은 셀 것이
 * 없다 (S-piece). layout 은 stage 와 controls 뿐이라 러너에 맡긴다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const rotateToBalanceFacet: FacetJson = {
  id: 'facet:rotateToBalance',
  title: {
    en: 'Rotate to Balance',
    ko: '균형을 위한 회전',
    ja: '均衡のための回転',
    zh: '为平衡而旋转',
    ar: 'دوران لتحقيق التوازن',
    es: 'Rotar para equilibrar',
    fr: 'Rotation pour rééquilibrer',
    hi: 'संतुलन के लिए घुमाव',
    id: 'Rotasi untuk menyeimbangkan',
    pt: 'Rotação para equilibrar',
  },
  description: {
    en: 'A single rotation straightens a leaning tree.',
    ko: '한 번의 회전이 기울어진 트리를 바로 세운다.',
    ja: '一度の回転が傾いた木を立て直す。',
    zh: '一次旋转就能把倾斜的树扶正。',
    ar: 'دوران واحد يعدّل شجرة مائلة.',
    es: 'Una sola rotación endereza un árbol inclinado.',
    fr: 'Une seule rotation redresse un arbre penché.',
    hi: 'एक ही घुमाव झुके हुए ट्री को सीधा कर देता है।',
    id: 'Satu rotasi meluruskan pohon yang miring.',
    pt: 'Uma única rotação endireita uma árvore inclinada.',
  },
  algorithm: 'module:rotateToBalance',
  projector: 'module:rotateToBalanceProjector',
  initialData: {
    type: 'rotateToBalance',
    stepMs: 760,
    rootId: '30',
    pivotId: '30',
    nodes: [
      { id: '30', value: 30, left: '10', right: '50' },
      { id: '50', value: 50, left: '40', right: '70' },
      { id: '70', value: 70, left: null, right: '80' },
      { id: '10', value: 10, left: null, right: null },
      { id: '40', value: 40, left: null, right: null },
      { id: '80', value: 80, left: null, right: null },
    ],
  },
  blocks: {
    stage: { type: 'rotate-to-balance-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.imbalance': {
      en: 'Node {value} has balance factor {balance} — outside the [-1, 1] range.',
      ko: '노드 {value}의 균형 인수가 {balance}로 [-1, 1] 범위를 벗어났습니다.',
      ja: 'ノード {value} の均衡係数が {balance} で、[-1, 1] の範囲を外れた。',
      zh: '节点 {value} 的平衡因子为 {balance} — 超出 [-1, 1] 范围。',
      ar: 'العقدة {value} معامل توازنها {balance} — خارج المدى [-1, 1].',
      es: 'El nodo {value} tiene factor de equilibrio {balance}: fuera del rango [-1, 1].',
      fr: "Le nœud {value} a un facteur d'équilibre de {balance} — hors de l'intervalle [-1, 1].",
      hi: 'नोड {value} का संतुलन गुणांक {balance} है — [-1, 1] परास के बाहर।',
      id: 'Simpul {value} punya faktor keseimbangan {balance} — di luar rentang [-1, 1].',
      pt: 'O nó {value} tem fator de equilíbrio {balance} — fora do intervalo [-1, 1].',
    },
    'caption.balanceChecked': {
      en: 'Every balance factor is within range.',
      ko: '모든 균형 인수가 범위 안에 있습니다.',
      ja: 'すべての均衡係数が範囲内にある。',
      zh: '所有平衡因子都在范围内。',
      ar: 'كل معاملات التوازن ضمن المدى.',
      es: 'Todos los factores de equilibrio están dentro del rango.',
      fr: "Tous les facteurs d'équilibre sont dans l'intervalle.",
      hi: 'हर संतुलन गुणांक परास के भीतर है।',
      id: 'Semua faktor keseimbangan berada dalam rentang.',
      pt: 'Todos os fatores de equilíbrio estão dentro do intervalo.',
    },
    'caption.rebalanced': {
      en: 'Every balance factor is back in the [-1, 1] range.',
      ko: '모든 균형 인수가 다시 [-1, 1] 범위 안으로 돌아왔습니다.',
      ja: 'すべての均衡係数が [-1, 1] の範囲に戻った。',
      zh: '所有平衡因子都回到了 [-1, 1] 范围内。',
      ar: 'عادت كل معاملات التوازن إلى المدى [-1, 1].',
      es: 'Todos los factores de equilibrio han vuelto al rango [-1, 1].',
      fr: "Tous les facteurs d'équilibre sont revenus dans l'intervalle [-1, 1].",
      hi: 'सभी संतुलन गुणांक फिर से [-1, 1] परास में आ गए।',
      id: 'Semua faktor keseimbangan kembali ke rentang [-1, 1].',
      pt: 'Todos os fatores de equilíbrio voltaram ao intervalo [-1, 1].',
    },
    'caption.rotating': {
      en: '{newRootValue} rises to the top, {pivotValue} settles below it, and {movedValue} changes parent.',
      ko: '{newRootValue}가 위로 올라가고 {pivotValue}는 그 아래로 내려가며, {movedValue}는 부모를 바꿉니다.',
      ja: '{newRootValue} が上に上がり、{pivotValue} はその下に収まり、{movedValue} は親を変える。',
      zh: '{newRootValue} 升到上面，{pivotValue} 落到它下面，{movedValue} 换了父节点。',
      ar: 'يصعد {newRootValue} إلى الأعلى، ويستقر {pivotValue} تحته، ويغيّر {movedValue} أباه.',
      es: '{newRootValue} sube arriba, {pivotValue} queda debajo y {movedValue} cambia de padre.',
      fr: '{newRootValue} monte en haut, {pivotValue} se place en dessous et {movedValue} change de parent.',
      hi: '{newRootValue} ऊपर चढ़ता है, {pivotValue} उसके नीचे बैठता है, और {movedValue} अपना जनक बदलता है।',
      id: '{newRootValue} naik ke atas, {pivotValue} turun di bawahnya, dan {movedValue} berganti induk.',
      pt: '{newRootValue} sobe ao topo, {pivotValue} assenta abaixo dele e {movedValue} muda de pai.',
    },
    'caption.rotatingSimple': {
      en: '{newRootValue} rises to the top and {pivotValue} settles below it.',
      ko: '{newRootValue}가 위로 올라가고 {pivotValue}는 그 아래로 내려갑니다.',
      ja: '{newRootValue} が上に上がり、{pivotValue} はその下に収まる。',
      zh: '{newRootValue} 升到上面，{pivotValue} 落到它下面。',
      ar: 'يصعد {newRootValue} إلى الأعلى ويستقر {pivotValue} تحته.',
      es: '{newRootValue} sube arriba y {pivotValue} queda debajo.',
      fr: '{newRootValue} monte en haut et {pivotValue} se place en dessous.',
      hi: '{newRootValue} ऊपर चढ़ता है और {pivotValue} उसके नीचे बैठता है।',
      id: '{newRootValue} naik ke atas dan {pivotValue} turun di bawahnya.',
      pt: '{newRootValue} sobe ao topo e {pivotValue} assenta abaixo dele.',
    },
    'caption.rewound': {
      en: 'Back to the start — press again to step through.',
      ko: '처음으로 되돌아갔습니다 — 다시 누르면 한 걸음씩 봅니다.',
      ja: '最初に戻った — もう一度押すと一歩ずつ進む。',
      zh: '已回到起点 — 再按一次可逐步查看。',
      ar: 'عدنا إلى البداية — اضغط مرة أخرى للتقدّم خطوة خطوة.',
      es: 'De vuelta al inicio: pulsa otra vez para avanzar paso a paso.',
      fr: 'Retour au début — appuyez de nouveau pour avancer pas à pas.',
      hi: 'शुरुआत पर लौट आए — फिर दबाएँ तो एक-एक कदम चलेगा।',
      id: 'Kembali ke awal — tekan lagi untuk melangkah satu per satu.',
      pt: 'De volta ao início — carregue de novo para avançar passo a passo.',
    },
    'caption.done': {
      en: 'Height drops from {before} to {after}; in-order sequence stays {order}.',
      ko: '높이가 {before}에서 {after}로 줄고, 중위 순회 순서는 {order} 그대로입니다.',
      ja: '高さは {before} から {after} に減り、中順の並びは {order} のままだ。',
      zh: '高度从 {before} 降到 {after}；中序序列仍是 {order}。',
      ar: 'ينخفض الارتفاع من {before} إلى {after}، ويبقى الترتيب الوسطي {order} كما هو.',
      es: 'La altura baja de {before} a {after}; el recorrido en orden sigue siendo {order}.',
      fr: 'La hauteur passe de {before} à {after} ; le parcours infixe reste {order}.',
      hi: 'ऊँचाई {before} से घटकर {after} हो जाती है; मध्यक्रम अनुक्रम {order} ही रहता है।',
      id: 'Tinggi turun dari {before} ke {after}; urutan in-order tetap {order}.',
      pt: 'A altura desce de {before} para {after}; a sequência em-ordem continua {order}.',
    },
  },
};
