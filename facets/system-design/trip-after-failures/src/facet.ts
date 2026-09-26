/**
 * @piece
 * 질문: 부르는 서비스가 자꾸 실패할 때, 부르는 쪽은 언제 부르기를 그만두는가?
 *
 * 서킷 브레이커의 닫힘 → 열림 구간만 보인다. 반열림 · 시험 부름 · 다시 닫힘은 다루지 않는다.
 */
import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const tripAfterFailuresFacet: FacetJson = {
  id: 'facet:tripAfterFailures',
  title: {
    en: 'Trip after failures',
    ko: '잇단 실패에 끊긴다',
    ja: '連続失敗で切れる',
    zh: '连续失败后断开',
    ar: 'ينقطع بعد إخفاقات متتالية',
    es: 'Se corta tras fallos seguidos',
    fr: 'Coupé après des échecs consécutifs',
    hi: 'लगातार विफलताओं के बाद कटाव',
    id: 'Terputus setelah gagal beruntun',
    pt: 'Corta após falhas seguidas',
  },
  description: {
    en: 'When failures in a row reach the threshold, the breaker opens and the calls after it never reach the service.',
    ko: '잇단 실패가 문턱에 닿으면 브레이커가 열리고, 그 뒤의 부름은 서비스에 닿지 않는다.',
    ja: '連続失敗がしきい値に達するとブレーカーが開き、その後の呼び出しはサービスに届かない。',
    zh: '连续失败达到阈值时断路器打开，之后的调用不再到达服务。',
    ar: 'حين تبلغ الإخفاقات المتتالية العتبة يُفتح القاطع، ولا تصل الاستدعاءات التالية إلى الخدمة.',
    es: 'Cuando los fallos seguidos llegan al umbral, el interruptor se abre y las llamadas siguientes ya no llegan al servicio.',
    fr: 'Quand les échecs consécutifs atteignent le seuil, le disjoncteur s’ouvre et les appels suivants n’atteignent plus le service.',
    hi: 'जब लगातार विफलताएँ सीमा तक पहुँचती हैं, ब्रेकर खुल जाता है और उसके बाद की कॉल सेवा तक नहीं पहुँचतीं।',
    id: 'Saat gagal beruntun mencapai ambang, pemutus terbuka dan panggilan berikutnya tidak lagi sampai ke layanan.',
    pt: 'Quando as falhas seguidas atingem o limiar, o disjuntor abre e as chamadas seguintes não chegam ao serviço.',
  },
  algorithm: 'module:tripAfterFailures',
  scene: 'module:tripAfterFailuresScene',
  initialData: {
    type: 'trip-after-failures',
    stepMs: 1200,
    calls: ['ok', 'ok', 'fail', 'ok', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail'],
    threshold: 3,
    waitMs: { ok: 100, fail: 1000, blocked: 0 },
  },
  shuffleOnReset: false,
  messages: {
    'label.caller': {
      en: 'Caller', ko: '부르는 쪽', ja: '呼び出し側', zh: '调用方', ar: 'المستدعي',
      es: 'Llamante', fr: 'Appelant', hi: 'कॉल करने वाला', id: 'Pemanggil', pt: 'Chamador',
    },
    'label.breaker': {
      en: 'Breaker', ko: '브레이커', ja: 'ブレーカー', zh: '断路器', ar: 'القاطع',
      es: 'Interruptor', fr: 'Disjoncteur', hi: 'ब्रेकर', id: 'Pemutus', pt: 'Disjuntor',
    },
    'label.service': {
      en: 'Service', ko: '서비스', ja: 'サービス', zh: '服务', ar: 'الخدمة',
      es: 'Servicio', fr: 'Service', hi: 'सेवा', id: 'Layanan', pt: 'Serviço',
    },
    'label.wait': {
      en: 'Wait (ms)', ko: '기다림 (ms)', ja: '待ち (ms)', zh: '等待 (ms)', ar: 'الانتظار (ms)',
      es: 'Espera (ms)', fr: 'Attente (ms)', hi: 'प्रतीक्षा (ms)', id: 'Tunggu (ms)', pt: 'Espera (ms)',
    },
    'label.closed': {
      en: 'Closed', ko: '닫힘', ja: '閉', zh: '闭合', ar: 'مغلق',
      es: 'Cerrado', fr: 'Fermé', hi: 'बंद', id: 'Tertutup', pt: 'Fechado',
    },
    'label.open': {
      en: 'Open', ko: '열림', ja: '開', zh: '断开', ar: 'مفتوح',
      es: 'Abierto', fr: 'Ouvert', hi: 'खुला', id: 'Terbuka', pt: 'Aberto',
    },
    'label.streak': {
      en: 'Failures in a row', ko: '잇단 실패', ja: '連続失敗', zh: '连续失败', ar: 'إخفاقات متتالية',
      es: 'Fallos seguidos', fr: 'Échecs consécutifs', hi: 'लगातार विफलताएँ', id: 'Gagal beruntun', pt: 'Falhas seguidas',
    },
    'label.blockedCount': {
      en: 'Blocked: {n}', ko: '막힘: {n}', ja: 'ブロック: {n}', zh: '被拦截: {n}', ar: 'محجوبة: {n}',
      es: 'Bloqueadas: {n}', fr: 'Bloqués : {n}', hi: 'रोकी गईं: {n}', id: 'Diblokir: {n}', pt: 'Bloqueadas: {n}',
    },
    'label.reached': {
      en: 'Calls reached: {n}', ko: '닿은 부름: {n}', ja: '届いた呼び出し: {n}', zh: '到达的调用: {n}',
      ar: 'استدعاءات وصلت: {n}', es: 'Llamadas que llegaron: {n}', fr: 'Appels arrivés : {n}',
      hi: 'पहुँची कॉल: {n}', id: 'Panggilan sampai: {n}', pt: 'Chamadas que chegaram: {n}',
    },
    'label.totalWait': {
      en: 'Total: {ms} ms', ko: '합: {ms} ms', ja: '合計: {ms} ms', zh: '合计: {ms} ms', ar: 'المجموع: {ms} ms',
      es: 'Total: {ms} ms', fr: 'Total : {ms} ms', hi: 'कुल: {ms} ms', id: 'Total: {ms} ms', pt: 'Total: {ms} ms',
    },
    'label.ok': {
      en: 'OK', ko: '성공', ja: '成功', zh: '成功', ar: 'نجاح',
      es: 'Éxito', fr: 'Succès', hi: 'सफल', id: 'Berhasil', pt: 'Sucesso',
    },
    'label.fail': {
      en: 'Fail', ko: '실패', ja: '失敗', zh: '失败', ar: 'فشل',
      es: 'Fallo', fr: 'Échec', hi: 'विफल', id: 'Gagal', pt: 'Falha',
    },
    'label.blocked': {
      en: 'Blocked', ko: '막힘', ja: 'ブロック', zh: '拦截', ar: 'محجوب',
      es: 'Bloqueada', fr: 'Bloqué', hi: 'रोकी', id: 'Diblokir', pt: 'Bloqueada',
    },
    'caption.start': {
      en: 'Breaker closed. Calls in line: {n}',
      ko: '브레이커 닫힘. 줄 선 부름: {n}',
      ja: 'ブレーカーは閉。並んだ呼び出し: {n}',
      zh: '断路器闭合。排队的调用: {n}',
      ar: 'القاطع مغلق. الاستدعاءات في الطابور: {n}',
      es: 'Interruptor cerrado. Llamadas en fila: {n}',
      fr: 'Disjoncteur fermé. Appels en file : {n}',
      hi: 'ब्रेकर बंद। कतार में कॉल: {n}',
      id: 'Pemutus tertutup. Panggilan antre: {n}',
      pt: 'Disjuntor fechado. Chamadas na fila: {n}',
    },
    'caption.ok': {
      en: 'Call {call}: success from the service. Failures in a row: {streak}',
      ko: '부름 {call}: 서비스의 답은 성공. 잇단 실패: {streak}',
      ja: '呼び出し {call}: サービスの答えは成功。連続失敗: {streak}',
      zh: '调用 {call}: 服务回答成功。连续失败: {streak}',
      ar: 'الاستدعاء {call}: ردّت الخدمة بالنجاح. إخفاقات متتالية: {streak}',
      es: 'Llamada {call}: éxito del servicio. Fallos seguidos: {streak}',
      fr: 'Appel {call} : succès du service. Échecs consécutifs : {streak}',
      hi: 'कॉल {call}: सेवा से सफल उत्तर। लगातार विफलताएँ: {streak}',
      id: 'Panggilan {call}: layanan menjawab berhasil. Gagal beruntun: {streak}',
      pt: 'Chamada {call}: sucesso do serviço. Falhas seguidas: {streak}',
    },
    'caption.fail': {
      en: 'Call {call}: failure from the service. Failures in a row: {streak}/{threshold}',
      ko: '부름 {call}: 서비스의 답은 실패. 잇단 실패: {streak}/{threshold}',
      ja: '呼び出し {call}: サービスの答えは失敗。連続失敗: {streak}/{threshold}',
      zh: '调用 {call}: 服务回答失败。连续失败: {streak}/{threshold}',
      ar: 'الاستدعاء {call}: ردّت الخدمة بالفشل. إخفاقات متتالية: {streak}/{threshold}',
      es: 'Llamada {call}: fallo del servicio. Fallos seguidos: {streak}/{threshold}',
      fr: 'Appel {call} : échec du service. Échecs consécutifs : {streak}/{threshold}',
      hi: 'कॉल {call}: सेवा से विफल उत्तर। लगातार विफलताएँ: {streak}/{threshold}',
      id: 'Panggilan {call}: layanan menjawab gagal. Gagal beruntun: {streak}/{threshold}',
      pt: 'Chamada {call}: falha do serviço. Falhas seguidas: {streak}/{threshold}',
    },
    'caption.trip': {
      en: 'Call {call}: failure. Failures in a row: {streak}/{threshold}. Breaker opens',
      ko: '부름 {call}: 실패. 잇단 실패: {streak}/{threshold}. 브레이커가 열린다',
      ja: '呼び出し {call}: 失敗。連続失敗: {streak}/{threshold}。ブレーカーが開く',
      zh: '调用 {call}: 失败。连续失败: {streak}/{threshold}。断路器打开',
      ar: 'الاستدعاء {call}: فشل. إخفاقات متتالية: {streak}/{threshold}. القاطع يُفتح',
      es: 'Llamada {call}: fallo. Fallos seguidos: {streak}/{threshold}. El interruptor se abre',
      fr: 'Appel {call} : échec. Échecs consécutifs : {streak}/{threshold}. Le disjoncteur s’ouvre',
      hi: 'कॉल {call}: विफल। लगातार विफलताएँ: {streak}/{threshold}। ब्रेकर खुलता है',
      id: 'Panggilan {call}: gagal. Gagal beruntun: {streak}/{threshold}. Pemutus terbuka',
      pt: 'Chamada {call}: falha. Falhas seguidas: {streak}/{threshold}. O disjuntor abre',
    },
    'caption.blocked': {
      en: 'Call {call}: stopped at the breaker. Wait: {ms} ms',
      ko: '부름 {call}: 브레이커에서 막힘. 기다림: {ms} ms',
      ja: '呼び出し {call}: ブレーカーで止まる。待ち: {ms} ms',
      zh: '调用 {call}: 被断路器挡下。等待: {ms} ms',
      ar: 'الاستدعاء {call}: توقّف عند القاطع. الانتظار: {ms} ms',
      es: 'Llamada {call}: detenida en el interruptor. Espera: {ms} ms',
      fr: 'Appel {call} : arrêté au disjoncteur. Attente : {ms} ms',
      hi: 'कॉल {call}: ब्रेकर पर रुकी। प्रतीक्षा: {ms} ms',
      id: 'Panggilan {call}: berhenti di pemutus. Tunggu: {ms} ms',
      pt: 'Chamada {call}: parada no disjuntor. Espera: {ms} ms',
    },
  },
  blocks: {
    stage: { type: 'trip-after-failures-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
};
