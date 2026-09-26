import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

/**
 * @piece
 * 질문: 3×3 창의 합성곱 층을 셋 쌓으면, 맨 위 층의 한 칸은 입력의 몇 칸에 기대어 셈해지는가?
 */
export const fieldGrowsWithDepthFacet: FacetJson = {
  id: 'facet:fieldGrowsWithDepth',
  title: {
    en: 'The field grows with depth',
    ko: '깊어질수록 넓게 본다',
    ja: '深くなるほど広く見る',
    zh: '越深看得越广',
    ar: 'كلما تعمّقت الطبقات اتسع ما تراه',
    es: 'Cuanto más profundo, más amplio el campo',
    fr: 'Plus c’est profond, plus le champ s’élargit',
    hi: 'जितनी गहराई, उतना चौड़ा दायरा',
    id: 'Makin dalam, makin luas yang dilihat',
    pt: 'Quanto mais fundo, mais amplo o campo',
  },
  description: {
    en: 'Stack three convolution layers with 3×3 windows. Start from one cell of the top layer and go down one layer at a time: the cells it relies on spread one cell in every direction, reaching 7×7 in the input.',
    ko: '3×3 창의 합성곱 층을 셋 쌓는다. 맨 위 층의 칸 하나에서 출발해 한 층씩 내려가면, 그 칸이 기대는 자리가 사방으로 한 칸씩 번져 입력에서 7×7 이 된다.',
    ja: '3×3 の窓を持つ畳み込み層を三つ重ねる。最上層の一マスから一層ずつ下りると、そのマスが頼る範囲が四方に一マスずつ広がり、入力では 7×7 になる。',
    zh: '叠三层 3×3 窗口的卷积层。从最上层的一个格出发逐层向下，它所依赖的格向四周各扩一格，到输入层时成为 7×7。',
    ar: 'نكدّس ثلاث طبقات التفاف بنوافذ 3×3. نبدأ من خلية واحدة في الطبقة العليا وننزل طبقةً طبقة: تتسع الخلايا التي تعتمد عليها خليةً في كل اتجاه حتى تبلغ 7×7 في المدخل.',
    es: 'Se apilan tres capas de convolución con ventanas de 3×3. Desde una celda de la capa superior, bajando capa a capa, las celdas de las que depende se extienden una celda en cada dirección hasta ocupar 7×7 en la entrada.',
    fr: 'On empile trois couches de convolution à fenêtres 3×3. En partant d’une cellule de la couche du haut et en descendant couche par couche, les cellules dont elle dépend s’étendent d’une cellule dans chaque direction, jusqu’à 7×7 dans l’entrée.',
    hi: '3×3 विंडो वाली तीन कन्वोल्यूशन परतें एक के ऊपर एक रखें। सबसे ऊपरी परत के एक खाने से शुरू करके एक-एक परत नीचे जाएँ: जिन खानों पर वह निर्भर है वे हर दिशा में एक खाना फैलते हैं और इनपुट में 7×7 हो जाते हैं।',
    id: 'Tumpuk tiga lapisan konvolusi berjendela 3×3. Mulai dari satu sel di lapisan teratas lalu turun satu lapisan demi satu: sel yang diandalkannya melebar satu sel ke segala arah hingga 7×7 di input.',
    pt: 'Empilham-se três camadas de convolução com janelas 3×3. Partindo de uma célula da camada do topo e descendo camada a camada, as células de que ela depende se espalham uma célula em cada direção, até 7×7 na entrada.',
  },
  algorithm: 'module:fieldGrowsWithDepth',
  scene: 'module:fieldGrowsWithDepthScene',
  initialData: {
    type: 'field-grows-with-depth',
    stepMs: 2200,
    inputSize: 7,
    kernel: 3,
    stride: 1,
    layers: ['input', 'layer1', 'layer2', 'layer3'],
    start: { row: 0, col: 0 },
  },
  shuffleOnReset: false,
  messages: {
    'label.input': {
      en: 'Input', ko: '입력', ja: '入力', zh: '输入', ar: 'المدخل',
      es: 'Entrada', fr: 'Entrée', hi: 'इनपुट', id: 'Input', pt: 'Entrada',
    },
    'label.layer1': {
      en: 'Layer 1', ko: '층 1', ja: '層 1', zh: '第 1 层', ar: 'الطبقة 1',
      es: 'Capa 1', fr: 'Couche 1', hi: 'परत 1', id: 'Lapisan 1', pt: 'Camada 1',
    },
    'label.layer2': {
      en: 'Layer 2', ko: '층 2', ja: '層 2', zh: '第 2 层', ar: 'الطبقة 2',
      es: 'Capa 2', fr: 'Couche 2', hi: 'परत 2', id: 'Lapisan 2', pt: 'Camada 2',
    },
    'label.layer3': {
      en: 'Layer 3', ko: '층 3', ja: '層 3', zh: '第 3 层', ar: 'الطبقة 3',
      es: 'Capa 3', fr: 'Couche 3', hi: 'परत 3', id: 'Lapisan 3', pt: 'Camada 3',
    },
    'label.window': {
      en: 'window', ko: '창', ja: '窓', zh: '窗口', ar: 'النافذة',
      es: 'ventana', fr: 'fenêtre', hi: 'विंडो', id: 'jendela', pt: 'janela',
    },
    'label.size': {
      en: '{n} × {n}', ko: '{n} × {n}', ja: '{n} × {n}', zh: '{n} × {n}', ar: '{n} × {n}',
      es: '{n} × {n}', fr: '{n} × {n}', hi: '{n} × {n}', id: '{n} × {n}', pt: '{n} × {n}',
    },
    'caption.start': {
      en: 'Start in {layer}: {side} × {side} = {n}',
      ko: '출발 — {layer}: {side} × {side} = {n}',
      ja: '出発 — {layer}: {side} × {side} = {n}',
      zh: '起点 — {layer}：{side} × {side} = {n}',
      ar: 'البداية — {layer}: {side} × {side} = {n}',
      es: 'Inicio en {layer}: {side} × {side} = {n}',
      fr: 'Départ dans {layer} : {side} × {side} = {n}',
      hi: 'शुरुआत — {layer}: {side} × {side} = {n}',
      id: 'Mulai di {layer}: {side} × {side} = {n}',
      pt: 'Início em {layer}: {side} × {side} = {n}',
    },
    'caption.spread': {
      en: 'Relied on in {layer}: {side} × {side} = {n}',
      ko: '기대는 칸 — {layer}: {side} × {side} = {n}',
      ja: '頼るマス — {layer}: {side} × {side} = {n}',
      zh: '所依赖的格 — {layer}：{side} × {side} = {n}',
      ar: 'الخلايا المعتمَد عليها — {layer}: {side} × {side} = {n}',
      es: 'Celdas de las que depende — {layer}: {side} × {side} = {n}',
      fr: 'Cellules dont elle dépend — {layer} : {side} × {side} = {n}',
      hi: 'जिन खानों पर निर्भर — {layer}: {side} × {side} = {n}',
      id: 'Sel yang diandalkan — {layer}: {side} × {side} = {n}',
      pt: 'Células de que depende — {layer}: {side} × {side} = {n}',
    },
  },
  blocks: {
    stage: { type: 'field-grows-with-depth-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
};
