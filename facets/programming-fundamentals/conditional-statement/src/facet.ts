/**
 * Conditional Statement facet JSON 선언.
 *
 * 진행 모델: 정적 + 입력 반응형 (ReactiveMechanism). 시간 축 없이 입력값
 * 슬라이더가 평가 마름모의 응결과 활성 가지를 직접 흔든다.
 *
 * 컨트롤바 어휘 (기획 §6 §8):
 *   [ mode-toggle (2갈래/3갈래) ] [ auto-demo ] [ reset ]
 *
 * 슬라이더 자체는 view 가 SVG 인-스테이지로 그려 dispatch 채널에 직접 송신.
 *
 * 도식 규칙 (학습 단순화) — `value >= threshold` 사슬:
 *   2갈래: 값 ≥ 50 → 덥다 / 그 외 → 시원하다 (초기 70 → "덥다")
 *   3갈래: 값 ≥ 80 → 뜨겁다 / 값 ≥ 50 → 따뜻하다 / 그 외 → 시원하다
 *          (초기 70 → "따뜻하다", 모드 전환 시 첫 가지가 켜지는 인상은 70 에서도
 *           유지되지 않으므로 auto-demo 로 모든 가지 점등을 한 번 보여준다.)
 *
 * 식별자 (C1): `flow:` `diamond:` `branch:` `block:` `merge:` 명시 prefix.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL } from '@ffacet/core/runtime';

export const conditionalStatementFacet: FacetJson = {
  id: 'facet:conditionalStatement',
  title: { en: 'If / Else If / Else', ko: '조건문 (if / else if / else)', ja: 'if / else if / else', zh: 'if / else if / else', ar: 'if / else if / else', es: 'if / else if / else', fr: 'if / else if / else', hi: 'if / else if / else', id: 'if / else if / else', pt: 'if / else if / else' },
  description: { en: 'A flow that hits a fork, evaluates each condition top-down, lights exactly one branch on the first true, and merges back into a single line', ko: '흐르던 길이 분기점에 도착해 조건의 참/거짓을 위에서부터 평가하다 처음 참이 된 한 가지에서 흐름이 확정되고, 나머지 가지는 어두워진 채 닫힌 뒤 다시 한 줄로 합쳐지는 약속', ja: '流れが分かれ道に着き、条件を上から順に見ていって最初に真になった一つの枝だけを灯し、また一本の線に合流する', zh: '流走到岔路口，自上而下逐个判断条件，在第一个为真处只点亮一条分支，然后重新汇成一条线', ar: 'تدفق يبلغ مفترقًا فيقيّم الشروط من الأعلى إلى الأسفل، يضيء فرعًا واحدًا عند أول شرط صحيح، ثم يعود ليندمج في سطر واحد', es: 'Un flujo llega a una bifurcación, evalúa las condiciones de arriba abajo, enciende exactamente una rama en la primera verdadera y vuelve a fundirse en una sola línea', fr: 'Un flux atteint une bifurcation, évalue les conditions de haut en bas, allume exactement une branche à la première vraie, puis se rassemble en une seule ligne', hi: 'प्रवाह दोराहे पर पहुँचता है, शर्तों को ऊपर से नीचे जाँचता है, पहली सत्य पर ठीक एक शाखा जलाता है, और फिर एक ही रेखा में मिल जाता है', id: 'Alur tiba di persimpangan, menilai syarat dari atas ke bawah, menyalakan tepat satu cabang pada yang pertama benar, lalu menyatu lagi jadi satu baris', pt: 'Um fluxo chega a uma bifurcação, avalia as condições de cima para baixo, acende exatamente um ramo na primeira verdadeira e volta a se fundir numa só linha' },
  algorithm: 'module:conditionalStatement',
  projector: 'module:conditionalStatementProjector',
  initialData: {
    type: 'conditional-statement',
    initialMode: 'two',
    initialValue: 70,
    rulesByMode: {
      two: {
        rules: [
          {
            diamondId: 'if',
            expr: '값 ≥ 50',
            threshold: 50,
            trueBranchId: 'then',
            trueBlockId: 'then',
            trueBlockLabel: '덥다',
          },
        ],
        else: { branchId: 'else', blockId: 'else', blockLabel: '시원하다' },
      },
      three: {
        rules: [
          {
            diamondId: 'if',
            expr: '값 ≥ 80',
            threshold: 80,
            trueBranchId: 'then',
            trueBlockId: 'then',
            trueBlockLabel: '뜨겁다',
          },
          {
            diamondId: 'elif',
            expr: '값 ≥ 50',
            threshold: 50,
            trueBranchId: 'elif-then',
            trueBlockId: 'elif-then',
            trueBlockLabel: '따뜻하다',
          },
        ],
        else: { branchId: 'else', blockId: 'else', blockLabel: '시원하다' },
      },
    },
    pulseMs: 220,
    autoDemoHoldMs: 1100,
    autoDemoValues: [90, 65, 25, 70],
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      { ref: 'stage', padding: '8px 0' },
      { ref: 'controls' },
    ],
  },
  messages: {
    'label.concept': {
      en: 'concept',
      ko: '개념',
      ja: '概念',
      zh: '概念',
      ar: 'المفهوم',
      es: 'concepto',
      fr: 'concept',
      hi: 'संकल्पना',
      id: 'konsep',
      pt: 'conceito',
    },
    'label.false': {
      en: 'false',
      ko: '거짓',
      ja: '偽',
      zh: '假',
      ar: 'خطأ',
      es: 'falso',
      fr: 'faux',
      hi: 'असत्य',
      id: 'salah',
      pt: 'falso',
    },
    'label.guide': {
      en: 'how to explore',
      ko: '학습자 안내',
      ja: '試し方',
      zh: '如何探索',
      ar: 'كيف تجرّب',
      es: 'cómo explorar',
      fr: 'comment explorer',
      hi: 'कैसे आज़माएँ',
      id: 'cara menjelajah',
      pt: 'como explorar',
    },
    'label.nextCode': {
      en: 'next code',
      ko: '다음 코드',
      ja: '次のコード',
      zh: '后续代码',
      ar: 'الشيفرة التالية',
      es: 'código siguiente',
      fr: 'code suivant',
      hi: 'अगला कोड',
      id: 'kode berikutnya',
      pt: 'código seguinte',
    },
    'label.title': {
      en: 'Conditional — one beat of condensation',
      ko: '조건문 — 한 박자의 응결',
      ja: '条件分岐 — 一拍の凝結',
      zh: '条件语句 — 一拍的凝结',
      ar: 'الشرط — تكثّف في نبضة واحدة',
      es: 'Condicional: una condensación en un solo compás',
      fr: 'Conditionnelle — une condensation en un temps',
      hi: 'शर्त — एक ताल का संघनन',
      id: 'Percabangan — satu ketuk pengembunan',
      pt: 'Condicional — uma condensação num só compasso',
    },
    'label.true': {
      en: 'true',
      ko: '참',
      ja: '真',
      zh: '真',
      ar: 'صحيح',
      es: 'verdadero',
      fr: 'vrai',
      hi: 'सत्य',
      id: 'benar',
      pt: 'verdadeiro',
    },
    'label.value': {
      en: 'value',
      ko: '값',
      ja: '値',
      zh: '值',
      ar: 'القيمة',
      es: 'valor',
      fr: 'valeur',
      hi: 'मान',
      id: 'nilai',
      pt: 'valor',
    },
    'caption.autoDemo': {
      en: 'Self-demonstration — the path changes with the value.',
      ko: '자동 시연 — 값에 따라 길이 바뀐다.',
      ja: '自動デモ — 値によって通る道が変わります。',
      zh: '自动演示 — 走的路随值而变。',
      ar: 'عرض تلقائي — يتغيّر المسار بتغيّر القيمة.',
      es: 'Autodemostración: el camino cambia con el valor.',
      fr: 'Auto-démonstration — le chemin change avec la valeur.',
      hi: 'स्वतः प्रदर्शन — मान के साथ रास्ता बदलता है।',
      id: 'Peragaan otomatis — jalurnya berubah mengikuti nilai.',
      pt: 'Autodemonstração — o caminho muda com o valor.',
    },
    'caption.demoEnd': {
      en: 'Self-demonstration finished.',
      ko: '자동 시연 종료.',
      ja: '自動デモが終わりました。',
      zh: '自动演示结束。',
      ar: 'انتهى العرض التلقائي.',
      es: 'Autodemostración terminada.',
      fr: 'Auto-démonstration terminée.',
      hi: 'स्वतः प्रदर्शन समाप्त।',
      id: 'Peragaan otomatis selesai.',
      pt: 'Autodemonstração concluída.',
    },
    'caption.ignoredInput': {
      en: 'Input ignored — {op}: {raw}',
      ko: '입력 무시 — {op}: {raw}',
      ja: '入力を無視しました — {op}: {raw}',
      zh: '忽略了输入 — {op}: {raw}',
      ar: 'تُجوهل الإدخال — {op}: {raw}',
      es: 'Entrada ignorada — {op}: {raw}',
      fr: 'Saisie ignorée — {op} : {raw}',
      hi: 'इनपुट अनदेखा किया गया — {op}: {raw}',
      id: 'Masukan diabaikan — {op}: {raw}',
      pt: 'Entrada ignorada — {op}: {raw}',
    },
    'caption.threeWay': {
      en: 'Three ways — it unfolds as an if / else if / else chain.',
      ko: '3갈래 — if / else if / else 사슬로 펼쳐진다.',
      ja: '三分岐 — if / else if / else の連鎖として開かれます。',
      zh: '三条路 — 展开成 if / else if / else 链。',
      ar: 'ثلاثة طرق — تنفتح كسلسلة if / else if / else.',
      es: 'Tres vías: se despliega como una cadena if / else if / else.',
      fr: 'Trois voies — cela se déploie en chaîne if / else if / else.',
      hi: 'तीन राहें — यह if / else if / else शृंखला के रूप में खुलता है।',
      id: 'Tiga jalan — terbentang sebagai rantai if / else if / else.',
      pt: 'Três caminhos — desdobra-se como uma cadeia if / else if / else.',
    },
    'caption.twoWay': {
      en: 'Two ways — it folds into a single if / else diamond.',
      ko: '2갈래 — if / else 한 마름모로 합쳐진다.',
      ja: '二分岐 — 一つの菱形に畳み込まれます。',
      zh: '两条路 — 折成一个 if / else 菱形。',
      ar: 'طريقان — ينطويان في معيّن if / else واحد.',
      es: 'Dos vías: se pliega en un solo rombo if / else.',
      fr: 'Deux voies — cela se replie en un seul losange if / else.',
      hi: 'दो राहें — यह एक ही if / else समचतुर्भुज में सिमट जाता है।',
      id: 'Dua jalan — melipat jadi satu belah ketupat if / else.',
      pt: 'Dois caminhos — dobra-se num único losango if / else.',
    },
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'conditional-flowchart' },
    controls: {
      type: 'control-bar',
      controls: [
        {
          widget: 'button',
          action: 'mode-toggle',
          label: { en: 'Branches: 2 / 3', ko: '갈래 2 / 3', ja: '分岐: 2 / 3', zh: '分支: 2 / 3', ar: 'الفروع: ٢ / ٣', es: 'Ramas: 2 / 3', fr: 'Branches : 2 / 3', hi: 'शाखाएँ: 2 / 3', id: 'Cabang: 2 / 3', pt: 'Ramos: 2 / 3' },
        },
        CONTROL.autoDemo,
        CONTROL.reset,
      ],
    },
  },
};
