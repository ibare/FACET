/**
 * fixed-length-stage View — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이 말하는
 * 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요 없다 (S-scene).
 *
 * 이 조각의 동사는 **접힌다** 이므로, 길이가 제각각인 입력이 실제로 같은 폭으로
 * 줄어들며 오른쪽으로 건너가야 한다 (S-piece). 상자 넷을 순서대로 나타나게 하면
 * "무엇을 넣든 같은 길이" 가 "상자 넷이 나란하다" 로 약해진다.
 *
 * 네 줄이 동시에 접히는 것이 요점이다 — 출발 폭은 넷 다 다른데 도착 폭이 하나로
 * 모이는 장면이 이 조각의 주장이다.
 *
 * 두 열로 대비한다:
 *   - 왼쪽: 입력 문자열 그대로. 길이가 제각각이고 가장 긴 것은 잘려 나간다
 *   - 오른쪽: 해시 상자. 마지막 걸음에서 좌우 안내선이 넷의 끝이 한 자리임을 짚는다
 *
 * 입력을 막대로 추상하지 않고 문자열 그대로 두는 이유:
 *   길이는 글자 수가 곧 길이다. 막대로 바꾸면 축척을 설명해야 하고, 축척을
 *   설명하는 순간 조각이 두 가지를 말하게 된다. 마지막 행이 화면 밖으로 잘리는
 *   것도 "더 길어도 마찬가지" 를 말없이 전한다.
 *
 * ── 이행이 고친 화면 — 결론이 셈이 아니라 상수였다 (함정 34)
 *
 * 옛 화면은 상자 폭을 상수 `BOX_W = 200` 으로 그렸다. 넷이 같은 폭인 것은 자료가
 * 그래서가 아니라 **코드가 그렇게 그려서**였고, "언제나 N비트" 의 N 도 선언의
 * `hashBits` 를 받아 적은 것이라 화면에 뜨는 해시 문자열과 **두 출처**였다.
 * 곧 조각의 결론이 그림과 다른 자료에서 나오고 있었다.
 *
 * 지금은 상자 폭이 `hash.length` 에서 나오고 비트 수도 거기서 센다
 * (`uniformHexDigitsOf` · `outputBitsOf`). 길이가 다른 해시를 넣으면 상자가 실제로
 * 어긋나고 "언제나 N비트" 는 아예 서지 않는다.
 *
 * ── 채움과 테두리를 가른다
 *
 * - **채움(fill) = 값의 형편** — 상자는 `bgSubtle` 로 차 있고 그 안에 hex 가 앉는다.
 *   빈 입력의 글자만 `textMuted` 로 눕혀 "이것은 입력이 아니라 빈 것을 이르는 말"
 *   임을 말한다.
 * - **테두리(stroke) = 짚음의 표식** — 상자 테두리가 강조색으로 서는 것은 "좌우
 *   안내선이 이 넷을 함께 짚었다" 는 표식이다. **머무는 표식**이라 정적 그리기가
 *   세우고, 되짚어도 남는다.
 *
 * 그래서 완주 화면에 *길이가 제각각인 입력*과 *끝이 한 자리인 출력*이 함께 선다 —
 * 견줄 짝이 한 화면에 있어야 이 조각의 주장이 선다 (함정 7).
 *
 * ── CSS transition 을 쓰지 않는다
 *
 * 옛 stage 는 `style.transition` 을 걸어 두고 `later()` 로 한 틱 뒤에 값을 바꾸는
 * 짜임이라 일곱 곳이 그것을 지났다. 되짚기는 `animate:false` 로 오는데 transition 은
 * 그 뒤에도 화면을 저 혼자 흘러가게 하므로 흔들림 축을 구조적으로 통과할 수 없다
 * (S-scene MUST NOT). 전부 `tween` 보간으로 옮겼다. 벽시계는 `setTimeout` 으로 재고
 * rAF 를 쓰지 않는다 — 걸음이 프레임 없는 자리에서도 돌아야 하기 때문이다.
 *
 * 한 걸음에서 흐르는 것이 여럿이면 **시계를 나누지 않고** 한 `tween` 안에서 행마다
 * 시차를 준다. 그래야 네 줄이 나란히 접히는 것이 우연이 아니게 되고, `render` 의
 * Promise 도 넷이 다 선 뒤에 구조적으로 풀린다.
 *
 * ── 색 토큰 (S-view 결정 트리)
 *   - 입력 문자열 — palette.text (빈 입력의 말은 palette.textMuted)
 *   - 해시 상자 — palette.bgSubtle 바탕에 palette.textMuted 글자
 *   - 안내선과 "언제나 N비트" — palette.accent (사건 강조)
 *
 * 세로는 이 파일이 상수로 갖고 마운트한 뒤 바뀌지 않는다 (S-view). 가로는 러너가
 * `PIECE_CANVAS_W` 로 준다.
 *
 * 걸어 둔 타이머는 집합에 담아 `destroy` 에서 일괄로 거두고 기다리던 promise 도 함께
 * 깨운다 — 그러지 않으면 unmount 뒤에도 `render` 의 `await` 가 영영 안 돌아온다
 * (S-piece).
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  captionOf,
  outputBitsOf,
  type FixedLengthCaption,
  type FixedLengthSceneRow,
  type HashFixedLengthScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 캔버스 세로. 내용이 정하는 값이라 그림 곁에 둔다 (S-view). */
const H = 288;

// ── 열 좌표 ─────────────────────────────────────────────────────────────
const INPUT_X = 20;
/** 입력 문자열이 잘리는 지점. 넘치는 것은 여기서 끊는다. */
const INPUT_CLIP_W = 300;
const BYTES_X = 366;
const ARROW_X = 382;
const BOX_X = 400;
/** 상자 오른쪽에 남기는 여백. 가장 긴 해시가 여기까지 차지한다. */
const BOX_RIGHT_PAD = 20;
const BOX_H = 22;

// ── 행 ──────────────────────────────────────────────────────────────────
const ROW_Y0 = 88;
const ROW_PITCH = 34;
/** 글자의 기준선은 상자 위끝에서 이만큼 아래다. */
const TEXT_DY = 15;

const CAPTION_Y = 34;
const HEADER_Y = 68;
const UNIFORM_LABEL_Y = 244;

// ── 박자 ────────────────────────────────────────────────────────────────
/** 행이 하나씩 나타나는 시차 (ms). */
const ROW_STEP_MS = 90;
/** 나타나고 사라지는 데 드는 시간 (ms). */
const FADE_MS = 200;
/** 입력이 상자 폭으로 접혀 건너가는 시간 (ms). */
const FOLD_MS = 560;
/** 안내선이 좌우 끝을 짚는 시간 (ms). */
const MARK_MS = 220;
/** 보간 한 프레임. rAF 가 아니라 벽시계로 잰다. */
const FRAME_MS = 16;

/** mono 12px 한 글자의 대략적 폭. 접힘 출발 폭을 재는 데 쓴다. */
const CHAR_W = 7.2;
/** 빈 입력도 접히는 것이 보여야 하므로 출발 폭에 하한을 둔다. */
const MIN_SRC_W = 10;
/** 상자 안 hex 글자의 대략적 폭. 몇 자가 들어가는지 재는 데 쓴다. */
const HEX_CHAR_W = 6.6;
/** 상자 안쪽 좌우 여백. */
const HEX_PAD = 8;

/** 도형에 새겨지는 표식 — 번역 대상이 아니다 (C10 판정 1·3). */
const ARROW_SIGN = '→';
const ELLIPSIS = '…';
/** 바이트를 이르는 단위 기호. */
const BYTE_SIGN = 'B';

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Attrs = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);
const easeOut = (p: number): number => 1 - (1 - p) ** 3;
const easeInOut = (p: number): number => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);

/**
 * 보간이 끝나면 속성을 **지운다**.
 *
 * `setAttribute(…, '1')` 로 되돌리면 흘려 세운 화면에만 그 속성이 남아 곧바로 세운
 * 화면과 글자 하나가 어긋난다 (프로토콜 4 절).
 */
function fade(node: Element, e: number): void {
  if (e >= 1) node.removeAttribute('opacity');
  else node.setAttribute('opacity', String(e));
}

function fadeStroke(node: Element, e: number): void {
  if (e >= 1) node.removeAttribute('stroke-opacity');
  else node.setAttribute('stroke-opacity', String(e));
}

/**
 * 자리와 치수. 바탕에서 매번 셈하므로 걸음마다 같은 값이 나온다.
 *
 * 척도를 `mount` 이 한 번 재어 클로저에 적어 두면 정하는 자리와 쓰는 자리가
 * 갈라진다 — 장면이 담는 것은 픽셀이 아니라 값이다 (S-piece).
 */
type Geom = {
  /** hex 한 자리가 차지하는 가로. 가장 긴 해시가 남은 폭을 꽉 채우도록 정한다. */
  unit: number;
  /** 가장 넓은 상자의 폭. 안내선의 오른쪽이 여기 선다. */
  widest: number;
  /** 그 행의 상자 폭. **해시 글자 수에서 나온다** — 상수가 아니다 (함정 34). */
  boxW(row: FixedLengthSceneRow): number;
  /** 그 행의 위끝 y. */
  rowY(index: number): number;
};

/** 해시 문자열에서 상자 폭이 나온다. 넷이 같은 폭인 것은 넷이 같은 길이여서다. */
function geomOf(scene: HashFixedLengthScene): Geom {
  const widestDigits = scene.rows.reduce((most, row) => Math.max(most, row.hash.length), 0);
  const room = W - BOX_X - BOX_RIGHT_PAD;
  const unit = widestDigits > 0 ? room / widestDigits : 0;
  return {
    unit,
    widest: widestDigits * unit,
    boxW: (row: FixedLengthSceneRow): number => row.hash.length * unit,
    rowY: (index: number): number => ROW_Y0 + index * ROW_PITCH,
  };
}

/** 상자에 들어가는 만큼만 hex 를 자른다. 넘치면 끝에 말줄임을 단다. */
function hexLabel(hash: string, boxW: number): string {
  const room = Math.floor((boxW - HEX_PAD * 2) / HEX_CHAR_W);
  if (room < 1) return '';
  if (hash.length <= room) return hash;
  return `${hash.slice(0, room - 1)}${ELLIPSIS}`;
}

/**
 * 정적 그리기가 세워 둔 손잡이.
 *
 * `render` 안에서만 살고 밖으로 새지 않는다. 뜻이나 수치를 여기 싣지 않는다 —
 * 옛 `RowNodes` 는 접힘 출발 폭까지 한 객체에 묶어 두어 손잡이와 상태가 섞여
 * 있었다 (함정 24).
 */
type DrawnRow = {
  input: SVGTextElement;
  bytes: SVGTextElement;
  /** 해시를 내놓기 전에는 없다 — 숨기지 않고 짓지 않는다 (함정 17). */
  arrow: SVGTextElement | null;
  outRow: SVGGElement | null;
  box: SVGRectElement | null;
};

type Drawn = {
  geom: Geom;
  rows: DrawnRow[];
  guides: SVGLineElement[];
  uniformLabel: SVGTextElement | null;
  /** 접혀 건너가는 복제본이 사는 층. 운동 중에만 자식이 있다. */
  fold: SVGGElement;
};

export const fixedLengthStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<HashFixedLengthScene> {
    const svg = params.canvas;
    const palette: Palette = getColors(params.theme);
    const HOT = palette.accent;
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t: Translate = params.t ?? makeTranslator(params.locale);
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    // 입력 열을 넘치는 글자에서 끊는 클립. 잘림 자체가 "더 길다" 는 표시다.
    // 재건 밖에 한 번만 짓는다 — id 를 가진 요소라 걸음마다 다시 지을 것이 아니다.
    const defs = el('defs');
    const clip = el('clipPath', { id: 'fixedLengthInputClip' });
    clip.appendChild(el('rect', { x: INPUT_X, y: 0, width: INPUT_CLIP_W, height: H }));
    defs.appendChild(clip);
    svg.appendChild(defs);

    /** 걸음마다 통째로 다시 세우는 층. 정적 그리기가 비우고 채운다. */
    const root = el('g');
    svg.appendChild(root);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 여러 프레임을 지난다. `destroy` 가 그 가운데 오면 남은 프레임이
     * 이미 떨어져 나간 화면에 쓰므로, 프레임마다 자기 번호가 아직 유효한지 보고
     * 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서 그것을 부르지
     * 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 보간 한 마디.
     *
     * CSS `transition` 을 쓰지 않는다 (S-scene MUST NOT). `resolve` 를 `waiters` 에
     * 담아 두므로 `destroy` 가 타이머를 취소해도 기다리던 약속이 함께 풀린다 —
     * 콜백 안에만 두면 취소된 tick 이 아예 안 불려 약속이 영영 안 풀린다 (S-piece).
     */
    function tween(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) {
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (!alive(mine)) {
            finish();
            return;
          }
          const p = ms <= 0 ? 1 : clamp01((Date.now() - started) / ms);
          draw(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        // 첫 마디를 곧바로 그린다 — 기다리면 그 사이에 끝 자리가 번쩍인다.
        tick();
      });
    }

    // ── 글자 ─────────────────────────────────────────────────────────────

    function text(
      x: number,
      y: number,
      opts: {
        anchor?: string;
        fill?: string;
        size?: string;
        family?: string;
        weight?: string;
      } = {},
    ): SVGTextElement {
      return el('text', {
        x,
        y,
        'text-anchor': opts.anchor ?? 'middle',
        fill: opts.fill ?? palette.text,
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        ...(opts.weight === undefined ? {} : { 'font-weight': opts.weight }),
      });
    }

    /** 빈 입력을 이르는 말. 입력 칸에 그대로 앉으므로 접힘 출발 폭도 이것이 정한다. */
    const emptyLabel = (): string => t('label.empty', '(nothing)');

    /** 그 행의 입력 칸에 실제로 앉는 글자. */
    const inputLabel = (row: FixedLengthSceneRow): string =>
      row.input === '' ? emptyLabel() : row.input;

    /** 접힘이 출발하는 폭. 화면에 앉은 글자 수에서 잰다 — 상태가 아니다. */
    const srcWidth = (row: FixedLengthSceneRow): number =>
      Math.max(MIN_SRC_W, inputLabel(row).length * CHAR_W);

    function captionText(cap: FixedLengthCaption): string {
      switch (cap.kind) {
        case 'inputsVary':
          return t('caption.inputsVary', 'The inputs run from nothing to {bytes} bytes.', {
            bytes: cap.bytes,
          });
        case 'outputsUniform':
          return t(
            'caption.outputsUniform',
            'Every output starts and ends at the same place — {bits} bits, whatever went in.',
            { bits: cap.bits },
          );
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * `step` 을 읽지 않는다 — 읽으면 흘려 세운 경로와 곧바로 세운 경로가 같은
     * 걸음을 달리 그릴 여지가 생기고, 그것을 자체 검증이 못 잡는다 (S-scene).
     * 두 번 그려도 그 사이에 타이머도 프레임도 없어 깜빡이지 않는다.
     */
    function drawStatic(scene: HashFixedLengthScene): Drawn {
      root.textContent = '';
      const geom = geomOf(scene);

      const gInputs = el('g', { 'clip-path': 'url(#fixedLengthInputClip)' });
      const gBytes = el('g');
      const gOutputs = el('g');
      const gFold = el('g');
      const gGuides = el('g');
      root.append(gInputs, gBytes, gOutputs, gFold, gGuides);

      const drawn: Drawn = {
        geom,
        rows: [],
        guides: [],
        uniformLabel: null,
        fold: gFold,
      };

      // ── 캡션. 자취가 정하므로 되짚어도 같은 자리에 같은 말이 선다.
      const cap = captionOf(scene);
      if (cap !== null) {
        const node = text(W / 2, CAPTION_Y, { fill: HOT, weight: '600' });
        node.textContent = captionText(cap);
        root.appendChild(node);
      }

      // ── 열 머리글. 담을 것이 생긴 뒤에 선다.
      if (scene.rows.length > 0) {
        const headIn = text(INPUT_X, HEADER_Y, {
          anchor: 'start',
          fill: palette.textMuted,
          size: fontSizes.xs,
        });
        headIn.textContent = t('label.inputColumn', 'input');
        const headOut = text(BOX_X, HEADER_Y, {
          anchor: 'start',
          fill: palette.textMuted,
          size: fontSizes.xs,
        });
        headOut.textContent = t('label.outputColumn', '{algorithm} output', {
          algorithm: scene.algorithmLabel,
        });
        root.append(headIn, headOut);
      }

      // ── 행. 아직 내놓지 않은 것은 숨기지 않고 짓지 않는다 (함정 17).
      if (scene.inputsShown) {
        scene.rows.forEach((row, i) => {
          const y = geom.rowY(i);

          const input = text(INPUT_X, y + TEXT_DY, {
            anchor: 'start',
            family: fonts.mono,
            size: fontSizes.sm,
            ...(row.input === '' ? { fill: palette.textMuted } : {}),
          });
          input.textContent = inputLabel(row);
          gInputs.appendChild(input);

          const bytes = text(BYTES_X, y + TEXT_DY, {
            anchor: 'end',
            fill: palette.textMuted,
            family: fonts.mono,
            size: fontSizes.xs,
          });
          bytes.textContent = `${row.bytes} ${BYTE_SIGN}`;
          gBytes.appendChild(bytes);

          let arrow: SVGTextElement | null = null;
          let outRow: SVGGElement | null = null;
          let box: SVGRectElement | null = null;

          if (scene.outputsShown) {
            arrow = text(ARROW_X, y + TEXT_DY, {
              fill: palette.textMuted,
              size: fontSizes.xs,
            });
            arrow.textContent = ARROW_SIGN;
            gBytes.appendChild(arrow);

            const boxW = geom.boxW(row);
            // 테두리는 짚음의 표식이다 — 안내선이 짚은 뒤로 머문다.
            box = el('rect', {
              x: BOX_X,
              y,
              width: boxW,
              height: BOX_H,
              rx: 3,
              fill: palette.bgSubtle,
              ...(scene.uniform ? { stroke: HOT, 'stroke-width': 1.5 } : {}),
            });
            const hex = text(BOX_X + HEX_PAD, y + TEXT_DY, {
              anchor: 'start',
              fill: palette.textMuted,
              family: fonts.mono,
              size: fontSizes.xs,
            });
            hex.textContent = hexLabel(row.hash, boxW);
            outRow = el('g');
            outRow.append(box, hex);
            gOutputs.appendChild(outRow);
          }

          drawn.rows.push({ input, bytes, arrow, outRow, box });
        });
      }

      // ── 안내선과 딱지. 머무는 표식이라 정적 그리기가 세운다 (S-scene PREFER).
      if (scene.uniform && scene.rows.length > 0 && geom.widest > 0) {
        for (const x of [BOX_X, BOX_X + geom.widest]) {
          const line = el('line', {
            x1: x,
            y1: ROW_Y0 - 8,
            x2: x,
            y2: ROW_Y0 + scene.rows.length * ROW_PITCH - 6,
            stroke: HOT,
            'stroke-width': 1,
            'stroke-dasharray': '3 3',
          });
          gGuides.appendChild(line);
          drawn.guides.push(line);
        }

        const bits = outputBitsOf(scene);
        if (bits !== null) {
          const label = text(BOX_X + geom.widest / 2, UNIFORM_LABEL_Y, {
            fill: HOT,
            family: fonts.mono,
            weight: '600',
          });
          label.textContent = t('label.always', 'always {bits} bits', { bits });
          root.appendChild(label);
          drawn.uniformLabel = label;
        }
      }

      return drawn;
    }

    // ── 걸음 함수 ─────────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 여기서는 아직 못 온 만큼을
    // 뒤로 물리는 꼴이 된다. 출발 그림은 `prev` 를 들추지 않고 바탕에서 셈한다
    // (S-scene).

    /** 길이가 제각각인 입력들이 위에서부터 차례로 놓인다. */
    function flowInputs(drawn: Drawn, mine: number): Promise<void> {
      const rows = drawn.rows;
      if (rows.length === 0) return Promise.resolve();
      const total = (rows.length - 1) * ROW_STEP_MS + FADE_MS;
      return tween(total, mine, (p) => {
        const now = p * total;
        rows.forEach((r, i) => {
          const e = easeOut(clamp01((now - i * ROW_STEP_MS) / FADE_MS));
          fade(r.input, e);
          fade(r.bytes, e);
        });
      });
    }

    /**
     * 네 줄이 나란히 접힌다. 출발 폭은 제각각인데 도착 폭이 하나로 모인다.
     *
     * 시계를 넷으로 나누지 않는다 — 한 시계 안에서 행마다 시차를 주어야 나란함이
     * 우연이 아니게 되고, `render` 의 Promise 도 넷이 다 선 뒤에 풀린다.
     */
    function flowOutputs(
      scene: HashFixedLengthScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const rows = drawn.rows;
      if (rows.length === 0) return Promise.resolve();

      // 복제본은 운동 중에만 산다. 마지막 정적 그리기가 층째 지운다.
      const ghosts = rows.map((_r, i) => {
        const row = scene.rows[i];
        const ghost = el('rect', {
          x: INPUT_X,
          y: drawn.geom.rowY(i),
          width: row === undefined ? MIN_SRC_W : srcWidth(row),
          height: BOX_H,
          rx: 3,
          fill: palette.bgSubtle,
          opacity: 0,
        });
        drawn.fold.appendChild(ghost);
        return ghost;
      });

      const total = (rows.length - 1) * ROW_STEP_MS + FOLD_MS + FADE_MS;
      return tween(total, mine, (p) => {
        const now = p * total;
        rows.forEach((r, i) => {
          const row = scene.rows[i];
          const ghost = ghosts[i];
          const from = i * ROW_STEP_MS;

          if (r.arrow !== null) fade(r.arrow, easeOut(clamp01((now - from) / FADE_MS)));

          const fold = clamp01((now - from) / FOLD_MS);
          if (ghost !== undefined && row !== undefined) {
            if (fold <= 0 || fold >= 1) {
              // 아직 없거나 이미 도착했다 — 숨기지 않고 자리에 세우지 않는다.
              ghost.setAttribute('opacity', '0');
            } else {
              const e = easeInOut(fold);
              const src = srcWidth(row);
              const dst = drawn.geom.boxW(row);
              ghost.setAttribute('opacity', '1');
              ghost.setAttribute('x', String(INPUT_X + (BOX_X - INPUT_X) * e));
              ghost.setAttribute('width', String(src + (dst - src) * e));
            }
          }

          if (r.outRow !== null) {
            fade(r.outRow, easeOut(clamp01((now - from - FOLD_MS) / FADE_MS)));
          }
        });
      });
    }

    /** 좌우 안내선이 상자의 두 끝을 짚는다 — 넷이 한 자리에서 시작하고 끝난다. */
    function flowUniform(drawn: Drawn, mine: number): Promise<void> {
      return tween(MARK_MS, mine, (p) => {
        const e = easeOut(p);
        for (const line of drawn.guides) fade(line, e);
        for (const r of drawn.rows) if (r.box !== null) fadeStroke(r.box, e);
        if (drawn.uniformLabel !== null) fade(drawn.uniformLabel, e);
      });
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: HashFixedLengthScene,
      _prev: HashFixedLengthScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null) return;

      switch (step.kind) {
        case 'inputs':
          await flowInputs(drawn, mine);
          break;
        case 'outputs':
          await flowOutputs(next, drawn, mine);
          break;
        case 'uniform':
          await flowUniform(drawn, mine);
          break;
      }

      if (!alive(mine)) return;
      // 흐르며 남은 속성·보간의 끝자리·복제본이 통째로 사라진다. 되돌릴 목록을
      // 손으로 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 걸어 둔 것을 거두는 것만으로는 모자라다 — 취소된 콜백은 아예 불리지
        // 않으므로 기다리던 것을 직접 깨워야 `await ctx.emit` 이 돌아온다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
