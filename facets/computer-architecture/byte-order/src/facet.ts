/**
 * byteOrder — 같은 값을 반대 차례로 늘어놓는다.
 *
 * @piece 답하는 물음: 같은 네 바이트가 메모리에 정반대 차례로 놓인다면, 그 차례를
 * 모르고 읽은 쪽은 무엇을 얻는가.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const byteOrderFacet: FacetJson = {
  id: 'facet:byteOrder',
  title: {
    en: 'Byte order',
    ko: '바이트 순서',
    ja: 'バイト順序',
    zh: '字节序',
    ar: 'ترتيب البايتات',
    es: 'Orden de bytes',
    fr: 'Ordre des octets',
    hi: 'बाइट क्रम',
    id: 'Urutan byte',
    pt: 'Ordem dos bytes',
  },
  description: {
    en: 'The same value laid into memory in opposite orders, and what it becomes when read with the wrong one.',
    ko: '같은 값이 메모리에 정반대 차례로 놓이는 것, 그리고 엉뚱한 차례로 읽었을 때 무엇이 되는지.',
    ja: '同じ値がメモリに正反対の順序で置かれること、そして誤った順序で読んだときに何になるか。',
    zh: '同一个值以相反的顺序放入内存，以及用错误的顺序读取时会变成什么。',
    ar: 'القيمة نفسها موضوعة في الذاكرة بترتيبين متعاكسين، وما تصير إليه عند قراءتها بالترتيب الخطأ.',
    es: 'El mismo valor colocado en memoria en órdenes opuestos, y en qué se convierte al leerlo con el orden equivocado.',
    fr: 'La même valeur placée en mémoire dans des ordres opposés, et ce qu\'elle devient lorsqu\'on la lit avec le mauvais.',
    hi: 'वही मान स्मृति में उल्टे क्रमों में रखा जाता है, और गलत क्रम से पढ़ने पर वह क्या बन जाता है।',
    id: 'Nilai yang sama ditaruh di memori dalam urutan berlawanan, dan menjadi apa ia bila dibaca dengan urutan yang keliru.',
    pt: 'O mesmo valor colocado na memória em ordens opostas, e no que ele se torna quando lido com a ordem errada.',
  },
  algorithm: 'module:byteOrder',
  projector: 'module:byteOrderProjector',
  initialData: {
    type: 'byte-order',
    // 1차 데이터는 이 둘뿐이다. 바이트 쪼개기 · 두 배치 · 읽은 값은 algorithm 이 센다.
    value: 0x12345678,
    byteCount: 4,
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'byte-order-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.value': {
      en: 'One number, written the way people write it: the biggest part first.',
      ko: '수 하나를 사람이 적는 차례대로 적었다. 큰 자리가 앞이다.',
      ja: '数をひとつ、人が書く順に並べた。大きい桁が先だ。',
      zh: '一个数，按人书写的顺序排列，高位在前。',
      ar: 'عدد واحد، مكتوب كما يكتبه الناس: الجزء الأكبر أولاً.',
      es: 'Un número, escrito como lo escriben las personas: la parte mayor primero.',
      fr: 'Un nombre, écrit comme on écrit les nombres : la plus grande partie en premier.',
      hi: 'एक संख्या, जैसे लोग लिखते हैं वैसे ही: सबसे बड़ा हिस्सा पहले।',
      id: 'Satu bilangan, ditulis seperti orang menuliskannya: bagian terbesar lebih dulu.',
      pt: 'Um número, escrito como as pessoas escrevem: a parte maior primeiro.',
    },
    'caption.big': {
      en: 'big-endian puts the biggest byte at the lowest address.',
      ko: '빅엔디언은 큰 자리 바이트를 낮은 주소에 놓는다.',
      ja: 'ビッグエンディアンは大きい桁のバイトを低い番地に置く。',
      zh: '大端序把高位字节放在低地址。',
      ar: 'الترتيب الكبير يضع البايت الأكبر في أدنى عنوان.',
      es: 'El big-endian coloca el byte mayor en la dirección más baja.',
      fr: 'Le big-endian place l\'octet le plus fort à l\'adresse la plus basse.',
      hi: 'बिग-एंडियन सबसे बड़े बाइट को सबसे निचले पते पर रखता है।',
      id: 'big-endian menaruh byte terbesar di alamat terendah.',
      pt: 'O big-endian põe o byte maior no endereço mais baixo.',
    },
    'caption.little': {
      en: 'little-endian puts the smallest byte at the lowest address. Same bytes, opposite order.',
      ko: '리틀엔디언은 작은 자리 바이트를 낮은 주소에 놓는다. 같은 바이트, 정반대 차례.',
      ja: 'リトルエンディアンは小さい桁のバイトを低い番地に置く。同じバイトで、順序は正反対だ。',
      zh: '小端序把低位字节放在低地址。同样的字节，顺序正好相反。',
      ar: 'الترتيب الصغير يضع البايت الأصغر في أدنى عنوان. البايتات نفسها، والترتيب معكوس.',
      es: 'El little-endian coloca el byte menor en la dirección más baja. Los mismos bytes, el orden opuesto.',
      fr: 'Le little-endian place l\'octet le plus faible à l\'adresse la plus basse. Les mêmes octets, l\'ordre inverse.',
      hi: 'लिटिल-एंडियन सबसे छोटे बाइट को सबसे निचले पते पर रखता है। वही बाइट, उल्टा क्रम।',
      id: 'little-endian menaruh byte terkecil di alamat terendah. Byte yang sama, urutan yang berlawanan.',
      pt: 'O little-endian põe o byte menor no endereço mais baixo. Os mesmos bytes, a ordem oposta.',
    },
    'caption.same': {
      en: 'Read each layout by its own rule and the number that comes back is the same.',
      ko: '각 배치를 제 규칙으로 읽으면 돌아오는 수는 같다.',
      ja: 'それぞれの並びを自分の規則で読めば、戻ってくる数は同じだ。',
      zh: '各自按自己的规则读取，得到的是同一个数。',
      ar: 'اقرأ كل تخطيط بقاعدته الخاصة، فالعدد العائد هو نفسه.',
      es: 'Lee cada disposición con su propia regla y el número que vuelve es el mismo.',
      fr: 'Lisez chaque disposition avec sa propre règle et le nombre obtenu est le même.',
      hi: 'हर विन्यास को उसके अपने नियम से पढ़ें तो लौटने वाली संख्या वही है।',
      id: 'Baca tiap susunan dengan aturannya sendiri, bilangan yang kembali sama.',
      pt: 'Leia cada arranjo pela sua própria regra e o número que volta é o mesmo.',
    },
    'caption.misread': {
      en: 'Read the little-endian bytes as big-endian instead: a different number.',
      ko: '리틀엔디언 바이트열을 빅엔디언으로 읽으면 — 다른 수가 나온다.',
      ja: 'リトルエンディアンのバイト列をビッグエンディアンとして読むと、別の数になる。',
      zh: '若把小端序的字节按大端序来读，就成了另一个数。',
      ar: 'اقرأ بايتات الترتيب الصغير على أنها ترتيب كبير، فيظهر عدد آخر.',
      es: 'Lee los bytes little-endian como si fueran big-endian: sale otro número.',
      fr: 'Lisez les octets little-endian comme du big-endian : un autre nombre apparaît.',
      hi: 'लिटिल-एंडियन बाइटों को बिग-एंडियन मानकर पढ़ें: दूसरी ही संख्या मिलती है।',
      id: 'Baca byte little-endian sebagai big-endian: bilangan yang keluar lain.',
      pt: 'Leia os bytes little-endian como big-endian: sai outro número.',
    },
  },
};
