import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

/**
 * mutex — 두 스레드가 `count` 를 두 번씩 올린다. 돌림 몫이 끼워 드는 차례를 정하고, 끊기는 자리가 끝값을
 * 정한다. 자물쇠를 켜면 lock 부터 unlock 까지 다섯 줄이 한 덩어리로 뭉친다.
 *
 * 코드 패널은 없다 — 까닭은 irs.ts. 프로그램은 화면이 가상 표기로 가진다(`initialData.programs`).
 */
export const mutexFacet: FacetJson = {
  id: 'facet:mutex',
  title: {
    en: 'Mutex: the cut decides, the lock removes the luck',
    ko: '뮤텍스: 끊기는 자리가 정하고, 자물쇠가 운을 지운다',
    ja: 'ミューテックス: 切れ目が結果を決め、ロックが運を消す',
    zh: '互斥锁：切换点决定结果，锁消除运气',
    ar: 'القفل المتبادل: موضع الانقطاع يحسم، والقفل يزيل الحظ',
    es: 'Mutex: el corte decide, el cerrojo quita la suerte',
    fr: 'Mutex : la coupure décide, le verrou efface la chance',
    hi: 'म्यूटेक्स: कटने की जगह तय करती है, लॉक किस्मत मिटाता है',
    id: 'Mutex: titik potong menentukan, kunci menghapus untung-untungan',
    pt: 'Mutex: o corte decide, o cadeado tira a sorte',
  },
  description: {
    en: 'Two threads each add 1 to count twice, so it should end at 4. Turn the time slice and the lines re-interleave: whether a write is lost depends on where the switch falls, and a bigger slice is not always better. Turn the lock on and each increment clumps into a five-line block.',
    ko: '두 스레드가 count 를 두 번씩 올리니 끝값은 4 여야 한다. 돌림 몫을 돌리면 줄들이 다시 끼워 든다 — 쓰기를 잃는지는 끊기는 자리가 정하고, 몫이 크다고 늘 나아지지 않는다. 자물쇠를 켜면 올림 하나가 다섯 줄 덩어리로 뭉친다.',
    ja: '2 つのスレッドが count をそれぞれ 2 回増やすので、最後は 4 になるはずです。タイムスライスを回すと行が組み直されます。書き込みが失われるかは切り替えの位置で決まり、スライスを大きくしても良くなるとは限りません。ロックを入れると、1 回の増加が 5 行のかたまりになります。',
    zh: '两个线程各把 count 加 1 两次，结果应为 4。转动时间片，各行重新交错：写入是否丢失取决于切换落在哪里，时间片越大并不一定越好。打开锁后，每次递增聚成五行一块。',
    ar: 'خيطان يضيف كل منهما 1 إلى count مرتين، فيجب أن تنتهي القيمة عند 4. غيّر شريحة الوقت فتتداخل الأسطر من جديد: ضياع الكتابة يتوقف على موضع التبديل، والشريحة الأكبر ليست دائمًا أفضل. شغّل القفل فتتكتل كل زيادة في كتلة من خمسة أسطر.',
    es: 'Dos hilos suman 1 a count dos veces cada uno, así que debería terminar en 4. Gira la porción de tiempo y las líneas se vuelven a intercalar: que se pierda una escritura depende de dónde cae el cambio, y una porción mayor no siempre es mejor. Activa el cerrojo y cada incremento se agrupa en un bloque de cinco líneas.',
    fr: 'Deux fils ajoutent chacun 1 à count deux fois : il devrait finir à 4. Tournez la tranche de temps et les lignes s’entrelacent autrement : qu’une écriture soit perdue dépend de l’endroit où tombe la bascule, et une tranche plus grande n’est pas toujours meilleure. Activez le verrou et chaque incrément se regroupe en un bloc de cinq lignes.',
    hi: 'दो थ्रेड count को दो-दो बार 1 बढ़ाते हैं, इसलिए अंत में 4 होना चाहिए। टाइम स्लाइस घुमाइए तो पंक्तियाँ फिर से गुँथती हैं: लिखा हुआ खोएगा या नहीं, यह स्विच की जगह पर निर्भर है, और बड़ी स्लाइस हमेशा बेहतर नहीं। लॉक चालू करें तो हर बढ़ोतरी पाँच पंक्तियों के एक गुच्छे में सिमट जाती है।',
    id: 'Dua thread masing-masing menambah count dua kali, jadi hasilnya mesti 4. Putar jatah waktu dan baris-baris berselang-seling ulang: hilang tidaknya tulisan bergantung pada titik perpindahan, dan jatah lebih besar tidak selalu lebih baik. Nyalakan kunci dan tiap penambahan menggumpal menjadi blok lima baris.',
    pt: 'Duas threads somam 1 a count duas vezes cada, então deveria terminar em 4. Gire a fatia de tempo e as linhas se reintercalam: perder uma escrita depende de onde cai a troca, e uma fatia maior nem sempre é melhor. Ligue o cadeado e cada incremento se junta num bloco de cinco linhas.',
  },
  algorithm: 'module:mutex',
  projector: 'module:mutexProjector',
  initialData: {
    type: 'mutex',
    stepMs: 1000,
    sliceLadder: [1, 2, 3, 4, 5, 6],
    slice: 2,
    lockLadder: [0, 1],
    useLock: 0,
    threads: ['A', 'B'],
    shared: 'count',
    register: 'r',
    lock: 'm',
    start: 0,
    programs: [
      [
        { op: 'load', text: 'let r = count' },
        { op: 'add', text: 'r = r + 1' },
        { op: 'store', text: 'count = r' },
        { op: 'load', text: 'r = count' },
        { op: 'add', text: 'r = r + 1' },
        { op: 'store', text: 'count = r' },
      ],
      [
        { op: 'lock', text: 'lock(m)' },
        { op: 'load', text: 'let r = count' },
        { op: 'add', text: 'r = r + 1' },
        { op: 'store', text: 'count = r' },
        { op: 'unlock', text: 'unlock(m)' },
        { op: 'lock', text: 'lock(m)' },
        { op: 'load', text: 'r = count' },
        { op: 'add', text: 'r = r + 1' },
        { op: 'store', text: 'count = r' },
        { op: 'unlock', text: 'unlock(m)' },
      ],
    ],
  },
  layout: {
    type: 'column',
    gap: 12,
    children: [{ ref: 'header' }, { ref: 'stage' }, { ref: 'controls' }],
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'mutex-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        ...CONTROL_SET.playback,
        {
          widget: 'segmented-slider',
          action: 'slice',
          name: 'slice',
          label: {
            en: 'Time slice',
            ko: '돌림 몫',
            ja: 'タイムスライス',
            zh: '时间片',
            ar: 'شريحة الوقت',
            es: 'Porción de tiempo',
            fr: 'Tranche de temps',
            hi: 'टाइम स्लाइस',
            id: 'Jatah waktu',
            pt: 'Fatia de tempo',
          },
          segments: [
            { value: 1, label: '1' },
            { value: 2, label: '2', default: true },
            { value: 3, label: '3' },
            { value: 4, label: '4' },
            { value: 5, label: '5' },
            { value: 6, label: '6' },
          ],
        },
        {
          widget: 'segmented-slider',
          action: 'useLock',
          name: 'useLock',
          label: {
            en: 'Lock',
            ko: '자물쇠',
            ja: 'ロック',
            zh: '锁',
            ar: 'القفل',
            es: 'Cerrojo',
            fr: 'Verrou',
            hi: 'लॉक',
            id: 'Kunci',
            pt: 'Cadeado',
          },
          segments: [
            {
              value: 0,
              label: { en: 'Off', ko: '없음', ja: 'なし', zh: '无', ar: 'بدون', es: 'No', fr: 'Non', hi: 'बंद', id: 'Tidak', pt: 'Não' },
              default: true,
            },
            {
              value: 1,
              label: { en: 'On', ko: '있음', ja: 'あり', zh: '有', ar: 'مع', es: 'Sí', fr: 'Oui', hi: 'चालू', id: 'Ya', pt: 'Sim' },
            },
          ],
        },
      ],
      metrics: [
        {
          name: 'final-count',
          label: { en: 'Final count', ko: '끝값', ja: '最終値', zh: '最终值', ar: 'القيمة النهائية', es: 'Valor final', fr: 'Valeur finale', hi: 'अंतिम मान', id: 'Nilai akhir', pt: 'Valor final' },
          initial: 0,
        },
        {
          name: 'lost-updates',
          label: { en: 'Lost updates', ko: '잃은 올림', ja: '失われた更新', zh: '丢失的更新', ar: 'تحديثات ضائعة', es: 'Incrementos perdidos', fr: 'Mises à jour perdues', hi: 'खोए अपडेट', id: 'Pembaruan hilang', pt: 'Incrementos perdidos' },
          initial: 0,
        },
        {
          name: 'ticks',
          label: { en: 'Ticks', ko: '틱 수', ja: 'ティック数', zh: '滴答数', ar: 'عدد النبضات', es: 'Ticks', fr: 'Ticks', hi: 'टिक', id: 'Tik', pt: 'Ticks' },
          initial: 0,
        },
        {
          name: 'blocked-tries',
          label: { en: 'Blocked tries', ko: '막힌 시도', ja: '阻まれた試行', zh: '受阻尝试', ar: 'محاولات محجوبة', es: 'Intentos bloqueados', fr: 'Essais bloqués', hi: 'रुके प्रयास', id: 'Percobaan terhalang', pt: 'Tentativas bloqueadas' },
          initial: 0,
        },
      ],
    },
  },
  messages: {
    'caption.start': {
      en: 'Slice: {k}', ko: '돌림 몫: {k}', ja: 'スライス: {k}', zh: '时间片: {k}', ar: 'الشريحة: {k}',
      es: 'Porción: {k}', fr: 'Tranche : {k}', hi: 'स्लाइस: {k}', id: 'Jatah: {k}', pt: 'Fatia: {k}',
    },
    'caption.tick': {
      en: 'Tick {n} · {thread}', ko: '틱 {n} · {thread}', ja: 'ティック {n} · {thread}', zh: '滴答 {n} · {thread}', ar: 'النبضة {n} · {thread}',
      es: 'Tick {n} · {thread}', fr: 'Tick {n} · {thread}', hi: 'टिक {n} · {thread}', id: 'Tik {n} · {thread}', pt: 'Tick {n} · {thread}',
    },
    'caption.chunk': {
      en: 'Tick {from}–{to} · {thread}', ko: '틱 {from}–{to} · {thread}', ja: 'ティック {from}–{to} · {thread}', zh: '滴答 {from}–{to} · {thread}',
      ar: 'النبضات {from}–{to} · {thread}', es: 'Tick {from}–{to} · {thread}', fr: 'Tick {from}–{to} · {thread}', hi: 'टिक {from}–{to} · {thread}',
      id: 'Tik {from}–{to} · {thread}', pt: 'Tick {from}–{to} · {thread}',
    },
    'caption.done': {
      en: 'Count: {n} · Expected: {expected}', ko: '끝값: {n} · 있어야 할 값: {expected}', ja: '結果: {n} · 期待値: {expected}',
      zh: '结果: {n} · 应有值: {expected}', ar: 'القيمة: {n} · المتوقع: {expected}', es: 'Valor: {n} · Esperado: {expected}',
      fr: 'Valeur : {n} · Attendu : {expected}', hi: 'मान: {n} · अपेक्षित: {expected}', id: 'Nilai: {n} · Seharusnya: {expected}',
      pt: 'Valor: {n} · Esperado: {expected}',
    },
    'label.thread': {
      en: 'Thread {name}', ko: '스레드 {name}', ja: 'スレッド {name}', zh: '线程 {name}', ar: 'الخيط {name}',
      es: 'Hilo {name}', fr: 'Fil {name}', hi: 'थ्रेड {name}', id: 'Thread {name}', pt: 'Thread {name}',
    },
    'label.shared': {
      en: 'Shared', ko: '공유', ja: '共有', zh: '共享', ar: 'مشترك', es: 'Compartido', fr: 'Partagé', hi: 'साझा', id: 'Bersama', pt: 'Compartilhado',
    },
    'label.lock': {
      en: 'Lock {name}', ko: '자물쇠 {name}', ja: 'ロック {name}', zh: '锁 {name}', ar: 'القفل {name}',
      es: 'Cerrojo {name}', fr: 'Verrou {name}', hi: 'लॉक {name}', id: 'Kunci {name}', pt: 'Cadeado {name}',
    },
    'label.owner': {
      en: 'Owner', ko: '주인', ja: '持ち主', zh: '持有者', ar: 'المالك', es: 'Dueño', fr: 'Détenteur', hi: 'मालिक', id: 'Pemilik', pt: 'Dono',
    },
    'label.queue': {
      en: 'Queue', ko: '줄', ja: '待ち列', zh: '队列', ar: 'الطابور', es: 'Cola', fr: 'File', hi: 'कतार', id: 'Antrean', pt: 'Fila',
    },
    'label.order': {
      en: 'Run order', ko: '실행 차례', ja: '実行順', zh: '执行顺序', ar: 'ترتيب التنفيذ', es: 'Orden de ejecución', fr: 'Ordre d’exécution',
      hi: 'चलने का क्रम', id: 'Urutan jalan', pt: 'Ordem de execução',
    },
    'label.asleep': {
      en: 'Asleep', ko: '잠듦', ja: '眠り', zh: '休眠', ar: 'نائم', es: 'Dormido', fr: 'Endormi', hi: 'सोया', id: 'Tidur', pt: 'Dormindo',
    },
    'label.finished': {
      en: 'Finished', ko: '끝남', ja: '終了', zh: '结束', ar: 'انتهى', es: 'Terminado', fr: 'Terminé', hi: 'पूरा', id: 'Selesai', pt: 'Terminou',
    },
    'label.lost': {
      en: '{old} → {new}', ko: '{old} → {new}', ja: '{old} → {new}', zh: '{old} → {new}', ar: '{old} → {new}',
      es: '{old} → {new}', fr: '{old} → {new}', hi: '{old} → {new}', id: '{old} → {new}', pt: '{old} → {new}',
    },
  },
};
