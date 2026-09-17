/**
 * 자리 옮기기 — 옮기면 곱해지고 나뉜다.
 *
 * @piece 한 질문에만 답한다: 비트 무리를 통째로 한 칸 옆으로 밀면 수에 무슨 일이
 * 일어나는가. 자리 무게가 배가 되거나 반이 되고, 그릇 밖으로 나간 비트는 버려진다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const bitShiftFacet: FacetJson = {
  id: 'facet:bitShift',
  title: {
    en: 'Bit Shift',
    ko: '자리 옮기기',
    ja: 'ビットシフト',
    zh: '位移',
    ar: 'إزاحة البتات',
    es: 'Desplazamiento de bits',
    fr: 'Décalage de bits',
    hi: 'बिट शिफ्ट',
    id: 'Pergeseran bit',
    pt: 'Deslocamento de bits',
  },
  description: {
    en: 'Slide the bits one slot and the number doubles or halves. Whatever runs past the end is gone.',
    ko: '비트를 한 칸 밀면 수가 배가 되거나 반이 된다. 끝을 넘어간 비트는 사라진다.',
    ja: 'ビットを 1 つずらすと数は 2 倍か半分になる。端を越えたビットは消える。',
    zh: '把比特移动一格，数值就翻倍或减半。越过边界的比特会消失。',
    ar: 'أزح البتات خانة واحدة فيتضاعف العدد أو ينقسم إلى النصف، وما يتجاوز الحافة يضيع.',
    es: 'Desliza los bits una casilla y el número se duplica o se reduce a la mitad. Lo que pasa del borde se pierde.',
    fr: 'Décalez les bits de une case et le nombre double ou est divisé par deux. Ce qui dépasse le bord est perdu.',
    hi: 'बिट को एक खाना खिसकाइए और संख्या दोगुनी या आधी हो जाती है। किनारे से बाहर गया बिट खो जाता है।',
    id: 'Geser bit satu kotak, angkanya menjadi dua kali atau setengah. Yang lewat dari ujung hilang.',
    pt: 'Desloque os bits uma casa e o número dobra ou cai pela metade. O que passa da borda se perde.',
  },
  algorithm: 'module:bitShift',
  scene: 'module:bitShiftScene',
  initialData: {
    type: 'bit-shift',
    // 그릇의 크기. 넘쳐 나가는 지점을 정하는 구조값이다.
    bits: 8,
    // 왼쪽으로 — 3 에서 다섯 칸. 여덟 칸을 넘기기 전에 멈춘다.
    leftStart: 3,
    leftShifts: 5,
    // 오른쪽으로 — 200 에서 네 칸. 마지막 칸에서 1 이 떨어져 나간다.
    rightStart: 200,
    rightShifts: 4,
    // 읽을 시간을 주는 것은 저작 결정이다 (S-piece).
    stepMs: 650,
  },
  blocks: {
    stage: { type: 'bit-shift-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
  messages: {
    'caption.start': {
      en: '{bits} bits hold {value}.',
      ko: '{bits} 칸에 담긴 수는 {value}.',
      ja: '{bits} ビットが表す数は {value}。',
      zh: '{bits} 位表示的数是 {value}。',
      ar: '{bits} بت تحمل القيمة {value}.',
      es: '{bits} bits contienen {value}.',
      fr: '{bits} bits contiennent {value}.',
      hi: '{bits} बिट में रखी संख्या {value} है।',
      id: '{bits} bit menyimpan {value}.',
      pt: '{bits} bits contêm {value}.',
    },
    'caption.left': {
      en: 'One slot left — every place doubles. Now {value}.',
      ko: '왼쪽으로 한 칸 — 자리 무게가 모두 배가 된다. 지금 값은 {value}.',
      ja: '左へ 1 つ — どの桁の重みも 2 倍になる。いまの値は {value}。',
      zh: '向左移一格 — 每个位权都翻倍。当前值为 {value}。',
      ar: 'خانة واحدة إلى اليسار — تتضاعف قيمة كل خانة. القيمة الآن {value}.',
      es: 'Una casilla a la izquierda: cada posición se duplica. Ahora {value}.',
      fr: 'Une case vers la gauche : chaque rang double. Maintenant {value}.',
      hi: 'एक खाना बाएँ — हर स्थान का मान दोगुना। अब {value}.',
      id: 'Satu kotak ke kiri — setiap nilai tempat menjadi dua kali. Sekarang {value}.',
      pt: 'Uma casa à esquerda — cada posição dobra. Agora {value}.',
    },
    'caption.turn': {
      en: 'The other way now. {bits} bits hold {value}.',
      ko: '이번에는 반대쪽. {bits} 칸에 담긴 수는 {value}.',
      ja: '今度は逆向き。{bits} ビットが表す数は {value}。',
      zh: '这次换个方向。{bits} 位表示的数是 {value}。',
      ar: 'الآن في الاتجاه الآخر. {bits} بت تحمل القيمة {value}.',
      es: 'Ahora al revés. {bits} bits contienen {value}.',
      fr: 'Maintenant en sens inverse. {bits} bits contiennent {value}.',
      hi: 'अब दूसरी दिशा। {bits} बिट में रखी संख्या {value} है।',
      id: 'Sekarang arah sebaliknya. {bits} bit menyimpan {value}.',
      pt: 'Agora no sentido inverso. {bits} bits contêm {value}.',
    },
    'caption.right': {
      en: 'One slot right — every place halves. Now {value}.',
      ko: '오른쪽으로 한 칸 — 자리 무게가 모두 반이 된다. 지금 값은 {value}.',
      ja: '右へ 1 つ — どの桁の重みも半分になる。いまの値は {value}。',
      zh: '向右移一格 — 每个位权都减半。当前值为 {value}。',
      ar: 'خانة واحدة إلى اليمين — تصبح قيمة كل خانة نصفها. القيمة الآن {value}.',
      es: 'Una casilla a la derecha: cada posición se reduce a la mitad. Ahora {value}.',
      fr: 'Une case vers la droite : chaque rang est divisé par deux. Maintenant {value}.',
      hi: 'एक खाना दाएँ — हर स्थान का मान आधा। अब {value}.',
      id: 'Satu kotak ke kanan — setiap nilai tempat menjadi setengah. Sekarang {value}.',
      pt: 'Uma casa à direita — cada posição cai pela metade. Agora {value}.',
    },
    'caption.dropped': {
      en: 'The last bit ran off the end. Exact division gives {exact}, what is left is {value}.',
      ko: '맨 끝 비트가 밖으로 떨어졌다. 정확한 나눗셈은 {exact}, 남은 값은 {value}.',
      ja: '端のビットが外へ落ちた。正確な割り算では {exact}、残った値は {value}。',
      zh: '末位的比特掉出了边界。精确除法得 {exact}，剩下的值是 {value}。',
      ar: 'سقط البت الأخير خارج الحافة. القسمة الدقيقة تعطي {exact}، والمتبقي هو {value}.',
      es: 'El último bit se salió por el borde. La división exacta da {exact}; queda {value}.',
      fr: 'Le dernier bit est tombé hors du bord. La division exacte donne {exact}, il reste {value}.',
      hi: 'आखिरी बिट किनारे से बाहर गिर गया। सटीक भाग देता है {exact}, बचता है {value}.',
      id: 'Bit terakhir jatuh keluar dari ujung. Pembagian tepat memberi {exact}, yang tersisa {value}.',
      pt: 'O último bit caiu para fora da borda. A divisão exata dá {exact}, resta {value}.',
    },
  },
};
