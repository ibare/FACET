/**
 * sign-hash-stage View — 해시에 서명하기 단일 캔버스.
 *
 * 이 조각의 동사는 **접힌다** 이므로, 문서 막대가 실제로 줄어들며 내려가야 한다
 * (S-piece). 막대 셋을 순서대로 나타나게 하면 "접힌다" 가 "크기 목록" 이 된다.
 *
 * 원본은 제자리에 남고 복제본이 줄어들며 내려간다 — 문서가 사라져 해시가 되는
 * 게 아니라, 문서를 재료로 해시가 새로 생기기 때문이다. 서명 단계도 같은
 * 운동이되 이번엔 늘어난다 (32B → 64B).
 *
 * ## 비율이 논증이라 척도를 가장 작은 마디에서 뽑는다
 *
 * 옛 그림은 척도를 **문서 막대**에서 뽑았다 (`BAR_MAX_W / documentBytes`). 그래서
 * 문서는 자료가 무엇이든 언제나 430px 였고 해시와 서명은 최소 폭으로 깎여, 셋 다
 * 사실상 상수였다 — 그림이 주장을 그리지 않고 되풀이만 했다 (함정 34). 머리 주석은
 * "문서 막대가 화면을 넘어간다" 고 적어 두었는데 150 + 430 = 580 이라 넘어가지도
 * 않았다.
 *
 * 지금은 **가장 작은 마디**가 `MIN_BAR_W` 를 갖게 척도를 정하고 나머지는 거기서
 * 참된 비율로 따라 나온다 (`geomOf`). 그러면 3.5MB 문서 막대가 화면을 한참
 * 넘어가고, **잘림 자체가 "얼마든지 커진다"** 가 된다. 눈속임은 하나뿐이다 —
 * 가장 작은 마디를 알아볼 수 있게 띄운 것. 그 전제는 `description.ts` 가 밝힌다
 * (S-piece: 전제는 글이 밝히고 화면에 각주를 두지 않는다).
 *
 * ## 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`showDocument()` · `hashIt()` · `signIt()` · `compare()`) 를
 * 두지 않는다. 그 메서드들은 되돌릴 수 없는 명령이라 임의의 걸음으로 가려면
 * 처음부터 다시 밟는 수밖에 없었다. 대신 `render` 하나가 장면을 받아 화면
 * **전체**를 세우고, 방금 달라진 자리만 흐르게 한다 (S-scene).
 *
 * **CSS 전환(`transition`)을 쓰지 않는다 (S-scene MUST NOT).** 옛 stage 는 세 곳에서
 * 전환을 걸어 두고 한 틱 뒤에 끝 값을 대입했다 — 되짚기는 `animate:false` 로 오는데
 * 전환은 그 뒤에도 화면을 저 혼자 흘러가게 한다. 셋을 전부 `tween` 보간으로 옮겼고,
 * 프레임은 rAF 가 아니라 `setTimeout` 이라 headless 에서도 실제로 돈다.
 *
 * 접히는 운동은 `transform`/`scaleX` 가 아니라 `y`·`width`·`fill` 을 직접 보간한다 —
 * 배율과 `-0` 의 끝자리가 문자열에 남지 않는다 (프로토콜 4 절). 폭이 다섯 자릿수를
 * 건너므로 **기하 보간**(`src · (dst/src)^e`)을 쓴다. 폭을 선형으로 줄이면 시간의
 * 9 할 동안 화면 밖에 머물다가 마지막에 툭 떨어져 "접힌다" 로 읽히지 않는다.
 *
 * ## 두 축을 갈라 둔다 (함정 29)
 *
 * **채움**은 그 마디가 무엇인가 — 문서 · 해시 · 서명. **테두리**는 짚음의 표식 —
 * 마지막 걸음이 서명 마디를 짚어 둔 파선. 둘이 부딪히지 않으므로 짚은 뒤에도 서명이
 * 서명으로 읽힌다.
 *
 * 색 토큰 (S-view 결정 트리):
 *   - 문서 — palette.textMuted
 *   - 해시 — palette.primary
 *   - 서명 — palette.accent (사건 강조)
 *   - 짚음의 표식 — palette.text (값의 세 색과 겹치지 않는 먹색)
 *
 * 세로는 이 파일이 정하고 가로는 러너가 정한다 (S-piece). 색은 전부 design-tokens
 * 경유이며 hex 리터럴은 없다 (S-view).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import { captionOf, type SignHashBase, type SignHashCaption, type SignatureOnHashScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 세로는 내용이 정한다 — 캡션 하나와 마디 셋. */
const H = 224;

const BAR_X = 150;
const BAR_H = 20;
/** 이름과 크기가 오른쪽 맞춤으로 서는 열. 막대는 여기서 18px 떨어져 시작한다. */
const LABEL_X = 132;

const ROW_Y = [72, 130, 188];

const CAPTION_Y = 26;

/**
 * 가장 작은 마디에 주는 폭. 이 그림에서 눈속임은 이것 하나뿐이다.
 *
 * 32 바이트를 3.5MB 와 같은 척도로 그리면 0.004px 라 아예 보이지 않는다. 그래서
 * 가장 작은 마디를 여기까지 띄우고 **나머지는 거기서 참된 비율로** 따라 나오게
 * 한다. 그 전제는 `description.ts` 가 밝힌다 (S-piece).
 */
const MIN_BAR_W = 6;

/** 막대 하나가 다음 마디로 접혀 내려가는 시간 (ms). */
const FOLD_MS = 520;
/** 마디 하나가 자리에 드러나는 시간 (ms). */
const FADE_MS = 240;
/** 짚음의 표식이 드러나는 시간 (ms). */
const MARK_MS = 260;
/** 보간 프레임 간격. rAF 가 아니라 타이머라 headless 에서도 실제로 돈다. */
const FRAME_MS = 16;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Attrs = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/**
 * 바이트 수를 사람이 읽는 단위로. 화면 폭이 좁아 소수점은 한 자리까지만.
 *
 * `B` · `KB` · `MB` 는 번역 대상이 아니다 (C10 의 표식 예외).
 */
function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

/**
 * 두 색 사이. 끝에서는 보간값이 아니라 **목표 hex 를 글자 그대로** 돌려준다 —
 * `rgb(115, 115, 115)` 와 `#737373` 이 문자열로 갈리기 때문이다 (프로토콜 4 절).
 */
function mixColor(from: string, to: string, p: number): string {
  if (p >= 1) return to;
  const a = parseHex(from);
  const b = parseHex(to);
  if (a === null || b === null) return to;
  const at = (i: number): number => Math.round(a[i] + (b[i] - a[i]) * p);
  return `rgb(${at(0)}, ${at(1)}, ${at(2)})`;
}

function parseHex(value: string): [number, number, number] | null {
  const raw = value.trim().replace('#', '');
  const full = raw.length === 3 ? raw.replace(/./g, (ch) => ch + ch) : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * 접히는 도중의 폭. 다섯 자릿수를 건너므로 **기하 보간**이다.
 *
 * 선형으로 줄이면 시간의 9 할 동안 화면 밖에 머물다가 마지막에 툭 떨어진다.
 * 기하로 줄이면 오른쪽 끝이 화면을 가로질러 쓸려 들어와 "접힌다" 로 읽힌다.
 */
function foldWidth(src: number, dst: number, e: number): number {
  if (src <= 0 || dst <= 0) return src + (dst - src) * e;
  return src * (dst / src) ** e;
}

/**
 * 정적 그리기가 세운 손잡이.
 *
 * 걸음 함수는 여기서만 요소를 꺼낸다 — 화면을 되읽지도, 지난 화면의 거울을 들고
 * 다니지도 않는다 (프로토콜 4 절 ④·28).
 */
type Drawn = {
  /** 서 있는 마디들. 차례가 곧 문서 · 해시 · 서명이다. */
  rows: SVGGElement[];
  /** 마디 사이의 화살. 차례가 곧 해시 함수 · 서명 방식이다. */
  arrows: SVGGElement[];
  /** 짚음의 표식. 아직 안 짚었으면 `null`. */
  mark: SVGRectElement | null;
  /** 접히는 복제본이 사는 층. 운동 중에만 자식을 갖는다. */
  fold: SVGGElement;
};

export const signHashStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<SignatureOnHashScene> {
    const palette = getColors(params.theme);
    const DOC = palette.textMuted;
    const DIGEST = palette.primary;
    const SIG = palette.accent;
    /** 짚음의 표식. 값의 세 색과 겹치지 않아야 두 축이 부딪히지 않는다. */
    const MARK = palette.text;
    const TONES = [DOC, DIGEST, SIG];

    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t: Translate = params.t ?? makeTranslator(params.locale);

    const svg = params.canvas;
    const root = el('g');
    svg.appendChild(root);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호 — 세대 빗장.
     *
     * 접히는 걸음은 프레임이 여럿 이어진 사슬이다. `destroy` 가 그 가운데 오면 남은
     * 프레임이 이미 떨어져 나간 화면에 쓰므로, 프레임마다 자기 번호가 아직 유효한지
     * 보고 물러난다.
     *
     * `isInstant` / `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 부르지 않는다 (S-scene).
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

    // ── 배치 ─────────────────────────────────────────────────────────────

    /**
     * 마디 셋의 폭. **가장 작은 것**이 `MIN_BAR_W` 를 갖게 척도를 정하고 나머지는
     * 거기서 참된 비율로 따라 나온다.
     *
     * 좌표는 장면이 아니라 여기서 나온다 (S-piece). 그림에 뜨는 폭이 전부 이 함수를
     * 지나므로 갈릴 자리가 없다.
     */
    function geomOf(base: SignHashBase): number[] {
      const bytes = [base.documentBytes, base.digestBytes, base.signatureBytes];
      const smallest = Math.min(...bytes);
      if (!(smallest > 0)) return bytes.map(() => MIN_BAR_W);
      const scale = MIN_BAR_W / smallest;
      return bytes.map((n) => Math.max(MIN_BAR_W, n * scale));
    }

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
        'text-anchor': opts.anchor ?? 'start',
        fill: opts.fill ?? palette.text,
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size ?? fontSizes.xs,
        ...(opts.weight === undefined ? {} : { 'font-weight': opts.weight }),
      });
    }

    /** 마디 셋의 이름. 차례가 곧 문서 · 해시 · 서명이다. */
    function rowName(i: number): string {
      if (i === 0) return t('label.document', 'document');
      if (i === 1) return t('label.digest', 'digest');
      return t('label.signature', 'signature');
    }

    /** 마디 셋의 바이트 수. 그림의 폭을 정하는 바로 그 수다. */
    function rowBytes(base: SignHashBase, i: number): number {
      if (i === 0) return base.documentBytes;
      if (i === 1) return base.digestBytes;
      return base.signatureBytes;
    }

    function captionText(cap: SignHashCaption): string {
      switch (cap.kind) {
        case 'document':
          return t('caption.document', 'The document can be any size at all.');
        case 'hashed':
          return t('caption.hashed', 'Hashing folds it into {bytes} bytes.', {
            bytes: cap.bytes,
          });
        case 'signed':
          return t('caption.signed', 'The private key signs those {bytes} bytes.', {
            bytes: cap.bytes,
          });
        case 'fixed':
          return t(
            'caption.compare',
            'The signature stays {bytes} bytes while the document beside it is {times} times larger.',
            { bytes: cap.bytes, times: cap.times },
          );
      }
    }

    /**
     * 마디 하나 — 이름 · 바이트 수 · 막대.
     *
     * 이름과 크기를 막대 **왼쪽 열**에 오른쪽 맞춤으로 둔다. 막대 오른쪽에 두던 옛
     * 자리는 문서 막대가 화면을 넘어가면 따라 나가 버린다 (옛 화면에서도 이미
     * x=590 이라 글자가 오른쪽 가장자리를 넘고 있었다).
     */
    function drawRow(base: SignHashBase, i: number, width: number): SVGGElement {
      const y = ROW_Y[i] ?? 0;
      const g = el('g');
      const name = text(LABEL_X, y + 9, { anchor: 'end', fill: palette.textMuted });
      name.textContent = rowName(i);
      const size = text(LABEL_X, y + 23, {
        anchor: 'end',
        family: fonts.mono,
        fill: palette.text,
      });
      size.textContent = formatBytes(rowBytes(base, i));
      const bar = el('rect', {
        x: BAR_X,
        y,
        width,
        height: BAR_H,
        rx: 3,
        fill: TONES[i] ?? DOC,
      });
      g.append(name, size, bar);
      return g;
    }

    /** 마디 사이의 화살 — 무엇이 이 변환을 했는가. */
    function drawArrow(base: SignHashBase, i: number): SVGGElement {
      const yTop = (ROW_Y[i] ?? 0) + BAR_H;
      const yBottom = ROW_Y[i + 1] ?? 0;
      const g = el('g');
      const line = el('line', {
        x1: BAR_X + 10,
        y1: yTop + 4,
        x2: BAR_X + 10,
        y2: yBottom - 4,
        stroke: palette.border,
        'stroke-width': 1.4,
      });
      const label = text(BAR_X + 22, (yTop + yBottom) / 2 + 4, { fill: palette.textMuted });
      label.textContent = i === 0 ? base.hashLabel : base.signatureLabel;
      g.append(line, label);
      return g;
    }

    /**
     * 짚음의 표식 — 서명 마디를 두른 파선.
     *
     * 채움을 건드리지 않는다. 채움은 그 마디가 무엇인가를 말하는 축이고 여기는
     * 짚었다를 말하는 축이다 (함정 29).
     */
    function drawMark(width: number): SVGRectElement {
      return el('rect', {
        x: BAR_X - 3,
        y: (ROW_Y[2] ?? 0) - 3,
        width: width + 6,
        height: BAR_H + 6,
        rx: 5,
        fill: 'none',
        stroke: MARK,
        'stroke-width': 1.2,
        'stroke-dasharray': '3 3',
      });
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * `step` 을 읽지 않는다 — 읽으면 흘려 세운 경로와 곧바로 세운 경로가 같은 걸음을
     * 달리 그릴 여지가 생기고, 그것을 자체 검증이 못 잡는다 (공통 지시문 8 절).
     * 두 번 그려도 그 사이에 타이머도 프레임도 없어 깜빡이지 않는다.
     */
    function drawStatic(scene: SignatureOnHashScene): Drawn {
      root.textContent = '';
      const gArrows = el('g');
      const gRows = el('g');
      const gFold = el('g');
      const gMark = el('g');
      root.append(gArrows, gRows, gFold, gMark);

      const drawn: Drawn = { rows: [], arrows: [], mark: null, fold: gFold };

      // ── 캡션. 자취가 정하므로 되짚어도 같은 자리에 같은 말이 선다.
      const cap = captionOf(scene);
      if (cap !== null) {
        const node = text(W / 2, CAPTION_Y, {
          anchor: 'middle',
          fill: SIG,
          size: fontSizes.sm,
          weight: '600',
        });
        node.textContent = captionText(cap);
        root.appendChild(node);
      }

      const base = scene.base;
      if (base === null) return drawn;

      const widths = geomOf(base);

      // 화살은 마디 사이의 것이라 마디보다 하나 적다. 아직 없는 것은 숨기지 않고
      // 짓지 않는다 (프로토콜 4 절 17).
      for (let i = 0; i + 1 < scene.standing; i += 1) {
        const arrow = drawArrow(base, i);
        gArrows.appendChild(arrow);
        drawn.arrows.push(arrow);
      }

      for (let i = 0; i < scene.standing; i += 1) {
        const row = drawRow(base, i, widths[i] ?? MIN_BAR_W);
        gRows.appendChild(row);
        drawn.rows.push(row);
      }

      if (scene.marked && scene.standing >= 3) {
        const mark = drawMark(widths[2] ?? MIN_BAR_W);
        gMark.appendChild(mark);
        drawn.mark = mark;
      }

      return drawn;
    }

    // ── 걸음 함수 ─────────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 여기서는 아직 못 온 만큼을
    // 뒤로 물리는 꼴이 된다. 출발 그림은 `prev` 를 들추지 않고 바탕에서 셈한다
    // (S-scene).

    /** 끝에서는 속성을 거둔다 — `opacity="1"` 이 남으면 두 화면이 문자열로 갈린다. */
    function fade(node: SVGElement, p: number): void {
      if (p >= 1) node.removeAttribute('opacity');
      else node.setAttribute('opacity', String(p));
    }

    /** 문서가 놓인다. */
    async function flowDocument(drawn: Drawn, mine: number): Promise<void> {
      const row = drawn.rows[0];
      if (row === undefined) return;
      fade(row, 0);
      await tween(FADE_MS, mine, (p) => fade(row, easeOut(p)));
    }

    /**
     * 한 마디가 다음 마디로 접혀 내려간다.
     *
     * 원본은 남고 복제본만 움직인다 — 위가 사라져 아래가 되는 게 아니라 위를
     * 재료로 아래가 생기기 때문이다. 화살이 드러나는 것과 새 마디가 앉는 것을
     * **한 시계 안으로 접는다** — 시계를 나누면 `render` 의 약속이 셋 중 하나가
     * 끝날 때 풀릴 여지가 생기고, 어느 걸음에서 오든 멎은 화면이 같아야 한다
     * (프로토콜 4 절 30).
     */
    async function flowFold(
      scene: SignatureOnHashScene,
      drawn: Drawn,
      to: number,
      mine: number,
    ): Promise<void> {
      const base = scene.base;
      const dst = drawn.rows[to];
      if (base === null || dst === undefined) return;

      const from = to - 1;
      const widths = geomOf(base);
      const srcW = widths[from] ?? MIN_BAR_W;
      const dstW = widths[to] ?? MIN_BAR_W;
      const yFrom = ROW_Y[from] ?? 0;
      const yTo = ROW_Y[to] ?? 0;
      const srcTone = TONES[from] ?? DOC;
      const dstTone = TONES[to] ?? DOC;
      const arrow = drawn.arrows[from];

      // 복제본은 운동 중에만 산다. 마지막 정적 그리기가 층째 지운다.
      const ghost = el('rect', {
        x: BAR_X,
        y: yFrom,
        width: srcW,
        height: BAR_H,
        rx: 3,
        fill: srcTone,
        opacity: 0,
      });
      drawn.fold.appendChild(ghost);

      fade(dst, 0);
      if (arrow !== undefined) fade(arrow, 0);

      const total = FOLD_MS + FADE_MS;
      await tween(total, mine, (p) => {
        const now = p * total;
        if (arrow !== undefined) fade(arrow, easeOut(clamp01(now / FADE_MS)));

        const k = clamp01(now / FOLD_MS);
        if (k <= 0 || k >= 1) {
          // 아직 없거나 이미 도착했다 — 숨기지 않고 자리에 세우지 않는다.
          ghost.setAttribute('opacity', '0');
        } else {
          const e = easeInOut(k);
          ghost.setAttribute('opacity', '1');
          ghost.setAttribute('y', String(yFrom + (yTo - yFrom) * e));
          ghost.setAttribute('width', String(foldWidth(srcW, dstW, e)));
          ghost.setAttribute('fill', mixColor(srcTone, dstTone, e));
        }

        fade(dst, easeOut(clamp01((now - FOLD_MS) / FADE_MS)));
      });
    }

    /** 서명 마디를 짚는다. 표식이 드러나고 그대로 머문다. */
    async function flowMark(drawn: Drawn, mine: number): Promise<void> {
      const mark = drawn.mark;
      if (mark === null) return;
      fade(mark, 0);
      await tween(MARK_MS, mine, (p) => fade(mark, easeOut(p)));
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: SignatureOnHashScene,
      _prev: SignatureOnHashScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null) return;

      switch (step.kind) {
        case 'document':
          await flowDocument(drawn, mine);
          break;
        case 'hash':
          await flowFold(next, drawn, 1, mine);
          break;
        case 'sign':
          await flowFold(next, drawn, 2, mine);
          break;
        case 'mark':
          await flowMark(drawn, mine);
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
        root.remove();
      },
    };
  },
};
