/**
 * 배압 facet 선언 — 넘칠 때의 세 방식(다 받음 · 버림 · 배압)을 한 서버에 갈아 끼우고 보내는 빠르기를 돌린다.
 *
 * initialData 는 구조만 둔다 — 틱 수 · 일의 조각 · 힘 · 기한 · 한도 · 손잡이 사다리 · 503 (번역하지 않는 자료).
 * 몫 · 누적 · 끝남 · 판정 · 줄 · 사다리 최대는 algorithm 이 셈한다.
 */
import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export type BackpressureInitialData = {
  type: 'backpressure';
  stepMs: number;
  motionMs: number;
  ticks: number;
  workUnits: number;
  capacity: number;
  deadline: number;
  limit: number;
  overflows: number[];
  rates: number[];
  overflowDefault: number;
  rateDefault: number;
  rejectCode: string;
};

const initialData: BackpressureInitialData = {
  type: 'backpressure',
  stepMs: 400,
  motionMs: 300,
  ticks: 20,
  workUnits: 12,
  capacity: 24,
  deadline: 4,
  limit: 4,
  overflows: [0, 1, 2],
  rates: [1, 2, 3, 4],
  overflowDefault: 0,
  rateDefault: 3,
  rejectCode: '503',
};

export const backpressureFacet: FacetJson = {
  id: 'facet:backpressure',
  title: {
    en: 'Backpressure',
    ko: '배압',
    ja: 'バックプレッシャー',
    zh: '背压',
    ar: 'الضغط العكسي',
    es: 'Contrapresión',
    fr: 'Contre-pression',
    hi: 'बैकप्रेशर',
    id: 'Backpressure',
    pt: 'Contrapressão',
  },
  description: {
    en: 'When more arrives than one server can handle, the receiver can accept everything, reject with 503, or push back. At 3 requests per tick, accepting everything finishes 6 on time, while rejecting and backpressure both finish 36 — rejecting turns 20 away at the door, backpressure drops 12 beside the sender.',
    ko: '한 서버가 감당하는 것보다 많이 올 때 받는 쪽은 다 받거나, 503 으로 버리거나, 배압을 건다. 틱당 3 개를 보내면 다 받음은 6 개만 제때 끝내고 버림과 배압은 둘 다 36 개를 끝낸다 — 버림은 문 앞에서 20 개를 돌려보내고, 배압은 보내는 쪽 곁에서 12 개를 버린다.',
    ja: '1 台のサーバーが処理できる量より多く届くとき、受け手はすべて受け入れるか、503 で断るか、背圧をかける。1 ティックに 3 件送ると、すべて受け入れは期限内に 6 件しか終えず、断りと背圧はどちらも 36 件を終える — 断りは入口で 20 件を返し、背圧は送り手の側で 12 件を捨てる。',
    zh: '当到达量超过一台服务器的处理能力时，接收方可以全部接收、用 503 拒绝，或施加背压。每个时刻发送 3 个时，全部接收只有 6 个按时完成，拒绝和背压都完成 36 个——拒绝在门口退回 20 个，背压在发送方身边丢弃 12 个。',
    ar: 'حين يصل أكثر مما يطيقه خادم واحد، يمكن للمستقبِل أن يقبل الكل أو يرفض بـ 503 أو يضغط عكسيًا. عند 3 طلبات في كل نبضة، يُنهي قبول الكل 6 فقط في الموعد، بينما يُنهي الرفض والضغط العكسي 36 لكلٍّ منهما — الرفض يردّ 20 عند الباب، والضغط العكسي يُسقط 12 بجانب المرسِل.',
    es: 'Cuando llega más de lo que un servidor puede atender, el receptor puede aceptarlo todo, rechazar con 503 o aplicar contrapresión. A 3 peticiones por tic, aceptarlo todo termina 6 a tiempo, mientras que rechazar y la contrapresión terminan 36 cada uno: rechazar devuelve 20 en la puerta y la contrapresión descarta 12 junto al emisor.',
    fr: "Quand il arrive plus qu'un serveur ne peut traiter, le récepteur peut tout accepter, refuser avec 503 ou exercer une contre-pression. À 3 requêtes par tic, tout accepter n'en termine que 6 à temps, tandis que refuser et la contre-pression en terminent 36 chacun — le refus en renvoie 20 à la porte, la contre-pression en abandonne 12 auprès de l'émetteur.",
    hi: 'जब एक सर्वर की क्षमता से अधिक अनुरोध आते हैं, तो प्राप्तकर्ता सब स्वीकार कर सकता है, 503 से अस्वीकार कर सकता है, या बैकप्रेशर लगा सकता है। प्रति टिक 3 भेजने पर सब स्वीकार करना केवल 6 समय पर पूरे करता है, जबकि अस्वीकार और बैकप्रेशर दोनों 36 पूरे करते हैं — अस्वीकार दरवाज़े पर 20 लौटाता है, बैकप्रेशर भेजने वाले के पास 12 छोड़ देता है।',
    id: 'Saat yang datang lebih banyak dari kemampuan satu server, penerima bisa menerima semuanya, menolak dengan 503, atau memberi backpressure. Pada 3 permintaan per tik, menerima semua hanya menyelesaikan 6 tepat waktu, sedangkan menolak dan backpressure sama-sama menyelesaikan 36 — menolak mengembalikan 20 di pintu, backpressure membuang 12 di sisi pengirim.',
    pt: 'Quando chega mais do que um servidor aguenta, o receptor pode aceitar tudo, rejeitar com 503 ou aplicar contrapressão. A 3 pedidos por tique, aceitar tudo termina só 6 a tempo, enquanto rejeitar e a contrapressão terminam 36 cada — rejeitar devolve 20 na porta, a contrapressão descarta 12 ao lado do emissor.',
  },
  algorithm: 'module:backpressure',
  projector: 'module:backpressureProjector',
  initialData,
  layout: {
    type: 'column',
    gap: 12,
    children: [{ ref: 'header' }, { ref: 'stage' }, { ref: 'controls' }, { ref: 'codePanel' }],
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'backpressure-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        ...CONTROL_SET.playback,
        {
          widget: 'segmented-slider',
          action: 'overflow',
          name: 'overflow',
          label: {
            en: 'When overloaded',
            ko: '넘칠 때',
            ja: 'あふれたとき',
            zh: '过载时',
            ar: 'عند الفيض',
            es: 'Al saturarse',
            fr: 'En surcharge',
            hi: 'अधिभार पर',
            id: 'Saat meluap',
            pt: 'Ao sobrecarregar',
          },
          segments: [
            {
              value: 0,
              default: true,
              label: {
                en: 'Accept all', ko: '다 받음', ja: 'すべて受け入れ', zh: '全部接收', ar: 'قبول الكل',
                es: 'Aceptar todo', fr: 'Tout accepter', hi: 'सब स्वीकार', id: 'Terima semua', pt: 'Aceitar tudo',
              },
            },
            {
              value: 1,
              label: {
                en: 'Reject', ko: '버림', ja: '断る', zh: '拒绝', ar: 'رفض',
                es: 'Rechazar', fr: 'Refuser', hi: 'अस्वीकार', id: 'Tolak', pt: 'Rejeitar',
              },
            },
            {
              value: 2,
              label: {
                en: 'Backpressure', ko: '배압', ja: '背圧', zh: '背压', ar: 'ضغط عكسي',
                es: 'Contrapresión', fr: 'Contre-pression', hi: 'बैकप्रेशर', id: 'Backpressure', pt: 'Contrapressão',
              },
            },
          ],
        },
        {
          widget: 'segmented-slider',
          action: 'rate',
          name: 'rate',
          label: {
            en: 'Send rate',
            ko: '보내는 빠르기',
            ja: '送る速さ',
            zh: '发送速率',
            ar: 'معدل الإرسال',
            es: 'Ritmo de envío',
            fr: "Cadence d'envoi",
            hi: 'भेजने की दर',
            id: 'Laju kirim',
            pt: 'Ritmo de envio',
          },
          segments: [
            { value: 1, label: '1' },
            { value: 2, label: '2' },
            { value: 3, label: '3', default: true },
            { value: 4, label: '4' },
          ],
        },
      ],
      metrics: [
        {
          name: 'on-time',
          initial: 0,
          label: {
            en: 'On time', ko: '제때', ja: '期限内', zh: '按时', ar: 'في الموعد',
            es: 'A tiempo', fr: 'À temps', hi: 'समय पर', id: 'Tepat waktu', pt: 'A tempo',
          },
        },
        {
          name: 'late-done',
          initial: 0,
          label: {
            en: 'Wasted (late)', ko: '헛일', ja: '無駄な仕事', zh: '白做 (超时)', ar: 'جهد ضائع',
            es: 'En vano (tarde)', fr: 'Perdu (en retard)', hi: 'व्यर्थ (देर से)', id: 'Sia-sia (telat)', pt: 'Em vão (atrasado)',
          },
        },
        {
          name: 'rejected',
          initial: 0,
          label: {
            en: '503', ko: '503', ja: '503', zh: '503', ar: '503',
            es: '503', fr: '503', hi: '503', id: '503', pt: '503',
          },
        },
        {
          name: 'sender-dropped',
          initial: 0,
          label: {
            en: 'Dropped by sender', ko: '보내는 쪽 버림', ja: '送り手が捨てた', zh: '发送方丢弃', ar: 'أسقطها المرسِل',
            es: 'Descartadas por el emisor', fr: "Abandonnées par l'émetteur", hi: 'भेजने वाले ने छोड़े', id: 'Dibuang pengirim', pt: 'Descartadas pelo emissor',
          },
        },
      ],
    },
    codePanel: {
      type: 'code-view',
      ir: 'ir:backpressure-imperative',
      label: {
        en: 'One overloaded server',
        ko: '넘치는 서버 한 대',
        ja: 'あふれるサーバー 1 台',
        zh: '一台过载的服务器',
        ar: 'خادم واحد مثقل',
        es: 'Un servidor saturado',
        fr: 'Un serveur surchargé',
        hi: 'एक अधिभारित सर्वर',
        id: 'Satu server yang meluap',
        pt: 'Um servidor sobrecarregado',
      },
    },
  },
  messages: {
    'label.sender': {
      en: 'Sender', ko: '보내는 쪽', ja: '送り手', zh: '发送方', ar: 'المرسِل',
      es: 'Emisor', fr: 'Émetteur', hi: 'भेजने वाला', id: 'Pengirim', pt: 'Emissor',
    },
    'label.receiver': {
      en: 'Receiver · {capacity} units per tick',
      ko: '받는 쪽 · 틱당 {capacity} 조각',
      ja: '受け手 · 1 ティック {capacity} 単位',
      zh: '接收方 · 每时刻 {capacity} 份',
      ar: 'المستقبِل · {capacity} وحدة لكل نبضة',
      es: 'Receptor · {capacity} unidades por tic',
      fr: 'Récepteur · {capacity} unités par tic',
      hi: 'प्राप्तकर्ता · प्रति टिक {capacity} इकाई',
      id: 'Penerima · {capacity} unit per tik',
      pt: 'Receptor · {capacity} unidades por tique',
    },
    'label.limit': {
      en: 'Limit {limit}', ko: '한도 {limit}', ja: '上限 {limit}', zh: '上限 {limit}', ar: 'الحد {limit}',
      es: 'Límite {limit}', fr: 'Limite {limit}', hi: 'सीमा {limit}', id: 'Batas {limit}', pt: 'Limite {limit}',
    },
    'label.onTime': {
      en: 'On time', ko: '제때', ja: '期限内', zh: '按时', ar: 'في الموعد',
      es: 'A tiempo', fr: 'À temps', hi: 'समय पर', id: 'Tepat waktu', pt: 'A tempo',
    },
    'label.late': {
      en: 'Wasted (late)', ko: '헛일', ja: '無駄な仕事', zh: '白做 (超时)', ar: 'جهد ضائع',
      es: 'En vano (tarde)', fr: 'Perdu (en retard)', hi: 'व्यर्थ (देर से)', id: 'Sia-sia (telat)', pt: 'Em vão (atrasado)',
    },
    'label.senderDropped': {
      en: 'Dropped by sender', ko: '보내는 쪽 버림', ja: '送り手が捨てた', zh: '发送方丢弃', ar: 'أسقطها المرسِل',
      es: 'Descartadas por el emisor', fr: "Abandonnées par l'émetteur", hi: 'भेजने वाले ने छोड़े', id: 'Dibuang pengirim', pt: 'Descartadas pelo emissor',
    },
    'label.rejectPile': {
      en: 'At the door: {code}', ko: '문 앞: {code}', ja: '入口: {code}', zh: '门口: {code}', ar: 'عند الباب: {code}',
      es: 'En la puerta: {code}', fr: 'À la porte : {code}', hi: 'दरवाज़े पर: {code}', id: 'Di pintu: {code}', pt: 'Na porta: {code}',
    },
    'label.overflow.accept': {
      en: 'Accept all', ko: '다 받음', ja: 'すべて受け入れ', zh: '全部接收', ar: 'قبول الكل',
      es: 'Aceptar todo', fr: 'Tout accepter', hi: 'सब स्वीकार', id: 'Terima semua', pt: 'Aceitar tudo',
    },
    'label.overflow.reject': {
      en: 'Reject', ko: '버림', ja: '断る', zh: '拒绝', ar: 'رفض',
      es: 'Rechazar', fr: 'Refuser', hi: 'अस्वीकार', id: 'Tolak', pt: 'Rejeitar',
    },
    'label.overflow.backpressure': {
      en: 'Backpressure', ko: '배압', ja: '背圧', zh: '背压', ar: 'ضغط عكسي',
      es: 'Contrapresión', fr: 'Contre-pression', hi: 'बैकप्रेशर', id: 'Backpressure', pt: 'Contrapressão',
    },
    'caption.ready': {
      en: '{mode} · the sender makes {rate} per tick',
      ko: '{mode} · 보내는 쪽이 틱마다 {rate} 개를 만든다',
      ja: '{mode} · 送り手は 1 ティックに {rate} 件つくる',
      zh: '{mode} · 发送方每个时刻产生 {rate} 个',
      ar: '{mode} · يُنشئ المرسِل {rate} في كل نبضة',
      es: '{mode} · el emisor crea {rate} por tic',
      fr: "{mode} · l'émetteur en crée {rate} par tic",
      hi: '{mode} · भेजने वाला प्रति टिक {rate} बनाता है',
      id: '{mode} · pengirim membuat {rate} per tik',
      pt: '{mode} · o emissor cria {rate} por tique',
    },
    'caption.workIdle': {
      en: 'Tick {tick} · work: nothing held',
      ko: '틱 {tick} · 일: 든 것이 없다',
      ja: 'ティック {tick} · 仕事: 抱えているものはない',
      zh: '时刻 {tick} · 工作: 没有在处理的',
      ar: 'النبضة {tick} · العمل: لا شيء محمول',
      es: 'Tic {tick} · trabajo: nada en curso',
      fr: 'Tic {tick} · travail : rien en cours',
      hi: 'टिक {tick} · काम: कुछ भी नहीं',
      id: 'Tik {tick} · kerja: tidak ada yang ditangani',
      pt: 'Tique {tick} · trabalho: nada em curso',
    },
    'caption.work': {
      en: 'Tick {tick} · work: split among {held} · {share} units each · finished {finished}',
      ko: '틱 {tick} · 일: {held} 개가 나눠 하나에 {share} 조각 · 끝남 {finished}',
      ja: 'ティック {tick} · 仕事: {held} 件で分けて 1 件に {share} 単位 · 完了 {finished}',
      zh: '时刻 {tick} · 工作: {held} 个分摊 · 每个 {share} 份 · 完成 {finished}',
      ar: 'النبضة {tick} · العمل: يُقسَم على {held} · لكلٍّ {share} وحدة · انتهى {finished}',
      es: 'Tic {tick} · trabajo: repartido entre {held} · {share} unidades cada una · terminadas {finished}',
      fr: 'Tic {tick} · travail : partagé entre {held} · {share} unités chacune · terminées {finished}',
      hi: 'टिक {tick} · काम: {held} में बँटा · हर एक को {share} इकाई · पूरे {finished}',
      id: 'Tik {tick} · kerja: dibagi ke {held} · {share} unit masing-masing · selesai {finished}',
      pt: 'Tique {tick} · trabalho: dividido entre {held} · {share} unidades cada · terminadas {finished}',
    },
    'caption.workExtra': {
      en: 'Tick {tick} · work: split among {held} · {share} units each (+1 for the first {extra}) · finished {finished}',
      ko: '틱 {tick} · 일: {held} 개가 나눠 하나에 {share} 조각 (먼저 든 {extra} 개는 +1) · 끝남 {finished}',
      ja: 'ティック {tick} · 仕事: {held} 件で分けて 1 件に {share} 単位 (先に来た {extra} 件は +1) · 完了 {finished}',
      zh: '时刻 {tick} · 工作: {held} 个分摊 · 每个 {share} 份 (先到的 {extra} 个 +1) · 完成 {finished}',
      ar: 'النبضة {tick} · العمل: يُقسَم على {held} · لكلٍّ {share} وحدة (+1 لأول {extra}) · انتهى {finished}',
      es: 'Tic {tick} · trabajo: repartido entre {held} · {share} unidades cada una (+1 a las primeras {extra}) · terminadas {finished}',
      fr: 'Tic {tick} · travail : partagé entre {held} · {share} unités chacune (+1 aux {extra} premières) · terminées {finished}',
      hi: 'टिक {tick} · काम: {held} में बँटा · हर एक को {share} इकाई (पहले {extra} को +1) · पूरे {finished}',
      id: 'Tik {tick} · kerja: dibagi ke {held} · {share} unit masing-masing (+1 untuk {extra} pertama) · selesai {finished}',
      pt: 'Tique {tick} · trabalho: dividido entre {held} · {share} unidades cada (+1 para as {extra} primeiras) · terminadas {finished}',
    },
    'caption.arriveAccept': {
      en: 'Tick {tick} · {count} arrive: all taken in',
      ko: '틱 {tick} · 도착 {count}: 모두 받음',
      ja: 'ティック {tick} · 到着 {count}: すべて受け入れ',
      zh: '时刻 {tick} · 到达 {count}: 全部接收',
      ar: 'النبضة {tick} · وصل {count}: قُبل الكل',
      es: 'Tic {tick} · llegan {count}: todas aceptadas',
      fr: 'Tic {tick} · {count} arrivent : toutes acceptées',
      hi: 'टिक {tick} · {count} आए: सब स्वीकार',
      id: 'Tik {tick} · {count} tiba: semua diterima',
      pt: 'Tique {tick} · chegam {count}: todas aceitas',
    },
    'caption.arriveReject': {
      en: 'Tick {tick} · {count} arrive: taken {taken} · {code}: {rejected}',
      ko: '틱 {tick} · 도착 {count}: 받음 {taken} · {code}: {rejected}',
      ja: 'ティック {tick} · 到着 {count}: 受け入れ {taken} · {code}: {rejected}',
      zh: '时刻 {tick} · 到达 {count}: 接收 {taken} · {code}: {rejected}',
      ar: 'النبضة {tick} · وصل {count}: قُبل {taken} · {code}: {rejected}',
      es: 'Tic {tick} · llegan {count}: aceptadas {taken} · {code}: {rejected}',
      fr: 'Tic {tick} · {count} arrivent : acceptées {taken} · {code} : {rejected}',
      hi: 'टिक {tick} · {count} आए: स्वीकार {taken} · {code}: {rejected}',
      id: 'Tik {tick} · {count} tiba: diterima {taken} · {code}: {rejected}',
      pt: 'Tique {tick} · chegam {count}: aceitas {taken} · {code}: {rejected}',
    },
    'caption.arriveBack': {
      en: 'Tick {tick} · {count} arrive: sent {taken} · waiting {queue} · dropped by sender {dropped}',
      ko: '틱 {tick} · 도착 {count}: 보냄 {taken} · 곁에서 기다림 {queue} · 보내는 쪽 버림 {dropped}',
      ja: 'ティック {tick} · 到着 {count}: 送った {taken} · 待機 {queue} · 送り手が捨てた {dropped}',
      zh: '时刻 {tick} · 到达 {count}: 已发送 {taken} · 等待 {queue} · 发送方丢弃 {dropped}',
      ar: 'النبضة {tick} · وصل {count}: أُرسل {taken} · ينتظر {queue} · أسقطها المرسِل {dropped}',
      es: 'Tic {tick} · llegan {count}: enviadas {taken} · esperando {queue} · descartadas por el emisor {dropped}',
      fr: "Tic {tick} · {count} arrivent : envoyées {taken} · en attente {queue} · abandonnées par l'émetteur {dropped}",
      hi: 'टिक {tick} · {count} आए: भेजे {taken} · प्रतीक्षा में {queue} · भेजने वाले ने छोड़े {dropped}',
      id: 'Tik {tick} · {count} tiba: dikirim {taken} · menunggu {queue} · dibuang pengirim {dropped}',
      pt: 'Tique {tick} · chegam {count}: enviadas {taken} · esperando {queue} · descartadas pelo emissor {dropped}',
    },
    'status.line': {
      en: 'Held {held} · sender line {queue} · on time {pct}% of {made} made',
      ko: '든 수 {held} · 보내는 쪽 줄 {queue} · 제때 {pct}% (만든 {made})',
      ja: '抱え {held} · 送り手の列 {queue} · 期限内 {pct}% (作成 {made})',
      zh: '在处理 {held} · 发送方队列 {queue} · 按时 {pct}% (共产生 {made})',
      ar: 'المحمول {held} · صف المرسِل {queue} · في الموعد {pct}% من {made}',
      es: 'En curso {held} · fila del emisor {queue} · a tiempo {pct}% de {made} creadas',
      fr: "En cours {held} · file de l'émetteur {queue} · à temps {pct}% des {made} créées",
      hi: 'चालू {held} · भेजने वाले की कतार {queue} · समय पर {pct}% ({made} में से)',
      id: 'Ditangani {held} · antrean pengirim {queue} · tepat waktu {pct}% dari {made} dibuat',
      pt: 'Em curso {held} · fila do emissor {queue} · a tempo {pct}% de {made} criadas',
    },
  },
};
