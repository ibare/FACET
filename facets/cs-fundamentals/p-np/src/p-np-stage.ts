/**
 * p-np-stage — 두 줄, 그리고 접힌 격자 두 층.
 *
 * 위는 고를 수 있는 수와 목표다. 그 아래 **확인** 줄에는 건네받은 후보 한 칸과
 * 덧셈 자가 서고, **찾기** 줄에는 후보를 담는 격자가 선다. 손잡이를 밀면 확인 줄은
 * 거의 그대로인데 찾기 줄이 화면을 잡아먹는다 — **그 갈림이 이 완제품의 까닭이다.**
 *
 * ── 축척 — 이 화면의 급소
 *
 * n=20 이면 후보가 1,048,576 이다. 낱낱이 그릴 수 없고, **로그 눈금을 쓰면 지수가
 * 직선이 되어 "폭발한다" 는 주장 자체가 화면에서 사라진다.**
 *
 * 그래서 **접는다.** 칸 하나가 후보 하나이고, 32 × 32 = 1,024 칸이 **한 장**이다.
 * 그 한 장이 통째로 위층 격자의 **칸 하나**가 된다. 두 층이면 1,024 × 1,024 =
 * 1,048,576 이라 손잡이의 끝이 정확히 담긴다.
 *
 *   n=6   아래층 두 줄 (64)          위층 0
 *   n=10  아래층 꽉 (1,024)          위층 한 칸
 *   n=15  아래층 꽉                  위층 32 칸
 *   n=20  아래층 꽉                  위층 꽉 (1,024 칸)
 *
 * **이것은 로그 축척이 아니다.** 한 층 안에서는 넓이가 값에 그대로 비례하고, 층이
 * 하나 올라가는 것이 1,024 배라는 사실을 "화면을 꽉 채운 격자가 저쪽의 점 하나"
 * 라는 그림이 몸으로 말한다. 폭발이 눌리지 않고 접힌다.
 *
 * 아래층이 꽉 찬 뒤로는 아래층이 더 자라지 않는데, 그것이 **자(尺)** 가 되기
 * 때문이다 — 자가 늘어나면 잴 수가 없다. 전제는 글이 밝힌다 (description.ts).
 *
 * ── 세로는 마운트한 뒤 바뀌지 않는다 (S-view)
 *
 * 손잡이가 n 을 6 → 20 으로 밀어도 격자 두 장의 자리는 처음부터 가장 큰 몫으로
 * 잡아 둔다. 작은 판일 때는 유령 격자만 남아 "여기까지 커진다" 를 미리 말한다.
 * 높이를 내용에 맞춰 다시 재면 글 안에 박힌 그림의 위아래 문단이 밀린다.
 *
 * ── 눈금은 여기서 정한다
 *
 * View 는 algorithm 을 참조하지 않는다 (원칙 1). 그래서 손잡이의 값을 algorithm 에서
 * 가져오지 않고 이 파일이 제 눈금을 가진다. 둘이 어긋나지 않는지는 검사가 본다
 * (`P_NP_N_TICKS` ↔ `P_NP_N_CHOICES` ↔ facet.ts 의 segments). 담을 수 있는 범위
 * (`P_NP_SHEET` 두 층)도 검사가 손잡이의 끝과 견준다.
 *
 * **타이머도 프레임 루프도 없다.** 걸음의 간격은 알고리즘의 `sleep` 이 정하고 이
 * view 의 메서드는 전부 동기로 즉시 그린다. 그래서 `destroy()` 가 풀어 줄 기다림이
 * 애초에 생기지 않는다 — 이 주석은 사실이어야 하므로, 나중에 여기에 애니메이션을
 * 들이면 이 문장부터 고쳐야 한다.
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

/** 손잡이가 설 수 있는 값. facet.ts 의 segments · algorithm 의 CHOICES 와 같아야 한다. */
export const P_NP_N_TICKS: readonly number[] = [6, 8, 10, 12, 15, 20];

// ── 격자 (접기의 단위) ───────────────────────────────────────────────────────
/** 한 줄에 놓는 칸 수. 세로도 같아 한 장이 정사각이다. */
export const P_NP_GRID_COLS = 32;
/** 한 장이 담는 후보의 수. 위층 칸 하나가 이만큼을 뜻한다. */
export const P_NP_SHEET = P_NP_GRID_COLS * P_NP_GRID_COLS;
/** 두 층으로 담을 수 있는 끝. 손잡이의 최대가 이 안에 들어야 한다. */
export const P_NP_CAPACITY = P_NP_SHEET * P_NP_SHEET;

// ── 기하 (S-view: SVG 안의 좌표·칸 크기는 그림이 정한다) ─────────────────────
const W = 720;
const PAD = 24;

const CHIP_Y = 14;
const CHIP_H = 28;
const CHIP_GAP = 4;
const CHIP_MAX_W = 34;
const PLATE_W = 60;
const PLATE_X = W - PAD - PLATE_W;
const LABEL_DROP = 10;

const CHECK_LABEL_Y = 72;
const CHECK_Y = 80;
const CHECK_TILE = 22;
const SUM_W = 58;
const TICK_W = 8;
const TICK_H = 14;
const TICK_GAP = 3;
/**
 * 덧셈 자의 라벨은 자 **옆**이 아니라 제 줄에 선다.
 *
 * 옆에 두면 자가 시작하는 자리까지가 곧 라벨의 예산이 되는데, 그 예산은 영어를
 * 재서 잡게 된다. 열 언어 중 가장 긴 것(아랍어 · 인도네시아어)이 그 폭을 넘어
 * 자의 첫 칸을 파고들었다. 줄을 갈라 예산 자체를 없앤다.
 */
const ADDS_LABEL_Y = CHECK_Y + CHECK_TILE + 14;
const RULE_Y = ADDS_LABEL_Y + 6;

const FIND_LABEL_Y = RULE_Y + TICK_H + 16;

const GRID_SIDE = 224;
const CELL = GRID_SIDE / P_NP_GRID_COLS;
const GRID_GAP = 100;
const GRID_Y = FIND_LABEL_Y + 12;
const LOWER_X = Math.round((W - (GRID_SIDE * 2 + GRID_GAP)) / 2);
const UPPER_X = LOWER_X + GRID_SIDE + GRID_GAP;
/** 격자 발치도 두 줄이다 — 라벨과 수를 한 줄에 두면 긴 번역이 수를 밀어낸다. */
const GRID_FOOT_Y = GRID_Y + GRID_SIDE + 14;
const GRID_VALUE_Y = GRID_FOOT_Y + 15;

const LADDER_Y = GRID_VALUE_Y + 24;

/**
 * 캡션은 두 줄까지 쓴다.
 *
 * 한 줄로 두면 영어에서도 넘치고(가장 긴 캡션이 캔버스 폭을 넘는다) 번역은 더
 * 길다. 자리는 **늘 두 줄만큼** 잡아 두어, 한 줄짜리 캡션이 와도 세로가 흔들리지
 * 않는다 (S-view: 세로는 마운트한 뒤 바뀌지 않는다).
 */
const CAPTION_Y = LADDER_Y + 26;
const CAPTION_LINE_H = 15;
const CAPTION_MAX_LINES = 2;
const CAPTION_W = W - PAD * 2;
const CAPTION_FONT_PX = parseFloat(fontSizes.sm);
const H = CAPTION_Y + CAPTION_LINE_H * (CAPTION_MAX_LINES - 1) + 12;

/**
 * 글자 폭 어림.
 *
 * 러너가 도는 곳에 실제 글자 계측기가 있다는 보장이 없고(happy-dom), 있더라도
 * 마운트 시점에 재면 화면마다 답이 갈린다. 그래서 자로 재지 않고 **글자의 종류**로
 * 셈한다 — 한중일 글자는 한 칸을 통째로 쓰고 나머지는 그 절반 남짓이다.
 */
/**
 * **값으로 읽는 수**에 천 단위 구분을 넣는다.
 *
 * 표기가 두 층위다 — 식의 일부(계수 · 지수 · `n-1` 같은 것)는 구분 없이 적고, "후보
 * 1,048,576 가지" 처럼 크기를 읽는 자리에는 넣는다. 이 화면에 뜨는 수는 전부 뒤쪽이라
 * 다 넣는다. 자릿수가 일곱까지 가므로 구분이 없으면 눈으로 셀 수 없다.
 *
 * `toLocaleString` 을 쓰지 않는다 — 환경마다 ICU 가 달라 답이 갈리고, locale 에 따라
 * 자릿수 글자 자체가 바뀌어 무엇이 뜰지 검사가 못 박는다.
 */
function groupDigits(n: number): string {
  const digits = String(Math.trunc(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return n < 0 ? `-${digits}` : digits;
}

function textWidth(s: string, size: number): number {
  let units = 0;
  for (const ch of s) {
    units += /[　-〿぀-ヿ㐀-鿿가-힯＀-￯]/.test(ch)
      ? 1
      : 0.56;
  }
  return units * size;
}

/** 한 줄에 안 담기면 나눈다. 띄어쓰기가 없는 언어는 글자에서 끊는다. */
function wrapText(s: string, size: number, budget: number, maxLines: number): string[] {
  if (s === '') return [];
  if (textWidth(s, size) <= budget) return [s];

  const lines: string[] = [];
  let line = '';
  const flush = (): void => {
    if (line !== '') lines.push(line);
    line = '';
  };

  for (const token of s.split(/(\s+)/)) {
    if (token === '') continue;
    if (textWidth(line + token, size) <= budget) {
      line += token;
      continue;
    }
    // 줄 끝에서 넘친 것이 공백이면 그냥 버린다 — 다음 줄이 공백으로 시작하지 않게.
    if (/^\s+$/.test(token)) {
      flush();
      continue;
    }
    flush();
    if (textWidth(token, size) <= budget) {
      line = token;
      continue;
    }
    // 한 덩이가 이미 한 줄을 넘는다 (띄어쓰기로 끊기지 않는 언어).
    for (const ch of token) {
      if (textWidth(line + ch, size) > budget) flush();
      line += ch;
    }
  }
  flush();
  return lines.slice(0, maxLines);
}

type Attrs = Record<string, string | number>;

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

function textEl(x: number, y: number, value: string, attrs: Attrs): SVGTextElement {
  const t = svgEl('text', { x, y, 'font-family': fonts.body, ...attrs });
  t.textContent = value;
  return t;
}

function clear(g: SVGGElement): void {
  while (g.firstChild) g.removeChild(g.firstChild);
}

export type PNpProblemFrame = { values: number[]; target: number; n: number; adds: number };
export type PNpSumFrame = { picked: number[]; sum: number; used: number };
export type PNpVerdictFrame = { sum: number; target: number; ok: boolean };
export type PNpSweepFrame = { seen: number; total: number };

export const pNpStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    // 컨테이너는 손대지 않는다 — 러너가 캔버스를 거기 먼저 붙여 두었고, 비우면
    // 그 캔버스가 떨어져 나간다 (S-view). 그릴 자리는 `params.canvas` 안쪽이다.
    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const canvas = params.canvas;

    const root = svgEl('g', {});
    const gTop = svgEl('g', {});
    const gCheck = svgEl('g', {});
    const gFind = svgEl('g', {});
    const gLadder = svgEl('g', {});
    const gCaption = svgEl('g', {});
    root.append(gTop, gCheck, gFind, gLadder, gCaption);
    canvas.appendChild(root);

    // ── 초기 데이터 좁히기 (C9). 좁히는 자리는 여기 한 곳이다.
    const initial = params.initialData ?? {};
    const rawValues = initial['values'];
    const allValues = Array.isArray(rawValues)
      ? rawValues.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      : [];
    const initialN = typeof initial['n'] === 'number' ? initial['n'] : (P_NP_N_TICKS[0] ?? 6);
    const initialTarget = typeof initial['target'] === 'number' ? initial['target'] : 0;

    // ── 걸음마다 바뀌는 상태.
    let n = initialN;
    let values = allValues.slice(0, initialN);
    let target = initialTarget;
    /** 후보 하나를 들여다보는 값 — 자의 칸 수. */
    let adds = Math.max(0, initialN - 1);
    /** 건네받은 후보가 실제로 쓴 덧셈. 자의 칠해지는 칸 수. */
    let used = -1;
    /** 확인 줄에 선 후보의 수들과 합. 아직 안 섰으면 null. */
    let picked: number[] | null = null;
    let sum: number | null = null;
    let verdict: boolean | null = null;
    /** 찾기 쪽이 세어 놓은 후보의 수. 세기 전에는 0 이다. */
    let candidates = 0;
    /** 지금까지 들여다본 후보. */
    let seen = 0;
    /** 독자가 밀어 본 n 값. 사다리가 이것으로 채워진다. */
    const visited = new Set<number>();

    const chipW = (): number =>
      Math.max(
        18,
        Math.min(
          CHIP_MAX_W,
          Math.floor((PLATE_X - PAD - 16 - CHIP_GAP * Math.max(0, n - 1)) / Math.max(1, n)),
        ),
      );
    const chipX = (i: number): number => PAD + i * (chipW() + CHIP_GAP);

    // ── 위 — 고를 수 있는 수와 목표 ──────────────────────────────────────
    function drawTop(): void {
      clear(gTop);
      const w = chipW();

      gTop.appendChild(
        textEl(PAD, CHIP_Y - LABEL_DROP + 4, tr('label.numbers', 'Numbers to choose from'), {
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }),
      );

      values.forEach((value, i) => {
        const x = chipX(i);
        gTop.appendChild(
          svgEl('rect', {
            x,
            y: CHIP_Y,
            width: w,
            height: CHIP_H,
            rx: 4,
            fill: colors.itemDefault,
            stroke: colors.border,
            'stroke-width': 1,
          }),
        );
        gTop.appendChild(
          textEl(x + w / 2, CHIP_Y + CHIP_H / 2 + 4, String(value), {
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            'text-anchor': 'middle',
            fill: colors.text,
          }),
        );
      });

      // 목표 라벨은 판 **왼쪽 옆**이 아니라 머리 줄에 선다.
      //
      // 옆에 두면 그 라벨의 폭이 곧 칩 줄의 예산이 되는데, 칩은 손잡이를 따라
      // 자란다 — n=15 에서 이미 라벨을 파고들었다. 라벨과 내용이 가로로 예산을
      // 다투게 두지 않는다 (덧셈 자의 라벨과 같은 까닭, 같은 처방).
      gTop.appendChild(
        textEl(PLATE_X + PLATE_W, CHIP_Y - LABEL_DROP + 4, tr('label.target', 'Target'), {
          'font-size': fontSizes.xs,
          'text-anchor': 'end',
          fill: colors.textMuted,
        }),
      );
      gTop.appendChild(
        svgEl('rect', {
          x: PLATE_X,
          y: CHIP_Y,
          width: PLATE_W,
          height: CHIP_H,
          rx: 4,
          fill: colors.itemPivot,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      gTop.appendChild(
        textEl(PLATE_X + PLATE_W / 2, CHIP_Y + CHIP_H / 2 + 5, String(target), {
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'text-anchor': 'middle',
          fill: colors.stateInk,
        }),
      );
    }

    // ── 확인 줄 ─────────────────────────────────────────────────────────
    function drawCheck(): void {
      clear(gCheck);

      gCheck.appendChild(
        textEl(PAD, CHECK_LABEL_Y, tr('label.check', 'Checking one handed to you'), {
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }),
      );

      // 후보 한 칸. 찾기 격자의 칸과 같은 뜻이고, 확인은 이것 하나로 끝난다.
      const lit = picked !== null;
      gCheck.appendChild(
        svgEl('rect', {
          x: PAD,
          y: CHECK_Y,
          width: CHECK_TILE,
          height: CHECK_TILE,
          rx: 3,
          fill: verdict === true ? colors.itemPivot : lit ? colors.itemComparing : colors.bgSubtle,
          stroke: lit ? colors.stateInk : colors.border,
          'stroke-width': 1,
        }),
      );
      // 들여다본 후보의 수. 늘 하나다 — 그것이 이 줄의 전부다.
      gCheck.appendChild(
        textEl(PAD + CHECK_TILE + 8, CHECK_Y + CHECK_TILE / 2 + 4, lit ? '1' : '—', {
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.text,
        }),
      );

      // 고른 수와 합.
      const listX = PAD + CHECK_TILE + 30;
      if (picked !== null) {
        gCheck.appendChild(
          textEl(listX, CHECK_Y + CHECK_TILE / 2 + 4, picked.join(' + '), {
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: colors.text,
          }),
        );
      }
      if (sum !== null) {
        gCheck.appendChild(
          svgEl('rect', {
            x: PLATE_X,
            y: CHECK_Y,
            width: SUM_W,
            height: CHECK_TILE,
            rx: 3,
            fill: verdict === true ? colors.itemPivot : colors.itemDefault,
            stroke: verdict === true ? colors.itemPivot : colors.border,
            'stroke-width': 1,
          }),
        );
        gCheck.appendChild(
          textEl(PLATE_X + SUM_W / 2, CHECK_Y + CHECK_TILE / 2 + 4, String(sum), {
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'text-anchor': 'middle',
            fill: verdict === true ? colors.stateInk : colors.text,
          }),
        );
      }

      // 덧셈 자 — 칸이 `adds` 개(최악)이고 이번 후보가 쓴 만큼만 칠해진다.
      // 손잡이를 밀면 이 자가 길어지지만 **한 칸씩** 길어진다. 그것이 이 줄의 주장이다.
      gCheck.appendChild(
        textEl(PAD, ADDS_LABEL_Y, tr('label.adds', 'Additions'), {
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }),
      );
      const ruleY = RULE_Y;
      const ruleX = PAD;
      for (let i = 0; i < adds; i += 1) {
        const on = used >= 0 && i < used;
        gCheck.appendChild(
          svgEl('rect', {
            x: ruleX + i * (TICK_W + TICK_GAP),
            y: ruleY,
            width: TICK_W,
            height: TICK_H,
            rx: 2,
            fill: on ? colors.itemComparing : colors.bg,
            stroke: on ? colors.stateInk : colors.ghostOutline,
            'stroke-width': 1,
            ...(on ? {} : { 'stroke-dasharray': '2 2' }),
          }),
        );
      }
      gCheck.appendChild(
        textEl(
          ruleX + adds * (TICK_W + TICK_GAP) + 8,
          ruleY + TICK_H - 2,
          used >= 0 ? `${used} / ${adds}` : String(adds),
          {
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          },
        ),
      );
    }

    // ── 찾기 줄 — 접힌 격자 두 층 ────────────────────────────────────────

    /** 격자 한 장의 유령 바탕과 칸 선. 판이 여기까지 커진다는 뜻이다. */
    function drawLattice(x0: number): void {
      for (let i = 0; i <= P_NP_GRID_COLS; i += 1) {
        const heavy = i % 8 === 0;
        gFind.appendChild(
          svgEl('line', {
            x1: x0 + i * CELL,
            y1: GRID_Y,
            x2: x0 + i * CELL,
            y2: GRID_Y + GRID_SIDE,
            stroke: heavy ? colors.border : colors.ghostOutline,
            'stroke-width': heavy ? 1 : 0.4,
            opacity: heavy ? 1 : 0.5,
          }),
        );
        gFind.appendChild(
          svgEl('line', {
            x1: x0,
            y1: GRID_Y + i * CELL,
            x2: x0 + GRID_SIDE,
            y2: GRID_Y + i * CELL,
            stroke: heavy ? colors.border : colors.ghostOutline,
            'stroke-width': heavy ? 1 : 0.4,
            opacity: heavy ? 1 : 0.5,
          }),
        );
      }
    }

    /**
     * 칸을 왼쪽 위부터 `count` 개 칠한다.
     *
     * 낱낱의 사각형을 천 개 만들지 않는다 — 꽉 찬 줄은 한 덩이로, 남는 칸만 한
     * 덩이로 그린다. 후보의 수는 2 의 거듭제곱이라 64 이상이면 늘 줄이 딱 떨어진다.
     */
    function fillCells(x0: number, count: number, fill: string): void {
      if (count <= 0) return;
      const rows = Math.floor(count / P_NP_GRID_COLS);
      const rest = count % P_NP_GRID_COLS;
      if (rows > 0) {
        gFind.appendChild(
          svgEl('rect', {
            x: x0,
            y: GRID_Y,
            width: GRID_SIDE,
            height: rows * CELL,
            fill,
            stroke: 'none',
          }),
        );
      }
      if (rest > 0) {
        gFind.appendChild(
          svgEl('rect', {
            x: x0,
            y: GRID_Y + rows * CELL,
            width: rest * CELL,
            height: CELL,
            fill,
            stroke: 'none',
          }),
        );
      }
    }

    function drawFind(): void {
      clear(gFind);

      gFind.appendChild(
        textEl(PAD, FIND_LABEL_Y, tr('label.find', 'Finding one yourself'), {
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }),
      );

      // 아래층은 자(尺)다 — 한 장이 꽉 차면 더 자라지 않고, 넘치는 몫이 위층으로 간다.
      const sheets = Math.floor(candidates / P_NP_SHEET);
      const rest = candidates % P_NP_SHEET;
      const lowerHeld = sheets > 0 ? P_NP_SHEET : rest;
      const upperHeld = Math.min(P_NP_SHEET, sheets);

      // 훑기는 전체에 대한 몫이므로 두 층에 같은 비로 나눠 칠한다.
      const ratio = candidates > 0 ? Math.min(1, seen / candidates) : 0;
      const lowerSeen = Math.round(lowerHeld * ratio);
      const upperSeen = Math.round(upperHeld * ratio);

      for (const x0 of [LOWER_X, UPPER_X]) {
        gFind.appendChild(
          svgEl('rect', {
            x: x0,
            y: GRID_Y,
            width: GRID_SIDE,
            height: GRID_SIDE,
            fill: colors.bg,
            stroke: colors.ghostOutline,
            'stroke-width': 1,
            'stroke-dasharray': '3 4',
          }),
        );
      }

      fillCells(LOWER_X, lowerHeld, colors.bgSubtle);
      fillCells(LOWER_X, lowerSeen, colors.itemComparing);
      fillCells(UPPER_X, upperHeld, colors.bgSubtle);
      fillCells(UPPER_X, upperSeen, colors.itemComparing);

      drawLattice(LOWER_X);
      drawLattice(UPPER_X);

      // 접는 자리 — 아래층 한 장이 통째로 위층의 칸 하나다.
      const bridgeY = GRID_Y + GRID_SIDE / 2;
      gFind.appendChild(
        svgEl('line', {
          x1: LOWER_X + GRID_SIDE + 6,
          y1: bridgeY,
          x2: UPPER_X - 12,
          y2: GRID_Y + CELL / 2,
          stroke: sheets > 0 ? colors.risingMarker : colors.ghostOutline,
          'stroke-width': 1,
          ...(sheets > 0 ? {} : { 'stroke-dasharray': '2 3' }),
        }),
      );
      gFind.appendChild(
        svgEl('rect', {
          x: UPPER_X - 1,
          y: GRID_Y - 1,
          width: CELL + 2,
          height: CELL + 2,
          fill: 'none',
          stroke: sheets > 0 ? colors.risingMarker : colors.ghostOutline,
          'stroke-width': 1.5,
        }),
      );

      gFind.appendChild(
        textEl(LOWER_X, GRID_FOOT_Y, tr('label.sheet', 'One sheet holds {n} candidates', {
          n: groupDigits(P_NP_SHEET),
        }), {
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }),
      );
      gFind.appendChild(
        textEl(UPPER_X, GRID_FOOT_Y, tr('label.sheets', 'Sheets needed'), {
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }),
      );
      gFind.appendChild(
        textEl(LOWER_X + GRID_SIDE, GRID_VALUE_Y, candidates > 0 ? groupDigits(candidates) : '—', {
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'text-anchor': 'end',
          fill: colors.text,
        }),
      );
      gFind.appendChild(
        textEl(UPPER_X + GRID_SIDE, GRID_VALUE_Y, candidates > 0 ? groupDigits(sheets) : '—', {
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'text-anchor': 'end',
          fill: colors.text,
        }),
      );
    }

    // ── 사다리 — 밀어 본 자리 ────────────────────────────────────────────
    function drawLadder(): void {
      clear(gLadder);
      const span = W - PAD * 2;
      P_NP_N_TICKS.forEach((tick, i) => {
        const x = PAD + (i * span) / Math.max(1, P_NP_N_TICKS.length - 1);
        const here = tick === n;
        const been = visited.has(tick);
        gLadder.appendChild(
          svgEl('circle', {
            cx: x,
            cy: LADDER_Y - 10,
            r: here ? 4.5 : 3,
            fill: been ? colors.itemPivot : 'none',
            stroke: been || here ? colors.risingMarker : colors.ghostOutline,
            'stroke-width': 1,
            ...(been || here ? {} : { 'stroke-dasharray': '2 2' }),
          }),
        );
        gLadder.appendChild(
          textEl(x, LADDER_Y + 8, String(tick), {
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            'text-anchor': 'middle',
            'font-weight': here ? '600' : '400',
            fill: here ? colors.text : colors.textMuted,
          }),
        );
      });
    }

    function drawCaption(text: string): void {
      clear(gCaption);
      // 두 줄까지 나눠 담는다. 자리는 늘 두 줄만큼 잡혀 있으므로 세로는 그대로다.
      wrapText(text, CAPTION_FONT_PX, CAPTION_W, CAPTION_MAX_LINES).forEach((line, i) => {
        gCaption.appendChild(
          textEl(W / 2, CAPTION_Y + i * CAPTION_LINE_H, line, {
            'font-size': fontSizes.sm,
            'text-anchor': 'middle',
            fill: colors.text,
          }),
        );
      });
    }

    function drawAll(): void {
      drawTop();
      drawCheck();
      drawFind();
      drawLadder();
    }

    function resetRound(): void {
      used = -1;
      picked = null;
      sum = null;
      verdict = null;
      candidates = 0;
      seen = 0;
    }

    // 첫 그림. 알고리즘이 곧 problem 으로 덮지만, 그 전에도 화면은 비어 있지 않다.
    drawAll();
    drawCaption('');

    return {
      destroy(): void {
        // 타이머도 프레임 루프도 구독도 없다 — 붙인 노드만 거둔다.
        if (root.parentNode) root.parentNode.removeChild(root);
      },

      setProblem(frame: PNpProblemFrame): void {
        n = frame.n;
        values = [...frame.values];
        target = frame.target;
        adds = frame.adds;
        resetRound();
        drawAll();
      },

      showSum(frame: PNpSumFrame): void {
        picked = [...frame.picked];
        sum = frame.sum;
        used = frame.used;
        drawCheck();
      },

      showVerdict(frame: PNpVerdictFrame): void {
        sum = frame.sum;
        verdict = frame.ok;
        drawCheck();
      },

      countCandidates(frame: { candidates: number }): void {
        candidates = frame.candidates;
        seen = 0;
        drawFind();
      },

      sweep(frame: PNpSweepFrame): void {
        candidates = frame.total;
        seen = frame.seen;
        drawFind();
      },

      settle(): void {
        visited.add(n);
        drawLadder();
      },

      setCaption(text: string): void {
        drawCaption(text);
      },

      resetAll(): void {
        n = initialN;
        values = allValues.slice(0, initialN);
        target = initialTarget;
        adds = Math.max(0, initialN - 1);
        resetRound();
        visited.clear();
        drawAll();
        drawCaption('');
      },
    };
  },
};
