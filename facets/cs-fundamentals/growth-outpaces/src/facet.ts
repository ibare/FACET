/**
 * growth-outpaces — 최고차항 지배. **@piece**
 *
 * 답하는 질문 하나: **입력이 커지면 왜 최고차항만 남는가.**
 *
 * 선언에 두는 것은 계수 셋과 n 사다리, 그리고 읽을 시간뿐이다. 항의 값도 합도
 * 몫도 세 항이 같아지는 자리도 알고리즘이 그 자리에서 셈한다 — 파생값을 여기
 * 옮겨 적으면 저작자의 오타가 그대로 화면에 뜬다.
 *
 * 좌표는 없다. 어디에 무엇을 놓을지는 질문이 정하는 형태의 일부라 stage 가
 * 캔버스에서 역산한다 (S-piece).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const growthOutpacesFacet: FacetJson = {
  id: 'facet:growthOutpaces',
  title: {
    en: 'The biggest term eats the rest',
    ko: '큰 항이 나머지를 먹는다',
    ja: '最大の項が残りを飲み込む',
    zh: '最大的项吞掉其余',
    ar: 'الحد الأكبر يبتلع البقية',
    es: 'El término mayor se come al resto',
    fr: 'Le terme dominant dévore les autres',
    hi: 'सबसे बड़ा पद बाकी को निगल जाता है',
    id: 'Suku terbesar melahap sisanya',
    pt: 'O termo maior devora os demais',
  },
  description: {
    en: 'n² + 10n + 100 split into three shares of one bar: as n climbs, n² swallows the others.',
    ko: 'n² + 10n + 100 을 한 막대의 세 몫으로 쪼갠다. n 이 커지면 n² 가 나머지를 삼킨다.',
    ja: 'n² + 10n + 100 を1本の帯の3つの取り分に分ける。n が大きくなると n² が残りを飲み込む。',
    zh: '把 n² + 10n + 100 拆成一根条的三份:n 变大时,n² 吞掉其余两项。',
    ar: 'تقسيم n² + 10n + 100 إلى ثلاثة أنصبة من شريط واحد: كلما كبر n ابتلع n² الباقي.',
    es: 'n² + 10n + 100 repartido en tres partes de una barra: al crecer n, n² se traga a las demás.',
    fr: "n² + 10n + 100 réparti en trois parts d'une même barre : quand n grandit, n² avale les autres.",
    hi: 'n² + 10n + 100 को एक पट्टी के तीन हिस्सों में बाँटा गया: n बढ़ने पर n² बाकी को निगल लेता है।',
    id: 'n² + 10n + 100 dibagi menjadi tiga bagian dari satu batang: saat n membesar, n² menelan sisanya.',
    pt: 'n² + 10n + 100 dividido em três partes de uma barra: quando n cresce, n² engole as outras.',
  },
  algorithm: 'module:growthOutpaces',
  projector: 'module:growthOutpacesProjector',
  initialData: {
    type: 'growth-outpaces',
    quadratic: 1,
    linear: 10,
    constant: 100,
    ladder: [1, 5, 10, 50, 100, 1000],
    stepMs: 900,
  },
  blocks: {
    stage: { type: 'growth-outpaces-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.begin': {
      en: 'One formula, three terms, one bar. At n = {n} the largest term holds {pct}% of it.',
      ko: '한 식, 세 항, 한 막대. n = {n} 에서 가장 큰 항의 몫은 {pct}%.',
      ja: '1つの式、3つの項、1本の帯。n = {n} で最も大きい項の取り分は {pct}%。',
      zh: '一个式子,三个项,一根条。n = {n} 时最大的项占 {pct}%。',
      ar: 'معادلة واحدة وثلاثة حدود وشريط واحد. عند n = {n} يشغل أكبر الحدود {pct}% منه.',
      es: 'Una fórmula, tres términos, una barra. En n = {n} el término mayor ocupa el {pct}%.',
      fr: 'Une formule, trois termes, une barre. À n = {n}, le terme le plus grand en occupe {pct}%.',
      hi: 'एक सूत्र, तीन पद, एक पट्टी। n = {n} पर सबसे बड़ा पद उसका {pct}% घेरता है।',
      id: 'Satu rumus, tiga suku, satu batang. Pada n = {n} suku terbesar mengambil {pct}%.',
      pt: 'Uma fórmula, três termos, uma barra. Em n = {n} o maior termo ocupa {pct}%.',
    },
    'caption.rung': {
      en: 'n = {n} — n² now takes {pct}% of the bar.',
      ko: 'n = {n} — n² 가 막대에서 차지하는 몫은 {pct}%.',
      ja: 'n = {n} — n² が帯に占める割合は {pct}%。',
      zh: 'n = {n} — n² 现在占据条的 {pct}%。',
      ar: 'عند n = {n} يشغل n² نسبة {pct}% من الشريط.',
      es: 'n = {n}: n² ocupa ahora el {pct}% de la barra.',
      fr: 'n = {n} : n² occupe maintenant {pct}% de la barre.',
      hi: 'n = {n} — अब n² पट्टी का {pct}% घेरता है।',
      id: 'n = {n} — n² kini mengambil {pct}% dari batang.',
      pt: 'n = {n} — n² ocupa agora {pct}% da barra.',
    },
    'caption.tie': {
      en: 'n = {n} — the three terms are exactly equal. Each one is {each}. This is the tipping point.',
      ko: 'n = {n} — 세 항이 정확히 같다. 각 항은 {each}. 여기가 갈림목.',
      ja: 'n = {n} — 3つの項がぴったり等しい。どれも {each}。ここが分かれ目。',
      zh: 'n = {n} — 三个项正好相等,每个都是 {each}。这里是分水岭。',
      ar: 'عند n = {n} تتساوى الحدود الثلاثة تمامًا؛ كل حد يساوي {each}. هنا نقطة التحول.',
      es: 'n = {n}: los tres términos son exactamente iguales. Cada uno vale {each}. Este es el punto de inflexión.',
      fr: "n = {n} : les trois termes sont exactement égaux. Chacun vaut {each}. C'est le point de bascule.",
      hi: 'n = {n} — तीनों पद बिल्कुल बराबर हैं। हर एक {each} है। यही मोड़ है।',
      id: 'n = {n} — ketiga suku persis sama. Masing-masing {each}. Di sinilah titik baliknya.',
      pt: 'n = {n} — os três termos são exatamente iguais. Cada um vale {each}. Este é o ponto de virada.',
    },
    'caption.settle': {
      en: 'Only n² is left. Dropping the smaller terms is what O(n²) means.',
      ko: '남는 것은 n² 하나. 작은 항을 지우는 것이 O(n²) 라는 말이다.',
      ja: '残るのは n² だけ。小さい項を落とすことが O(n²) の意味だ。',
      zh: '只剩下 n²。丢掉较小的项,这就是 O(n²) 的含义。',
      ar: 'لم يبق سوى n². إسقاط الحدود الأصغر هو ما يعنيه O(n²).',
      es: 'Solo queda n². Descartar los términos menores es lo que significa O(n²).',
      fr: 'Il ne reste que n². Écarter les termes plus petits, voilà ce que signifie O(n²).',
      hi: 'केवल n² बचता है। छोटे पदों को हटाना ही O(n²) का अर्थ है।',
      id: 'Yang tersisa hanya n². Membuang suku yang lebih kecil itulah arti O(n²).',
      pt: 'Resta apenas n². Descartar os termos menores é o que significa O(n²).',
    },
  },
};
