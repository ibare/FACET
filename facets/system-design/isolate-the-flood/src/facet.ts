import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

/**
 * @piece
 * 질문: 한 의존 서비스가 멎어 그쪽 호출이 스레드를 붙들고 놓지 않을 때, 다른 서비스로 가는 호출은 어떻게 계속 사는가?
 *
 * 스레드 여섯이 칸 둘(a 셋 · b 셋)로 나뉘어 있다. 멎은 a 로 가는 호출이 a 칸을 붙들어 채우고
 * 뒤이어 오는 a 호출은 곧바로 자리 없음으로 튕긴다. 그동안 b 칸의 스레드는 틱마다 호출을 잡았다
 * 돌려주며 계속 돈다. 칸 크기 3 · 3 과 "멎음 = 호출이 돌아오지 않음" 은 예로 정한 값이다.
 */
export const isolateTheFloodFacet: FacetJson = {
  id: 'facet:isolateTheFlood',
  title: {
    en: 'A full bay leaves its neighbor running',
    ko: '한 칸이 차도 옆 칸은 산다',
    ja: '一つの区画が埋まっても隣は動く',
    zh: '一个隔舱满了，隔壁照常运转',
    ar: 'امتلاء حجيرة لا يوقف جارتها',
    es: 'Un compartimento lleno deja vivir al de al lado',
    fr: 'Un compartiment plein laisse vivre son voisin',
    hi: 'एक खाना भरे, तब भी बगल वाला चलता है',
    id: 'Satu sekat penuh, sekat sebelah tetap hidup',
    pt: 'Um compartimento cheio deixa o vizinho vivo',
  },
  description: {
    en: 'Calls to a stalled service fill their own bay of threads and then bounce off, while calls to the other service keep taking threads in the bay next door.',
    ko: '멎은 서비스로 가는 호출이 제 칸의 스레드를 채우고 나면 튕겨 나가지만, 다른 서비스로 가는 호출은 옆 칸에서 계속 스레드를 잡는다.',
    ja: '停止したサービスへの呼び出しは自分の区画のスレッドを埋めると弾かれるが、別のサービスへの呼び出しは隣の区画でスレッドを取り続ける。',
    zh: '发往停滞服务的调用占满自己隔舱的线程后便被弹回，而发往另一服务的调用在隔壁隔舱里照常拿到线程。',
    ar: 'تملأ الاستدعاءات إلى خدمة متوقفة خيوط حجيرتها ثم تُرفض، بينما تواصل الاستدعاءات إلى الخدمة الأخرى أخذ الخيوط في الحجيرة المجاورة.',
    es: 'Las llamadas a un servicio detenido llenan su propio compartimento de hilos y luego rebotan, mientras las llamadas al otro servicio siguen tomando hilos en el compartimento de al lado.',
    fr: 'Les appels vers un service bloqué remplissent leur propre compartiment de threads puis rebondissent, tandis que les appels vers l’autre service continuent de prendre des threads dans le compartiment voisin.',
    hi: 'ठप सेवा को जाने वाली कॉल अपने खाने के थ्रेड भर देती हैं और फिर लौटा दी जाती हैं, जबकि दूसरी सेवा की कॉल बगल के खाने में थ्रेड लेती रहती हैं।',
    id: 'Panggilan ke layanan yang macet memenuhi sekat thread-nya sendiri lalu terpental, sementara panggilan ke layanan lain terus mengambil thread di sekat sebelah.',
    pt: 'Chamadas a um serviço travado enchem o próprio compartimento de threads e depois são rejeitadas, enquanto chamadas ao outro serviço continuam pegando threads no compartimento ao lado.',
  },
  algorithm: 'module:isolateTheFlood',
  scene: 'module:isolateTheFloodScene',
  initialData: {
    type: 'isolate-the-flood',
    stepMs: 1100,
    bays: [
      { id: 'a', size: 3 },
      { id: 'b', size: 3 },
    ],
    services: [
      { id: 'a', returnsAfter: null },
      { id: 'b', returnsAfter: 1 },
    ],
    arrivals: [
      { tick: 0, to: 'a' }, { tick: 0, to: 'a' }, { tick: 0, to: 'b' },
      { tick: 1, to: 'a' }, { tick: 1, to: 'a' }, { tick: 1, to: 'b' },
      { tick: 2, to: 'a' }, { tick: 2, to: 'a' }, { tick: 2, to: 'b' },
      { tick: 3, to: 'a' }, { tick: 3, to: 'a' }, { tick: 3, to: 'b' },
      { tick: 4, to: 'b' },
      { tick: 5, to: 'b' },
      { tick: 6, to: 'b' },
      { tick: 7, to: 'b' },
    ],
  },
  shuffleOnReset: false,
  messages: {
    'label.tick': {
      en: 'Tick {tick}', ko: '틱 {tick}', ja: 'ティック {tick}', zh: '时刻 {tick}', ar: 'النبضة {tick}',
      es: 'Tic {tick}', fr: 'Tic {tick}', hi: 'टिक {tick}', id: 'Tik {tick}', pt: 'Tique {tick}',
    },
    'label.pool': {
      en: 'Thread pool: {n}', ko: '스레드 풀: {n}', ja: 'スレッドプール: {n}', zh: '线程池: {n}', ar: 'مجمّع الخيوط: {n}',
      es: 'Pool de hilos: {n}', fr: 'Pool de threads : {n}', hi: 'थ्रेड पूल: {n}', id: 'Kumpulan thread: {n}', pt: 'Pool de threads: {n}',
    },
    'label.bay': {
      en: 'Bay for {svc}', ko: '{svc} 칸', ja: '{svc} の区画', zh: '{svc} 隔舱', ar: 'حجيرة {svc}',
      es: 'Compartimento de {svc}', fr: 'Compartiment {svc}', hi: '{svc} का खाना', id: 'Sekat {svc}', pt: 'Compartimento de {svc}',
    },
    'label.use': {
      en: '{used} / {size}', ko: '{used} / {size}', ja: '{used} / {size}', zh: '{used} / {size}', ar: '{used} / {size}',
      es: '{used} / {size}', fr: '{used} / {size}', hi: '{used} / {size}', id: '{used} / {size}', pt: '{used} / {size}',
    },
    'label.callsTo': {
      en: 'Calls to {svc}', ko: '{svc} 호출', ja: '{svc} への呼び出し', zh: '发往 {svc} 的调用', ar: 'استدعاءات {svc}',
      es: 'Llamadas a {svc}', fr: 'Appels vers {svc}', hi: '{svc} को कॉल', id: 'Panggilan ke {svc}', pt: 'Chamadas para {svc}',
    },
    'label.away': {
      en: 'No free thread: {n}', ko: '자리 없음: {n}', ja: '空きなし: {n}', zh: '无空闲线程: {n}', ar: 'لا خيط متاح: {n}',
      es: 'Sin hilo libre: {n}', fr: 'Aucun thread libre : {n}', hi: 'खाली थ्रेड नहीं: {n}', id: 'Tak ada thread kosong: {n}', pt: 'Sem thread livre: {n}',
    },
    'label.back': {
      en: 'Returned: {n}', ko: '돌아옴: {n}', ja: '戻った: {n}', zh: '已返回: {n}', ar: 'عادت: {n}',
      es: 'Devueltas: {n}', fr: 'Revenus : {n}', hi: 'लौटे: {n}', id: 'Kembali: {n}', pt: 'Devolvidas: {n}',
    },
    'label.svc.a': {
      en: 'Reviews', ko: '리뷰', ja: 'レビュー', zh: '评论', ar: 'المراجعات',
      es: 'Reseñas', fr: 'Avis', hi: 'समीक्षाएँ', id: 'Ulasan', pt: 'Avaliações',
    },
    'label.svc.b': {
      en: 'Checkout', ko: '결제', ja: '決済', zh: '结账', ar: 'الدفع',
      es: 'Pago', fr: 'Paiement', hi: 'भुगतान', id: 'Pembayaran', pt: 'Pagamento',
    },
    'label.stalled': {
      en: 'Stalled', ko: '멎음', ja: '停止', zh: '停滞', ar: 'متوقف',
      es: 'Detenido', fr: 'Bloqué', hi: 'ठप', id: 'Macet', pt: 'Travado',
    },
    'label.up': {
      en: 'Up', ko: '살아 있음', ja: '稼働中', zh: '正常', ar: 'يعمل',
      es: 'Activo', fr: 'Actif', hi: 'चालू', id: 'Hidup', pt: 'Ativo',
    },
    'caption.start': {
      en: 'Threads are split into one bay per service.',
      ko: '스레드를 서비스마다 한 칸씩 나눠 두었다.',
      ja: 'スレッドはサービスごとに一つの区画に分けてある。',
      zh: '线程按服务分进各自的隔舱。',
      ar: 'الخيوط مقسّمة إلى حجيرة لكل خدمة.',
      es: 'Los hilos están repartidos en un compartimento por servicio.',
      fr: 'Les threads sont répartis en un compartiment par service.',
      hi: 'थ्रेड हर सेवा के लिए एक-एक खाने में बँटे हैं।',
      id: 'Thread dibagi menjadi satu sekat per layanan.',
      pt: 'As threads estão divididas em um compartimento por serviço.',
    },
    'caption.fill': {
      en: '{a} never answers: each call to it keeps its thread.',
      ko: '{a} 쪽은 응답이 없다 — 그리로 간 호출은 스레드를 붙든 채 놓지 않는다.',
      ja: '{a} は応答しない — そこへの呼び出しはスレッドを掴んだまま離さない。',
      zh: '{a} 不再应答 — 发往它的调用占着线程不放。',
      ar: '{a} لا يردّ — كل استدعاء إليه يمسك خيطه ولا يتركه.',
      es: '{a} no responde: cada llamada a él retiene su hilo.',
      fr: '{a} ne répond plus : chaque appel vers lui garde son thread.',
      hi: '{a} जवाब नहीं देता — उसकी हर कॉल अपना थ्रेड पकड़े रहती है।',
      id: '{a} tidak menjawab: tiap panggilan ke sana menahan thread-nya.',
      pt: '{a} não responde: cada chamada para ele retém sua thread.',
    },
    'caption.full': {
      en: 'The {a} bay is full: the next call to {a} bounces off.',
      ko: '{a} 칸이 찼다 — 다음 {a} 호출은 곧바로 튕겨 나간다.',
      ja: '{a} の区画が埋まった — 次の {a} 呼び出しはすぐに弾かれる。',
      zh: '{a} 隔舱已满 — 下一个发往 {a} 的调用立刻被弹回。',
      ar: 'امتلأت حجيرة {a} — الاستدعاء التالي إلى {a} يُرفض فورًا.',
      es: 'El compartimento de {a} está lleno: la siguiente llamada a {a} rebota.',
      fr: 'Le compartiment {a} est plein : l’appel suivant vers {a} rebondit.',
      hi: '{a} का खाना भर गया — {a} की अगली कॉल तुरंत लौटा दी जाती है।',
      id: 'Sekat {a} penuh: panggilan berikutnya ke {a} langsung terpental.',
      pt: 'O compartimento de {a} está cheio: a próxima chamada para {a} é rejeitada na hora.',
    },
    'caption.reject': {
      en: 'No free thread for {a} calls. {b} calls still find one.',
      ko: '{a} 호출은 빈 스레드가 없어 튕겨 나가고, {b} 호출은 제 칸에서 스레드를 잡는다.',
      ja: '{a} への呼び出しは空きスレッドがなく弾かれ、{b} への呼び出しは自分の区画でスレッドを得る。',
      zh: '发往 {a} 的调用没有空闲线程；发往 {b} 的调用仍在自己的隔舱拿到线程。',
      ar: 'لا خيط متاح لاستدعاءات {a}، أما استدعاءات {b} فتجد خيطًا في حجيرتها.',
      es: 'Las llamadas a {a} no hallan hilo libre; las de {b} aún encuentran uno.',
      fr: 'Aucun thread libre pour les appels vers {a} ; ceux vers {b} en trouvent encore.',
      hi: '{a} की कॉल को खाली थ्रेड नहीं मिलता; {b} की कॉल को अब भी मिलता है।',
      id: 'Panggilan ke {a} tak mendapat thread kosong; panggilan ke {b} masih dapat.',
      pt: 'Chamadas para {a} não acham thread livre; as para {b} ainda acham.',
    },
    'caption.flow': {
      en: '{b} keeps turning: one call returns, the next takes its thread.',
      ko: '{b} 칸은 계속 돈다 — 호출 하나가 돌아오고 다음 호출이 그 스레드를 잡는다.',
      ja: '{b} の区画は回り続ける — 呼び出しが一つ戻り、次がそのスレッドを取る。',
      zh: '{b} 隔舱持续运转 — 一个调用返回，下一个接过它的线程。',
      ar: 'حجيرة {b} تواصل الدوران — يعود استدعاء ويأخذ التالي خيطه.',
      es: '{b} sigue girando: una llamada vuelve y la siguiente toma su hilo.',
      fr: '{b} continue de tourner : un appel revient, le suivant prend son thread.',
      hi: '{b} का खाना चलता रहता है — एक कॉल लौटती है, अगली उसका थ्रेड लेती है।',
      id: '{b} terus berputar: satu panggilan kembali, berikutnya mengambil thread-nya.',
      pt: '{b} continua girando: uma chamada volta e a próxima pega sua thread.',
    },
    'caption.last': {
      en: 'The last {b} call returns. The {a} bay is still full.',
      ko: '마지막 {b} 호출이 돌아왔다. {a} 칸은 여전히 차 있다.',
      ja: '最後の {b} 呼び出しが戻った。{a} の区画はまだ埋まったまま。',
      zh: '最后一个 {b} 调用已返回。{a} 隔舱仍然满着。',
      ar: 'عاد آخر استدعاء إلى {b}. حجيرة {a} ما زالت ممتلئة.',
      es: 'Vuelve la última llamada a {b}. El compartimento de {a} sigue lleno.',
      fr: 'Le dernier appel vers {b} revient. Le compartiment {a} reste plein.',
      hi: '{b} की आख़िरी कॉल लौट आई। {a} का खाना अब भी भरा है।',
      id: 'Panggilan terakhir ke {b} kembali. Sekat {a} masih penuh.',
      pt: 'A última chamada para {b} volta. O compartimento de {a} continua cheio.',
    },
  },
  blocks: {
    stage: { type: 'isolate-the-flood-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
};
