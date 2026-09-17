/**
 * write-back 과 write-through 를 나란히 굴리는 조각.
 *
 * @piece 고친 것을 언제 아래로 보내는가 — 한쪽은 고칠 때마다 곧장 내려보내고,
 * 다른 쪽은 표시만 달아 두었다가 그 줄이 쫓겨날 때 한꺼번에 내려보낸다. 같은
 * 일곱 번의 고침이 일곱 번과 네 번으로 갈린다.
 *
 * 1차 데이터는 칸 수 · 라인 크기 · 고치는 줄 차례뿐이다. 적재 · 축출 · 고침
 * 표시 · 메모리 쓰기 횟수는 algorithm 이 그 자리에서 셈한다 — 화면에 뜰 값을
 * 선언에 적어 두면 데이터를 바꿀 때 둘이 어긋난다 (S-piece).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const writeBackVsThroughFacet: FacetJson = {
  id: 'facet:writeBackVsThrough',
  title: {
    en: 'Write Back or Write Through',
    ko: '지금 내려보낼까, 모아 둘까',
    ja: '今すぐ書き戻すか、ためておくか',
    zh: '立刻写下去，还是先攒着',
    ar: 'الكتابة الآن أم تجميعها',
    es: 'Escribir ya o acumular',
    fr: 'Écrire tout de suite ou accumuler',
    hi: 'अभी लिखें या जमा करें',
    id: 'Tulis sekarang atau kumpulkan dulu',
    pt: 'Escrever já ou acumular',
  },
  description: {
    en: 'The same seven writes cost seven trips to memory with write-through and only four with write-back.',
    ko: '같은 일곱 번의 고침이 write-through 에서는 메모리 쓰기 일곱 번, write-back 에서는 네 번이 된다.',
    ja: '同じ七回の書き込みが、write-through では七回、write-back では四回のメモリ書き込みになる。',
    zh: '同样的七次写入，write-through 要写七次内存，write-back 只写四次。',
    ar: 'السبع كتابات نفسها تكلّف سبع رحلات إلى الذاكرة مع write-through وأربعًا فقط مع write-back.',
    es: 'Las mismas siete escrituras suponen siete viajes a memoria con write-through y solo cuatro con write-back.',
    fr: 'Les mêmes sept écritures donnent sept accès mémoire en write-through et seulement quatre en write-back.',
    hi: 'वही सात लेखन write-through में मेमोरी तक सात बार जाते हैं, write-back में केवल चार बार।',
    id: 'Tujuh penulisan yang sama menjadi tujuh tulis ke memori pada write-through, dan hanya empat pada write-back.',
    pt: 'As mesmas sete escritas viram sete idas à memória no write-through e apenas quatro no write-back.',
  },
  algorithm: 'module:writeBackVsThrough',
  scene: 'module:writeBackVsThroughScene',
  initialData: {
    type: 'write-back-vs-through',
    /** 칸 둘. 자리가 모자라면 가장 오래전에 쓴 줄이 나간다 (LRU). */
    slotCount: 2,
    /** 한 줄은 16 바이트 — 세 번을 고쳐도 내려갈 때는 한 줄이다. */
    lineBytes: 16,
    /** 고치는 줄의 차례. 줄0 을 세 번 고치는 것이 이 조각의 급소다. */
    writes: [0, 0, 0, 1, 1, 2, 0],
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'write-back-vs-through-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
  messages: {
    'caption.start': {
      en: 'The same write lands in both. One sends it down now; the other only marks the line.',
      ko: '같은 고침이 양쪽에 온다. 한쪽은 곧장 내려보내고, 다른 쪽은 줄에 표시만 단다.',
      ja: '同じ書き込みが両方に届く。一方はすぐ下へ送り、もう一方は行に印を付けるだけだ。',
      zh: '同一次写入落到两边。一边立刻写下去，另一边只在行上做个记号。',
      ar: 'تصل الكتابة نفسها إلى الجانبين: أحدهما يرسلها إلى الأسفل فورًا، والآخر يكتفي بوضع علامة على السطر.',
      es: 'La misma escritura llega a ambos: uno la baja ya, el otro solo marca la línea.',
      fr: "La même écriture arrive des deux côtés : l'un la descend tout de suite, l'autre se contente de marquer la ligne.",
      hi: 'वही लेखन दोनों ओर पहुँचता है: एक उसे तुरंत नीचे भेजता है, दूसरा बस लाइन पर निशान लगाता है।',
      id: 'Penulisan yang sama tiba di kedua sisi: satu langsung mengirimnya ke bawah, satu lagi hanya menandai baris.',
      pt: 'A mesma escrita chega aos dois lados: um a envia já para baixo, o outro apenas marca a linha.',
    },
    'caption.again': {
      en: 'The same line is written again: another trip down on the left, another mark on the right.',
      ko: '같은 줄을 또 고쳤다. 왼쪽은 또 내려가고, 오른쪽은 표시가 하나 는다.',
      ja: '同じ行をまた書き換えた。左はまた下へ行き、右は印が一つ増える。',
      zh: '同一行又被写了一次：左边再跑一趟，右边只多一个记号。',
      ar: 'كُتب السطر نفسه مرة أخرى: رحلة جديدة إلى الأسفل على اليسار، وعلامة إضافية على اليمين.',
      es: 'Se escribe otra vez la misma línea: otro viaje abajo a la izquierda, otra marca a la derecha.',
      fr: 'La même ligne est réécrite : un nouveau trajet vers le bas à gauche, une marque de plus à droite.',
      hi: 'वही लाइन फिर लिखी गई: बाईं ओर एक और यात्रा नीचे, दाईं ओर एक और निशान।',
      id: 'Baris yang sama ditulis lagi: satu perjalanan turun lagi di kiri, satu tanda lagi di kanan.',
      pt: 'A mesma linha é escrita de novo: mais uma viagem para baixo à esquerda, mais uma marca à direita.',
    },
    'caption.load': {
      en: 'A new line takes an empty slot. The left still sends every write down.',
      ko: '새 줄이 빈 칸에 들어온다. 왼쪽은 여전히 고칠 때마다 내려보낸다.',
      ja: '新しい行が空いた枠に入る。左は相変わらず書くたびに下へ送る。',
      zh: '新的行占了一个空槽。左边照旧每写一次就送下去一次。',
      ar: 'يأخذ سطر جديد خانة فارغة. ولا يزال اليسار يرسل كل كتابة إلى الأسفل.',
      es: 'Una línea nueva ocupa un hueco libre. La izquierda sigue bajando cada escritura.',
      fr: 'Une nouvelle ligne occupe un emplacement libre. La gauche descend toujours chaque écriture.',
      hi: 'एक नई लाइन खाली खाने में आ जाती है। बायाँ हिस्सा अब भी हर लेखन नीचे भेजता है।',
      id: 'Baris baru mengisi slot kosong. Sisi kiri tetap mengirim setiap penulisan ke bawah.',
      pt: 'Uma linha nova ocupa um espaço vazio. A esquerda continua a descer cada escrita.',
    },
    'caption.evict': {
      en: 'The line is pushed out, so the marks it gathered go down together — one trip.',
      ko: '줄이 쫓겨난다. 모아 둔 표시가 한꺼번에 내려간다 — 내려간 것은 한 번이다.',
      ja: '行が追い出される。ためておいた印がまとめて下りる — 下りたのは一度だけだ。',
      zh: '这一行被挤了出去，攒下的记号一起下去——只跑了一趟。',
      ar: 'يُطرد السطر، فتنزل العلامات المتراكمة دفعة واحدة — رحلة واحدة فقط.',
      es: 'La línea es expulsada, así que las marcas acumuladas bajan juntas: un solo viaje.',
      fr: 'La ligne est expulsée : les marques accumulées descendent ensemble — un seul trajet.',
      hi: 'लाइन बाहर धकेली जाती है, तो जमा हुए सारे निशान एक साथ नीचे जाते हैं — बस एक यात्रा।',
      id: 'Baris itu terusir, jadi tanda-tanda yang terkumpul turun sekaligus — satu perjalanan saja.',
      pt: 'A linha é expulsa, e as marcas acumuladas descem juntas: uma única viagem.',
    },
    'caption.flush': {
      en: 'The marked lines left in the cache still have to go down. Nothing is free.',
      ko: '캐시에 남은 고쳐진 줄도 언젠가는 내려보내야 한다. 공짜는 없다.',
      ja: 'キャッシュに残った印つきの行も、いつかは下ろさねばならない。ただではない。',
      zh: '还留在缓存里的带记号的行，终究也要写下去。没有白得的。',
      ar: 'الأسطر المعلَّمة الباقية في المخبأ لا بد أن تنزل هي الأخرى؛ لا شيء بالمجان.',
      es: 'Las líneas marcadas que quedan en la caché también tendrán que bajar. Nada sale gratis.',
      fr: "Les lignes marquées restées dans le cache devront descendre elles aussi. Rien n'est gratuit.",
      hi: 'कैश में बची निशान लगी लाइनों को भी नीचे भेजना ही होगा। कुछ भी मुफ़्त नहीं है।',
      id: 'Baris bertanda yang masih di cache pun harus turun. Tidak ada yang gratis.',
      pt: 'As linhas marcadas que ficaram na cache também terão de descer. Nada é de graça.',
    },
    'caption.done': {
      en: 'Same {writes} writes on both sides. Trips to memory: {through} against {back}.',
      ko: '고침은 어느 쪽이나 {writes} 번. 메모리 쓰기: {through} 대 {back}.',
      ja: '書き込みはどちらも {writes} 回。メモリ書き込みは {through} 対 {back}。',
      zh: '两边都是 {writes} 次写入。写内存的次数：{through} 比 {back}。',
      ar: 'العدد نفسه من الكتابات على الجانبين: {writes}. أما الكتابات إلى الذاكرة فهي {through} مقابل {back}.',
      es: 'Las mismas {writes} escrituras en ambos lados. Viajes a memoria: {through} frente a {back}.',
      fr: 'Les mêmes {writes} écritures des deux côtés. Accès mémoire : {through} contre {back}.',
      hi: 'दोनों ओर वही {writes} लेखन। मेमोरी तक यात्राएँ: {through} बनाम {back}।',
      id: 'Sama-sama {writes} penulisan. Tulis ke memori: {through} berbanding {back}.',
      pt: 'As mesmas {writes} escritas dos dois lados. Idas à memória: {through} contra {back}.',
    },
    'label.writeOrder': {
      en: 'writes, in order',
      ko: '고치는 차례',
      ja: '書き込みの順',
      zh: '写入顺序',
      ar: 'الكتابات بالترتيب',
      es: 'escrituras, en orden',
      fr: 'écritures, en ordre',
      hi: 'लेखन, क्रम में',
      id: 'urutan penulisan',
      pt: 'escritas, em ordem',
    },
    'label.memoryWrites': {
      en: 'memory writes: {n}',
      ko: '메모리 쓰기: {n}',
      ja: 'メモリ書き込み: {n}',
      zh: '写内存次数：{n}',
      ar: 'كتابات الذاكرة: {n}',
      es: 'escrituras en memoria: {n}',
      fr: 'écritures mémoire : {n}',
      hi: 'मेमोरी लेखन: {n}',
      id: 'tulis ke memori: {n}',
      pt: 'escritas na memória: {n}',
    },
  },
};
