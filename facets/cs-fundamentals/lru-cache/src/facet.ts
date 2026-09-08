/**
 * LruCache facet JSON 선언.
 *
 * 진행 모델 입력 반응형 — algorithm 등록 시 mechanismKind: 'reactive' 사용.
 * mount 즉시 자동 시연 (put k1·k2·k3 → get k1) 후 학습자 입력 대기.
 *
 * 컨트롤바 어휘 (기획 §6 §7 컨트롤 영역):
 *   [ key ] [ value ] [ get ] [ put ] [ 초기화 ]
 *
 * 코드 패널은 1차 구현에서 생략 (기획 §6 보조 요소 미언급).
 *
 * 식별자 (C1): `node:<key>` 명시 prefix 만 사용 (기획 §1 노드 기반 자료구조).
 *
 * 자동 시연 시퀀스 (capacity = 4):
 *   put(k1,v1) → put(k2,v2) → put(k3,v3) → get(k1)
 *   결과 list (LRU→MRU): [k2, k3, k1], size=3, capacity 게이지 3/4 (여유 1).
 *   다음 학습자 시도: put(k4,v4) (꽉 참 진입) → put(k5,v5) (eviction) → get(k3) (promotion).
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL } from '@ffacet/core/runtime';

export const lruCacheFacet: FacetJson = {
  id: 'facet:lruCache',
  title: { en: 'LRU Cache', ko: 'LRU 캐시', ja: 'LRU キャッシュ', zh: 'LRU 缓存', ar: 'ذاكرة LRU', es: 'Caché LRU', fr: 'Cache LRU', hi: 'LRU कैश', id: 'Cache LRU', pt: 'Cache LRU' },
  description: { en: 'A capacity-bound key-value store that pulls every touched node to the MRU end and drops the LRU end on overflow', ko: '용량이 정해진 키-값 저장소 — 모든 호출이 노드를 MRU 끝으로 끌어올리고 꽉 차면 LRU 끝이 두 영역에서 함께 사라진다', ja: '容量の決まったキー値ストア — 触れたノードはすべて MRU 端へ引き上げられ、あふれれば LRU 端が消える', zh: '容量固定的键值存储 — 每次触碰都把节点拖到 MRU 端，溢出时 LRU 端消失', ar: 'مخزن مفتاح-قيمة محدود السعة — كل عقدة تُلمس تُسحب إلى طرف MRU، وعند الفيض يختفي طرف LRU', es: 'Almacén clave-valor con capacidad fija: cada nodo tocado sube al extremo MRU y al desbordar cae el extremo LRU', fr: 'Magasin clé-valeur à capacité fixe — chaque nœud touché monte à l\'extrémité MRU, et au débordement l\'extrémité LRU disparaît', hi: 'निश्चित क्षमता का कुंजी-मान भंडार — छुआ गया हर नोड MRU छोर पर आता है, और भरने पर LRU छोर लुप्त होता है', id: 'Penyimpanan kunci-nilai berkapasitas tetap — tiap simpul yang disentuh naik ke ujung MRU, dan saat meluap ujung LRU hilang', pt: 'Armazém chave-valor de capacidade fixa — todo nó tocado sobe à ponta MRU e, ao transbordar, a ponta LRU cai' },
  algorithm: 'module:lruCache',
  projector: 'module:lruCacheProjector',
  initialData: {
    type: 'lru-cache',
    capacity: 4,
    autoDemoIntervalMs: 900,
    autoDemoSequence: [
      { op: 'put', key: 'k1', value: 'v1' },
      { op: 'put', key: 'k2', value: 'v2' },
      { op: 'put', key: 'k3', value: 'v3' },
      { op: 'get', key: 'k1' },
    ],
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
    'caption.evict': {
      en: 'Over capacity — {key} at the LRU end disappears from both areas together.',
      ko: '용량 초과 — LRU 끝의 {key} 가 두 영역에서 함께 사라진다.',
      ja: '容量超過 — LRU 端の {key} が両方の領域から同時に消えます。',
      zh: '超出容量 — LRU 端的 {key} 从两个区域一同消失。',
      ar: 'تجاوز السعة — يختفي {key} عند طرف LRU من المنطقتين معًا.',
      es: 'Sobre capacidad: {key} en el extremo LRU desaparece de ambas zonas a la vez.',
      fr: 'Capacité dépassée — {key} à l\'extrémité LRU disparaît des deux zones ensemble.',
      hi: 'क्षमता से अधिक — LRU छोर का {key} दोनों क्षेत्रों से एक साथ लुप्त होता है।',
      id: 'Melebihi kapasitas — {key} di ujung LRU lenyap dari kedua area bersamaan.',
      pt: 'Acima da capacidade — {key} na ponta LRU some das duas áreas juntas.',
    },
    'caption.getHit': {
      en: '{key} was dragged to the MRU end — even a get rotates the list.',
      ko: '{key} 가 MRU 끝으로 끌려 올라갔다 — get 도 list 를 회전시킨다.',
      ja: '{key} が MRU 端へ引き上げられました — get でもリストは回ります。',
      zh: '{key} 被拖到了 MRU 端 — 连 get 也会让链表转动。',
      ar: 'سُحب {key} إلى طرف MRU — حتى get يدير القائمة.',
      es: '{key} fue arrastrado al extremo MRU: incluso un get rota la lista.',
      fr: '{key} a été tiré vers l\'extrémité MRU — même un get fait tourner la liste.',
      hi: '{key} को MRU छोर तक खींचा गया — get भी सूची को घुमाता है।',
      id: '{key} diseret ke ujung MRU — bahkan get memutar senarai.',
      pt: '{key} foi arrastado para a ponta MRU — até um get gira a lista.',
    },
    'caption.getMiss': {
      en: '{key} is not in the cache — the list stays as it was.',
      ko: '{key} 는 캐시에 없다 — list 는 변하지 않는다.',
      ja: '{key} はキャッシュにありません — リストは変わりません。',
      zh: '{key} 不在缓存里 — 链表保持原样。',
      ar: '{key} ليس في الذاكرة — تبقى القائمة كما هي.',
      es: '{key} no está en la caché: la lista queda igual.',
      fr: '{key} n\'est pas dans le cache — la liste reste inchangée.',
      hi: '{key} कैश में नहीं है — सूची जैसी थी वैसी रहती है।',
      id: '{key} tidak ada di cache — senarai tetap seperti semula.',
      pt: '{key} não está no cache — a lista continua como estava.',
    },
    'caption.handover': {
      en: 'Your turn — type a key and value, then press get or put.',
      ko: '이제 직접 — 키와 값을 입력하고 get / put 를 눌러 보세요.',
      ja: 'あなたの番です — キーと値を入力して get・put を押してみてください。',
      zh: '轮到你了 — 输入键和值，然后按 get 或 put。',
      ar: 'دورك الآن — اكتب مفتاحًا وقيمة، ثم اضغط get أو put.',
      es: 'Te toca: escribe una clave y un valor, y pulsa get o put.',
      fr: 'À vous — saisissez une clé et une valeur, puis appuyez sur get ou put.',
      hi: 'अब आपकी बारी — कुंजी और मान लिखें, फिर get या put दबाएं।',
      id: 'Giliran Anda — ketik kunci dan nilai, lalu tekan get atau put.',
      pt: 'Sua vez — digite uma chave e um valor e pressione get ou put.',
    },
    'caption.invalidKey': {
      en: '{op}: only short alphanumeric keys (values) are accepted — got "{raw}"',
      ko: '{op}: 짧은 영숫자 키 (값) 만 받는다 — 입력: "{raw}"',
      ja: '{op}: 短い英数字のキー (値) しか受け付けません — 入力: "{raw}"',
      zh: '{op}: 只接受简短的字母数字键 (值) — 收到: "{raw}"',
      ar: '{op}: لا تُقبل إلا مفاتيح (قيم) قصيرة أبجدية رقمية — ورد: "{raw}"',
      es: '{op}: solo se aceptan claves (valores) alfanuméricas cortas — se recibió «{raw}»',
      fr: '{op} : seules des clés (valeurs) alphanumériques courtes sont acceptées — reçu « {raw} »',
      hi: '{op}: केवल छोटी अक्षरांकीय कुंजियाँ (मान) स्वीकार्य हैं — मिला "{raw}"',
      id: '{op}: hanya kunci (nilai) alfanumerik pendek yang diterima — diterima "{raw}"',
      pt: '{op}: só são aceitas chaves (valores) alfanuméricas curtas — recebido "{raw}"',
    },
    'caption.missMark': {
      en: '{key} ?  absent',
      ko: '{key} ?  미존재',
      ja: '{key} ?  なし',
      zh: '{key} ?  不存在',
      ar: '{key} ؟  غير موجود',
      es: '{key} ?  ausente',
      fr: '{key} ?  absent',
      hi: '{key} ?  अनुपस्थित',
      id: '{key} ?  tidak ada',
      pt: '{key} ?  ausente',
    },
    'caption.putInsert': {
      en: 'New key {key} entered at the MRU end (room to spare).',
      ko: '새 키 {key} 가 MRU 끝에 들어왔다 (여유 있음).',
      ja: '新しいキー {key} が MRU 端に入りました (まだ余裕あり)。',
      zh: '新键 {key} 进入了 MRU 端 (还有空间)。',
      ar: 'دخل المفتاح الجديد {key} عند طرف MRU (ما زال هناك متسع).',
      es: 'La clave nueva {key} entró en el extremo MRU (aún hay sitio).',
      fr: 'La nouvelle clé {key} est entrée à l\'extrémité MRU (il reste de la place).',
      hi: 'नई कुंजी {key} MRU छोर पर आई (जगह बची है)।',
      id: 'Kunci baru {key} masuk di ujung MRU (masih ada ruang).',
      pt: 'A chave nova {key} entrou na ponta MRU (ainda há espaço).',
    },
    'caption.putUpdate': {
      en: 'The value for {key} was updated and dragged to the MRU end.',
      ko: '{key} 의 값이 갱신되며 MRU 끝으로 끌려 올라갔다.',
      ja: '{key} の値が更新され、MRU 端へ引き上げられました。',
      zh: '{key} 的值被更新，并被拖到了 MRU 端。',
      ar: 'حُدّثت قيمة {key} وسُحبت إلى طرف MRU.',
      es: 'Se actualizó el valor de {key} y se arrastró al extremo MRU.',
      fr: 'La valeur de {key} a été mise à jour et tirée vers l\'extrémité MRU.',
      hi: '{key} का मान बदला गया और उसे MRU छोर तक खींचा गया।',
      id: 'Nilai untuk {key} diperbarui dan diseret ke ujung MRU.',
      pt: 'O valor de {key} foi atualizado e arrastado para a ponta MRU.',
    },
    'label.dllArea': {
      en: 'doubly linked list  (recency order)',
      ko: 'doubly linked list  (사용 순서)',
      ja: 'doubly linked list  (使用順)',
      zh: 'doubly linked list  (使用顺序)',
      ar: 'doubly linked list  (ترتيب الاستخدام)',
      es: 'doubly linked list  (orden de uso)',
      fr: 'doubly linked list  (ordre d\'utilisation)',
      hi: 'doubly linked list  (उपयोग क्रम)',
      id: 'doubly linked list  (urutan pemakaian)',
      pt: 'doubly linked list  (ordem de uso)',
    },
    'label.hashArea': {
      en: 'hash map  (key → node pointer)',
      ko: 'hash map  (key → 노드 포인터)',
      ja: 'hash map  (キー → ノードのポインタ)',
      zh: 'hash map  (键 → 节点指针)',
      ar: 'hash map  (مفتاح ← مؤشر عقدة)',
      es: 'hash map  (clave → puntero a nodo)',
      fr: 'hash map  (clé → pointeur de nœud)',
      hi: 'hash map  (कुंजी → नोड सूचक)',
      id: 'hash map  (kunci → penunjuk simpul)',
      pt: 'hash map  (chave → ponteiro de nó)',
    },
    'label.lruEnd': {
      en: '◀ LRU (least recently seen)',
      ko: '◀ LRU (가장 오래 안 본 것)',
      ja: '◀ LRU (最も長く見ていない)',
      zh: '◀ LRU (最久未看)',
      ar: '◀ LRU (الأقدم مشاهدة)',
      es: '◀ LRU (visto hace más tiempo)',
      fr: '◀ LRU (vu il y a le plus longtemps)',
      hi: '◀ LRU (सबसे पहले देखा गया)',
      id: '◀ LRU (paling lama tak dilihat)',
      pt: '◀ LRU (visto há mais tempo)',
    },
    'label.mruEnd': {
      en: '(just seen) MRU ▶',
      ko: '(방금 본 것) MRU ▶',
      ja: '(たった今見た) MRU ▶',
      zh: '(刚刚看过) MRU ▶',
      ar: '(شوهد للتو) MRU ▶',
      es: '(recién visto) MRU ▶',
      fr: '(vu à l\'instant) MRU ▶',
      hi: '(अभी देखा गया) MRU ▶',
      id: '(baru dilihat) MRU ▶',
      pt: '(visto agora) MRU ▶',
    },
    'label.traceTitle': {
      en: 'Call trace',
      ko: '호출 트레이스',
      ja: '呼び出しトレース',
      zh: '调用轨迹',
      ar: 'سجل الاستدعاءات',
      es: 'Traza de llamadas',
      fr: 'Trace des appels',
      hi: 'कॉल ट्रेस',
      id: 'Jejak panggilan',
      pt: 'Rastro de chamadas',
    },
  },
  blocks: {
    header: { type: 'title-block' },
    stage: {
      type: 'lru-cache-stage',
    },
    controls: {
      type: 'control-bar',
      controls: [
        {
          widget: 'value-input',
          name: 'key',
          action: 'input',
          label: { en: 'key', ko: 'key', ja: 'キー', zh: '键', ar: 'مفتاح', es: 'clave', fr: 'clé', hi: 'कुंजी', id: 'kunci', pt: 'chave' },
          placeholder: { en: 'e.g. k4', ko: '예: k4', ja: '例: k4', zh: '例: k4', ar: 'مثال: k4', es: 'p. ej. k4', fr: 'ex. k4', hi: 'जैसे k4', id: 'mis. k4', pt: 'ex.: k4' },
          default: '',
        },
        {
          widget: 'value-input',
          name: 'value',
          action: 'input',
          label: { en: 'value', ko: 'value', ja: '値', zh: '值', ar: 'قيمة', es: 'valor', fr: 'valeur', hi: 'मान', id: 'nilai', pt: 'valor' },
          placeholder: { en: 'e.g. v4', ko: '예: v4', ja: '例: v4', zh: '例: v4', ar: 'مثال: v4', es: 'p. ej. v4', fr: 'ex. v4', hi: 'जैसे v4', id: 'mis. v4', pt: 'ex.: v4' },
          default: '',
        },
        { widget: 'button', action: 'get', label: { en: 'Get', ko: 'get', ja: '取得', zh: '读取', ar: 'جلب', es: 'Obtener', fr: 'Obtenir', hi: 'प्राप्त', id: 'Ambil', pt: 'Obter' } },
        { widget: 'button', action: 'put', label: { en: 'Put', ko: 'put', ja: '格納', zh: '写入', ar: 'وضع', es: 'Guardar', fr: 'Placer', hi: 'रखें', id: 'Simpan', pt: 'Guardar' } },
        CONTROL.reset,
      ],
      metrics: [
        { name: 'get-count', label: { en: 'Get', ko: 'get', ja: '取得', zh: '读取', ar: 'جلب', es: 'Obtener', fr: 'Obtenir', hi: 'प्राप्त', id: 'Ambil', pt: 'Obter' }, initial: 0 },
        { name: 'put-count', label: { en: 'Put', ko: 'put', ja: '格納', zh: '写入', ar: 'وضع', es: 'Guardar', fr: 'Placer', hi: 'रखें', id: 'Simpan', pt: 'Guardar' }, initial: 0 },
        { name: 'hit-count', label: { en: 'Hit', ko: '적중', ja: 'ヒット', zh: '命中', ar: 'إصابة', es: 'Aciertos', fr: 'Succès', hi: 'हिट', id: 'Hit', pt: 'Acertos' }, initial: 0 },
        { name: 'miss-count', label: { en: 'Miss', ko: '빗남', ja: 'ミス', zh: '未命中', ar: 'إخفاق', es: 'Fallos', fr: 'Échecs', hi: 'मिस', id: 'Miss', pt: 'Falhas' }, initial: 0 },
        { name: 'eviction-count', label: { en: 'Evict', ko: '축출', ja: '追い出し', zh: '淘汰', ar: 'إخراج', es: 'Desalojo', fr: 'Éviction', hi: 'निष्कासन', id: 'Usir', pt: 'Despejo' }, initial: 0 },
      ],
    },
  },
};
