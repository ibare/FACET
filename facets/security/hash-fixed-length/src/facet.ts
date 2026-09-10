/**
 * HashFixedLength facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "한 글자를 넣든 파일을 넣든 왜 결과 길이가 같은가?"
 *
 * 왼쪽 입력은 0바이트부터 화면 밖으로 잘려 나갈 만큼 길고, 오른쪽 출력 상자는
 * 넷이 정확히 같은 폭이다. 마지막 걸음의 좌우 안내선이 그 사실을 짚는다.
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범:
 *   - 필수 조작 없음. 다시 보기 하나만 둔다.
 *   - 제목 없음 — 제목은 글의 문단이 준다.
 *   - 짧음 — 세 걸음 재생하고 정지한다.
 *   - 한 주장 — 진행 캡션들은 한 논증의 단계다.
 *   - 메트릭 없음.
 *   - 캔버스 폭 620 — playground 가 아니라 글의 문단 폭에 맞춘다.
 *
 * 해시는 전부 실측 SHA-256 이다. 각주가 밝히듯 3.7MB 파일도 같은 64자가 되며,
 * 빈 입력에도 해시가 있다 (e3b0c442…).
 *
 * title / description / messages 는 열 언어를 모두 채웠다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const hashFixedLengthFacet: FacetJson = {
  id: 'facet:hashFixedLength',
  title: {
    en: 'Fixed-Length Output',
    ko: '고정 길이 출력',
    ja: '固定長の出力',
    zh: '定长输出',
    ar: 'مخرَج ثابت الطول',
    es: 'Salida de longitud fija',
    fr: 'Sortie de longueur fixe',
    hi: 'नियत लंबाई का आउटपुट',
    id: 'Keluaran panjang tetap',
    pt: 'Saída de tamanho fixo',
  },
  description: {
    en: 'Inputs from nothing to a whole file, outputs all exactly the same size',
    ko: '입력은 빈 것부터 파일까지, 출력은 언제나 같은 크기',
    ja: '入力は空からファイル一つ分まで、出力はいつも同じ大きさ',
    zh: '输入从空到整个文件，输出始终一样大',
    ar: 'مدخلات من لا شيء إلى ملف كامل، ومخرجات بالحجم نفسه دائمًا',
    es: 'Entradas desde nada hasta un archivo entero; las salidas, siempre del mismo tamaño',
    fr: 'Des entrées allant de rien à un fichier entier, des sorties toujours de la même taille',
    hi: 'इनपुट खाली से लेकर पूरी फ़ाइल तक, आउटपुट हमेशा एक ही आकार का',
    id: 'Masukan dari kosong sampai satu berkas utuh, keluarannya selalu sama besar',
    pt: 'Entradas do nada a um arquivo inteiro, saídas sempre do mesmo tamanho',
  },
  algorithm: 'module:hashFixedLength',
  projector: 'module:hashFixedLengthProjector',
  initialData: {
    type: 'hash-fixed-length',
    algorithmLabel: 'SHA-256',
    hashBits: 256,
    // 전부 실측 SHA-256. 길이 차이가 한눈에 들어오도록 0B 부터 화면을 넘길
    // 만큼 긴 것까지 벌려 골랐다.
    rows: [
      {
        input: '',
        bytes: 0,
        hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      },
      {
        input: 'a',
        bytes: 1,
        hash: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
      },
      {
        input: 'hello world',
        bytes: 11,
        hash: 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
      },
      {
        input:
          'The quick brown fox jumps over the lazy dog and keeps running far past the edge of this line',
        bytes: 92,
        hash: '5cae16c80af2cdd75771050bb43313674050b21782a8cc8abd1b78275152be51',
      },
    ],
    // 네 줄이 접혀 건너가는 reveal-outputs 가 가장 긴 걸음이라 그것에 맞춘다.
    stepMs: 1200,
  },
  shuffleOnReset: false,
  messages: {
    'caption.inputsVary': {
      en: 'The inputs run from nothing to {bytes} bytes.',
      ko: '입력은 빈 것부터 {bytes} 바이트까지 제각각이다.',
      ja: '入力は空から {bytes} バイトまでまちまちだ。',
      zh: '输入从空一直到 {bytes} 字节，各不相同。',
      ar: 'تتراوح المدخلات من لا شيء إلى {bytes} بايت.',
      es: 'Las entradas van desde nada hasta {bytes} bytes.',
      fr: 'Les entrées vont de rien à {bytes} octets.',
      hi: 'इनपुट खाली से लेकर {bytes} बाइट तक फैले हैं।',
      id: 'Masukannya mulai dari kosong sampai {bytes} bita.',
      pt: 'As entradas vão de nada a {bytes} bytes.',
    },
    'caption.outputsUniform': {
      en: 'Every output starts and ends at the same place — {bits} bits, whatever went in.',
      ko: '출력은 모두 같은 자리에서 시작해 같은 자리에서 끝난다 — 무엇이 들어갔든 {bits} 비트다.',
      ja: 'どの出力も同じ位置で始まり同じ位置で終わる — 何を入れても {bits} ビットだ。',
      zh: '每个输出都从同一处开始、同一处结束 — 不管输入是什么，都是 {bits} 位。',
      ar: 'كل مخرَج يبدأ وينتهي عند الموضع نفسه — {bits} بت مهما كان المدخل.',
      es: 'Toda salida empieza y termina en el mismo lugar: {bits} bits, entre lo que entre.',
      fr: "Chaque sortie commence et finit au même endroit — {bits} bits, quoi qu'on entre.",
      hi: 'हर आउटपुट एक ही जगह शुरू और एक ही जगह खत्म होता है — जो भी डालें, {bits} बिट।',
      id: 'Setiap keluaran mulai dan berakhir di tempat yang sama — {bits} bit, apa pun yang masuk.',
      pt: 'Toda saída começa e termina no mesmo ponto — {bits} bits, seja lá o que entrar.',
    },
    'label.inputColumn': {
      en: 'input',
      ko: '입력',
      ja: '入力',
      zh: '输入',
      ar: 'المدخل',
      es: 'entrada',
      fr: 'entrée',
      hi: 'इनपुट',
      id: 'masukan',
      pt: 'entrada',
    },
    'label.outputColumn': {
      en: '{algorithm} output',
      ko: '{algorithm} 출력',
      ja: '{algorithm} の出力',
      zh: '{algorithm} 输出',
      ar: 'مخرَج {algorithm}',
      es: 'salida de {algorithm}',
      fr: 'sortie {algorithm}',
      hi: '{algorithm} आउटपुट',
      id: 'keluaran {algorithm}',
      pt: 'saída de {algorithm}',
    },
    'label.empty': {
      en: '(nothing)',
      ko: '(빈 입력)',
      ja: '(空)',
      zh: '（空）',
      ar: '(لا شيء)',
      es: '(nada)',
      fr: '(rien)',
      hi: '(कुछ नहीं)',
      id: '(kosong)',
      pt: '(nada)',
    },
    'label.always': {
      en: 'always {bits} bits',
      ko: '언제나 {bits} 비트',
      ja: 'いつも {bits} ビット',
      zh: '始终 {bits} 位',
      ar: 'دائمًا {bits} بت',
      es: 'siempre {bits} bits',
      fr: 'toujours {bits} bits',
      hi: 'हमेशा {bits} बिट',
      id: 'selalu {bits} bit',
      pt: 'sempre {bits} bits',
    },
  },
  blocks: {
    stage: { type: 'fixed-length-stage' },
    controls: {
      type: 'control-bar',
      // ReactiveMechanism 의 reset() 은 끝에 ensureStarted() 를 부른다 — 즉
      // reset 이 곧 다시 재생이다. 그래서 action 은 reset 이고 라벨만 다르다.
      controls: CONTROL_SET.piece,
    },
  },
};
