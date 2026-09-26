/**
 * 문서와 키-값 — 선언.
 *
 * 자료는 표 셋(customers · orders · items)과 질의 셋뿐이다. 문서와 키-값의 값은 알고리즘이 표 셋에서
 * 주문마다 하나씩 접어 만든다. 표 · 열 · 값 · 열쇠 이름은 번역하지 않는 자료다. 문서 · 값은 JSON 글자 그대로 보인다.
 *
 * @notation native
 */
import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';
import type { DocumentKvData } from './algorithm.js';

const initialData: DocumentKvData = {
  type: 'document-kv',
  stepMs: 1100,
  customers: [
    { id: 'c1', name: 'Ana', city: 'Lima' },
    { id: 'c2', name: 'Ben', city: 'Oslo' },
    { id: 'c3', name: 'Cho', city: 'Seoul' },
  ],
  orders: [
    { id: 101, customer_id: 'c1', date: '2026-03-02' },
    { id: 102, customer_id: 'c2', date: '2026-03-05' },
    { id: 103, customer_id: 'c1', date: '2026-03-09' },
  ],
  items: [
    { order_id: 101, product: 'pen', qty: 2 },
    { order_id: 102, product: 'ink', qty: 1 },
    { order_id: 101, product: 'pad', qty: 1 },
    { order_id: 103, product: 'pen', qty: 5 },
    { order_id: 101, product: 'cup', qty: 3 },
    { order_id: 102, product: 'pad', qty: 2 },
  ],
  queries: [
    { kind: 'whole', order: 101 },
    { kind: 'where', field: 'city', value: 'Lima' },
    { kind: 'update', name: 'Ana', field: 'city', value: 'Quito' },
  ],
  layoutLadder: [0, 1, 2],
  queryLadder: [0, 1, 2],
  layout: 1,
  query: 0,
};

export const documentKvFacet: FacetJson = {
  id: 'facet:documentKv',
  title: {
    en: 'Documents and Key-Value',
    ko: '문서와 키-값',
    ja: 'ドキュメントとキー・バリュー',
    zh: '文档与键值',
    ar: 'المستندات والمفتاح-القيمة',
    es: 'Documentos y clave-valor',
    fr: 'Documents et clé-valeur',
    hi: 'दस्तावेज़ और की-वैल्यू',
    id: 'Dokumen dan Kunci-Nilai',
    pt: 'Documentos e chave-valor',
  },
  description: {
    en: 'The same three orders stored as three tables, as documents, or as key-value pairs. Turn the way of storing and the query, and watch which chunks come out of the store.',
    ko: '같은 주문 셋을 표 셋 · 문서 · 키-값으로 담는다. 담는 법과 질의를 돌려 저장소에서 어느 덩어리가 들려 나오는지 본다.',
    ja: '同じ3件の注文を、3つのテーブル・ドキュメント・キー・バリューで格納する。格納方法とクエリを切り替え、ストアからどの塊が取り出されるかを見る。',
    zh: '同样的三笔订单，分别存成三张表、文档或键值。切换存储方式和查询，看哪些块被从存储中取出。',
    ar: 'الطلبات الثلاثة نفسها مخزّنة في ثلاثة جداول أو كمستندات أو كأزواج مفتاح-قيمة. غيّر طريقة التخزين والاستعلام وشاهد أي الكتل تخرج من المخزن.',
    es: 'Los mismos tres pedidos guardados en tres tablas, como documentos o como pares clave-valor. Cambia la forma de almacenar y la consulta, y observa qué bloques salen del almacén.',
    fr: 'Les trois mêmes commandes stockées en trois tables, en documents ou en paires clé-valeur. Changez le stockage et la requête, et regardez quels blocs sortent du stockage.',
    hi: 'वही तीन ऑर्डर तीन तालिकाओं, दस्तावेज़ों या की-वैल्यू जोड़ों में रखे गए हैं। भंडारण रूप और क्वेरी बदलें, और देखें कि स्टोर से कौन-से टुकड़े बाहर आते हैं।',
    id: 'Tiga pesanan yang sama disimpan sebagai tiga tabel, dokumen, atau pasangan kunci-nilai. Ubah cara simpan dan kuerinya, lalu lihat potongan mana yang keluar dari penyimpanan.',
    pt: 'Os mesmos três pedidos guardados em três tabelas, como documentos ou como pares chave-valor. Mude a forma de armazenar e a consulta e veja quais blocos saem do armazenamento.',
  },
  algorithm: 'module:documentKv',
  projector: 'module:documentKvProjector',
  initialData,
  layout: {
    type: 'column',
    gap: 12,
    children: [{ ref: 'header' }, { ref: 'stage' }, { ref: 'controls' }],
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'document-kv-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        ...CONTROL_SET.playback,
        {
          widget: 'segmented-slider',
          action: 'layout',
          name: 'layout',
          label: { en: 'Stored as', ko: '담는 법', ja: '格納方法', zh: '存储方式', ar: 'طريقة التخزين', es: 'Almacenado como', fr: 'Stocké en', hi: 'भंडारण रूप', id: 'Disimpan sebagai', pt: 'Armazenado como' },
          segments: [
            { value: 0, label: { en: 'Tables', ko: '표 셋', ja: 'テーブル3つ', zh: '三张表', ar: 'ثلاثة جداول', es: 'Tres tablas', fr: 'Trois tables', hi: 'तीन तालिकाएँ', id: 'Tiga tabel', pt: 'Três tabelas' } },
            { value: 1, label: { en: 'Documents', ko: '문서', ja: 'ドキュメント', zh: '文档', ar: 'مستندات', es: 'Documentos', fr: 'Documents', hi: 'दस्तावेज़', id: 'Dokumen', pt: 'Documentos' }, default: true },
            { value: 2, label: { en: 'Key-value', ko: '키-값', ja: 'キー・バリュー', zh: '键值', ar: 'مفتاح-قيمة', es: 'Clave-valor', fr: 'Clé-valeur', hi: 'की-वैल्यू', id: 'Kunci-nilai', pt: 'Chave-valor' } },
          ],
        },
        {
          widget: 'segmented-slider',
          action: 'query',
          name: 'query',
          label: { en: 'Query', ko: '질의', ja: 'クエリ', zh: '查询', ar: 'الاستعلام', es: 'Consulta', fr: 'Requête', hi: 'क्वेरी', id: 'Kueri', pt: 'Consulta' },
          segments: [
            { value: 0, label: { en: 'Whole order', ko: '통째 읽기', ja: '注文を丸ごと', zh: '整单读取', ar: 'الطلب كاملًا', es: 'Pedido entero', fr: 'Commande entière', hi: 'पूरा ऑर्डर', id: 'Pesanan utuh', pt: 'Pedido inteiro' }, default: true },
            { value: 1, label: { en: 'Filter inside', ko: '값 속 조건', ja: '中身で絞り込み', zh: '按内部字段筛选', ar: 'شرط داخل القيمة', es: 'Filtro interno', fr: 'Filtre interne', hi: 'अंदर की शर्त', id: 'Saring isi', pt: 'Filtro interno' } },
            { value: 2, label: { en: 'Edit a fact', ko: '사실 고치기', ja: '事実を直す', zh: '修改一个事实', ar: 'تعديل معلومة', es: 'Editar un dato', fr: 'Modifier un fait', hi: 'एक तथ्य बदलें', id: 'Ubah satu fakta', pt: 'Editar um dado' } },
          ],
        },
      ],
      metrics: [
        { name: 'reads', label: { en: 'Reads', ko: '읽기', ja: '読み', zh: '读', ar: 'قراءات', es: 'Lecturas', fr: 'Lectures', hi: 'पढ़ना', id: 'Baca', pt: 'Leituras' }, initial: 0 },
        { name: 'writes', label: { en: 'Writes', ko: '쓰기', ja: '書き', zh: '写', ar: 'كتابات', es: 'Escrituras', fr: 'Écritures', hi: 'लिखना', id: 'Tulis', pt: 'Escritas' }, initial: 0 },
      ],
    },
  },
  messages: {
    'label.layout.tables': { en: 'Tables', ko: '표 셋', ja: 'テーブル3つ', zh: '三张表', ar: 'ثلاثة جداول', es: 'Tres tablas', fr: 'Trois tables', hi: 'तीन तालिकाएँ', id: 'Tiga tabel', pt: 'Três tabelas' },
    'label.layout.documents': { en: 'Documents', ko: '문서', ja: 'ドキュメント', zh: '文档', ar: 'مستندات', es: 'Documentos', fr: 'Documents', hi: 'दस्तावेज़', id: 'Dokumen', pt: 'Documentos' },
    'label.layout.kv': { en: 'Key-value', ko: '키-값', ja: 'キー・バリュー', zh: '键值', ar: 'مفتاح-قيمة', es: 'Clave-valor', fr: 'Clé-valeur', hi: 'की-वैल्यू', id: 'Kunci-nilai', pt: 'Chave-valor' },
    'label.query.whole': { en: 'Order {order}, whole', ko: '주문 {order} 통째로', ja: '注文 {order} を丸ごと', zh: '整个订单 {order}', ar: 'الطلب {order} كاملًا', es: 'Pedido {order} entero', fr: 'Commande {order} entière', hi: 'पूरा ऑर्डर {order}', id: 'Pesanan {order} utuh', pt: 'Pedido {order} inteiro' },
    'label.query.where': { en: 'Orders where {field} = {value}', ko: '{field} = {value} 인 손님의 주문', ja: '{field} = {value} の顧客の注文', zh: '{field} = {value} 的顾客的订单', ar: 'طلبات العملاء حيث {field} = {value}', es: 'Pedidos con {field} = {value}', fr: 'Commandes où {field} = {value}', hi: '{field} = {value} वाले ग्राहकों के ऑर्डर', id: 'Pesanan dengan {field} = {value}', pt: 'Pedidos com {field} = {value}' },
    'label.query.update': { en: '{field} of {name} → {value}', ko: '{name} 의 {field} → {value}', ja: '{name} の {field} → {value}', zh: '{name} 的 {field} → {value}', ar: '{field} لدى {name} → {value}', es: '{field} de {name} → {value}', fr: '{field} de {name} → {value}', hi: '{name} का {field} → {value}', id: '{field} milik {name} → {value}', pt: '{field} de {name} → {value}' },
    'caption.start': { en: 'Stored as: {layout} · Query: {query}', ko: '담는 법: {layout} · 질의: {query}', ja: '格納方法: {layout} · クエリ: {query}', zh: '存储方式：{layout} · 查询：{query}', ar: 'طريقة التخزين: {layout} · الاستعلام: {query}', es: 'Almacenado como: {layout} · Consulta: {query}', fr: 'Stocké en : {layout} · Requête : {query}', hi: 'भंडारण रूप: {layout} · क्वेरी: {query}', id: 'Disimpan sebagai: {layout} · Kueri: {query}', pt: 'Armazenado como: {layout} · Consulta: {query}' },
    'caption.ready': { en: 'Nothing taken out of the store yet', ko: '아직 저장소에서 꺼낸 것이 없다', ja: 'まだストアから何も取り出していない', zh: '还没有从存储中取出任何东西', ar: 'لم يُؤخذ شيء من المخزن بعد', es: 'Aún no se ha sacado nada del almacén', fr: 'Rien n’a encore été sorti du stockage', hi: 'अभी तक स्टोर से कुछ नहीं निकाला गया', id: 'Belum ada yang diambil dari penyimpanan', pt: 'Nada foi retirado do armazenamento ainda' },
    'caption.readRow': { en: 'Read: row {pos} of {table} ({row})', ko: '꺼냄 — {table} 의 {pos}번째 줄 ({row})', ja: '読み出し: {table} の {pos} 行目 ({row})', zh: '读取：{table} 第 {pos} 行（{row}）', ar: 'قراءة: الصف {pos} من {table} ({row})', es: 'Lectura: fila {pos} de {table} ({row})', fr: 'Lecture : ligne {pos} de {table} ({row})', hi: 'पढ़ा: {table} की पंक्ति {pos} ({row})', id: 'Baca: baris {pos} dari {table} ({row})', pt: 'Leitura: linha {pos} de {table} ({row})' },
    'caption.readDoc': { en: 'Read: document {id}', ko: '꺼냄 — 문서 {id}', ja: '読み出し: ドキュメント {id}', zh: '读取：文档 {id}', ar: 'قراءة: المستند {id}', es: 'Lectura: documento {id}', fr: 'Lecture : document {id}', hi: 'पढ़ा: दस्तावेज़ {id}', id: 'Baca: dokumen {id}', pt: 'Leitura: documento {id}' },
    'caption.getWhole': { en: '{op} — the whole value comes out', ko: '{op} — 값이 통째로 나온다', ja: '{op} — 値が丸ごと出てくる', zh: '{op} — 整个值被取出', ar: '{op} — تخرج القيمة كاملة', es: '{op} — sale el valor entero', fr: '{op} — la valeur sort en entier', hi: '{op} — पूरा मान बाहर आता है', id: '{op} — seluruh nilai keluar', pt: '{op} — o valor sai inteiro' },
    'caption.getMatch': { en: '{op} — opened outside: {field} = {found} · match', ko: '{op} — 밖에서 열어 보니 {field} = {found} · 맞음', ja: '{op} — 外で開くと {field} = {found} · 一致', zh: '{op} — 在外部打开：{field} = {found} · 匹配', ar: '{op} — فُتحت في الخارج: {field} = {found} · مطابقة', es: '{op} — abierto fuera: {field} = {found} · coincide', fr: '{op} — ouvert dehors : {field} = {found} · correspond', hi: '{op} — बाहर खोलने पर {field} = {found} · मेल', id: '{op} — dibuka di luar: {field} = {found} · cocok', pt: '{op} — aberto fora: {field} = {found} · corresponde' },
    'caption.getMiss': { en: '{op} — opened outside: {field} = {found} · no match', ko: '{op} — 밖에서 열어 보니 {field} = {found} · 아님', ja: '{op} — 外で開くと {field} = {found} · 不一致', zh: '{op} — 在外部打开：{field} = {found} · 不匹配', ar: '{op} — فُتحت في الخارج: {field} = {found} · غير مطابقة', es: '{op} — abierto fuera: {field} = {found} · no coincide', fr: '{op} — ouvert dehors : {field} = {found} · ne correspond pas', hi: '{op} — बाहर खोलने पर {field} = {found} · मेल नहीं', id: '{op} — dibuka di luar: {field} = {found} · tidak cocok', pt: '{op} — aberto fora: {field} = {found} · não corresponde' },
    'caption.writeRow': { en: 'Write: row {pos} of {table} · {column} → {value}', ko: '고쳐 넣음 — {table} 의 {pos}번째 줄 · {column} → {value}', ja: '書き込み: {table} の {pos} 行目 · {column} → {value}', zh: '写入：{table} 第 {pos} 行 · {column} → {value}', ar: 'كتابة: الصف {pos} من {table} · {column} → {value}', es: 'Escritura: fila {pos} de {table} · {column} → {value}', fr: 'Écriture : ligne {pos} de {table} · {column} → {value}', hi: 'लिखा: {table} की पंक्ति {pos} · {column} → {value}', id: 'Tulis: baris {pos} dari {table} · {column} → {value}', pt: 'Escrita: linha {pos} de {table} · {column} → {value}' },
    'caption.writeDoc': { en: 'Write: document {id} · {path} → {value}', ko: '고쳐 넣음 — 문서 {id} · {path} → {value}', ja: '書き込み: ドキュメント {id} · {path} → {value}', zh: '写入：文档 {id} · {path} → {value}', ar: 'كتابة: المستند {id} · {path} → {value}', es: 'Escritura: documento {id} · {path} → {value}', fr: 'Écriture : document {id} · {path} → {value}', hi: 'लिखा: दस्तावेज़ {id} · {path} → {value}', id: 'Tulis: dokumen {id} · {path} → {value}', pt: 'Escrita: documento {id} · {path} → {value}' },
    'caption.put': { en: '{op} — the whole value goes back in', ko: '{op} — 값을 통째로 다시 넣는다', ja: '{op} — 値を丸ごと書き戻す', zh: '{op} — 把整个值写回', ar: '{op} — تعود القيمة كاملة إلى المخزن', es: '{op} — el valor entero vuelve a entrar', fr: '{op} — la valeur entière est réécrite', hi: '{op} — पूरा मान वापस रखा जाता है', id: '{op} — seluruh nilai dimasukkan kembali', pt: '{op} — o valor inteiro volta a entrar' },
    'caption.doneWhole': { en: 'Answer: order {order} · customer {name} · items: {n}', ko: '답 — 주문 {order} · 손님 {name} · 품목 {n}개', ja: '答え: 注文 {order} · 顧客 {name} · 品目 {n} 件', zh: '答案：订单 {order} · 顾客 {name} · 商品 {n} 项', ar: 'الجواب: الطلب {order} · العميل {name} · عدد الأصناف: {n}', es: 'Respuesta: pedido {order} · cliente {name} · artículos: {n}', fr: 'Réponse : commande {order} · client {name} · articles : {n}', hi: 'उत्तर: ऑर्डर {order} · ग्राहक {name} · वस्तुएँ: {n}', id: 'Jawaban: pesanan {order} · pelanggan {name} · barang: {n}', pt: 'Resposta: pedido {order} · cliente {name} · itens: {n}' },
    'caption.doneWhere': { en: 'Answer: orders {ids}', ko: '답 — 주문 {ids}', ja: '答え: 注文 {ids}', zh: '答案：订单 {ids}', ar: 'الجواب: الطلبات {ids}', es: 'Respuesta: pedidos {ids}', fr: 'Réponse : commandes {ids}', hi: 'उत्तर: ऑर्डर {ids}', id: 'Jawaban: pesanan {ids}', pt: 'Resposta: pedidos {ids}' },
    'caption.doneUpdate': { en: 'Answer: copies changed: {n}', ko: '답 — 고친 사본: {n}', ja: '答え: 直したコピー: {n}', zh: '答案：改动的副本数：{n}', ar: 'الجواب: النسخ المعدّلة: {n}', es: 'Respuesta: copias cambiadas: {n}', fr: 'Réponse : copies modifiées : {n}', hi: 'उत्तर: बदली गई प्रतियाँ: {n}', id: 'Jawaban: salinan diubah: {n}', pt: 'Resposta: cópias alteradas: {n}' },
    'stage.store': { en: 'Store', ko: '저장소', ja: 'ストア', zh: '存储', ar: 'المخزن', es: 'Almacén', fr: 'Stockage', hi: 'स्टोर', id: 'Penyimpanan', pt: 'Armazenamento' },
    'stage.app': { en: 'App', ko: '앱', ja: 'アプリ', zh: '应用', ar: 'التطبيق', es: 'Aplicación', fr: 'Application', hi: 'ऐप', id: 'Aplikasi', pt: 'Aplicação' },
    'stage.counts': { en: 'Reads: {reads} · Writes: {writes}', ko: '읽기: {reads} · 쓰기: {writes}', ja: '読み: {reads} · 書き: {writes}', zh: '读：{reads} · 写：{writes}', ar: 'قراءات: {reads} · كتابات: {writes}', es: 'Lecturas: {reads} · Escrituras: {writes}', fr: 'Lectures : {reads} · Écritures : {writes}', hi: 'पढ़ना: {reads} · लिखना: {writes}', id: 'Baca: {reads} · Tulis: {writes}', pt: 'Leituras: {reads} · Escritas: {writes}' },
    'stage.tally': { en: 'Chunks this query touched, per way of storing', ko: '같은 질의가 담는 법마다 건드린 덩어리', ja: '同じクエリが格納方法ごとに触れた塊', zh: '同一查询在各存储方式下触及的块', ar: 'الكتل التي لمسها هذا الاستعلام في كل طريقة تخزين', es: 'Bloques que tocó esta consulta en cada forma de almacenar', fr: 'Blocs touchés par cette requête selon le stockage', hi: 'हर भंडारण रूप में इस क्वेरी ने छुए टुकड़े', id: 'Potongan yang disentuh kueri ini per cara simpan', pt: 'Blocos tocados por esta consulta em cada forma de armazenar' },
    'stage.fewest': { en: 'Fewest', ko: '가장 적음', ja: '最少', zh: '最少', ar: 'الأقل', es: 'Menos', fr: 'Le moins', hi: 'सबसे कम', id: 'Paling sedikit', pt: 'Menos' },
    'stage.verdict': { en: '{field} = {found} · {verdict}', ko: '{field} = {found} · {verdict}', ja: '{field} = {found} · {verdict}', zh: '{field} = {found} · {verdict}', ar: '{field} = {found} · {verdict}', es: '{field} = {found} · {verdict}', fr: '{field} = {found} · {verdict}', hi: '{field} = {found} · {verdict}', id: '{field} = {found} · {verdict}', pt: '{field} = {found} · {verdict}' },
    'label.match': { en: 'match', ko: '맞음', ja: '一致', zh: '匹配', ar: 'مطابقة', es: 'coincide', fr: 'correspond', hi: 'मेल', id: 'cocok', pt: 'corresponde' },
    'label.miss': { en: 'no match', ko: '아님', ja: '不一致', zh: '不匹配', ar: 'غير مطابقة', es: 'no coincide', fr: 'ne correspond pas', hi: 'मेल नहीं', id: 'tidak cocok', pt: 'não corresponde' },
    'label.reads': { en: 'Reads', ko: '읽기', ja: '読み', zh: '读', ar: 'قراءات', es: 'Lecturas', fr: 'Lectures', hi: 'पढ़ना', id: 'Baca', pt: 'Leituras' },
    'label.writes': { en: 'Writes', ko: '쓰기', ja: '書き', zh: '写', ar: 'كتابات', es: 'Escrituras', fr: 'Écritures', hi: 'लिखना', id: 'Tulis', pt: 'Escritas' },
  },
};
