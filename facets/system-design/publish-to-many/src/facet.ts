import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

/**
 * @piece
 * 질문: 보내는 쪽이 메시지를 한 번 보내면, 그 메시지는 몇 곳에 닿는가.
 */
export const publishToManyFacet: FacetJson = {
  id: 'facet:publishToMany',
  title: {
    en: 'Publish once, many receive',
    ko: '한 번 보내면 여럿이 받는다',
    ja: '一度送ると多くが受け取る',
    zh: '发送一次，多方接收',
    ar: 'أرسل مرة واحدة فيستلم الكثيرون',
    es: 'Se publica una vez, reciben muchos',
    fr: 'Publier une fois, plusieurs reçoivent',
    hi: 'एक बार भेजो, कई पाते हैं',
    id: 'Kirim sekali, banyak yang menerima',
    pt: 'Publica uma vez, muitos recebem',
  },
  description: {
    en: 'One message goes to the topic, then splits into one copy per subscriber.',
    ko: '메시지 하나가 토픽으로 가고, 토픽에서 구독자마다 사본 하나씩으로 갈라진다.',
    ja: '一つのメッセージがトピックへ行き、購読者ごとに一つずつのコピーに分かれる。',
    zh: '一条消息发往主题，再按订阅者各分出一份副本。',
    ar: 'تذهب رسالة واحدة إلى الموضوع، ثم تنقسم إلى نسخة لكل مشترك.',
    es: 'Un mensaje llega al tema y se divide en una copia por suscriptor.',
    fr: 'Un message arrive au sujet, puis se divise en une copie par abonné.',
    hi: 'एक संदेश टॉपिक तक जाता है, फिर हर सब्सक्राइबर के लिए एक प्रति में बँट जाता है।',
    id: 'Satu pesan menuju topik, lalu terbelah menjadi satu salinan untuk tiap pelanggan.',
    pt: 'Uma mensagem vai ao tópico e se divide em uma cópia por assinante.',
  },
  algorithm: 'module:publishToMany',
  scene: 'module:publishToManyScene',
  initialData: {
    type: 'publish-to-many',
    topic: 'order.placed',
    subscribers: ['email', 'stock', 'stats'],
    messages: [101, 102, 103],
    stepMs: 1500,
  },
  shuffleOnReset: false,
  messages: {
    'caption.ready': {
      en: 'Topic {topic}. Subscribers: {n}.',
      ko: '토픽 {topic}. 구독자: {n}.',
      ja: 'トピック {topic}。購読者: {n}。',
      zh: '主题 {topic}。订阅者：{n}。',
      ar: 'الموضوع {topic}. المشتركون: {n}.',
      es: 'Tema {topic}. Suscriptores: {n}.',
      fr: 'Sujet {topic}. Abonnés : {n}.',
      hi: 'टॉपिक {topic}। सब्सक्राइबर: {n}।',
      id: 'Topik {topic}. Pelanggan: {n}.',
      pt: 'Tópico {topic}. Assinantes: {n}.',
    },
    'caption.send': {
      en: 'The sender publishes to the topic: {message}.',
      ko: '보내는 쪽이 토픽으로 보낸다: {message}.',
      ja: '送信側がトピックへ送る: {message}。',
      zh: '发送方发往主题：{message}。',
      ar: 'يرسل المُرسِل إلى الموضوع: {message}.',
      es: 'El emisor publica en el tema: {message}.',
      fr: 'L’émetteur publie sur le sujet : {message}.',
      hi: 'भेजने वाला टॉपिक को भेजता है: {message}।',
      id: 'Pengirim menerbitkan ke topik: {message}.',
      pt: 'O emissor publica no tópico: {message}.',
    },
    'caption.fanOut': {
      en: 'The topic puts a copy in every subscriber: {message}. New copies: {n}.',
      ko: '토픽이 구독자마다 사본을 넣는다: {message}. 새 사본: {n}.',
      ja: 'トピックが購読者ごとにコピーを入れる: {message}。新しいコピー: {n}。',
      zh: '主题给每个订阅者放入一份副本：{message}。新副本：{n}。',
      ar: 'يضع الموضوع نسخة عند كل مشترك: {message}. نسخ جديدة: {n}.',
      es: 'El tema deja una copia en cada suscriptor: {message}. Copias nuevas: {n}.',
      fr: 'Le sujet dépose une copie chez chaque abonné : {message}. Nouvelles copies : {n}.',
      hi: 'टॉपिक हर सब्सक्राइबर में एक प्रति रखता है: {message}। नई प्रतियाँ: {n}।',
      id: 'Topik menaruh salinan di tiap pelanggan: {message}. Salinan baru: {n}.',
      pt: 'O tópico coloca uma cópia em cada assinante: {message}. Cópias novas: {n}.',
    },
    'label.sender': {
      en: 'Sender', ko: '보내는 쪽', ja: '送信側', zh: '发送方', ar: 'المُرسِل',
      es: 'Emisor', fr: 'Émetteur', hi: 'भेजने वाला', id: 'Pengirim', pt: 'Emissor',
    },
    'label.topic': {
      en: 'Topic', ko: '토픽', ja: 'トピック', zh: '主题', ar: 'الموضوع',
      es: 'Tema', fr: 'Sujet', hi: 'टॉपिक', id: 'Topik', pt: 'Tópico',
    },
    'label.email': {
      en: 'Email', ko: '메일', ja: 'メール', zh: '邮件', ar: 'البريد',
      es: 'Correo', fr: 'E-mail', hi: 'ईमेल', id: 'Surel', pt: 'E-mail',
    },
    'label.stock': {
      en: 'Stock', ko: '재고', ja: '在庫', zh: '库存', ar: 'المخزون',
      es: 'Inventario', fr: 'Stock', hi: 'स्टॉक', id: 'Stok', pt: 'Estoque',
    },
    'label.stats': {
      en: 'Stats', ko: '통계', ja: '統計', zh: '统计', ar: 'الإحصاءات',
      es: 'Estadísticas', fr: 'Statistiques', hi: 'आँकड़े', id: 'Statistik', pt: 'Estatísticas',
    },
    'label.sent': {
      en: 'Sent', ko: '보낸 것', ja: '送った数', zh: '已发送', ar: 'المُرسَل',
      es: 'Enviados', fr: 'Envoyés', hi: 'भेजे गए', id: 'Terkirim', pt: 'Enviados',
    },
    'label.copies': {
      en: 'Copies received', ko: '받은 사본', ja: '受け取ったコピー', zh: '收到的副本', ar: 'النسخ المستلمة',
      es: 'Copias recibidas', fr: 'Copies reçues', hi: 'मिली प्रतियाँ', id: 'Salinan diterima', pt: 'Cópias recebidas',
    },
  },
  blocks: {
    stage: { type: 'publish-to-many-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
};
