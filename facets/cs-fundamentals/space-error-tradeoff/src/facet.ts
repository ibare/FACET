/**
 * spaceErrorTradeoff — Count-Min Sketch 를 얼마나 크게 잡을 것인가.
 *
 * @piece 질문 하나에 답하고 멈추는 조각. 자리를 아끼는 값을 오차로 치른다는
 * 주장 하나만 말한다. 제목은 글의 문단이 주므로 header 를 두지 않고, 셀 것이
 * 없으므로 metrics 도 두지 않는다 (S-piece).
 *
 * `initialData` 에는 **구조**만 둔다 — 키 · 반복 수 · 줄 수 · 견줘 볼 폭.
 * 해시도 자리도 표의 값도 알고리즘이 직접 셈하고, 좌표는 stage 가 캔버스에서
 * 역산한다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const spaceErrorTradeoffFacet: FacetJson = {
  id: 'facet:spaceErrorTradeoff',
  title: {
    en: 'How big to size a Count-Min Sketch',
    ko: 'Count-Min Sketch 를 얼마나 크게 잡을 것인가',
    ja: 'Count-Min Sketch をどれだけ大きく取るか',
    zh: 'Count-Min Sketch 该开多大',
    ar: 'ما حجم Count-Min Sketch المناسب',
    es: 'Qué tamaño dar a un Count-Min Sketch',
    fr: 'Quelle taille donner à un Count-Min Sketch',
    hi: 'Count-Min Sketch कितना बड़ा रखें',
    id: 'Seberapa besar Count-Min Sketch dibuat',
    pt: 'Que tamanho dar a um Count-Min Sketch',
  },
  description: {
    en: 'Space saved is paid for in error: the narrower the table, the more the read values swell.',
    ko: '자리를 아끼는 값을 오차로 치른다. 표가 좁을수록 읽히는 값이 부풀어 오른다.',
    ja: '節約した領域は誤差で支払う。表が狭いほど読み出す値は膨らむ。',
    zh: '省下的空间要用误差偿还：表越窄，读出的值越膨胀。',
    ar: 'المساحة الموفّرة تُدفع خطأً: كلما ضاق الجدول تضخّمت القيم المقروءة.',
    es: 'El espacio ahorrado se paga con error: cuanto más estrecha la tabla, más se hinchan los valores leídos.',
    fr: "L'espace économisé se paie en erreur : plus la table est étroite, plus les valeurs lues gonflent.",
    hi: 'बचाई गई जगह की कीमत त्रुटि से चुकती है: तालिका जितनी सँकरी, पढ़े गए मान उतने ही फूलते हैं।',
    id: 'Ruang yang dihemat dibayar dengan galat: makin sempit tabel, makin menggelembung nilai yang terbaca.',
    pt: 'O espaço poupado paga-se em erro: quanto mais estreita a tabela, mais incham os valores lidos.',
  },
  algorithm: 'module:spaceErrorTradeoff',
  projector: 'module:spaceErrorTradeoffProjector',
  initialData: {
    type: 'space-error-tradeoff',
    keys: ['kiwi', 'mango', 'elder', 'cherry', 'banana', 'date'],
    repeats: 4,
    depth: 3,
    widths: [2, 4, 8],
    stepMs: 900,
  },
  blocks: {
    stage: { type: 'space-error-tradeoff-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.stage': {
      en: 'Width {width}: {depth} rows x {width} columns = {cells} cells. Items counted: {total}.',
      ko: '폭 {width} — {depth}줄 × {width}칸. 칸 수는 {cells}, 센 항목 수는 {total}.',
      ja: '幅 {width} — {depth}行 × {width}列。セル数 {cells}、数えた項目 {total}。',
      zh: '宽度 {width}：{depth} 行 × {width} 列 = {cells} 格。计入项目 {total}。',
      ar: 'العرض {width}: {depth} صفوف × {width} أعمدة = {cells} خلية. العناصر المعدودة: {total}.',
      es: 'Ancho {width}: {depth} filas x {width} columnas = {cells} celdas. Elementos contados: {total}.',
      fr: 'Largeur {width} : {depth} lignes x {width} colonnes = {cells} cases. Éléments comptés : {total}.',
      hi: 'चौड़ाई {width}: {depth} पंक्तियाँ x {width} स्तंभ = {cells} खाने। गिने गए आइटम: {total}.',
      id: 'Lebar {width}: {depth} baris x {width} kolom = {cells} sel. Item yang dihitung: {total}.',
      pt: 'Largura {width}: {depth} linhas x {width} colunas = {cells} células. Itens contados: {total}.',
    },
    'caption.reads': {
      en: 'Reading all {keyCount} keys back. Overshoot total: {errorSum}. Exact hits: {exact}.',
      ko: '키 {keyCount} 개를 모두 되읽는다. 부푼 양의 합은 {errorSum}, 정확히 맞은 키 수는 {exact}.',
      ja: '{keyCount} 個のキーをすべて読み戻す。膨らみの合計 {errorSum}、ぴたり当たり {exact}。',
      zh: '把全部 {keyCount} 个键读回。膨胀总量 {errorSum}，精确命中 {exact}。',
      ar: 'قراءة كل المفاتيح {keyCount}. مجموع التضخّم: {errorSum}. الإصابات الدقيقة: {exact}.',
      es: 'Se releen las {keyCount} claves. Exceso total: {errorSum}. Aciertos exactos: {exact}.',
      fr: 'Relecture des {keyCount} clés. Excès total : {errorSum}. Coups exacts : {exact}.',
      hi: 'सभी {keyCount} कुंजियाँ वापस पढ़ी गईं। कुल अधिकता: {errorSum}. सटीक मिलान: {exact}.',
      id: 'Membaca kembali seluruh {keyCount} kunci. Total kelebihan: {errorSum}. Tepat sasaran: {exact}.',
      pt: 'Releitura das {keyCount} chaves. Excesso total: {errorSum}. Acertos exatos: {exact}.',
    },
    'caption.done': {
      en: 'Narrower table, more swollen reads. Overshoot at {cellsMin} cells: {errorMax}. At {cellsMax} cells: {errorMin}.',
      ko: '표가 좁을수록 읽힌 값이 더 부푼다. 부푼 양은 칸 {cellsMin} 에서 {errorMax}, 칸 {cellsMax} 에서 {errorMin}.',
      ja: '表が狭いほど読み値は膨らむ。膨らみはセル {cellsMin} で {errorMax}、セル {cellsMax} で {errorMin}。',
      zh: '表越窄，读数越膨胀。膨胀量在 {cellsMin} 格时为 {errorMax}，在 {cellsMax} 格时为 {errorMin}。',
      ar: 'كلما ضاق الجدول تضخّمت القراءات. التضخّم عند {cellsMin} خلية: {errorMax}، وعند {cellsMax} خلية: {errorMin}.',
      es: 'Tabla más estrecha, lecturas más hinchadas. Exceso con {cellsMin} celdas: {errorMax}. Con {cellsMax} celdas: {errorMin}.',
      fr: 'Table plus étroite, lectures plus gonflées. Excès à {cellsMin} cases : {errorMax}. À {cellsMax} cases : {errorMin}.',
      hi: 'तालिका जितनी सँकरी, पाठ उतने फूले। {cellsMin} खानों पर अधिकता: {errorMax}. {cellsMax} खानों पर: {errorMin}.',
      id: 'Tabel makin sempit, bacaan makin menggelembung. Kelebihan pada {cellsMin} sel: {errorMax}. Pada {cellsMax} sel: {errorMin}.',
      pt: 'Tabela mais estreita, leituras mais inchadas. Excesso com {cellsMin} células: {errorMax}. Com {cellsMax} células: {errorMin}.',
    },
    'label.trueValue': {
      en: 'true = {truth}',
      ko: '참값 = {truth}',
      ja: '真値 = {truth}',
      zh: '真值 = {truth}',
      ar: 'القيمة الحقيقية = {truth}',
      es: 'real = {truth}',
      fr: 'vrai = {truth}',
      hi: 'सही = {truth}',
      id: 'asli = {truth}',
      pt: 'real = {truth}',
    },
    'label.readValue': {
      en: 'read value',
      ko: '읽힌 값',
      ja: '読み出し値',
      zh: '读出值',
      ar: 'القيمة المقروءة',
      es: 'valor leído',
      fr: 'valeur lue',
      hi: 'पढ़ा गया मान',
      id: 'nilai terbaca',
      pt: 'valor lido',
    },
  },
};
