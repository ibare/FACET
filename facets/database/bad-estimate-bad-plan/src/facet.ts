import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

/**
 * @piece
 * 줄 수 짐작이 틀리면 옵티마이저의 선택은 어떻게 되는가.
 *
 * @notation native
 * SQL 은 질의 언어 자체가 주장의 소재라 그대로 쓴다. 연산자 이름(Seq Scan · Index Scan)도 EXPLAIN 표기 그대로 자료다.
 */
export const badEstimateBadPlanFacet: FacetJson = {
  id: 'facet:badEstimateBadPlan',
  title: {
    en: 'A bad estimate picks a bad plan',
    ko: '짐작이 틀리면 길도 틀린다',
    ja: '見積もりを誤ると実行計画も誤る',
    zh: '估算错了，计划也就错了',
    ar: 'تقدير خاطئ يختار خطة خاطئة',
    es: 'Una mala estimación elige un mal plan',
    fr: 'Une mauvaise estimation choisit un mauvais plan',
    hi: 'गलत अनुमान, गलत योजना',
    id: 'Perkiraan keliru memilih rencana keliru',
    pt: 'Uma estimativa errada escolhe um plano errado',
  },
  description: {
    en: 'The optimizer guesses the row count from statistics, picks the cheaper path, and then the real row count flips the order of the two costs.',
    ko: '옵티마이저가 통계로 줄 수를 짐작해 싼 길을 고르고, 실제 줄 수가 들어오자 두 길의 비용 차례가 뒤집힌다.',
    ja: 'オプティマイザは統計から行数を見積もって安い経路を選ぶが、実際の行数が入ると二つの経路のコストの順が逆転する。',
    zh: '优化器根据统计信息估算行数并选择较便宜的路径，而实际行数一出现，两条路径的代价顺序就颠倒了。',
    ar: 'يخمّن المُحسِّن عدد الصفوف من الإحصاءات ويختار المسار الأرخص، ثم يقلب العدد الفعلي للصفوف ترتيب التكلفتين.',
    es: 'El optimizador estima el número de filas con las estadísticas y elige el camino más barato; luego el número real de filas invierte el orden de los dos costes.',
    fr: "L'optimiseur estime le nombre de lignes à partir des statistiques et choisit le chemin le moins cher ; le vrai nombre de lignes inverse ensuite l'ordre des deux coûts.",
    hi: 'ऑप्टिमाइज़र आँकड़ों से पंक्तियों की संख्या का अनुमान लगाकर सस्ता रास्ता चुनता है, फिर असली संख्या आते ही दोनों लागतों का क्रम उलट जाता है।',
    id: 'Optimizer menebak jumlah baris dari statistik dan memilih jalur yang lebih murah, lalu jumlah baris sebenarnya membalik urutan kedua biaya.',
    pt: 'O otimizador estima o número de linhas pelas estatísticas e escolhe o caminho mais barato; depois o número real de linhas inverte a ordem dos dois custos.',
  },
  algorithm: 'module:badEstimateBadPlan',
  scene: 'module:badEstimateBadPlanScene',
  initialData: {
    type: 'bad-estimate-bad-plan',
    stepMs: 2200,
    sql: "SELECT * FROM users WHERE city = 'Seoul'",
    table: 'users',
    column: 'city',
    value: 'Seoul',
    stats: { rows: 300, pages: 30, distinct: 30 },
    actual: { match: 155, otherValues: 29, rowsPerOther: 5 },
    descent: 3,
    paths: ['Seq Scan', 'Index Scan'],
  },
  shuffleOnReset: false,
  messages: {
    'label.rows': {
      en: 'Rows: {n}', ko: '줄: {n}', ja: '行数: {n}', zh: '行数: {n}', ar: 'الصفوف: {n}',
      es: 'Filas: {n}', fr: 'Lignes : {n}', hi: 'पंक्तियाँ: {n}', id: 'Baris: {n}', pt: 'Linhas: {n}',
    },
    'label.pages': {
      en: 'Pages: {n}', ko: '페이지: {n}', ja: 'ページ: {n}', zh: '页数: {n}', ar: 'الصفحات: {n}',
      es: 'Páginas: {n}', fr: 'Pages : {n}', hi: 'पेज: {n}', id: 'Halaman: {n}', pt: 'Páginas: {n}',
    },
    'label.distinct': {
      en: 'Distinct {col}: {n}', ko: '서로 다른 {col}: {n}', ja: '{col} の異なる値: {n}', zh: '{col} 不同值: {n}',
      ar: 'قيم {col} المختلفة: {n}', es: '{col} distintos: {n}', fr: '{col} distincts : {n}',
      hi: 'अलग-अलग {col}: {n}', id: '{col} berbeda: {n}', pt: '{col} distintos: {n}',
    },
    'label.estimate': {
      en: 'Estimate: {n}', ko: '추정: {n}', ja: '見積もり: {n}', zh: '估算: {n}', ar: 'التقدير: {n}',
      es: 'Estimación: {n}', fr: 'Estimation : {n}', hi: 'अनुमान: {n}', id: 'Perkiraan: {n}', pt: 'Estimativa: {n}',
    },
    'label.actual': {
      en: 'Actual: {n}', ko: '실제: {n}', ja: '実際: {n}', zh: '实际: {n}', ar: 'الفعلي: {n}',
      es: 'Real: {n}', fr: 'Réel : {n}', hi: 'वास्तविक: {n}', id: 'Sebenarnya: {n}', pt: 'Real: {n}',
    },
    'label.others': {
      en: 'Other values', ko: '나머지 값', ja: 'その他の値', zh: '其余值', ar: 'القيم الأخرى',
      es: 'Otros valores', fr: 'Autres valeurs', hi: 'बाकी मान', id: 'Nilai lainnya', pt: 'Outros valores',
    },
    'label.order': {
      en: 'Fewer pages on top', ko: '적게 읽는 길이 위', ja: '読むページが少ない経路が上', zh: '读页少的路径在上',
      ar: 'الأقل صفحات في الأعلى', es: 'Menos páginas arriba', fr: 'Moins de pages en haut',
      hi: 'कम पेज वाला ऊपर', id: 'Halaman lebih sedikit di atas', pt: 'Menos páginas em cima',
    },
    'label.indexPage': {
      en: 'Index page', ko: '인덱스 페이지', ja: 'インデックスページ', zh: '索引页', ar: 'صفحة فهرس',
      es: 'Página de índice', fr: "Page d'index", hi: 'इंडेक्स पेज', id: 'Halaman indeks', pt: 'Página de índice',
    },
    'label.tablePage': {
      en: 'Table page', ko: '표 페이지', ja: 'テーブルページ', zh: '表页', ar: 'صفحة جدول',
      es: 'Página de tabla', fr: 'Page de table', hi: 'टेबल पेज', id: 'Halaman tabel', pt: 'Página de tabela',
    },
    'label.extraPage': {
      en: 'Beyond estimate', ko: '추정 밖', ja: '見積もり超過', zh: '超出估算', ar: 'خارج التقدير',
      es: 'Fuera de la estimación', fr: "Au-delà de l'estimation", hi: 'अनुमान से बाहर', id: 'Di luar perkiraan',
      pt: 'Além da estimativa',
    },
    'label.costHead': {
      en: 'Estimate', ko: '추정', ja: '見積もり', zh: '估算', ar: 'التقدير',
      es: 'Estimación', fr: 'Estimation', hi: 'अनुमान', id: 'Perkiraan', pt: 'Estimativa',
    },
    'label.costHeadBoth': {
      en: 'Estimate → Actual', ko: '추정 → 실제', ja: '見積もり → 実際', zh: '估算 → 实际', ar: 'التقدير ← الفعلي',
      es: 'Estimación → Real', fr: 'Estimation → Réel', hi: 'अनुमान → वास्तविक', id: 'Perkiraan → Sebenarnya',
      pt: 'Estimativa → Real',
    },
    'label.costChange': {
      en: '{from} → {to}', ko: '{from} → {to}', ja: '{from} → {to}', zh: '{from} → {to}', ar: '{from} ← {to}',
      es: '{from} → {to}', fr: '{from} → {to}', hi: '{from} → {to}', id: '{from} → {to}', pt: '{from} → {to}',
    },
    'label.picked': {
      en: 'Picked', ko: '고름', ja: '選択', zh: '已选', ar: 'المختار',
      es: 'Elegido', fr: 'Choisi', hi: 'चुना', id: 'Dipilih', pt: 'Escolhido',
    },
    'caption.start': {
      en: 'Only statistics — rows per {col} value are not in them.',
      ko: '통계뿐이다 — {col} 값마다 몇 줄인지는 들어 있지 않다.',
      ja: '統計だけ — {col} の値ごとの行数は入っていない。',
      zh: '只有统计信息 — 其中没有每个 {col} 值的行数。',
      ar: 'إحصاءات فقط — لا تتضمن عدد الصفوف لكل قيمة من {col}.',
      es: 'Solo estadísticas: no incluyen las filas por cada valor de {col}.',
      fr: 'Seulement des statistiques — les lignes par valeur de {col} n’y sont pas.',
      hi: 'केवल आँकड़े — हर {col} मान की पंक्तियाँ इनमें नहीं हैं।',
      id: 'Hanya statistik — jumlah baris per nilai {col} tidak ada di dalamnya.',
      pt: 'Só estatísticas — as linhas por valor de {col} não estão nelas.',
    },
    'caption.estimate': {
      en: 'Estimate per value: {rows} ÷ {distinct} = {est}',
      ko: '값 하나의 추정: {rows} ÷ {distinct} = {est}',
      ja: '値ひとつの見積もり: {rows} ÷ {distinct} = {est}',
      zh: '每个值的估算: {rows} ÷ {distinct} = {est}',
      ar: 'التقدير لكل قيمة: {rows} ÷ {distinct} = {est}',
      es: 'Estimación por valor: {rows} ÷ {distinct} = {est}',
      fr: 'Estimation par valeur : {rows} ÷ {distinct} = {est}',
      hi: 'हर मान का अनुमान: {rows} ÷ {distinct} = {est}',
      id: 'Perkiraan per nilai: {rows} ÷ {distinct} = {est}',
      pt: 'Estimativa por valor: {rows} ÷ {distinct} = {est}',
    },
    'caption.pick': {
      en: 'Estimated pages — {pick}: {cp} · {other}: {co}. Picked: {pick}',
      ko: '추정 페이지 — {pick}: {cp} · {other}: {co}. 고른 길: {pick}',
      ja: '見積もりページ — {pick}: {cp} · {other}: {co}。選択: {pick}',
      zh: '估算页数 — {pick}: {cp} · {other}: {co}。选择: {pick}',
      ar: 'الصفحات المقدّرة — {pick}: {cp} · {other}: {co}. المختار: {pick}',
      es: 'Páginas estimadas — {pick}: {cp} · {other}: {co}. Elegido: {pick}',
      fr: 'Pages estimées — {pick} : {cp} · {other} : {co}. Choisi : {pick}',
      hi: 'अनुमानित पेज — {pick}: {cp} · {other}: {co}. चुना: {pick}',
      id: 'Halaman perkiraan — {pick}: {cp} · {other}: {co}. Dipilih: {pick}',
      pt: 'Páginas estimadas — {pick}: {cp} · {other}: {co}. Escolhido: {pick}',
    },
    'caption.actual': {
      en: 'Actual rows for {value}: {actual}. Estimated: {est}',
      ko: '실제 줄 — {value}: {actual}. 추정: {est}',
      ja: '{value} の実際の行数: {actual}。見積もり: {est}',
      zh: '{value} 的实际行数: {actual}。估算: {est}',
      ar: 'الصفوف الفعلية لـ {value}: {actual}. التقدير: {est}',
      es: 'Filas reales de {value}: {actual}. Estimadas: {est}',
      fr: 'Lignes réelles pour {value} : {actual}. Estimées : {est}',
      hi: '{value} की असली पंक्तियाँ: {actual}. अनुमान: {est}',
      id: 'Baris sebenarnya untuk {value}: {actual}. Perkiraan: {est}',
      pt: 'Linhas reais de {value}: {actual}. Estimadas: {est}',
    },
    'caption.actualCost': {
      en: 'Actual pages — {pick}: {cp} · {other}: {co}. Plan stays: {pick}',
      ko: '실제 페이지 — {pick}: {cp} · {other}: {co}. 고른 길은 그대로: {pick}',
      ja: '実際のページ — {pick}: {cp} · {other}: {co}。計画はそのまま: {pick}',
      zh: '实际页数 — {pick}: {cp} · {other}: {co}。计划不变: {pick}',
      ar: 'الصفحات الفعلية — {pick}: {cp} · {other}: {co}. الخطة باقية: {pick}',
      es: 'Páginas reales — {pick}: {cp} · {other}: {co}. El plan sigue: {pick}',
      fr: 'Pages réelles — {pick} : {cp} · {other} : {co}. Le plan reste : {pick}',
      hi: 'असली पेज — {pick}: {cp} · {other}: {co}. योजना वही: {pick}',
      id: 'Halaman sebenarnya — {pick}: {cp} · {other}: {co}. Rencana tetap: {pick}',
      pt: 'Páginas reais — {pick}: {cp} · {other}: {co}. O plano fica: {pick}',
    },
  },
  blocks: {
    stage: { type: 'bad-estimate-bad-plan-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
};
