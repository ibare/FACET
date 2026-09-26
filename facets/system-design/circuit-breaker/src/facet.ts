/**
 * 서킷 브레이커 완제품 선언.
 *
 * initialData 는 1차 데이터만 — 틱 수 · 삐끗 틱 · 죽음 구간 · 손잡이 사다리 · 기본값.
 * 틱마다의 건강 열 · 되살아나는 틱 · 상태 전이 · 수는 알고리즘이 셈한다.
 */
import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

type CircuitBreakerInitial = {
  type: 'circuit-breaker';
  stepMs: number;
  motionMs: number;
  service: string;
  ticks: number;
  blip: number[];
  downFrom: number;
  downTo: number;
  thresholds: number[];
  waits: number[];
  defaults: { threshold: number; wait: number };
};

const initialData: CircuitBreakerInitial = {
  type: 'circuit-breaker',
  stepMs: 500,
  motionMs: 300,
  service: 'inventory',
  ticks: 24,
  blip: [1, 2],
  downFrom: 6,
  downTo: 15,
  thresholds: [1, 2, 3, 5, 8],
  waits: [2, 4, 6, 8],
  defaults: { threshold: 3, wait: 4 },
};

export const circuitBreakerFacet: FacetJson = {
  id: 'facet:circuitBreaker',
  title: {
    en: 'Circuit breaker',
    ko: '서킷 브레이커',
    ja: 'サーキットブレーカー',
    zh: '熔断器',
    ar: 'قاطع الدائرة',
    es: 'Cortacircuitos',
    fr: 'Disjoncteur',
    hi: 'सर्किट ब्रेकर',
    id: 'Pemutus sirkuit',
    pt: 'Disjuntor',
  },
  description: {
    en: 'One call per tick passes a breaker on its way to a service that blips twice and then goes down for ten ticks. Turn the threshold and the open wait and watch where each call stops. At threshold 3 and wait 4, 4 calls reach the dead service and 6 are blocked.',
    ko: '틱마다 부름 하나가 브레이커를 지나 서비스로 간다. 서비스는 두 번 삐끗하고 열 틱 동안 죽는다. 문턱과 열림 기다림을 돌리며 부름이 어디서 멈추는지 본다. 문턱 3 · 기다림 4 에서 죽은 곳에 닿은 부름 4, 막은 부름 6.',
    ja: '1 ティックに 1 回の呼び出しがブレーカーを通ってサービスへ向かう。サービスは 2 回つまずき、その後 10 ティック落ちる。しきい値とオープン待ちを回し、呼び出しがどこで止まるかを見る。しきい値 3・待ち 4 では落ちた先に届いた呼び出し 4、遮断 6。',
    zh: '每个时刻一次调用经过熔断器去往服务。服务先抖动两次，随后宕机十个时刻。转动阈值和打开等待，看每次调用停在哪里。阈值 3、等待 4 时，打到宕机服务的调用 4 次，被拦下 6 次。',
    ar: 'في كل نبضة يمر استدعاء واحد عبر القاطع نحو خدمة تتعثر مرتين ثم تتوقف عشر نبضات. أدر العتبة وانتظار الفتح وشاهد أين يتوقف كل استدعاء. عند العتبة 3 والانتظار 4 يصل 4 استدعاءات إلى الخدمة المتوقفة ويُحجب 6.',
    es: 'Una llamada por tick pasa por un cortacircuitos hacia un servicio que falla dos veces y luego cae diez ticks. Gira el umbral y la espera abierta y mira dónde se detiene cada llamada. Con umbral 3 y espera 4, 4 llamadas llegan al servicio caído y 6 se bloquean.',
    fr: 'Un appel par tick traverse un disjoncteur vers un service qui trébuche deux fois puis tombe pendant dix ticks. Tournez le seuil et l’attente ouverte et voyez où chaque appel s’arrête. Au seuil 3 et attente 4, 4 appels atteignent le service tombé et 6 sont bloqués.',
    hi: 'हर टिक एक कॉल ब्रेकर से होकर सेवा तक जाती है। सेवा दो बार लड़खड़ाती है, फिर दस टिक बंद रहती है। थ्रेशोल्ड और खुला इंतज़ार घुमाकर देखें कि हर कॉल कहाँ रुकती है। थ्रेशोल्ड 3 और इंतज़ार 4 पर 4 कॉल बंद सेवा तक पहुँचती हैं और 6 रोकी जाती हैं।',
    id: 'Satu panggilan per tik melewati pemutus menuju layanan yang tersandung dua kali lalu mati sepuluh tik. Putar ambang dan jeda terbuka, lihat di mana tiap panggilan berhenti. Pada ambang 3 dan jeda 4, 4 panggilan mencapai layanan mati dan 6 diblokir.',
    pt: 'Uma chamada por tick passa por um disjuntor rumo a um serviço que falha duas vezes e depois cai por dez ticks. Gire o limiar e a espera aberta e veja onde cada chamada para. Com limiar 3 e espera 4, 4 chamadas chegam ao serviço caído e 6 são bloqueadas.',
  },
  algorithm: 'module:circuitBreaker',
  projector: 'module:circuitBreakerProjector',
  initialData,
  layout: {
    type: 'column',
    gap: 12,
    children: [{ ref: 'header' }, { ref: 'stage' }, { ref: 'controls' }, { ref: 'codePanel' }],
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'circuit-breaker-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        ...CONTROL_SET.playback,
        {
          widget: 'segmented-slider',
          action: 'threshold',
          name: 'threshold',
          label: { en: 'Threshold', ko: '문턱', ja: 'しきい値', zh: '阈值', ar: 'العتبة', es: 'Umbral', fr: 'Seuil', hi: 'थ्रेशोल्ड', id: 'Ambang', pt: 'Limiar' },
          segments: [
            { value: 1, label: '1' },
            { value: 2, label: '2' },
            { value: 3, label: '3', default: true },
            { value: 5, label: '5' },
            { value: 8, label: '8' },
          ],
        },
        {
          widget: 'segmented-slider',
          action: 'wait',
          name: 'wait',
          label: { en: 'Open wait', ko: '열림 기다림', ja: 'オープン待ち', zh: '打开等待', ar: 'انتظار الفتح', es: 'Espera abierta', fr: 'Attente ouverte', hi: 'खुला इंतज़ार', id: 'Jeda terbuka', pt: 'Espera aberta' },
          segments: [
            { value: 2, label: '2' },
            { value: 4, label: '4', default: true },
            { value: 6, label: '6' },
            { value: 8, label: '8' },
          ],
        },
      ],
      metrics: [
        {
          name: 'dead-hits',
          label: { en: 'Calls to the dead service', ko: '죽은 곳에 닿은 부름', ja: '落ちた先に届いた呼び出し', zh: '打到宕机服务', ar: 'استدعاءات للخدمة المتوقفة', es: 'Llamadas al servicio caído', fr: 'Appels au service tombé', hi: 'बंद सेवा तक कॉल', id: 'Panggilan ke layanan mati', pt: 'Chamadas ao serviço caído' },
          initial: 0,
        },
        {
          name: 'blocked-calls',
          label: { en: 'Blocked calls', ko: '막은 부름', ja: '遮断した呼び出し', zh: '拦下的调用', ar: 'استدعاءات محجوبة', es: 'Llamadas bloqueadas', fr: 'Appels bloqués', hi: 'रोकी गई कॉल', id: 'Panggilan diblokir', pt: 'Chamadas bloqueadas' },
          initial: 0,
        },
        {
          name: 'blip-trips',
          label: { en: 'Opened on a blip', ko: '삐끗에 열림', ja: 'つまずきで開いた', zh: '因抖动打开', ar: 'فتح بسبب تعثر', es: 'Abierto por un fallo breve', fr: 'Ouvert sur un raté', hi: 'लड़खड़ाहट पर खुला', id: 'Terbuka karena tersandung', pt: 'Aberto por uma falha breve' },
          initial: 0,
        },
        {
          name: 'close-lag',
          label: { en: 'Ticks to close after recovery', ko: '살아난 뒤 닫힘까지', ja: '復旧後に閉じるまで', zh: '恢复后到闭合', ar: 'نبضات حتى الإغلاق بعد التعافي', es: 'Ticks hasta cerrar tras volver', fr: 'Ticks avant fermeture après retour', hi: 'लौटने के बाद बंद होने तक', id: 'Tik hingga tertutup setelah pulih', pt: 'Ticks até fechar após voltar' },
          initial: 0,
        },
      ],
    },
    codePanel: {
      type: 'code-view',
      ir: 'ir:circuit-breaker-imperative',
      label: { en: 'Breaker over one run', ko: '한 판의 브레이커', ja: '1 回分のブレーカー', zh: '一轮的熔断器', ar: 'القاطع في جولة واحدة', es: 'El cortacircuitos en una pasada', fr: 'Le disjoncteur sur une passe', hi: 'एक दौर का ब्रेकर', id: 'Pemutus dalam satu putaran', pt: 'O disjuntor numa rodada' },
    },
  },
  messages: {
    'label.caller': { en: 'Caller', ko: '부르는 쪽', ja: '呼び出し側', zh: '调用方', ar: 'المستدعي', es: 'Llamante', fr: 'Appelant', hi: 'कॉल करने वाला', id: 'Pemanggil', pt: 'Chamador' },
    'label.breaker': { en: 'Breaker', ko: '브레이커', ja: 'ブレーカー', zh: '熔断器', ar: 'القاطع', es: 'Cortacircuitos', fr: 'Disjoncteur', hi: 'ब्रेकर', id: 'Pemutus', pt: 'Disjuntor' },
    'label.service': { en: 'Service', ko: '서비스', ja: 'サービス', zh: '服务', ar: 'الخدمة', es: 'Servicio', fr: 'Service', hi: 'सेवा', id: 'Layanan', pt: 'Serviço' },
    'label.wait': { en: 'Open wait', ko: '열림 기다림', ja: 'オープン待ち', zh: '打开等待', ar: 'انتظار الفتح', es: 'Espera abierta', fr: 'Attente ouverte', hi: 'खुला इंतज़ार', id: 'Jeda terbuka', pt: 'Espera aberta' },
    'label.closed': { en: 'Closed', ko: '닫힘', ja: 'クローズ', zh: '闭合', ar: 'مغلق', es: 'Cerrado', fr: 'Fermé', hi: 'बंद', id: 'Tertutup', pt: 'Fechado' },
    'label.open': { en: 'Open', ko: '열림', ja: 'オープン', zh: '打开', ar: 'مفتوح', es: 'Abierto', fr: 'Ouvert', hi: 'खुला', id: 'Terbuka', pt: 'Aberto' },
    'label.halfOpen': { en: 'Half-open', ko: '반열림', ja: 'ハーフオープン', zh: '半开', ar: 'نصف مفتوح', es: 'Semiabierto', fr: 'Semi-ouvert', hi: 'आधा खुला', id: 'Setengah terbuka', pt: 'Meio aberto' },
    'label.up': { en: 'Up', ko: '살아 있음', ja: '稼働中', zh: '正常', ar: 'تعمل', es: 'Activo', fr: 'En service', hi: 'चालू', id: 'Hidup', pt: 'No ar' },
    'label.blip': { en: 'Blip', ko: '삐끗', ja: 'つまずき', zh: '抖动', ar: 'تعثر', es: 'Fallo breve', fr: 'Raté', hi: 'लड़खड़ाहट', id: 'Tersandung', pt: 'Falha breve' },
    'label.down': { en: 'Down', ko: '죽음', ja: 'ダウン', zh: '宕机', ar: 'متوقفة', es: 'Caído', fr: 'Tombé', hi: 'बंद पड़ी', id: 'Mati', pt: 'Caído' },
    'label.fails': {
      en: 'Failures in a row: {n} / {k}',
      ko: '잇단 실패: {n} / {k}',
      ja: '連続失敗: {n} / {k}',
      zh: '连续失败：{n} / {k}',
      ar: 'إخفاقات متتالية: {n} / {k}',
      es: 'Fallos seguidos: {n} / {k}',
      fr: 'Échecs d’affilée : {n} / {k}',
      hi: 'लगातार विफलता: {n} / {k}',
      id: 'Gagal berturut: {n} / {k}',
      pt: 'Falhas seguidas: {n} / {k}',
    },
    'legend.answered': { en: 'Answered', ko: '답함', ja: '応答', zh: '已应答', ar: 'أُجيب', es: 'Respondida', fr: 'Répondu', hi: 'उत्तर मिला', id: 'Dijawab', pt: 'Respondida' },
    'legend.timeout': { en: 'Timeout', ko: '시간 초과', ja: 'タイムアウト', zh: '超时', ar: 'انتهت المهلة', es: 'Tiempo agotado', fr: 'Délai dépassé', hi: 'टाइमआउट', id: 'Waktu habis', pt: 'Tempo esgotado' },
    'legend.blocked': { en: 'Blocked', ko: '막힘', ja: '遮断', zh: '被拦下', ar: 'محجوب', es: 'Bloqueada', fr: 'Bloqué', hi: 'रोकी गई', id: 'Diblokir', pt: 'Bloqueada' },
    'legend.probe': { en: 'Trial call', ko: '시험 부름', ja: '試し呼び出し', zh: '试探调用', ar: 'استدعاء تجريبي', es: 'Llamada de prueba', fr: 'Appel d’essai', hi: 'परीक्षण कॉल', id: 'Panggilan uji', pt: 'Chamada de teste' },
    'caption.start': {
      en: 'Threshold {k} · open wait {w} ticks — the breaker starts closed.',
      ko: '문턱 {k} · 열림 기다림 {w} 틱 — 브레이커는 닫힘에서 시작한다.',
      ja: 'しきい値 {k} · オープン待ち {w} ティック — ブレーカーはクローズから始まる。',
      zh: '阈值 {k} · 打开等待 {w} 个时刻 — 熔断器从闭合开始。',
      ar: 'العتبة {k} · انتظار الفتح {w} نبضات — يبدأ القاطع مغلقًا.',
      es: 'Umbral {k} · espera abierta {w} ticks — el cortacircuitos empieza cerrado.',
      fr: 'Seuil {k} · attente ouverte {w} ticks — le disjoncteur commence fermé.',
      hi: 'थ्रेशोल्ड {k} · खुला इंतज़ार {w} टिक — ब्रेकर बंद से शुरू होता है।',
      id: 'Ambang {k} · jeda terbuka {w} tik — pemutus mulai tertutup.',
      pt: 'Limiar {k} · espera aberta {w} ticks — o disjuntor começa fechado.',
    },
    'caption.reset': {
      en: 'Tick {tick}: the service answers — the failure streak goes back to 0.',
      ko: '틱 {tick}: 서비스가 답한다 — 잇단 실패는 0 으로.',
      ja: 'ティック {tick}: サービスが応答 — 連続失敗は 0 に戻る。',
      zh: '时刻 {tick}：服务应答 — 连续失败归 0。',
      ar: 'النبضة {tick}: الخدمة تجيب — تعود الإخفاقات المتتالية إلى 0.',
      es: 'Tick {tick}: el servicio responde — la racha de fallos vuelve a 0.',
      fr: 'Tick {tick} : le service répond — la série d’échecs revient à 0.',
      hi: 'टिक {tick}: सेवा उत्तर देती है — लगातार विफलता 0 पर लौटती है।',
      id: 'Tik {tick}: layanan menjawab — gagal berturut kembali ke 0.',
      pt: 'Tick {tick}: o serviço responde — a sequência de falhas volta a 0.',
    },
    'caption.count': {
      en: 'Tick {tick}: timeout — still below the threshold.',
      ko: '틱 {tick}: 시간 초과 — 아직 문턱 아래.',
      ja: 'ティック {tick}: タイムアウト — まだしきい値の下。',
      zh: '时刻 {tick}：超时 — 仍低于阈值。',
      ar: 'النبضة {tick}: انتهت المهلة — ما زالت تحت العتبة.',
      es: 'Tick {tick}: tiempo agotado — aún por debajo del umbral.',
      fr: 'Tick {tick} : délai dépassé — encore sous le seuil.',
      hi: 'टिक {tick}: टाइमआउट — अभी थ्रेशोल्ड से नीचे।',
      id: 'Tik {tick}: waktu habis — masih di bawah ambang.',
      pt: 'Tick {tick}: tempo esgotado — ainda abaixo do limiar.',
    },
    'caption.trip': {
      en: 'Tick {tick}: a timeout reaches the threshold — the breaker opens.',
      ko: '틱 {tick}: 시간 초과로 문턱에 닿아 브레이커가 열린다.',
      ja: 'ティック {tick}: タイムアウトでしきい値に達し、ブレーカーが開く。',
      zh: '时刻 {tick}：超时达到阈值 — 熔断器打开。',
      ar: 'النبضة {tick}: مهلة تبلغ العتبة — ينفتح القاطع.',
      es: 'Tick {tick}: un tiempo agotado alcanza el umbral — el cortacircuitos se abre.',
      fr: 'Tick {tick} : un délai dépassé atteint le seuil — le disjoncteur s’ouvre.',
      hi: 'टिक {tick}: टाइमआउट थ्रेशोल्ड तक पहुँचा — ब्रेकर खुलता है।',
      id: 'Tik {tick}: waktu habis mencapai ambang — pemutus terbuka.',
      pt: 'Tick {tick}: um tempo esgotado atinge o limiar — o disjuntor abre.',
    },
    'caption.block': {
      en: 'Tick {tick}: open — the call stops at the breaker and never reaches the service.',
      ko: '틱 {tick}: 열림 — 부름은 서비스에 가지 않고 브레이커에서 멈춘다.',
      ja: 'ティック {tick}: オープン — 呼び出しはサービスに行かずブレーカーで止まる。',
      zh: '时刻 {tick}：打开 — 调用停在熔断器，不到服务。',
      ar: 'النبضة {tick}: مفتوح — يتوقف الاستدعاء عند القاطع ولا يصل إلى الخدمة.',
      es: 'Tick {tick}: abierto — la llamada se detiene en el cortacircuitos y no llega al servicio.',
      fr: 'Tick {tick} : ouvert — l’appel s’arrête au disjoncteur sans atteindre le service.',
      hi: 'टिक {tick}: खुला — कॉल ब्रेकर पर रुकती है, सेवा तक नहीं जाती।',
      id: 'Tik {tick}: terbuka — panggilan berhenti di pemutus dan tidak sampai ke layanan.',
      pt: 'Tick {tick}: aberto — a chamada para no disjuntor e não chega ao serviço.',
    },
    'caption.probeOk': {
      en: 'Tick {tick}: half-open — the trial call is answered, closed again.',
      ko: '틱 {tick}: 반열림 — 시험 부름이 답을 받아 다시 닫힘.',
      ja: 'ティック {tick}: ハーフオープン — 試し呼び出しが応答され、再びクローズ。',
      zh: '时刻 {tick}：半开 — 试探调用得到应答，重新闭合。',
      ar: 'النبضة {tick}: نصف مفتوح — أُجيب الاستدعاء التجريبي، فيُغلق من جديد.',
      es: 'Tick {tick}: semiabierto — la llamada de prueba recibe respuesta, cerrado de nuevo.',
      fr: 'Tick {tick} : semi-ouvert — l’appel d’essai reçoit une réponse, de nouveau fermé.',
      hi: 'टिक {tick}: आधा खुला — परीक्षण कॉल को उत्तर मिला, फिर से बंद।',
      id: 'Tik {tick}: setengah terbuka — panggilan uji dijawab, tertutup lagi.',
      pt: 'Tick {tick}: meio aberto — a chamada de teste é respondida, fechado de novo.',
    },
    'caption.probeFail': {
      en: 'Tick {tick}: half-open — the trial call times out, open again and the wait starts over.',
      ko: '틱 {tick}: 반열림 — 시험 부름이 시간 초과, 다시 열리고 기다림은 처음부터.',
      ja: 'ティック {tick}: ハーフオープン — 試し呼び出しがタイムアウト、再びオープンし待ちは最初から。',
      zh: '时刻 {tick}：半开 — 试探调用超时，重新打开，等待从头计。',
      ar: 'النبضة {tick}: نصف مفتوح — انتهت مهلة الاستدعاء التجريبي، فينفتح من جديد ويبدأ الانتظار من أوله.',
      es: 'Tick {tick}: semiabierto — la llamada de prueba agota el tiempo, abierto otra vez y la espera empieza de nuevo.',
      fr: 'Tick {tick} : semi-ouvert — l’appel d’essai dépasse le délai, de nouveau ouvert et l’attente repart de zéro.',
      hi: 'टिक {tick}: आधा खुला — परीक्षण कॉल का टाइमआउट, फिर खुला और इंतज़ार शुरू से।',
      id: 'Tik {tick}: setengah terbuka — panggilan uji habis waktu, terbuka lagi dan jeda mulai dari awal.',
      pt: 'Tick {tick}: meio aberto — a chamada de teste esgota o tempo, aberto de novo e a espera recomeça.',
    },
    'caption.notClosed': {
      en: 'Service back since tick {back} — breaker not closed yet.',
      ko: '틱 {back} 부터 서비스가 살아났다 — 브레이커는 아직 닫히지 않음.',
      ja: 'ティック {back} からサービスは復旧 — ブレーカーはまだクローズしていない。',
      zh: '服务自时刻 {back} 起恢复 — 熔断器尚未闭合。',
      ar: 'عادت الخدمة منذ النبضة {back} — لم يُغلق القاطع بعد.',
      es: 'Servicio de vuelta desde el tick {back} — el cortacircuitos aún no se cierra.',
      fr: 'Service revenu depuis le tick {back} — le disjoncteur n’est pas encore fermé.',
      hi: 'टिक {back} से सेवा लौट आई — ब्रेकर अभी बंद नहीं हुआ।',
      id: 'Layanan pulih sejak tik {back} — pemutus belum tertutup.',
      pt: 'Serviço de volta desde o tick {back} — o disjuntor ainda não fechou.',
    },
    'caption.closedAt': {
      en: 'Service back at tick {back} — closed again at tick {tick}.',
      ko: '틱 {back} 에 서비스가 살아났다 — 틱 {tick} 에 다시 닫힘.',
      ja: 'ティック {back} でサービス復旧 — ティック {tick} で再びクローズ。',
      zh: '服务在时刻 {back} 恢复 — 时刻 {tick} 重新闭合。',
      ar: 'عادت الخدمة في النبضة {back} — أُغلق من جديد في النبضة {tick}.',
      es: 'Servicio de vuelta en el tick {back} — cerrado de nuevo en el tick {tick}.',
      fr: 'Service revenu au tick {back} — refermé au tick {tick}.',
      hi: 'टिक {back} पर सेवा लौटी — टिक {tick} पर फिर बंद।',
      id: 'Layanan pulih di tik {back} — tertutup lagi di tik {tick}.',
      pt: 'Serviço de volta no tick {back} — fechado de novo no tick {tick}.',
    },
  },
};
