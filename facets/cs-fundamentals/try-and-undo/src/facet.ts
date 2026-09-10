/**
 * @piece 가 보고 아니면 되돌린다 — 백트래킹.
 *
 * 답하는 질문 하나: **되돌리기는 왜 실패의 뒤처리가 아니라 절차의 한 짝인가.**
 * 끝까지 가 보지 않고는 아닌 줄 알 수 없으므로 가 보고 물린다. 놓는 운동과
 * 걷어내는 운동이 나란히 보이고, 물릴 때 판이 반쯤 남지 않고 정확히 이전
 * 상태로 돌아간다.
 *
 * 조각이므로 header 도 metrics 도 두지 않는다 (S-piece). 제목은 글의 문단이 주고,
 * 셀 것은 패널에 걸지 않는다 — 놓기와 물리기의 수는 마지막 캡션이 말한다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const tryAndUndoFacet: FacetJson = {
  id: 'facet:tryAndUndo',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: {
    en: 'Backtracking',
    ko: '백트래킹',
    ja: 'バックトラッキング',
    zh: '回溯法',
    ar: 'التراجع',
    es: 'Vuelta atrás',
    fr: 'Retour sur trace',
    hi: 'बैकट्रैकिंग',
    id: 'Runut balik',
    pt: 'Retrocesso',
  },
  description: {
    en: 'Why undoing a move is part of the procedure, not a failure to clean up.',
    ko: '되돌리기가 실패의 뒤처리가 아니라 절차의 한 짝인 까닭.',
    ja: '手を戻すことが失敗の後始末ではなく、手順の片割れである理由。',
    zh: '为什么撤回一步是流程的一半，而不是失败后的收拾。',
    ar: 'لماذا التراجع عن نقلة جزء من الإجراء، لا تنظيفًا بعد الفشل.',
    es: 'Por qué deshacer una jugada es parte del procedimiento, no la limpieza de un fracaso.',
    fr: "Pourquoi défaire un coup fait partie de la procédure, et n'est pas un nettoyage après échec.",
    hi: 'एक चाल वापस लेना प्रक्रिया का हिस्सा क्यों है, नाकामी की सफ़ाई नहीं।',
    id: 'Mengapa membatalkan langkah adalah bagian dari prosedurnya, bukan beres-beres setelah gagal.',
    pt: 'Porque desfazer uma jogada faz parte do procedimento, e não é limpeza depois do falhanço.',
  },
  algorithm: 'module:tryAndUndo',
  projector: 'module:tryAndUndoProjector',

  initialData: {
    type: 'try-and-undo',
    // 4×4 판에 말 넷. 같은 가로줄·세로줄·대각선에 둘이 서지 못한다.
    // 이 크기에서 놓기 여덟 · 물리기 넷 만에 답에 닿고, 첫 시도(행0 열0)는
    // 통째로 물린다 — 그 되돌아옴이 이 화면의 큰 마디다.
    boardSize: 4,
    stepMs: 460,
  },

  blocks: {
    stage: { type: 'try-and-undo-stage' },
    controls: { type: 'control-bar', controls: [CONTROL.replay, CONTROL.advance] },
  },

  messages: {
    'caption.start': {
      en: 'An empty board. One piece per row, from the top down.',
      ko: '빈 판이다. 위 행부터 한 줄에 하나씩 놓는다.',
      ja: '空の盤。上の行から一行に一つずつ置く。',
      zh: '空棋盘。从上往下，每行放一枚。',
      ar: 'رقعة فارغة. قطعة واحدة في كل صف، من الأعلى نزولًا.',
      es: 'Un tablero vacío. Una pieza por fila, de arriba abajo.',
      fr: 'Un plateau vide. Une pièce par rangée, du haut vers le bas.',
      hi: 'खाली बोर्ड। ऊपर से नीचे, हर पंक्ति में एक मोहरा।',
      id: 'Papan kosong. Satu bidak per baris, dari atas ke bawah.',
      pt: 'Um tabuleiro vazio. Uma peça por linha, de cima para baixo.',
    },
    'caption.place': {
      en: 'Row {row}: put a piece on column {col}.',
      ko: '행 {row} — 열 {col} 에 놓는다.',
      ja: '行 {row} — 列 {col} に置く。',
      zh: '第 {row} 行 — 放在第 {col} 列。',
      ar: 'الصف {row}: ضع قطعة في العمود {col}.',
      es: 'Fila {row}: coloca una pieza en la columna {col}.',
      fr: 'Rangée {row} : place une pièce en colonne {col}.',
      hi: 'पंक्ति {row} — स्तंभ {col} पर मोहरा रखो।',
      id: 'Baris {row}: taruh bidak di kolom {col}.',
      pt: 'Linha {row}: põe uma peça na coluna {col}.',
    },
    'caption.blocked': {
      en: 'Row {row}: every square left is ruled out.',
      ko: '행 {row} — 남은 자리가 모두 막혔다.',
      ja: '行 {row} — 残った升はすべて塞がっている。',
      zh: '第 {row} 行 — 剩下的格子全被排除。',
      ar: 'الصف {row}: كل المربعات المتبقية مستبعدة.',
      es: 'Fila {row}: todas las casillas restantes quedan descartadas.',
      fr: 'Rangée {row} : toutes les cases restantes sont exclues.',
      hi: 'पंक्ति {row} — बची हर जगह बाहर हो गई।',
      id: 'Baris {row}: semua petak yang tersisa tertutup.',
      pt: 'Linha {row}: todas as casas restantes ficam excluídas.',
    },
    'caption.undo': {
      en: 'Take the row {row} piece back. Everything below it returns to what it was.',
      ko: '행 {row} 의 말을 걷어낸다. 그 아래는 처음으로 돌아간다.',
      ja: '行 {row} の駒を取り戻す。その下はすべて元に戻る。',
      zh: '把第 {row} 行的棋子收回。它下面的一切都回到原样。',
      ar: 'أعد قطعة الصف {row}. وكل ما تحتها يعود كما كان.',
      es: 'Retira la pieza de la fila {row}. Todo lo que hay debajo vuelve a como estaba.',
      fr: "Reprends la pièce de la rangée {row}. Tout ce qui est en dessous revient à l'état d'avant.",
      hi: 'पंक्ति {row} का मोहरा वापस उठाओ। उसके नीचे सब कुछ पहले जैसा हो जाता है।',
      id: 'Ambil kembali bidak baris {row}. Semua di bawahnya kembali seperti semula.',
      pt: 'Retira a peça da linha {row}. Tudo abaixo dela volta ao que era.',
    },
    'caption.undoRoot': {
      en: 'Back past the very first move. The board is empty again.',
      ko: '첫 수까지 물렸다. 판이 처음처럼 비었다.',
      ja: '最初の一手まで戻した。盤はまた空だ。',
      zh: '退到了第一步之前。棋盘又空了。',
      ar: 'رجعنا إلى ما قبل النقلة الأولى. الرقعة فارغة من جديد.',
      es: 'Se ha vuelto más atrás de la primera jugada. El tablero está vacío otra vez.',
      fr: 'On est remonté avant le tout premier coup. Le plateau est de nouveau vide.',
      hi: 'पहली चाल से भी पीछे। बोर्ड फिर खाली है।',
      id: 'Mundur melewati langkah pertama. Papan kosong lagi.',
      pt: 'Recuou-se para antes da primeira jogada. O tabuleiro está vazio outra vez.',
    },
    'caption.solved': {
      en: 'All four stand — {placed} placements and {undone} take-backs.',
      ko: '넷이 다 섰다 — 놓기 {placed}번, 물리기 {undone}번.',
      ja: '四つとも立った — 置き {placed} 回、戻し {undone} 回。',
      zh: '四枚都立住了 — 放 {placed} 次，收回 {undone} 次。',
      ar: 'الأربع كلها قائمة — {placed} وضعًا و{undone} تراجعًا.',
      es: 'Las cuatro en pie: {placed} colocaciones y {undone} retiradas.',
      fr: 'Les quatre tiennent — {placed} poses et {undone} retraits.',
      hi: 'चारों खड़े हैं — {placed} बार रखा, {undone} बार वापस लिया।',
      id: 'Keempatnya berdiri — {placed} penempatan dan {undone} penarikan.',
      pt: 'As quatro de pé — {placed} colocações e {undone} recuos.',
    },
  },
};
