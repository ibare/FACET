/**
 * LinkedList facet JSON 선언.
 *
 * 진행 모델 입력 반응형 — algorithm 등록 시 mechanismKind: 'reactive' 사용.
 * mount 즉시 자동 시연 (initialData.autoDemoSequence) 후 학습자 입력 대기.
 *
 * 이 파일은 완결형 facet 하나와 aspect facet 셋을 함께 선언한다. 넷은 algorithm /
 * projector / stage view 를 그대로 공유하고 initialData 와 layout 만 다르다 —
 * 개념의 한 대목만 확대해 글의 한 문단 옆에 놓기 위한 발췌다.
 *
 * 컨트롤바 어휘 (기획 §6 § 7 컨트롤 영역):
 *   [ i ] [ v ] [ 삽입 ] [ 삭제 ] [ 검색 ] [ 초기화 ]
 *
 * 코드 패널은 1차 구현에서 생략 (기획 §6 보조 요소 미언급).
 *
 * 식별자 (C1): `index:<n>` 표준 prefix 만 사용.
 */

import type { FacetJson } from '@ffacet/core/runtime';

export const linkedListFacet: FacetJson = {
  id: 'facet:linkedListSingly',
  title: { en: 'Linked List', ko: '연결 리스트', ja: '連結リスト', zh: '链表', ar: 'قائمة مترابطة', es: 'Lista enlazada', fr: 'Liste chaînée', hi: 'संबद्ध सूची', id: 'Senarai berantai', pt: 'Lista ligada' },
  description: { en: 'Each node has a single finger pointing only at its next — insert/remove rewires arrows, not cards', ko: '노드는 자기 다음 한 명만 가리킨다 — 끼우거나 빼는 일은 카드를 옮기는 게 아니라 손가락을 다시 잇는 일이다', ja: 'ノードは自分の次だけを指す一本の指を持つ — 挿入も削除もカードではなく指をつなぎ直す仕事だ', zh: '每个节点只有一根手指指向自己的下一个 — 插入和删除是重接手指，不是搬动卡片', ar: 'لكل عقدة إصبع واحد يشير إلى تاليها — والإدراج والحذف إعادة ربط أصابع لا تحريك بطاقات', es: 'Cada nodo tiene un solo dedo que apunta a su siguiente: insertar y eliminar reatan dedos, no mueven tarjetas', fr: 'Chaque nœud a un seul doigt vers son suivant — insérer et supprimer renouent des doigts, pas des cartes', hi: 'हर नोड की एक ही उंगली अपने अगले की ओर — डालना-हटाना उंगलियाँ फिर से बाँधना है, कार्ड सरकाना नहीं', id: 'Tiap simpul punya satu jari ke penerusnya — menyisipkan dan menghapus mengikat ulang jari, bukan memindah kartu', pt: 'Cada nó tem um só dedo apontando ao próximo — inserir e remover reatam dedos, não movem cartas' },
  algorithm: 'module:linkedList',
  projector: 'module:linkedListProjector',
  initialData: {
    type: 'linked-list',
    initialValues: ['10', '20', '30'],
    autoDemoIntervalMs: 1000,
    searchStepMs: 280,
    maxSize: 7,
    autoDemoSequence: [{ op: 'insert', index: 2, value: '25' }],
    handoverAfterDemo: true,
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      { ref: 'stage', padding: '8px 0' },
      { ref: 'controls' },
    ],
  },
  messages: {
    'caption.base': {
      en: 'In a linked list every node holds a single finger pointing only at its own next — inserting or removing is not moving cards around but cutting and retying two or three fingers.',
      ko: '연결 리스트는 노드 각각이 자기 다음 한 명만 가리키는 단 하나의 손가락을 갖는다 — 끼우거나 빼는 일은 카드를 옮기는 게 아니라 두세 개의 손가락을 끊고 다시 잇는 일이다.',
      ja: '連結リストではどのノードも自分の次だけを指す指を一本ずつ持つ — 挿入や削除はカードを動かすことではなく、二、三本の指を切ってつなぎ直すことだ。',
      zh: '链表里每个节点只有一根手指，指向自己的下一个 — 插入或删除不是搬动卡片，而是剪断并重新系上两三根手指。',
      ar: 'في القائمة المترابطة تحمل كل عقدة إصبعًا واحدًا يشير إلى تاليها فقط — والإدراج أو الحذف ليس تحريكًا للبطاقات بل قطع إصبعين أو ثلاثة وإعادة ربطها.',
      es: 'En una lista enlazada cada nodo tiene un solo dedo que apunta únicamente a su siguiente: insertar o eliminar no es mover tarjetas, sino cortar y volver a atar dos o tres dedos.',
      fr: 'Dans une liste chaînée, chaque nœud tient un seul doigt pointant uniquement vers son suivant — insérer ou supprimer, ce n\'est pas déplacer des cartes mais couper et renouer deux ou trois doigts.',
      hi: 'संबद्ध सूची में हर नोड के पास एक ही उंगली होती है जो केवल अपने अगले की ओर इशारा करती है — डालना या हटाना कार्ड सरकाना नहीं, बल्कि दो-तीन उंगलियाँ काटकर फिर से बाँधना है।',
      id: 'Pada senarai berantai setiap simpul memegang satu jari yang menunjuk hanya ke penerusnya — menyisipkan atau menghapus bukan memindahkan kartu, melainkan memotong dan mengikat ulang dua tiga jari.',
      pt: 'Numa lista ligada cada nó tem um único dedo apontando só para o seu próximo — inserir ou remover não é mover cartas, mas cortar e reatar dois ou três dedos.',
    },
    'caption.emptyList': {
      en: 'The list is empty.',
      ko: '리스트가 비어 있다.',
      ja: 'リストは空です。',
      zh: '链表是空的。',
      ar: 'القائمة فارغة.',
      es: 'La lista está vacía.',
      fr: 'La liste est vide.',
      hi: 'सूची खाली है।',
      id: 'Senarainya kosong.',
      pt: 'A lista está vazia.',
    },
    'caption.handover': {
      en: 'Your turn — type an index and a value, then press Insert, Remove or Search.',
      ko: '이제 직접 — 인덱스와 값을 입력하고 삽입·삭제·검색을 눌러보세요.',
      ja: 'あなたの番です — 添字と値を入力して、挿入・削除・検索を押してみてください。',
      zh: '轮到你了 — 输入索引和值，然后按插入、删除或查找。',
      ar: 'دورك الآن — اكتب فهرسًا وقيمة، ثم اضغط إدراج أو حذف أو بحث.',
      es: 'Te toca: escribe un índice y un valor, y pulsa Insertar, Eliminar o Buscar.',
      fr: 'À vous — saisissez un indice et une valeur, puis appuyez sur Insérer, Supprimer ou Rechercher.',
      hi: 'अब आपकी बारी — सूचकांक और मान लिखें, फिर डालें, हटाएं या खोजें दबाएं।',
      id: 'Giliran Anda — ketik indeks dan nilai, lalu tekan Sisip, Hapus, atau Cari.',
      pt: 'Sua vez — digite um índice e um valor e pressione Inserir, Remover ou Buscar.',
    },
    'caption.headSlideNew': {
      en: 'The head label glided over to the new card.',
      ko: 'head 라벨이 새 카드 위로 활주했다.',
      ja: 'head ラベルが新しいカードの上へ滑って移りました。',
      zh: 'head 标签滑到了新卡片上方。',
      ar: 'انزلقت لافتة head إلى البطاقة الجديدة.',
      es: 'La etiqueta head se deslizó hasta la tarjeta nueva.',
      fr: 'L\'étiquette head a glissé jusqu\'à la nouvelle carte.',
      hi: 'head लेबल खिसककर नए कार्ड पर आ गया।',
      id: 'Label head meluncur ke kartu baru.',
      pt: 'O rótulo head deslizou até a carta nova.',
    },
    'caption.headSlideSecond': {
      en: 'The head label glided over to the second card.',
      ko: 'head 라벨이 두 번째 카드 위로 활주했다.',
      ja: 'head ラベルが二枚目のカードの上へ滑って移りました。',
      zh: 'head 标签滑到了第二张卡片上方。',
      ar: 'انزلقت لافتة head إلى البطاقة الثانية.',
      es: 'La etiqueta head se deslizó hasta la segunda tarjeta.',
      fr: 'L\'étiquette head a glissé jusqu\'à la deuxième carte.',
      hi: 'head लेबल खिसककर दूसरे कार्ड पर आ गया।',
      id: 'Label head meluncur ke kartu kedua.',
      pt: 'O rótulo head deslizou até a segunda carta.',
    },
    'caption.insertBindNext': {
      en: 'Tied the new card\'s finger to the next card first.',
      ko: '새 카드의 손가락을 다음 카드에 먼저 묶었다.',
      ja: '新しいカードの指を先に次のカードへ結びました。',
      zh: '先把新卡片的手指系到了下一张卡片上。',
      ar: 'رُبط إصبع البطاقة الجديدة أولًا بالبطاقة التالية.',
      es: 'Primero se ató el dedo de la tarjeta nueva a la tarjeta siguiente.',
      fr: 'On a d\'abord noué le doigt de la nouvelle carte à la carte suivante.',
      hi: 'पहले नए कार्ड की उंगली अगले कार्ड से बाँधी गई।',
      id: 'Jari kartu baru diikat lebih dulu ke kartu berikutnya.',
      pt: 'Primeiro atou-se o dedo da carta nova à carta seguinte.',
    },
    'caption.insertHeadBind': {
      en: 'Tied the new card\'s finger to the old first card.',
      ko: '새 카드의 손가락을 옛 첫 카드로 묶었다.',
      ja: '新しいカードの指を元の先頭カードへ結びました。',
      zh: '把新卡片的手指系到了原来的第一张卡片上。',
      ar: 'رُبط إصبع البطاقة الجديدة بالبطاقة الأولى القديمة.',
      es: 'Se ató el dedo de la tarjeta nueva a la antigua primera tarjeta.',
      fr: 'Le doigt de la nouvelle carte a été noué à l\'ancienne première carte.',
      hi: 'नए कार्ड की उंगली पुराने पहले कार्ड से बाँधी गई।',
      id: 'Jari kartu baru diikat ke kartu pertama yang lama.',
      pt: 'O dedo da carta nova foi atado à antiga primeira carta.',
    },
    'caption.insertLimit': {
      en: 'Reached the teaching limit — no more cards can be threaded in.',
      ko: '학습 한도 도달 — 더 이상 새 카드를 끼울 수 없다.',
      ja: '学習上の上限に達しました — これ以上カードを差し込めません。',
      zh: '已达到教学上限 — 无法再穿入新卡片。',
      ar: 'بلغنا الحد التعليمي — لا يمكن إدخال بطاقات أخرى.',
      es: 'Se alcanzó el límite didáctico: no se pueden enhebrar más tarjetas.',
      fr: 'Limite pédagogique atteinte — plus aucune carte ne peut être enfilée.',
      hi: 'शिक्षण सीमा पर पहुँच गए — अब और कार्ड नहीं पिरोए जा सकते।',
      id: 'Mencapai batas pembelajaran — tidak ada kartu lagi yang bisa disisipkan.',
      pt: 'Atingido o limite didático — não é possível enfiar mais cartas.',
    },
    'caption.insertRewirePrev': {
      en: 'Moved the previous card\'s finger over to the new card.',
      ko: '이전 카드의 손가락을 새 카드로 옮겨 끼웠다.',
      ja: '前のカードの指を新しいカードへ移し替えました。',
      zh: '把前一张卡片的手指改指到了新卡片。',
      ar: 'نُقل إصبع البطاقة السابقة إلى البطاقة الجديدة.',
      es: 'Se pasó el dedo de la tarjeta anterior a la tarjeta nueva.',
      fr: 'Le doigt de la carte précédente a été reporté sur la nouvelle carte.',
      hi: 'पिछले कार्ड की उंगली नए कार्ड पर लगा दी गई।',
      id: 'Jari kartu sebelumnya dipindahkan ke kartu baru.',
      pt: 'O dedo da carta anterior passou para a carta nova.',
    },
    'caption.removeRewire': {
      en: 'Moved the previous card\'s finger straight on to the next card.',
      ko: '이전 카드의 손가락을 다음 카드로 곧장 옮겨 끼웠다.',
      ja: '前のカードの指を次のカードへ直接つなぎ替えました。',
      zh: '把前一张卡片的手指直接改指到了下一张。',
      ar: 'نُقل إصبع البطاقة السابقة مباشرة إلى البطاقة التالية.',
      es: 'Se pasó el dedo de la tarjeta anterior directamente a la siguiente.',
      fr: 'Le doigt de la carte précédente a été reporté directement sur la suivante.',
      hi: 'पिछले कार्ड की उंगली सीधे अगले कार्ड पर लगा दी गई।',
      id: 'Jari kartu sebelumnya dipindahkan langsung ke kartu berikutnya.',
      pt: 'O dedo da carta anterior passou direto para a carta seguinte.',
    },
    'caption.searchFound': {
      en: 'Found it after {walked} steps — {value} at index {index}',
      ko: '{walked} 칸 만에 찾았다 — 인덱스 {index} 의 {value}',
      ja: '{walked} 歩で見つかりました — 添字 {index} の {value}',
      zh: '走了 {walked} 步后找到了 — 索引 {index} 处的 {value}',
      ar: 'وجدناه بعد {walked} خطوة — {value} عند الفهرس {index}',
      es: 'Encontrado tras {walked} pasos: {value} en el índice {index}',
      fr: 'Trouvé après {walked} pas — {value} à l\'indice {index}',
      hi: '{walked} कदम बाद मिल गया — सूचकांक {index} पर {value}',
      id: 'Ketemu setelah {walked} langkah — {value} pada indeks {index}',
      pt: 'Encontrado após {walked} passos — {value} no índice {index}',
    },
    'caption.searchMiss': {
      en: 'Walked to the end, and that value was not there.',
      ko: '끝까지 갔지만 그 값은 없었다.',
      ja: '最後まで歩きましたが、その値はありませんでした。',
      zh: '一直走到末尾，没有那个值。',
      ar: 'مشينا حتى النهاية ولم تكن تلك القيمة موجودة.',
      es: 'Se caminó hasta el final y ese valor no estaba.',
      fr: 'On a marché jusqu\'au bout, et cette valeur n\'y était pas.',
      hi: 'अंत तक चले, पर वह मान वहाँ नहीं था।',
      id: 'Berjalan sampai ujung, dan nilai itu tidak ada.',
      pt: 'Caminhou-se até o fim, e esse valor não estava lá.',
    },
    'caption.searchStart': {
      en: 'Starting at the head — following the fingers one step at a time.',
      ko: '머리에서 출발 — 손가락을 한 칸씩 따라간다.',
      ja: '先頭から出発 — 指を一つずつたどっていきます。',
      zh: '从头开始 — 一根一根地顺着手指走。',
      ar: 'نبدأ من الرأس — نتبع الأصابع خطوة خطوة.',
      es: 'Empezando por la cabeza: siguiendo los dedos uno a uno.',
      fr: 'Départ depuis la tête — on suit les doigts un par un.',
      hi: 'सिर से शुरू — उंगलियों का एक-एक कर अनुसरण।',
      id: 'Mulai dari kepala — mengikuti jari satu per satu.',
      pt: 'Começando pela cabeça — seguindo os dedos um a um.',
    },
    'caption.unreachable': {
      en: 'That position cannot be reached ({op} {index}).',
      ko: '그 자리에 닿을 수 없다 ({op} {index}).',
      ja: 'その位置には届きません ({op} {index})。',
      zh: '到不了那个位置 ({op} {index})。',
      ar: 'لا يمكن بلوغ ذلك الموضع ({op} {index}).',
      es: 'No se puede llegar a esa posición ({op} {index}).',
      fr: 'Cette position ne peut pas être atteinte ({op} {index}).',
      hi: 'उस स्थान तक नहीं पहुँचा जा सकता ({op} {index})।',
      id: 'Posisi itu tidak dapat dicapai ({op} {index}).',
      pt: 'Essa posição não pode ser alcançada ({op} {index}).',
    },
    'caption.walked': {
      en: 'Walked {count} steps so far.',
      ko: '지금까지 {count} 칸 걸었다.',
      ja: 'ここまで {count} 歩あるきました。',
      zh: '到目前为止走了 {count} 步。',
      ar: 'مشينا {count} خطوة حتى الآن.',
      es: 'Se han recorrido {count} pasos hasta ahora.',
      fr: '{count} pas parcourus jusqu\'ici.',
      hi: 'अब तक {count} कदम चले।',
      id: 'Sudah berjalan {count} langkah sejauh ini.',
      pt: 'Percorridos {count} passos até agora.',
    },
    'label.stage': {
      en: 'Step',
      ko: '단계',
      ja: '段階',
      zh: '步骤',
      ar: 'خطوة',
      es: 'Paso',
      fr: 'Étape',
      hi: 'चरण',
      id: 'Langkah',
      pt: 'Passo',
    },
  },
  blocks: {
    header: { type: 'title-block' },
    stage: {
      type: 'linked-list-stage',
    },
    controls: {
      type: 'control-bar',
      controls: [
        {
          widget: 'value-input',
          name: 'index',
          action: 'input',
          label: { en: 'i', ko: 'i', ja: 'i', zh: 'i', ar: 'i', es: 'i', fr: 'i', hi: 'i', id: 'i', pt: 'i' },
          placeholder: { en: 'e.g. 2', ko: '예: 2', ja: '例: 2', zh: '例: 2', ar: 'مثال: ٢', es: 'p. ej. 2', fr: 'ex. 2', hi: 'जैसे 2', id: 'mis. 2', pt: 'ex.: 2' },
          default: '',
        },
        {
          widget: 'value-input',
          name: 'value',
          action: 'input',
          label: { en: 'v', ko: 'v', ja: 'v', zh: 'v', ar: 'v', es: 'v', fr: 'v', hi: 'v', id: 'v', pt: 'v' },
          placeholder: { en: 'e.g. 25', ko: '예: 25', ja: '例: 25', zh: '例: 25', ar: 'مثال: ٢٥', es: 'p. ej. 25', fr: 'ex. 25', hi: 'जैसे 25', id: 'mis. 25', pt: 'ex.: 25' },
          default: '',
        },
        { widget: 'button', action: 'insert', label: { en: 'Insert', ko: '삽입', ja: '挿入', zh: '插入', ar: 'إدراج', es: 'Insertar', fr: 'Insérer', hi: 'डालें', id: 'Sisip', pt: 'Inserir' } },
        { widget: 'button', action: 'remove', label: { en: 'Remove', ko: '삭제', ja: '削除', zh: '删除', ar: 'حذف', es: 'Eliminar', fr: 'Supprimer', hi: 'हटाएं', id: 'Hapus', pt: 'Remover' } },
        { widget: 'button', action: 'search', label: { en: 'Search', ko: '검색', ja: '検索', zh: '查找', ar: 'بحث', es: 'Buscar', fr: 'Rechercher', hi: 'खोजें', id: 'Cari', pt: 'Buscar' } },
        { widget: 'button', action: 'reset', label: { en: 'Reset', ko: '초기화', ja: 'リセット', zh: '重置', ar: 'إعادة', es: 'Reiniciar', fr: 'Réinit.', hi: 'रीसेट', id: 'Atur ulang', pt: 'Reiniciar' } },
      ],
      metrics: [
        { name: 'insert-count', label: { en: 'Insert', ko: '삽입', ja: '挿入', zh: '插入', ar: 'إدراج', es: 'Insertar', fr: 'Insérer', hi: 'डालें', id: 'Sisip', pt: 'Inserir' }, initial: 0 },
        { name: 'remove-count', label: { en: 'Remove', ko: '삭제', ja: '削除', zh: '删除', ar: 'حذف', es: 'Eliminar', fr: 'Supprimer', hi: 'हटाएं', id: 'Hapus', pt: 'Remover' }, initial: 0 },
        { name: 'search-count', label: { en: 'Search', ko: '검색', ja: '検索', zh: '查找', ar: 'بحث', es: 'Buscar', fr: 'Rechercher', hi: 'खोजें', id: 'Cari', pt: 'Buscar' }, initial: 0 },
        { name: 'walk-count', label: { en: 'Walk', ko: '걸음', ja: '歩数', zh: '步数', ar: 'خطوات', es: 'Pasos', fr: 'Pas', hi: 'कदम', id: 'Langkah', pt: 'Passos' }, initial: 0 },
      ],
    },
  },
};

/**
 * aspect facet — 개념의 한 대목만 확대한 보조 시각화.
 *
 * canonical (`linkedListFacet`) 과 algorithm / projector / stage view 를 공유하고
 * `initialData` 와 `layout` 만 다르다. 셋 다 header 와 control-bar 를 두지 않는다 —
 * 글의 흐름에 박히는 그림은 독자가 조작하지 않아도 할 말을 마쳐야 하기 때문이다.
 *
 * 문안은 canonical 의 messages 를 그대로 쓴다. 같은 화면을 좁게 보는 것이라
 * 캡션 어휘가 갈리면 같은 그림이 두 가지로 불린다.
 *
 * title / description 은 en·ko 만 채웠다. 발췌 방식을 판정하기 위한 1차 시험이라
 * 10개 언어 확장은 채택 이후로 미룬다.
 */

/** 노드 하나 — value 칸과 next 칸. 자동 시연 없이 정지한다. */
export const linkedListNodeFacet: FacetJson = {
  id: 'facet:linkedListSingly-node',
  title: { en: 'A node', ko: '값과 참조를 담는 노드' },
  description: {
    en: 'One node — a value box and a next box side by side',
    ko: '노드 하나 — 값 칸과 다음 칸이 나란히 붙어 있다',
  },
  algorithm: 'module:linkedList',
  projector: 'module:linkedListProjector',
  initialData: {
    type: 'linked-list',
    initialValues: ['10'],
    autoDemoIntervalMs: 1000,
    searchStepMs: 280,
    maxSize: 7,
    autoDemoSequence: [],
    handoverAfterDemo: false,
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'stage', padding: '8px 0' }],
  },
  messages: linkedListFacet.messages,
  blocks: {
    stage: { type: 'linked-list-stage' },
  },
};

/** 노드 둘과 그 사이 참조 하나. 연결이 무엇인지만 보여 준다. */
export const linkedListLinkFacet: FacetJson = {
  id: 'facet:linkedListSingly-link',
  title: { en: 'A link between nodes', ko: '참조로 잇는 노드 관계' },
  description: {
    en: 'Two nodes and the single arrow that ties one to the next',
    ko: '노드 둘과 앞의 것을 뒤의 것에 잇는 화살표 하나',
  },
  algorithm: 'module:linkedList',
  projector: 'module:linkedListProjector',
  initialData: {
    type: 'linked-list',
    initialValues: ['10', '20'],
    autoDemoIntervalMs: 1000,
    searchStepMs: 280,
    maxSize: 7,
    autoDemoSequence: [],
    handoverAfterDemo: false,
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'stage', padding: '8px 0' }],
  },
  messages: linkedListFacet.messages,
  blocks: {
    stage: { type: 'linked-list-stage' },
  },
};

/** head 부터 끝까지 한 칸씩 — 임의 접근이 없다는 사실만 보여 준다. */
export const linkedListTraverseFacet: FacetJson = {
  id: 'facet:linkedListSingly-traverse',
  title: { en: 'Walking the list', ko: '연결을 따라가는 리스트' },
  description: {
    en: 'A walk from head to the last node — the only way in is one step at a time',
    ko: 'head 부터 마지막 노드까지의 걸음 — 들어가는 길은 한 칸씩뿐이다',
  },
  algorithm: 'module:linkedList',
  projector: 'module:linkedListProjector',
  initialData: {
    type: 'linked-list',
    initialValues: ['10', '20', '30', '40'],
    autoDemoIntervalMs: 700,
    searchStepMs: 420,
    maxSize: 7,
    autoDemoSequence: [{ op: 'search', value: '40' }],
    handoverAfterDemo: false,
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'stage', padding: '8px 0' }],
  },
  messages: linkedListFacet.messages,
  blocks: {
    stage: { type: 'linked-list-stage' },
  },
};
