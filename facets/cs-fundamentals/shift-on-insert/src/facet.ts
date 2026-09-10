/**
 * @piece 삽입 이동 — 가운데에 넣으면 뒤가 밀린다.
 *
 * 답하는 질문 하나: 배열 가운데에 값을 넣으면 뒤의 것들은 어떻게 되는가.
 * 답: 뒤에서부터 한 칸씩 오른쪽으로 옮겨 가고, 그렇게 비운 자리에 새 값이 들어간다.
 *
 * 조각이므로 title-block 도 metrics 도 두지 않는다. 제목은 이 조각을 안은 문단이
 * 주고, 셀 것은 화면의 이동 횟수 하나뿐이라 패널을 세우지 않는다 (S-piece).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const shiftOnInsertFacet: FacetJson = {
  id: 'facet:shiftOnInsert',
  title: {
    en: 'Inserting in the middle pushes the rest',
    ko: '가운데에 넣으면 뒤가 밀린다',
    ja: '真ん中に入れると後ろが押される',
    zh: '插在中间，后面都得挪',
    ar: 'الإدراج في الوسط يدفع الباقي',
    es: 'Insertar en medio empuja al resto',
    fr: 'Insérer au milieu pousse le reste',
    hi: 'बीच में डालो तो बाकी खिसकते हैं',
    id: 'Menyisipkan di tengah mendorong sisanya',
    pt: 'Inserir no meio empurra o resto',
  },
  description: {
    en: 'Values behind the insertion point really move one slot to the right, back to front.',
    ko: '넣는 자리 뒤의 값들이 뒤에서부터 한 칸씩 오른쪽으로 실제로 옮겨 간다.',
    ja: '挿入位置より後ろの値は、後ろから順に本当に一つずつ右へ動く。',
    zh: '插入点后面的值，从后往前，真的一个个向右挪一格。',
    ar: 'القيم التي خلف موضع الإدراج تنتقل فعلًا خانة واحدة إلى اليمين، من الآخر إلى الأول.',
    es: 'Los valores detrás del punto de inserción se mueven de verdad una casilla a la derecha, de atrás hacia delante.',
    fr: "Les valeurs situées après le point d'insertion se décalent réellement d'une case vers la droite, de la fin vers le début.",
    hi: 'डालने की जगह के पीछे के मान सचमुच एक-एक खाना दाईं ओर खिसकते हैं, पीछे से आगे की ओर।',
    id: 'Nilai di belakang titik sisip benar-benar bergeser satu slot ke kanan, dari belakang ke depan.',
    pt: 'Os valores após o ponto de inserção se deslocam mesmo uma casa para a direita, de trás para frente.',
  },
  algorithm: 'module:shiftOnInsert',
  projector: 'module:shiftOnInsertProjector',
  initialData: {
    type: 'shift-on-insert',
    values: [10, 20, 30, 40, 50],
    capacity: 6,
    targetIndex: 2,
    incoming: 99,
    /** 걸음 사이에 읽을 시간 (S-piece — 간격도 저작 결정이다). */
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'shift-on-insert-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.plan': {
      en: 'New value {incoming} — slot {at} is already taken by {occupied}.',
      ko: '넣을 값 {incoming} — {at}번 자리는 이미 {occupied} 이 차지하고 있다.',
      ja: '入れる値 {incoming} — {at} 番の枠はすでに {occupied} が使っている。',
      zh: '要插入的值 {incoming} — 第 {at} 格已被 {occupied} 占着。',
      ar: 'القيمة الجديدة {incoming} — الخانة {at} يشغلها {occupied} بالفعل.',
      es: 'Valor nuevo {incoming}: la casilla {at} ya la ocupa {occupied}.',
      fr: "Nouvelle valeur {incoming} — la case {at} est déjà occupée par {occupied}.",
      hi: 'नया मान {incoming} — खाना {at} पहले से {occupied} के पास है।',
      id: 'Nilai baru {incoming} — slot {at} sudah ditempati {occupied}.',
      pt: 'Novo valor {incoming} — a casa {at} já está ocupada por {occupied}.',
    },
    'caption.shift': {
      en: '{value} at slot {from} → slot {to}. Moving back to front overwrites nothing.',
      ko: '{from}번의 {value} → {to}번. 뒤에서부터라 아무것도 덮이지 않는다.',
      ja: '{from} 番の {value} → {to} 番。後ろから動かすので何も上書きしない。',
      zh: '第 {from} 格的 {value} → 第 {to} 格。从后往前挪，什么都不会被覆盖。',
      ar: '{value} من الخانة {from} إلى الخانة {to}. التحريك من الآخر إلى الأول لا يطمس شيئًا.',
      es: '{value} de la casilla {from} a la {to}. Moviendo de atrás hacia delante no se pisa nada.',
      fr: "{value} de la case {from} vers la case {to}. En allant de la fin vers le début, rien n'est écrasé.",
      hi: 'खाना {from} का {value} → खाना {to}। पीछे से आगे खिसकाने पर कुछ नहीं मिटता।',
      id: '{value} dari slot {from} ke slot {to}. Bergerak dari belakang tak menimpa apa pun.',
      pt: '{value} da casa {from} para a casa {to}. Movendo de trás para frente, nada é sobrescrito.',
    },
    'caption.cleared': {
      en: 'Slot {at} is empty. Only now can the new value move in.',
      ko: '{at}번 자리가 비었다. 새 값은 이제야 들어갈 수 있다.',
      ja: '{at} 番の枠が空いた。新しい値はここでようやく入れる。',
      zh: '第 {at} 格空了。新值到这时才进得来。',
      ar: 'الخانة {at} صارت فارغة. الآن فقط تستطيع القيمة الجديدة أن تدخل.',
      es: 'La casilla {at} está vacía. Solo ahora puede entrar el valor nuevo.',
      fr: "La case {at} est vide. Ce n'est que maintenant que la nouvelle valeur peut entrer.",
      hi: 'खाना {at} खाली है। नया मान अब जाकर अंदर आ सकता है।',
      id: 'Slot {at} kosong. Baru sekarang nilai baru bisa masuk.',
      pt: 'A casa {at} está vazia. Só agora o novo valor pode entrar.',
    },
    'caption.placed': {
      en: '{value} takes slot {at}.',
      ko: '{value} 가 {at}번 자리를 차지한다.',
      ja: '{value} が {at} 番の枠を取る。',
      zh: '{value} 占下第 {at} 格。',
      ar: '{value} يأخذ الخانة {at}.',
      es: '{value} ocupa la casilla {at}.',
      fr: '{value} prend la case {at}.',
      hi: '{value} खाना {at} ले लेता है।',
      id: '{value} menempati slot {at}.',
      pt: '{value} ocupa a casa {at}.',
    },
    'caption.done': {
      en: 'One insert cost {moves} moves. The closer to the front, the more get pushed.',
      ko: '하나 넣는 데 {moves} 개를 옮겼다. 앞쪽에 넣을수록 밀 것이 많아진다.',
      ja: '一つ入れるのに {moves} 個動かした。前に入れるほど押される数が増える。',
      zh: '插入一个花了 {moves} 次挪动。越靠前插，要挪的越多。',
      ar: 'إدراج واحد كلّف {moves} نقلة. كلما اقترب من المقدمة زاد ما يُدفع.',
      es: 'Una inserción costó {moves} movimientos. Cuanto más al principio, más hay que empujar.',
      fr: "Une insertion a coûté {moves} déplacements. Plus c'est près du début, plus il y en a à pousser.",
      hi: 'एक बार डालने में {moves} खिसकाव लगे। जितना आगे डालो, उतने ज़्यादा खिसकते हैं।',
      id: 'Satu penyisipan memakan {moves} perpindahan. Makin ke depan, makin banyak yang terdorong.',
      pt: 'Uma inserção custou {moves} movimentos. Quanto mais perto do início, mais são empurrados.',
    },
    'label.moveCount': {
      en: 'moved: {n}',
      ko: '옮긴 횟수: {n}',
      ja: '移動 {n} 回',
      zh: '挪动：{n}',
      ar: 'المنقول: {n}',
      es: 'movidos: {n}',
      fr: 'déplacés : {n}',
      hi: 'खिसके: {n}',
      id: 'dipindah: {n}',
      pt: 'movidos: {n}',
    },
  },
};
