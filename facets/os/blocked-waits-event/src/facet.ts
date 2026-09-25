import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

/**
 * @piece
 * 잠든 프로세스를 깨우는 것은 무엇인가 — CPU 가 비는 것인가, 기다리던 사건인가.
 *
 * 프로세스 셋이 CPU 하나를 나눠 쓴다. 둘은 도중에 사건(디스크 응답 · 키 입력)을 기다리며
 * 사건마다 따로 선 줄에 잠든다. 사건이 오면 그 사건의 줄에서만 하나가 준비 줄로 옮겨 가고,
 * 다른 줄의 것은 CPU 가 비어 있어도 그 자리에 있다.
 */
export const blockedWaitsEventFacet: FacetJson = {
  id: 'facet:blockedWaitsEvent',
  title: {
    en: 'What wakes a sleeping process',
    ko: '잠든 프로세스를 깨우는 것',
    ja: '眠ったプロセスを起こすもの',
    zh: '唤醒睡眠进程的是什么',
    ar: 'ما الذي يوقظ عملية نائمة',
    es: 'Qué despierta a un proceso dormido',
    fr: 'Ce qui réveille un processus endormi',
    hi: 'सोई हुई प्रक्रिया को क्या जगाता है',
    id: 'Apa yang membangunkan proses yang tidur',
    pt: 'O que acorda um processo adormecido',
  },
  description: {
    en: 'Is it the CPU going idle, or the event it was waiting for? Each event has its own waiting line, and an arriving event takes one process out of its own line only.',
    ko: 'CPU 가 비는 것인가, 기다리던 사건인가. 사건마다 대기 줄이 따로 있고, 도착한 사건은 제 줄에서만 하나를 꺼낸다.',
    ja: 'CPU が空くことか、待っていた事象か。事象ごとに待ち行列が別にあり、届いた事象は自分の列からだけ一つを取り出す。',
    zh: '是 CPU 空闲，还是它等待的事件？每个事件都有自己的等待队列，到达的事件只从自己的队列中取出一个进程。',
    ar: 'هل هو خمول المعالج أم الحدث الذي كانت تنتظره؟ لكل حدث طابور انتظار خاص، والحدث الواصل يُخرج عملية واحدة من طابوره فقط.',
    es: '¿Es que la CPU quede libre o el evento que esperaba? Cada evento tiene su propia cola de espera, y un evento que llega saca un proceso solo de su propia cola.',
    fr: 'Est-ce le CPU qui se libère, ou l’événement attendu ? Chaque événement a sa propre file d’attente, et un événement qui arrive ne sort un processus que de sa propre file.',
    hi: 'क्या CPU का खाली होना, या वह घटना जिसकी वह प्रतीक्षा कर रही थी? हर घटना की अपनी प्रतीक्षा कतार होती है, और आने वाली घटना केवल अपनी कतार से एक प्रक्रिया निकालती है।',
    id: 'Apakah CPU yang menganggur, atau peristiwa yang ditunggunya? Setiap peristiwa punya antrean tunggunya sendiri, dan peristiwa yang tiba hanya mengeluarkan satu proses dari antreannya sendiri.',
    pt: 'É a CPU ficar ociosa ou o evento que ele esperava? Cada evento tem sua própria fila de espera, e um evento que chega tira um processo apenas da sua própria fila.',
  },
  algorithm: 'module:blockedWaitsEvent',
  scene: 'module:blockedWaitsEventScene',
  initialData: {
    type: 'blocked-waits-event',
    stepMs: 1800,
    procs: [
      { id: 'editor', work: [{ do: 'cpu', ticks: 1 }, { do: 'wait', event: 'key' }, { do: 'cpu', ticks: 1 }] },
      { id: 'copier', work: [{ do: 'cpu', ticks: 2 }, { do: 'wait', event: 'disk' }, { do: 'cpu', ticks: 2 }] },
      { id: 'calc', work: [{ do: 'cpu', ticks: 3 }] },
    ],
    events: [
      { id: 'disk', after: 3 },
      { id: 'key', at: 10 },
    ],
  },
  shuffleOnReset: false,
  messages: {
    'label.ready': {
      en: 'Ready queue', ko: '준비 줄', ja: '実行待ち列', zh: '就绪队列', ar: 'طابور الجاهزية',
      es: 'Cola de listos', fr: 'File des prêts', hi: 'तैयार कतार', id: 'Antrean siap', pt: 'Fila de prontos',
    },
    'label.cpu': {
      en: 'CPU', ko: 'CPU', ja: 'CPU', zh: 'CPU', ar: 'المعالج',
      es: 'CPU', fr: 'CPU', hi: 'CPU', id: 'CPU', pt: 'CPU',
    },
    'label.done': {
      en: 'Finished', ko: '끝남', ja: '終了', zh: '已结束', ar: 'انتهت',
      es: 'Terminados', fr: 'Terminés', hi: 'समाप्त', id: 'Selesai', pt: 'Encerrados',
    },
    'label.queue': {
      en: 'Waiting for: {event}', ko: '기다리는 것: {event}', ja: '待っているもの: {event}', zh: '等待：{event}',
      ar: 'بانتظار: {event}', es: 'Esperando: {event}', fr: 'En attente de : {event}', hi: 'प्रतीक्षा: {event}',
      id: 'Menunggu: {event}', pt: 'Aguardando: {event}',
    },
    'label.arrive': {
      en: 'Arrives: tick {tick}', ko: '도착: 틱 {tick}', ja: '到着: ティック {tick}', zh: '到达：时刻 {tick}',
      ar: 'الوصول: النبضة {tick}', es: 'Llega: tic {tick}', fr: 'Arrivée : tic {tick}', hi: 'आगमन: टिक {tick}',
      id: 'Tiba: tik {tick}', pt: 'Chega: tique {tick}',
    },
    'label.arriveNone': {
      en: 'Arrives: —', ko: '도착: —', ja: '到着: —', zh: '到达：—', ar: 'الوصول: —',
      es: 'Llega: —', fr: 'Arrivée : —', hi: 'आगमन: —', id: 'Tiba: —', pt: 'Chega: —',
    },
    'label.proc.editor': {
      en: 'Editor', ko: '편집기', ja: 'エディタ', zh: '编辑器', ar: 'المحرر',
      es: 'Editor', fr: 'Éditeur', hi: 'संपादक', id: 'Editor', pt: 'Editor',
    },
    'label.proc.copier': {
      en: 'Copier', ko: '복사', ja: 'コピー', zh: '复制', ar: 'الناسخ',
      es: 'Copiador', fr: 'Copieur', hi: 'कॉपियर', id: 'Penyalin', pt: 'Copiador',
    },
    'label.proc.calc': {
      en: 'Calculator', ko: '계산', ja: '計算', zh: '计算', ar: 'الحاسبة',
      es: 'Calculadora', fr: 'Calcul', hi: 'गणक', id: 'Kalkulator', pt: 'Calculadora',
    },
    'label.event.disk': {
      en: 'Disk reply', ko: '디스크 응답', ja: 'ディスク応答', zh: '磁盘应答', ar: 'رد القرص',
      es: 'Respuesta del disco', fr: 'Réponse disque', hi: 'डिस्क उत्तर', id: 'Balasan disk', pt: 'Resposta do disco',
    },
    'label.event.key': {
      en: 'Key press', ko: '키 입력', ja: 'キー入力', zh: '按键', ar: 'ضغطة مفتاح',
      es: 'Pulsación de tecla', fr: 'Frappe de touche', hi: 'कुंजी दबाना', id: 'Tekan tombol', pt: 'Tecla pressionada',
    },
    'caption.before': {
      en: 'Before the first tick', ko: '첫 틱 전', ja: '最初のティックの前', zh: '第一个时刻之前',
      ar: 'قبل النبضة الأولى', es: 'Antes del primer tic', fr: 'Avant le premier tic', hi: 'पहले टिक से पहले',
      id: 'Sebelum tik pertama', pt: 'Antes do primeiro tique',
    },
    'caption.tick': {
      en: 'Tick: {tick}', ko: '틱: {tick}', ja: 'ティック: {tick}', zh: '时刻：{tick}', ar: 'النبضة: {tick}',
      es: 'Tic: {tick}', fr: 'Tic : {tick}', hi: 'टिक: {tick}', id: 'Tik: {tick}', pt: 'Tique: {tick}',
    },
    'caption.run': {
      en: '{proc} runs.', ko: '{proc} 실행.', ja: '{proc} 実行。', zh: '{proc} 运行。', ar: 'يعمل {proc}.',
      es: '{proc} se ejecuta.', fr: '{proc} s’exécute.', hi: '{proc} चलता है।', id: '{proc} berjalan.', pt: '{proc} executa.',
    },
    'caption.done': {
      en: '{proc} finishes.', ko: '{proc} 끝.', ja: '{proc} 終了。', zh: '{proc} 结束。', ar: 'انتهى {proc}.',
      es: '{proc} termina.', fr: '{proc} se termine.', hi: '{proc} समाप्त।', id: '{proc} selesai.', pt: '{proc} termina.',
    },
    'caption.sleep': {
      en: '{proc} sleeps. Waiting for: {event}',
      ko: '{proc} 잠듦 · 기다리는 것: {event}',
      ja: '{proc} 休眠 · 待つもの: {event}',
      zh: '{proc} 睡眠 · 等待：{event}',
      ar: 'ينام {proc}. بانتظار: {event}',
      es: '{proc} se duerme. Espera: {event}',
      fr: '{proc} s’endort. Attend : {event}',
      hi: '{proc} सो जाता है। प्रतीक्षा: {event}',
      id: '{proc} tidur. Menunggu: {event}',
      pt: '{proc} dorme. Aguarda: {event}',
    },
    'caption.wake': {
      en: '{event} arrives → {proc} wakes. Ticks asleep: {n}',
      ko: '{event} 도착 → {proc} 깸 · 잠든 틱: {n}',
      ja: '{event} 到着 → {proc} 起床 · 眠っていたティック: {n}',
      zh: '{event} 到达 → {proc} 唤醒 · 睡眠时刻数：{n}',
      ar: 'وصل {event} → استيقظ {proc}. نبضات النوم: {n}',
      es: 'Llega {event} → {proc} despierta. Tics dormido: {n}',
      fr: '{event} arrive → {proc} se réveille. Tics endormi : {n}',
      hi: '{event} आया → {proc} जागा। सोए टिक: {n}',
      id: '{event} tiba → {proc} bangun. Tik tidur: {n}',
      pt: '{event} chega → {proc} acorda. Tiques dormindo: {n}',
    },
    'caption.idle': {
      en: 'CPU idle ticks just before: {n}',
      ko: '바로 앞 CPU 가 비어 있던 틱: {n}',
      ja: '直前に CPU が空いていたティック: {n}',
      zh: '此前 CPU 空闲的时刻数：{n}',
      ar: 'نبضات خمول المعالج قبل ذلك مباشرة: {n}',
      es: 'Tics con la CPU ociosa justo antes: {n}',
      fr: 'Tics de CPU inactif juste avant : {n}',
      hi: 'ठीक पहले CPU खाली टिक: {n}',
      id: 'Tik CPU menganggur tepat sebelumnya: {n}',
      pt: 'Tiques de CPU ociosa logo antes: {n}',
    },
    'caption.cpuIdle': {
      en: 'The CPU is idle.', ko: 'CPU 가 비었다.', ja: 'CPU が空いた。', zh: 'CPU 空闲。', ar: 'المعالج خامل.',
      es: 'La CPU está ociosa.', fr: 'Le CPU est inactif.', hi: 'CPU खाली है।', id: 'CPU menganggur.', pt: 'A CPU está ociosa.',
    },
    'caption.stay': {
      en: 'Still asleep: {proc} · waiting for: {event}',
      ko: '그대로 잠: {proc} · 기다리는 것: {event}',
      ja: 'まだ休眠: {proc} · 待つもの: {event}',
      zh: '仍在睡眠：{proc} · 等待：{event}',
      ar: 'ما زال نائمًا: {proc} · بانتظار: {event}',
      es: 'Sigue dormido: {proc} · espera: {event}',
      fr: 'Toujours endormi : {proc} · attend : {event}',
      hi: 'अब भी सोया: {proc} · प्रतीक्षा: {event}',
      id: 'Masih tidur: {proc} · menunggu: {event}',
      pt: 'Ainda dormindo: {proc} · aguarda: {event}',
    },
  },
  blocks: {
    stage: { type: 'blocked-waits-event-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
};
