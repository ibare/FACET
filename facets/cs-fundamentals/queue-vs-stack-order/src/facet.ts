/**
 * @piece 탐색이 쓰는 그릇 — 같은 그래프에서 순서가 갈린다.
 *
 * 답하는 질문 하나: **같은 그래프에서 담는 그릇만 바꾸면 방문 순서가 갈리는가.**
 * 그래프도 출발점도 이웃을 보는 순서도 같게 두고, 꺼내는 자리만 다른 두 그릇을
 * 나란히 돌린다. 하나는 앞에서 꺼내고 하나는 위에서 꺼낸다.
 *
 * 조각이므로 header 도 metrics 도 layout 도 두지 않는다 (S-piece). 제목은 글의
 * 문단이 주고, 셀 것은 없고, 적을 배치는 하나뿐이다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const queueVsStackOrderFacet: FacetJson = {
  id: 'facet:queueVsStackOrder',
  title: {
    en: 'The vessel decides the order',
    ko: '그릇이 순서를 정한다',
    ja: '順序を決めるのは器',
    zh: '容器决定顺序',
    ar: 'الوعاء يقرّر الترتيب',
    es: 'El recipiente decide el orden',
    fr: "Le récipient décide de l'ordre",
    hi: 'क्रम बर्तन तय करता है',
    id: 'Wadahnya yang menentukan urutan',
    pt: 'O recipiente decide a ordem',
  },
  description: {
    en: 'Same graph, same neighbour order — swapping the vessel splits the visiting order.',
    ko: '같은 그래프, 같은 이웃 순서 — 담는 그릇만 바꾸면 방문 순서가 갈린다.',
    ja: '同じグラフ、同じ隣の順 — 器を替えるだけで訪問順が分かれる。',
    zh: '同一张图，同样的邻居顺序 — 只换容器，访问顺序就分道。',
    ar: 'الرسم نفسه وترتيب الجيران نفسه — تبديل الوعاء وحده يفرّق ترتيب الزيارة.',
    es: 'El mismo grafo y el mismo orden de vecinos: cambiar el recipiente separa el orden de visita.',
    fr: "Même graphe, même ordre des voisins — changer de récipient sépare l'ordre de visite.",
    hi: 'वही ग्राफ़, वही पड़ोसी क्रम — सिर्फ़ बर्तन बदलने से भ्रमण का क्रम बँट जाता है।',
    id: 'Graf sama, urutan tetangga sama — cukup tukar wadahnya, urutan kunjungan pun berpisah.',
    pt: 'Mesmo grafo, mesma ordem de vizinhos — trocar o recipiente separa a ordem de visita.',
  },
  algorithm: 'module:queueVsStackOrder',
  projector: 'module:queueVsStackOrderProjector',

  initialData: {
    type: 'queue-vs-stack-order',
    vertices: [1, 2, 3, 4, 5, 6],
    edges: [
      [1, 2],
      [1, 3],
      [2, 4],
      [2, 5],
      [3, 6],
    ],
    start: 1,
    stepMs: 750,
  },

  blocks: {
    stage: { type: 'queue-vs-stack-order-stage' },
    controls: { type: 'control-bar', controls: [CONTROL.replay, CONTROL.advance] },
  },

  messages: {
    'label.fifo': {
      en: 'first in, first out',
      ko: '먼저 넣은 것을 먼저',
      ja: '先に入れたものから',
      zh: '先进先出',
      ar: 'الأول دخولاً هو الأول خروجاً',
      es: 'el primero en entrar, el primero en salir',
      fr: 'premier entré, premier sorti',
      hi: 'पहले आया, पहले गया',
      id: 'masuk pertama, keluar pertama',
      pt: 'primeiro a entrar, primeiro a sair',
    },
    'label.lifo': {
      en: 'last in, first out',
      ko: '나중에 넣은 것을 먼저',
      ja: '後に入れたものから',
      zh: '后进先出',
      ar: 'الأخير دخولاً هو الأول خروجاً',
      es: 'el último en entrar, el primero en salir',
      fr: 'dernier entré, premier sorti',
      hi: 'बाद में आया, पहले गया',
      id: 'masuk terakhir, keluar pertama',
      pt: 'último a entrar, primeiro a sair',
    },
    'caption.ready': {
      en: 'Same graph, same neighbour order — only the vessels differ.',
      ko: '같은 그래프, 같은 이웃 순서 — 다른 것은 그릇뿐이다.',
      ja: '同じグラフ、同じ隣の順 — 違うのは器だけだ。',
      zh: '同一张图，同样的邻居顺序 — 不同的只有容器。',
      ar: 'الرسم نفسه وترتيب الجيران نفسه — الوعاء وحده مختلف.',
      es: 'El mismo grafo y el mismo orden de vecinos: solo cambian los recipientes.',
      fr: 'Même graphe, même ordre des voisins — seuls les récipients diffèrent.',
      hi: 'वही ग्राफ़, वही पड़ोसी क्रम — फ़र्क़ सिर्फ़ बर्तन का है।',
      id: 'Graf sama, urutan tetangga sama — hanya wadahnya yang berbeda.',
      pt: 'Mesmo grafo, mesma ordem de vizinhos — só os recipientes diferem.',
    },
    'caption.seed': {
      en: 'The start, {vertex}, goes into both vessels.',
      ko: '출발점 {vertex}번이 두 그릇에 모두 들어간다.',
      ja: '出発点 {vertex} が両方の器に入る。',
      zh: '起点 {vertex} 进入两个容器。',
      ar: 'نقطة البداية {vertex} تدخل الوعاءين معاً.',
      es: 'El inicio, {vertex}, entra en los dos recipientes.',
      fr: 'Le départ, {vertex}, entre dans les deux récipients.',
      hi: 'शुरुआत {vertex} दोनों बर्तनों में जाती है।',
      id: 'Titik awal {vertex} masuk ke kedua wadah.',
      pt: 'O início, {vertex}, entra nos dois recipientes.',
    },
    'caption.take': {
      en: 'Out — {fifo} from the front, {lifo} from the top.',
      ko: '꺼낸다 — 앞에서 {fifo}번, 위에서 {lifo}번.',
      ja: '取り出す — 前から {fifo}、上から {lifo}。',
      zh: '取出 — 从前面取 {fifo}，从上面取 {lifo}。',
      ar: 'نُخرج — {fifo} من الأمام و{lifo} من الأعلى.',
      es: 'Se saca: {fifo} por delante y {lifo} por arriba.',
      fr: 'On sort — {fifo} par le devant, {lifo} par le dessus.',
      hi: 'निकालते हैं — आगे से {fifo}, ऊपर से {lifo}।',
      id: 'Diambil — {fifo} dari depan, {lifo} dari atas.',
      pt: 'Sai — {fifo} pela frente, {lifo} pelo topo.',
    },
    'caption.diverge': {
      en: 'Here the orders part — {fifo} from the front, {lifo} from the top.',
      ko: '여기서 순서가 갈린다 — 앞에서 {fifo}번, 위에서 {lifo}번.',
      ja: 'ここで順序が分かれる — 前から {fifo}、上から {lifo}。',
      zh: '顺序在这里分道 — 从前面取 {fifo}，从上面取 {lifo}。',
      ar: 'هنا يفترق الترتيبان — {fifo} من الأمام و{lifo} من الأعلى.',
      es: 'Aquí se separan los órdenes: {fifo} por delante y {lifo} por arriba.',
      fr: 'Ici les ordres se séparent — {fifo} par le devant, {lifo} par le dessus.',
      hi: 'यहीं क्रम अलग हो जाते हैं — आगे से {fifo}, ऊपर से {lifo}।',
      id: 'Di sinilah urutannya berpisah — {fifo} dari depan, {lifo} dari atas.',
      pt: 'Aqui as ordens se separam — {fifo} pela frente, {lifo} pelo topo.',
    },
    'caption.offer': {
      en: 'The new neighbours go in, smallest number first — the same rule on both sides.',
      ko: '새 이웃이 번호가 작은 것부터 들어간다 — 양쪽 모두 같은 규칙이다.',
      ja: '新しい隣が番号の小さい順に入る — 両方とも同じ規則だ。',
      zh: '新的邻居按编号从小到大放入 — 两边规则相同。',
      ar: 'يدخل الجيران الجدد بدءاً من الرقم الأصغر — القاعدة نفسها على الجانبين.',
      es: 'Los vecinos nuevos entran de menor a mayor número: la misma regla en ambos lados.',
      fr: 'Les nouveaux voisins entrent du plus petit numéro au plus grand — même règle des deux côtés.',
      hi: 'नए पड़ोसी छोटे नंबर से शुरू होकर अंदर जाते हैं — दोनों तरफ़ वही नियम।',
      id: 'Tetangga baru masuk dari nomor terkecil — aturan yang sama di kedua sisi.',
      pt: 'Os novos vizinhos entram do menor número ao maior — a mesma regra dos dois lados.',
    },
    'caption.done': {
      en: 'Only the vessel differed, and the visiting order split.',
      ko: '다른 것은 그릇뿐인데 방문 순서가 갈렸다.',
      ja: '違ったのは器だけなのに、訪問順が分かれた。',
      zh: '不同的只有容器，访问顺序却分道了。',
      ar: 'لم يختلف سوى الوعاء، ومع ذلك افترق ترتيب الزيارة.',
      es: 'Solo cambió el recipiente y el orden de visita se separó.',
      fr: "Seul le récipient différait, et l'ordre de visite s'est séparé.",
      hi: 'फ़र्क़ सिर्फ़ बर्तन का था, फिर भी भ्रमण का क्रम बँट गया।',
      id: 'Yang berbeda hanya wadahnya, tetapi urutan kunjungannya berpisah.',
      pt: 'Só o recipiente diferia, e a ordem de visita se separou.',
    },
  },
};
