/**
 * square-and-halve facet 선언.
 *
 * @piece 조각(piece) — 질문 하나에 답하고 멈춘다.
 *   "3 을 열세 번 곱하지 않고 여섯 번만 곱해 3¹³ 에 닿는 것이 어떻게 가능한가."
 *
 * 1차 데이터는 밑과 지수 둘뿐이다. 화면에 뜨는 9 · 81 · 6561 · 243 · 1594323 은
 * 알고리즘이 그 자리에서 셈한 것이고, 그 셈이 참값과 같은지는
 * `test/square-and-halve.test.ts` 가 이 선언을 읽어 다시 잰다 (S-piece).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const squareAndHalveFacet: FacetJson = {
  id: 'facet:squareAndHalve',
  title: {
    en: 'Fast power — fold the row in half',
    ko: '분할 거듭제곱 — 줄을 반으로 접는다',
    ja: '繰り返し二乗法 — 列を半分に折る',
    zh: '快速幂 — 把一行对折',
    ar: 'الأس السريع — اطوِ الصف نصفين',
    es: 'Potencia rápida: dobla la fila por la mitad',
    fr: 'Exponentiation rapide — plier la rangée en deux',
    hi: 'तेज़ घातांक — पंक्ति को आधा मोड़ें',
    id: 'Pangkat cepat — lipat baris jadi dua',
    pt: 'Potência rápida — dobre a fileira ao meio',
  },
  description: {
    en: 'Multiplying 3 thirteen times costs twelve multiplications. Fold the row of thirteen in half instead: each pair meets and squares, and the odd cell left over at a fold is paid into the answer. Six multiplications reach the same number, and the cells paid are exactly the 1 digits of 13 written in binary, 1101.',
    ko: '3 을 열세 번 곱하면 곱셈이 열두 번 든다. 대신 열세 칸짜리 줄을 반으로 접는다. 짝지은 둘이 만나 제곱이 되고, 접을 때 남는 홀수 한 칸은 답으로 보낸다. 곱셈 여섯 번으로 같은 수에 닿으며, 답으로 보낸 칸들은 13 을 이진수로 적은 1101 의 1 자리와 정확히 같다.',
    ja: '3 を十三回掛ければ掛け算は十二回かかる。代わりに十三枡の列を半分に折る。対になった二つが出会って二乗になり、折るときに余る奇数の一枡は答えへ送る。掛け算六回で同じ数に届き、送った枡は 13 を二進法で書いた 1101 の 1 の桁とぴったり同じだ。',
    zh: '把 3 乘十三次要十二次乘法。换个办法：把十三格的一行对折，成对的两格相遇成为平方，每次对折剩下的那一格送进答案。六次乘法就能到达同一个数，而送进答案的格子恰好是 13 的二进制 1101 中为 1 的位。',
    ar: 'ضرب 3 ثلاث عشرة مرة يكلّف اثنتي عشرة عملية ضرب. بدل ذلك اطوِ صفّ الخانات الثلاث عشرة نصفين: يلتقي كل زوج فيصير تربيعًا، والخانة الفردية المتبقية عند الطي تذهب إلى الجواب. ست عمليات ضرب تبلغ العدد نفسه، والخانات المدفوعة هي تمامًا أرقام الواحد في 1101، وهو 13 بالنظام الثنائي.',
    es: 'Multiplicar 3 trece veces cuesta doce multiplicaciones. En vez de eso, dobla por la mitad la fila de trece casillas: cada pareja se junta y se eleva al cuadrado, y la casilla impar que sobra en un doblez se paga a la respuesta. Con seis multiplicaciones se llega al mismo número, y las casillas pagadas son exactamente los unos de 13 en binario, 1101.',
    fr: "Multiplier 3 treize fois coûte douze multiplications. Pliez plutôt en deux la rangée de treize cases : chaque paire se rejoint et se met au carré, et la case impaire qui reste à un pli part dans la réponse. Six multiplications atteignent le même nombre, et les cases versées sont exactement les 1 de 13 écrit en binaire, 1101.",
    hi: '3 को तेरह बार गुणा करने में बारह गुणा लगते हैं। इसके बजाय तेरह खानों की पंक्ति को आधा मोड़ें: हर जोड़ा मिलकर वर्ग बनता है, और मोड़ते समय बचा विषम खाना उत्तर में चला जाता है। छह गुणा से वही संख्या मिल जाती है, और जो खाने उत्तर में गए वे ठीक 13 के द्विआधारी रूप 1101 के 1 अंक हैं।',
    id: 'Mengalikan 3 sebanyak tiga belas kali menelan dua belas perkalian. Sebagai gantinya, lipat baris tiga belas sel itu jadi dua: tiap pasangan bertemu dan menjadi kuadrat, dan sel ganjil yang tersisa saat melipat dibayarkan ke jawaban. Enam perkalian mencapai bilangan yang sama, dan sel yang dibayarkan persis digit 1 dari 13 dalam biner, 1101.',
    pt: 'Multiplicar 3 treze vezes custa doze multiplicações. Em vez disso, dobre ao meio a fileira de treze casas: cada par se junta e vira um quadrado, e a casa ímpar que sobra na dobra é paga à resposta. Seis multiplicações chegam ao mesmo número, e as casas pagas são exatamente os dígitos 1 de 13 em binário, 1101.',
  },
  algorithm: 'module:squareAndHalve',
  projector: 'module:squareAndHalveProjector',
  initialData: {
    type: 'square-and-halve',
    base: 3,
    exponent: 13,
    stepMs: 800,
  },
  blocks: {
    stage: { type: 'square-and-halve-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
  messages: {
    'caption.begin': {
      en: 'A row of {exponent} cells, each one {base}. Multiplied one at a time, that is {naive} multiplications.',
      ko: '칸 {exponent} 개로 된 줄. 칸마다 적힌 값은 {base}. 하나씩 곱하면 곱셈은 {naive} 번.',
      ja: '{exponent} 個の枡でできた列。枡ごとの値は {base}。一つずつ掛けるなら掛け算は {naive} 回。',
      zh: '一行 {exponent} 个格子，每格都是 {base}。逐个相乘要 {naive} 次乘法。',
      ar: 'صف من {exponent} خانة، كل واحدة {base}. الضرب واحدة تلو الأخرى يعني {naive} عملية ضرب.',
      es: 'Una fila de {exponent} casillas, cada una {base}. Multiplicadas una a una, son {naive} multiplicaciones.',
      fr: "Une rangée de {exponent} cases, chacune valant {base}. Multipliées une à une, cela fait {naive} multiplications.",
      hi: '{exponent} खानों की एक पंक्ति, हर खाने में {base}। एक-एक करके गुणा करें तो {naive} गुणा लगते हैं।',
      id: 'Sebaris {exponent} sel, masing-masing {base}. Dikalikan satu per satu, itu {naive} perkalian.',
      pt: 'Uma fileira de {exponent} casas, cada uma {base}. Multiplicadas uma a uma, são {naive} multiplicações.',
    },
    'caption.take': {
      en: 'The count {count} is odd, so one cell has no partner. It goes into the answer: {factor}.',
      ko: '칸 {count} 개는 홀수. 짝 없는 칸 하나를 답으로 보낸다. 보내는 값: {factor}.',
      ja: '枡 {count} 個は奇数。相手のいない枡が一つ残る。答えへ送る値: {factor}。',
      zh: '格子 {count} 个是奇数，有一格配不成对。它进入答案：{factor}。',
      ar: 'العدد {count} فردي، فتبقى خانة بلا شريك. تذهب إلى الجواب: {factor}.',
      es: 'El total {count} es impar, así que una casilla queda sin pareja. Va a la respuesta: {factor}.',
      fr: "Le total {count} est impair : une case reste sans partenaire. Elle part dans la réponse : {factor}.",
      hi: 'गिनती {count} विषम है, इसलिए एक खाना बिना जोड़े रह जाता है। वह उत्तर में जाता है: {factor}।',
      id: 'Jumlah {count} ganjil, jadi satu sel tidak punya pasangan. Sel itu masuk ke jawaban: {factor}.',
      pt: 'O total {count} é ímpar, então uma casa fica sem par. Ela vai para a resposta: {factor}.',
    },
    'caption.skip': {
      en: 'The count {count} is even — every cell has a partner. Nothing goes into the answer.',
      ko: '칸 {count} 개는 짝수. 모든 칸에 짝이 있다. 답으로 갈 것이 없다.',
      ja: '枡 {count} 個は偶数。どの枡にも相手がいる。答えへ送るものはない。',
      zh: '格子 {count} 个是偶数 — 每格都有配对。没有东西进入答案。',
      ar: 'العدد {count} زوجي — لكل خانة شريك. لا شيء يذهب إلى الجواب.',
      es: 'El total {count} es par: cada casilla tiene pareja. Nada va a la respuesta.',
      fr: "Le total {count} est pair : chaque case a un partenaire. Rien ne part dans la réponse.",
      hi: 'गिनती {count} सम है — हर खाने का जोड़ा है। उत्तर में कुछ नहीं जाता।',
      id: 'Jumlah {count} genap — setiap sel punya pasangan. Tidak ada yang masuk ke jawaban.',
      pt: 'O total {count} é par — cada casa tem um par. Nada vai para a resposta.',
    },
    'caption.fold': {
      en: 'Fold in half. Each pair meets and becomes one cell worth {value}, and the row now holds {count}.',
      ko: '반으로 접는다. 짝지은 둘이 만나 한 칸이 되고, 그 값은 {value}. 남은 칸은 {count} 개.',
      ja: '半分に折る。対になった二つが出会って一つの枡になり、その値は {value}。残る枡は {count} 個。',
      zh: '对折。成对的两格相遇合为一格，值为 {value}，这一行还剩 {count} 格。',
      ar: 'نطوي الصف نصفين. يلتقي كل زوج ليصير خانة واحدة قيمتها {value}، ويبقى في الصف {count} خانة.',
      es: 'Doblamos por la mitad. Cada pareja se junta en una casilla que vale {value}, y la fila queda con {count}.',
      fr: "On plie en deux. Chaque paire se rejoint en une case valant {value}, et la rangée en compte {count}.",
      hi: 'आधा मोड़ें। हर जोड़ा मिलकर एक खाना बनता है जिसका मान {value} है, और पंक्ति में अब {count} खाने हैं।',
      id: 'Lipat jadi dua. Tiap pasangan bertemu menjadi satu sel bernilai {value}, dan baris kini berisi {count}.',
      pt: 'Dobra ao meio. Cada par se junta numa casa que vale {value}, e a fileira fica com {count}.',
    },
    'caption.done': {
      en: '{total} multiplications instead of {naive} — {squarings} squarings and {multiplies} products. The digits {bits} say which squares were taken.',
      ko: '곱셈은 {total} 번. 하나씩 곱했다면 {naive} 번. 제곱 {squarings} 번에 답곱 {multiplies} 번이고, 이진수 {bits} 의 1 자리가 곧 답에 곱한 제곱이다.',
      ja: '掛け算は {total} 回。一つずつなら {naive} 回。二乗 {squarings} 回と答えへの掛け算 {multiplies} 回で、二進数 {bits} の 1 の桁が答えに掛けた二乗そのものだ。',
      zh: '乘法 {total} 次，逐个相乘则要 {naive} 次。平方 {squarings} 次加上乘进答案 {multiplies} 次，而二进制 {bits} 中为 1 的位，正是被乘进答案的那些平方。',
      ar: '{total} عمليات ضرب بدل {naive} — {squarings} تربيعات و{multiplies} ضربات في الجواب. أرقام {bits} الثنائية تدل على التربيعات التي أُخذت.',
      es: '{total} multiplicaciones en vez de {naive}: {squarings} cuadrados y {multiplies} productos. Los dígitos {bits} dicen qué cuadrados se tomaron.',
      fr: "{total} multiplications au lieu de {naive} : {squarings} carrés et {multiplies} produits. Les chiffres {bits} disent quels carrés ont été pris.",
      hi: '{naive} के बजाय {total} गुणा — {squarings} वर्ग और {multiplies} गुणनफल। अंक {bits} बताते हैं कि कौन-से वर्ग लिए गए।',
      id: '{total} perkalian, bukan {naive} — {squarings} pengkuadratan dan {multiplies} hasil kali. Digit {bits} menunjukkan kuadrat mana yang diambil.',
      pt: '{total} multiplicações em vez de {naive} — {squarings} quadrados e {multiplies} produtos. Os dígitos {bits} dizem quais quadrados foram tomados.',
    },
  },
};
