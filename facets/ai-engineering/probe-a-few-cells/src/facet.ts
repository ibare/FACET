/**
 * probeAFewCells — 가까워 보이는 칸만 뒤진다.
 *
 * @piece 질문 하나: 무리 몇 개만 여는 것이 화면에서 무슨 일인가.
 *
 * 1차 데이터는 점 스물넷의 좌표 · 대표 넷의 좌표 · 질의의 좌표다. 칸 소속도
 * 대표까지의 거리도 여는 차례도 algorithm 이 이 좌표에서 셈한다. 그림의 좌표는
 * stage 가 캔버스에서 역산한다 (S-piece).
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const probeAFewCellsFacet: FacetJson = {
  id: 'facet:probeAFewCells',
  title: {
    en: 'Probe a few cells',
    ko: '무리 몇 개만 연다',
    ja: 'いくつかのセルだけを開く',
    zh: '只打开少数单元',
    ar: 'فحص بضع خلايا فقط',
    es: 'Explorar solo unas celdas',
    fr: 'Sonder quelques cellules',
    hi: 'कुछ ही कोष्ठ खोलें',
    id: 'Periksa beberapa sel saja',
    pt: 'Sondar apenas algumas células',
  },
  description: {
    en: 'The query is compared only with points in the nearest cells; points in unopened cells are never touched.',
    ko: '질의를 가까운 몇 칸의 점하고만 견준다. 안 연 칸의 점은 손도 대지 않는다.',
    ja: 'クエリは近いセルの点とだけ比べられ、開かなかったセルの点には触れない。',
    zh: '查询只与最近几个单元内的点比较，未打开单元中的点从不触及。',
    ar: 'يُقارن الاستعلام بنقاط أقرب الخلايا فقط، ولا تُمس نقاط الخلايا غير المفتوحة.',
    es: 'La consulta se compara solo con los puntos de las celdas más cercanas; los de las celdas sin abrir nunca se tocan.',
    fr: "La requête n'est comparée qu'aux points des cellules les plus proches ; ceux des cellules non ouvertes ne sont jamais touchés.",
    hi: 'क्वेरी की तुलना केवल निकटतम कोष्ठों के बिंदुओं से होती है; बिना खुले कोष्ठों के बिंदु कभी छुए नहीं जाते।',
    id: 'Kueri hanya dibandingkan dengan titik di sel terdekat; titik di sel yang tak dibuka tidak pernah disentuh.',
    pt: 'A consulta é comparada apenas com pontos das células mais próximas; os das células não abertas nunca são tocados.',
  },
  algorithm: 'module:probeAFewCells',
  // 화면을 명령이 아니라 **장면**으로 만든다 (`scene:`) — 어느 걸음의 화면이든 셈으로
  // 얻으므로 띠로 임의의 자리에 갈 수 있다 (S-scene).
  scene: 'module:probeAFewCellsScene',
  initialData: {
    type: 'probe-a-few-cells',
    points: [
      [2, 2], [3, 1], [1, 3], [3, 3], [2, 4], [4, 2],
      [9, 2], [10, 3], [11, 1], [10, 1], [9, 4], [11, 3],
      [2, 10], [3, 11], [1, 9], [3, 9], [2, 12], [4, 10],
      [9, 10], [10, 11], [11, 9], [10, 9], [9, 12], [11, 11],
    ],
    centroids: [
      [2.5, 2.5],
      [10, 2.3],
      [2.5, 10.2],
      [10, 10.3],
    ],
    query: [6, 6],
    nprobe: 2,
    stepMs: 800,
  },
  blocks: {
    stage: { type: 'probe-a-few-cells-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
  messages: {
    'caption.query': {
      en: 'A query lands on the plane. Points in all: {total}.',
      ko: '질의가 평면에 내려앉는다. 점은 모두 {total}.',
      ja: 'クエリが平面に降りる。点は全部で {total}。',
      zh: '查询落在平面上。点共 {total} 个。',
      ar: 'يصل استعلام إلى المستوى. إجمالي النقاط: {total}.',
      es: 'Una consulta aterriza en el plano. Puntos en total: {total}.',
      fr: 'Une requête arrive sur le plan. Points au total : {total}.',
      hi: 'एक क्वेरी समतल पर आती है। कुल बिंदु: {total}.',
      id: 'Sebuah kueri mendarat di bidang. Total titik: {total}.',
      pt: 'Uma consulta chega ao plano. Pontos no total: {total}.',
    },
    'caption.split': {
      en: 'The plane is already split into {cells} cells, each around one centroid.',
      ko: '평면은 이미 {cells} 칸으로 갈라져 있고, 칸마다 대표가 하나.',
      ja: '平面はすでに {cells} 個のセルに分かれ、それぞれに代表点が一つある。',
      zh: '平面已划分为 {cells} 个单元，每个单元有一个代表点。',
      ar: 'المستوى مقسوم بالفعل إلى {cells} خلايا، لكل منها مركز واحد.',
      es: 'El plano ya está dividido en {cells} celdas, cada una con un centroide.',
      fr: "Le plan est déjà divisé en {cells} cellules, chacune autour d'un centroïde.",
      hi: 'समतल पहले से {cells} कोष्ठों में बँटा है, हर एक का अपना केंद्रक।',
      id: 'Bidang sudah terbagi menjadi {cells} sel, masing-masing dengan satu sentroid.',
      pt: 'O plano já está dividido em {cells} células, cada uma com um centroide.',
    },
    'caption.measure': {
      en: 'Query to the centroid of cell {cell}: {dist}.',
      ko: '질의에서 칸 {cell} 대표까지: {dist}.',
      ja: 'クエリからセル {cell} の代表点まで: {dist}。',
      zh: '查询到单元 {cell} 代表点的距离: {dist}。',
      ar: 'من الاستعلام إلى مركز الخلية {cell}: {dist}.',
      es: 'De la consulta al centroide de la celda {cell}: {dist}.',
      fr: 'De la requête au centroïde de la cellule {cell} : {dist}.',
      hi: 'क्वेरी से कोष्ठ {cell} के केंद्रक तक: {dist}.',
      id: 'Dari kueri ke sentroid sel {cell}: {dist}.',
      pt: 'Da consulta ao centroide da célula {cell}: {dist}.',
    },
    'caption.rank': {
      en: 'All {cells} centroids sit in one thin ring. Nearest first: {order}.',
      ko: '{cells} 대표가 모두 얇은 고리 안에 든다. 가까운 쪽부터: {order}.',
      ja: '{cells} 個の代表点がどれも薄い環の中に入る。近い順: {order}。',
      zh: '{cells} 个代表点都落在一条窄环里。由近及远: {order}。',
      ar: 'كل المراكز الـ {cells} تقع في حلقة رفيعة واحدة. الأقرب أولاً: {order}.',
      es: 'Los {cells} centroides caen en un anillo estrecho. Del más cercano: {order}.',
      fr: 'Les {cells} centroïdes tiennent dans un anneau mince. Du plus proche : {order}.',
      hi: 'सभी {cells} केंद्रक एक पतले वलय में आते हैं। निकटतम पहले: {order}.',
      id: 'Semua {cells} sentroid berada dalam satu cincin tipis. Terdekat dahulu: {order}.',
      pt: 'Os {cells} centroides cabem em um anel estreito. Do mais próximo: {order}.',
    },
    'caption.open': {
      en: 'Cell {cell} opens. Points compared so far: {seen}.',
      ko: '칸 {cell} 뚜껑이 열린다. 지금까지 견준 점: {seen}.',
      ja: 'セル {cell} の蓋が開く。ここまでに比べた点: {seen}。',
      zh: '单元 {cell} 的盖子打开。至此比较过的点: {seen}。',
      ar: 'تُفتح الخلية {cell}. النقاط المقارَنة حتى الآن: {seen}.',
      es: 'La celda {cell} se abre. Puntos comparados hasta ahora: {seen}.',
      fr: "La cellule {cell} s'ouvre. Points comparés jusqu'ici : {seen}.",
      hi: 'कोष्ठ {cell} खुलता है। अब तक तुलना किए गए बिंदु: {seen}.',
      id: 'Sel {cell} terbuka. Titik yang sudah dibandingkan: {seen}.',
      pt: 'A célula {cell} abre. Pontos comparados até agora: {seen}.',
    },
    'caption.stop': {
      en: 'Opened {opened} of {cells}. Compared: {seen}. Untouched: {untouched}.',
      ko: '{cells} 칸 중 연 것은 {opened}. 견준 점: {seen}. 손대지 않은 점: {untouched}.',
      ja: '{cells} 個のうち開いたのは {opened}。比べた点: {seen}。触れていない点: {untouched}。',
      zh: '{cells} 个单元中打开了 {opened} 个。比较过: {seen}。未触及: {untouched}。',
      ar: 'فُتحت {opened} من {cells}. تمت المقارنة: {seen}. لم تُمس: {untouched}.',
      es: 'Se abrieron {opened} de {cells}. Comparados: {seen}. Sin tocar: {untouched}.',
      fr: 'Ouvertes : {opened} sur {cells}. Comparés : {seen}. Intacts : {untouched}.',
      hi: '{cells} में से {opened} खोले गए। तुलना किए गए: {seen}. अछूते: {untouched}.',
      id: 'Dibuka {opened} dari {cells}. Dibandingkan: {seen}. Tak tersentuh: {untouched}.',
      pt: 'Abertas {opened} de {cells}. Comparados: {seen}. Intocados: {untouched}.',
    },
  },
};
