/**
 * HashAvalanche facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "입력을 한 글자만 바꿨는데 왜 해시가 전혀 달라지는가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범 (완결형 facet 과 다른 종류다):
 *   - 필수 조작 없음 — 아무것도 누르지 않아도 할 말을 마친다. 다만 다시 보기
 *     하나는 둔다. 이 조각은 격자가 물드는 운동 자체가 메시지라, 최종 상태만
 *     남으면 5칸이 131칸으로 증폭되는 대목을 놓친 사람이 되돌릴 길이 없다.
 *     "눌러야 완성되는 것" 과 "놓쳤을 때 되돌리는 것" 은 다르다.
 *   - 제목 없음 — header 를 두지 않는다. 제목은 글의 문단이 준다.
 *   - 짧음 — 네 걸음 재생하고 정지한다.
 *   - 한 주장 — 캡션 둘은 주장과 그 증거이지 서로 다른 주장이 아니다.
 *   - 메트릭 없음 — 셀 것이 없다. control-bar 는 버튼 하나만 싣는다.
 *
 * ReactiveMechanism 이라 mount 즉시 스스로 재생한다. 걸음 간격은 `stepMs` 가
 * 정한다 — 컨트롤바가 없어 speed-slider 로 늦출 수 없기 때문이다.
 *
 * 해시값은 실측 SHA-256 이다. 입력 'hello' 와 'hellp' 는 40비트 중 5비트만
 * (마지막 글자 0x6F ^ 0x70) 다른데 출력은 256비트 중 131비트가 다르다.
 * 12.5% 가 51.2% 로 증폭되는 이 대비가 조각의 전부다.
 *
 * 화면에는 언제나 견줄 두 항이 함께 있다 — 차이만 그리면 무엇과 무엇의 차이인지가
 * 사라지기 때문이다. 네 걸음: 입력 둘 → 입력 차이 → 출력 둘 → 출력 차이.
 *
 * title / description / messages 는 열 언어를 채웠다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const hashAvalancheFacet: FacetJson = {
  id: 'facet:hashAvalanche',
  title: {
    en: 'Avalanche Effect',
    ko: '눈사태 효과',
    ja: 'なだれ効果',
    zh: '雪崩效应',
    ar: 'تأثير الانهيار',
    es: 'Efecto avalancha',
    fr: 'Effet avalanche',
    hi: 'हिमस्खलन प्रभाव',
    id: 'Efek longsoran',
    pt: 'Efeito avalanche',
  },
  description: {
    en: 'One changed character flips about half of a hash output',
    ko: '한 글자를 바꾸면 해시 출력의 절반이 뒤집힌다',
    ja: '一文字変えるだけで、ハッシュ出力の半分ほどが反転する',
    zh: '只改一个字符，哈希输出就有近一半被翻转',
    ar: 'تغيير حرف واحد يقلب نحو نصف مخرجات التجزئة',
    es: 'Cambiar un solo carácter voltea alrededor de la mitad del hash',
    fr: "Changer un seul caractère retourne environ la moitié de l'empreinte",
    hi: 'एक अक्षर बदलते ही हैश का लगभग आधा हिस्सा पलट जाता है',
    id: 'Mengubah satu karakter membalik sekitar separuh keluaran hash',
    pt: 'Trocar um único caractere inverte cerca de metade da saída do hash',
  },
  algorithm: 'module:hashAvalanche',
  projector: 'module:hashAvalancheProjector',
  initialData: {
    type: 'hash-avalanche',
    algorithmLabel: 'SHA-256',
    inputA: 'hello',
    inputB: 'hellp',
    hashA: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    hashB: 'fdd7585e08c4e2afd71dcabdb4636c89d557a3f42db9e2040c8bbd1708aa4ce7',
    stepMs: 900,
  },
  shuffleOnReset: false,
  messages: {
    'caption.result': {
      en: 'Only {inputFlipped} of {inputTotal} input bits differ, but {outputFlipped} of {outputTotal} output bits do.',
      ko: '입력은 {inputTotal} 비트 중 {inputFlipped} 비트만 달랐는데, 출력은 {outputTotal} 비트 중 {outputFlipped} 비트가 다르다.',
      ja: '入力は {inputTotal} ビット中 {inputFlipped} ビットしか違わないのに、出力は {outputTotal} ビット中 {outputFlipped} ビットが違う。',
      zh: '输入 {inputTotal} 位中只有 {inputFlipped} 位不同，输出 {outputTotal} 位中却有 {outputFlipped} 位不同。',
      ar: 'من {inputTotal} بت في الدخل تختلف {inputFlipped} فقط، بينما تختلف {outputFlipped} من {outputTotal} بت في الخرج.',
      es: 'Solo {inputFlipped} de {inputTotal} bits de entrada difieren, pero sí difieren {outputFlipped} de {outputTotal} bits de salida.',
      fr: "Seuls {inputFlipped} bits d'entrée sur {inputTotal} diffèrent, mais {outputFlipped} bits de sortie sur {outputTotal} le font.",
      hi: 'इनपुट के {inputTotal} बिट में से केवल {inputFlipped} अलग हैं, पर आउटपुट के {outputTotal} बिट में से {outputFlipped} अलग हैं।',
      id: 'Hanya {inputFlipped} dari {inputTotal} bit masukan yang berbeda, tetapi {outputFlipped} dari {outputTotal} bit keluaran berbeda.',
      pt: 'Só {inputFlipped} de {inputTotal} bits de entrada diferem, mas {outputFlipped} de {outputTotal} bits de saída diferem.',
    },
    'label.bitDiff': {
      en: '{flipped} / {total} bits differ',
      ko: '{flipped} / {total} 비트 다름',
      ja: '{flipped} / {total} ビットが違う',
      zh: '{flipped} / {total} 位不同',
      ar: '{flipped} / {total} بت مختلفة',
      es: '{flipped} / {total} bits difieren',
      fr: '{flipped} / {total} bits diffèrent',
      hi: '{flipped} / {total} बिट अलग',
      id: '{flipped} / {total} bit berbeda',
      pt: '{flipped} / {total} bits diferem',
    },
    'label.through': {
      en: '↓  {algorithm}  ↓',
      ko: '↓  {algorithm}  ↓',
      ja: '↓  {algorithm}  ↓',
      zh: '↓  {algorithm}  ↓',
      ar: '↓  {algorithm}  ↓',
      es: '↓  {algorithm}  ↓',
      fr: '↓  {algorithm}  ↓',
      hi: '↓  {algorithm}  ↓',
      id: '↓  {algorithm}  ↓',
      pt: '↓  {algorithm}  ↓',
    },
  },
  blocks: {
    stage: { type: 'avalanche-stage' },
    controls: {
      type: 'control-bar',
      // ReactiveMechanism 의 reset() 은 끝에 ensureStarted() 를 부른다 — 즉
      // reset 이 곧 다시 재생이다. 그래서 action 은 reset 이고 라벨만 다르다.
      controls: CONTROL_SET.piece,
    },
  },
};
