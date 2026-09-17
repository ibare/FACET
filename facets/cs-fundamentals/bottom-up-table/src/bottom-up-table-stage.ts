/**
 * bottom-up-table stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이 말하는
 * 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요 없다
 * (S-scene).
 *
 * ── 이 화면에는 나무가 없다
 *
 * 표는 한 줄이다. 칸은 왼쪽에서 오른쪽으로 하나씩 차고, 칸을 채울 때 **바로 앞 두
 * 칸에서 화살이 뻗어 나와** 그 칸으로 모인다. 화살은 예외 없이 왼쪽에서 오른쪽으로만
 * 그려지고 지워지지 않는다 — 재생이 끝나면 오른쪽을 가리키는 화살 여덟이 한 줄로
 * 남는다. **되돌아가는 화살이 하나도 없다는 것이 이 조각이 하려는 말**이라 그 증거를
 * 화면에 남긴다.
 *
 * 움직이는 것은 화살촉과 함께 달리는 **값 알갱이**다. 원본은 제자리에 남고 복제본이
 * 곡선을 타고 오른쪽으로 건너가 목표 칸 위에서 만나 합이 된다. 색만 바뀌는 전환이
 * 아니라 좌표가 실제로 움직인다 (S-piece).
 *
 * 바닥 칸도 같은 어휘를 쓴다 — 알갱이가 **표 바깥**에서 들어와 칸에 앉는다. 화살이
 * 없다는 것이 "표 안에 근거가 없다, 정의가 그냥 준다" 를 말한다. 옛 화면은 값 글자가
 * 18px 미끄러지는 220ms 짜리였고 걸음 벽시계가 920ms 로 이 조각에서 가장 얇았다.
 *
 * 마지막에는 창(window) 하나가 왼쪽에서 미끄러져 들어와 **`keepOf` 가 자취에서 잰
 * 만큼** 감싼다. 어느 칸도 바로 앞 둘만 보았으므로 들고 있어야 할 것은 그 둘뿐이다.
 *
 * ── 옛 stage 가 화면에만 적어 두던 것
 *
 * 표의 값은 `values[i].textContent` 에, 어느 칸이 어느 칸을 보았나는 `const arcs` 의
 * 좌표에, 칸의 형편은 `let states` 에, 다 끝났나는 `windowLayer` 의 자식 유무에
 * 있었다. 이제 `cells` · `finished` · `step` 이 말하므로 **정적 그리기가 그것을
 * 통째로 세운다** — 되짚어 그 걸음에 가도 표와 화살과 앉은 창이 그대로 선다
 * (`scene.ts` 의 "네 자리").
 *
 * ── 화면에 나란히 뜨는 수는 한 함수를 지난다
 *
 * 캡션의 `T[5] = T[3] + T[4] = 2 + 3 = 5` 는 네 수가 모두 `valueAt` 을 지나 표에서
 * 나온다. 마무리의 칸 수 · 덧셈 수 · 재귀 호출 수도 `fillsOf` · `callsOf` 가 자취에서
 * 센다. 걸음이 실어 오던 `values` · `cells` · `fills` · `calls` · `keep` 은 장면이
 * 이미 버렸으므로 여기 올 길이 없다.
 *
 * ── 좌표
 *
 * 가로는 `PIECE_CANVAS_W` 에서 역산한다 — 칸 폭은 상한만 상수로 두고 남는 폭을
 * 여백으로 버리지 않는다 (S-piece). 세로는 그림이 정하는 값이라 이 파일이 상수로
 * 갖는다 (S-view).
 *
 * 문안은 `params.t` 로 만든다. 칸 아래 `T[i]` 는 수식 표기라 표식이다 (C10).
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  callsOf,
  fillsOf,
  freshIndex,
  keepOf,
  valueAt,
  type BottomUpTableScene,
} from './scene.js';

// ── 좌표 ────────────────────────────────────────────────────────────────
const W = PIECE_CANVAS_W;
/** 칸 폭의 상한. 실제 폭은 캔버스에서 역산한다. */
const CELL_MAX_W = 96;
/** 표 좌우로 최소한 남겨 둘 여백. */
const SIDE_MIN = 26;
const CELL_GAP = 8;
const CELL_TOP = 86;
const CELL_H = 54;
/** 칸 아래 `T[i]` 표식의 baseline. */
const INDEX_BASELINE = CELL_TOP + CELL_H + 16;
const CAPTION_Y = 184;
const NOTE_Y = 204;
const CANVAS_H = 218;

/** 한 칸 앞에서 오는 화살의 제어점 높이 (정점은 그 절반만큼 솟는다). */
const ARC_RISE_NEAR = 56;
/** 한 칸 더 멀어질 때마다 더 솟는 만큼. 거리 2 면 116 이 된다. */
const ARC_RISE_STEP = 60;
/** 화살 끝이 칸 윗변에 닿기 직전에서 멈추는 거리 — 화살촉이 보이도록. */
const ARC_END_GAP = 3;
const ARC_SAMPLES = 26;
const HEAD_LEN = 9;
const HEAD_HALF = 5;

const TOKEN_R = 13;
/** 바닥 칸의 알갱이가 표 왼쪽 밖 어디에서 들어오나. */
const SEED_ENTRY = 52;

// ── 지속시간 ────────────────────────────────────────────────────────────
/** 값 알갱이가 곡선을 타고 건너가는 시간. */
const RIDE_MS = 340;
/** 알갱이가 칸 속으로 들어가 값이 되는 시간. `seed` 와 `fill` 이 함께 쓴다. */
const LAND_MS = 200;
/** 정의가 주는 알갱이가 표 밖에서 그 칸 위까지 오는 시간. */
const SEED_RIDE_MS = 320;
/** 마지막 창이 왼쪽에서 들어와 멈추는 시간. */
const WINDOW_MS = 420;

const NS = 'http://www.w3.org/2000/svg';

type Pt = { x: number; y: number };

/** 칸의 형편. 어디에도 저장하지 않고 걸음마다 장면에서 파생한다. */
type CellState = 'empty' | 'filled' | 'source' | 'fresh' | 'muted' | 'kept';

/** 정적 그리기가 세워 둔 화살 하나. 좌표는 여기서만 산다 — 장면은 칸 번호만 안다. */
type DrawnArc = {
  path: SVGPathElement;
  head: SVGPathElement;
  p0: Pt;
  cp: Pt;
  p1: Pt;
};

/** 자리 셈. 장면의 `size` 하나에서 캔버스를 역산한다. */
type Geom = {
  cellW: number;
  originX: number;
  cx(i: number): number;
  cellLeft(i: number): number;
};

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  geom: Geom;
  /** 칸 안의 값 글자. 칸 번호로 찾는다. 안 찬 칸은 빈 글자다. */
  valueTexts: SVGTextElement[];
  /** 방금 찬 칸으로 모이는 화살들. 그 걸음이 `fill` 일 때만 채워진다. */
  freshArcs: DrawnArc[];
  /** 들고 있어야 할 칸을 감싸는 창. `finished` 일 때만 있다. */
  windowRect: SVGRectElement | null;
  /** 창이 멎는 자리. 운동은 여기로 온다. */
  windowX: number;
  /**
   * 창의 폭. **화면에서 되읽지 않으려고 여기 싣는다.**
   *
   * 운동의 출발점이 `-windowW - 20` 이라 폭이 필요한데, `rect` 의 `width` 속성을
   * 도로 꺼내면 화면을 되읽어 출발값을 셈하는 꼴이 된다 (S-scene — `prev` 도 화면도
   * 출발값의 출처가 아니다). `windowX` 는 이미 여기 싣고 있었으니 폭만 되읽는 것은
   * 비대칭이기도 했다.
   */
  windowW: number;
};

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);
const easeOut = (p: number): number => 1 - (1 - p) ** 2;
const easeInOut = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** 2차 베지에 위의 한 점. SVG 기하 API 에 기대지 않으려고 직접 센다. */
function qbez(p0: Pt, cp: Pt, p1: Pt, t: number): Pt {
  const m = 1 - t;
  return {
    x: m * m * p0.x + 2 * m * t * cp.x + t * t * p1.x,
    y: m * m * p0.y + 2 * m * t * cp.y + t * t * p1.y,
  };
}

export const bottomUpTableStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<BottomUpTableScene> {
    const c = getColors(params.theme);
    const svg = params.canvas;
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    // ── 켜 (뒤에서 앞으로). 여기 담기는 것은 걸음마다 통째로 다시 세운다.
    const gWindow = el('g', {});
    const gArc = el('g', {});
    const gCell = el('g', {});
    const gToken = el('g', {});
    const gText = el('g', {});
    svg.append(gWindow, gArc, gCell, gToken, gText);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 rAF 를 여러 마디 지나고, 그 사이에 되짚기가 끼어들면 남은 프레임이
     * **이미 새로 선 화면**을 덮는다. 정적 그리기가 칸과 화살을 매번 새로 만들지만
     * `await` 뒤의 마무리 그리기는 **옛 장면**을 살아 있는 화면에 쓴다 — 그것을
     * 여기서 끊는다. `isInstant` 는 빗장이 아니다. 러너는 장면 조각에서 그것을 부르지
     * 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    const canAnimate = typeof requestAnimationFrame === 'function';

    function tween(duration: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) return resolve();
        const started = now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          // 세대가 바뀌었으면 그리지 않고 물러난다.
          if (!alive(mine)) return finish();
          const p = duration <= 0 ? 1 : clamp01((now() - started) / duration);
          draw(p);
          if (p >= 1) return finish();
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    // ── 자리 셈 ───────────────────────────────────────────────────────────

    const cellMid = CELL_TOP + CELL_H / 2;
    /** 칸 안 값 글자의 baseline. */
    const valueBaseline = CELL_TOP + CELL_H / 2 + 7;
    /** 화살이 뜨고 앉는 높이. 알갱이도 이 높이로 건너온다. */
    const arcY = CELL_TOP - ARC_END_GAP;

    function geomOf(scene: BottomUpTableScene): Geom {
      const size = Math.max(1, scene.size);
      // 칸 폭은 상한만 상수다. 남는 폭을 여백으로 버리지 않는다 (S-piece).
      const cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / size));
      const originX = Math.round((W - size * cellW) / 2);
      return {
        cellW,
        originX,
        cx: (i) => originX + i * cellW + cellW / 2,
        cellLeft: (i) => originX + i * cellW + CELL_GAP / 2,
      };
    }

    // ── 칸의 형편 ─────────────────────────────────────────────────────────

    /**
     * 그 칸이 지금 어떤 형편인가. 옛 `let states` 자리다.
     *
     * 전부 장면에서 파생하므로 `settleFresh()` 처럼 앞 걸음을 되돌리는 명령이 없다 —
     * 되짚어 온 화면도 같은 셈을 지난다.
     */
    function cellStateOf(
      scene: BottomUpTableScene,
      index: number,
      keep: ReadonlySet<number>,
    ): CellState {
      if (scene.cells[index] === undefined) return 'empty';
      if (scene.finished) return keep.has(index) ? 'kept' : 'muted';

      const fresh = freshIndex(scene);
      if (fresh === null) return 'filled';
      if (index === fresh) return 'fresh';

      // 방금 찬 칸이 본 자리들. 이 걸음 동안 머무는 표식이다.
      const last = scene.cells[fresh];
      if (last.kind === 'fill' && last.from.includes(index)) return 'source';
      return 'filled';
    }

    function paint(
      state: CellState,
      rect: SVGRectElement,
      text: SVGTextElement,
      label: SVGTextElement,
    ): void {
      switch (state) {
        case 'empty':
          rect.setAttribute('fill', c.bgSubtle);
          rect.setAttribute('stroke', c.border);
          rect.setAttribute('stroke-width', '1.5');
          rect.setAttribute('stroke-dasharray', '4 4');
          text.setAttribute('fill', c.text);
          label.setAttribute('fill', c.textMuted);
          break;
        case 'filled':
          rect.setAttribute('fill', c.itemDefault);
          rect.setAttribute('stroke', c.border);
          rect.setAttribute('stroke-width', '1.5');
          rect.setAttribute('stroke-dasharray', 'none');
          text.setAttribute('fill', c.text);
          label.setAttribute('fill', c.textMuted);
          break;
        case 'source':
          rect.setAttribute('fill', c.itemComparing);
          rect.setAttribute('stroke', c.itemComparing);
          rect.setAttribute('stroke-width', '1.5');
          rect.setAttribute('stroke-dasharray', 'none');
          text.setAttribute('fill', c.stateInk);
          label.setAttribute('fill', c.text);
          break;
        case 'fresh':
          rect.setAttribute('fill', c.itemPivot);
          rect.setAttribute('stroke', c.itemPivot);
          rect.setAttribute('stroke-width', '1.5');
          rect.setAttribute('stroke-dasharray', 'none');
          text.setAttribute('fill', c.stateInk);
          label.setAttribute('fill', c.text);
          break;
        case 'muted':
          rect.setAttribute('fill', c.bgSubtle);
          rect.setAttribute('stroke', c.border);
          rect.setAttribute('stroke-width', '1.5');
          rect.setAttribute('stroke-dasharray', 'none');
          text.setAttribute('fill', c.textMuted);
          label.setAttribute('fill', c.textMuted);
          break;
        case 'kept':
          rect.setAttribute('fill', c.itemDefault);
          rect.setAttribute('stroke', c.text);
          rect.setAttribute('stroke-width', '2');
          rect.setAttribute('stroke-dasharray', 'none');
          text.setAttribute('fill', c.text);
          label.setAttribute('fill', c.text);
          break;
      }
    }

    // ── 화살 ──────────────────────────────────────────────────────────────

    /** 두 칸 사이를 잇는 곡선의 세 점. 멀수록 높이 솟는다. */
    function arcPoints(geom: Geom, from: number, to: number): { p0: Pt; cp: Pt; p1: Pt } {
      const dist = Math.max(1, Math.abs(to - from));
      const rise = ARC_RISE_NEAR + (dist - 1) * ARC_RISE_STEP;
      const p0: Pt = { x: geom.cx(from), y: arcY };
      const p1: Pt = { x: geom.cx(to), y: arcY };
      return { p0, p1, cp: { x: (p0.x + p1.x) / 2, y: CELL_TOP - rise } };
    }

    /** 곡선을 `p` 만큼만 그리고 그 끝점을 돌려준다. 알갱이가 그 끝을 타고 간다. */
    function drawArc(arc: DrawnArc, p: number): Pt {
      let d = '';
      let tip: Pt = arc.p0;
      for (let k = 0; k <= ARC_SAMPLES; k++) {
        const at = qbez(arc.p0, arc.cp, arc.p1, (p * k) / ARC_SAMPLES);
        d += `${k === 0 ? 'M' : 'L'} ${at.x.toFixed(2)} ${at.y.toFixed(2)} `;
        tip = at;
      }
      arc.path.setAttribute('d', d);
      return tip;
    }

    /** 화살촉을 세운다. 곡선의 끝 접선 방향으로 눕는다. */
    function headPath(arc: DrawnArc): string {
      const dx = arc.p1.x - arc.cp.x;
      const dy = arc.p1.y - arc.cp.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const bx = arc.p1.x - ux * HEAD_LEN;
      const by = arc.p1.y - uy * HEAD_LEN;
      return (
        `M ${arc.p1.x.toFixed(2)} ${arc.p1.y.toFixed(2)} ` +
        `L ${(bx - uy * HEAD_HALF).toFixed(2)} ${(by + ux * HEAD_HALF).toFixed(2)} ` +
        `L ${(bx + uy * HEAD_HALF).toFixed(2)} ${(by - ux * HEAD_HALF).toFixed(2)} Z`
      );
    }

    // ── 값 알갱이. 운동 중에만 있으므로 정적 그리기가 만들지 않는다 ────────

    function newToken(value: number, at: Pt): SVGGElement {
      const g = el('g', { transform: `translate(${at.x.toFixed(2)} ${at.y.toFixed(2)})` });
      g.appendChild(el('circle', { cx: 0, cy: 0, r: TOKEN_R, fill: c.itemComparing }));
      const text = el('text', {
        x: 0,
        y: 5,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        'font-weight': '600',
        fill: c.stateInk,
      });
      text.textContent = String(value);
      g.appendChild(text);
      gToken.appendChild(g);
      return g;
    }

    function moveToken(g: SVGGElement, at: Pt): void {
      g.setAttribute('transform', `translate(${at.x.toFixed(2)} ${at.y.toFixed(2)})`);
    }

    // ── 문안 ──────────────────────────────────────────────────────────────

    /**
     * 그 걸음이 무엇을 말하나. `step` 의 갈래와 1 대 1 이라 장면에 따로 담지 않는다.
     *
     * 수는 전부 장면의 자취에서 꺼낸다 — 캡션과 그림이 한 출처다 (C10 · 함정 11).
     */
    function captionOf(scene: BottomUpTableScene): { text: string; note: string } {
      const step = scene.step;
      if (step === null) return { text: '', note: '' };
      const fresh = freshIndex(scene);

      switch (step.kind) {
        case 'seed': {
          if (fresh === null) return { text: '', note: '' };
          return {
            text: t('caption.seed', 'T[{i}] = {v} — the definition hands over the bottom two cells', {
              i: fresh,
              v: valueAt(scene, fresh) ?? 0,
            }),
            note: '',
          };
        }
        case 'fill': {
          if (fresh === null) return { text: '', note: '' };
          const cell = scene.cells[fresh];
          if (cell.kind !== 'fill') return { text: '', note: '' };
          const [a, b] = cell.from;
          return {
            text: t(
              'caption.fill',
              'T[{i}] = T[{a}] + T[{b}] = {x} + {y} = {v} — both values already sit to the left',
              {
                i: fresh,
                a,
                b,
                x: valueAt(scene, a) ?? 0,
                y: valueAt(scene, b) ?? 0,
                v: cell.value,
              },
            ),
            note: '',
          };
        }
        case 'keep':
          return {
            text: t(
              'caption.done',
              '{cells} cells filled left to right in {fills} additions — {calls} recursive calls',
              { cells: scene.cells.length, fills: fillsOf(scene), calls: callsOf(scene) },
            ),
            note: t(
              'caption.doneNote',
              'Every cell looked only at the two before it, so keeping those two is enough',
            ),
          };
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    function rewind(): void {
      gWindow.textContent = '';
      gArc.textContent = '';
      gCell.textContent = '';
      gToken.textContent = '';
      gText.textContent = '';
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 층을 통째로 비우고 다시 짓는다. 되돌릴 목록을 손으로 관리하지 않으므로 보간이
     * 남긴 `opacity` 나 좌표 끝자리가 남을 자리가 없다 (S-scene).
     */
    function drawStatic(scene: BottomUpTableScene): Drawn {
      rewind();
      const geom = geomOf(scene);
      const keep = new Set(scene.finished ? keepOf(scene) : []);
      const fresh = freshIndex(scene);

      // ── 칸
      const valueTexts: SVGTextElement[] = [];
      for (let i = 0; i < scene.size; i++) {
        const rect = el('rect', {
          x: geom.cellLeft(i),
          y: CELL_TOP,
          width: geom.cellW - CELL_GAP,
          height: CELL_H,
          rx: 6,
        });
        const text = el('text', {
          x: geom.cx(i),
          y: valueBaseline,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xl,
          'font-weight': '600',
        });
        const value = valueAt(scene, i);
        text.textContent = value === null ? '' : String(value);
        // `T[i]` 는 수식 표기라 표식이다 — 번역 대상이 아니다 (C10).
        const label = el('text', {
          x: geom.cx(i),
          y: INDEX_BASELINE,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        label.textContent = `T[${i}]`;
        paint(cellStateOf(scene, i, keep), rect, text, label);
        gCell.append(rect, text, label);
        valueTexts.push(text);
      }

      // ── 화살. 지금까지 채워진 모든 칸의 것을 다시 세운다 — 누적이 곧 주장이다.
      const freshArcs: DrawnArc[] = [];
      scene.cells.forEach((cell, index) => {
        if (cell.kind !== 'fill') return;
        // 지금 걸음의 화살만 진하다. 옛 `dimArcs()` 가 명령으로 하던 일이다.
        const live = index === fresh && !scene.finished;
        const ink = live ? c.itemComparing : c.textMuted;
        for (const src of cell.from) {
          const { p0, cp, p1 } = arcPoints(geom, src, index);
          const path = el('path', {
            d: '',
            fill: 'none',
            stroke: ink,
            'stroke-width': live ? '2.5' : '1.5',
            'stroke-linecap': 'round',
          });
          const head = el('path', { d: '', fill: ink });
          gArc.append(path, head);
          const arc: DrawnArc = { path, head, p0, cp, p1 };
          drawArc(arc, 1);
          head.setAttribute('d', headPath(arc));
          if (live) freshArcs.push(arc);
        }
      });

      // ── 창. 들고 있어야 할 칸만 감싼다.
      let windowRect: SVGRectElement | null = null;
      let windowX = 0;
      let windowW = 0;
      if (scene.finished && keep.size > 0) {
        const marks = [...keep].sort((a, b) => a - b);
        const k0 = marks[0];
        const k1 = marks[marks.length - 1];
        windowX = geom.cellLeft(k0) - 6;
        windowW = geom.cellLeft(k1) + (geom.cellW - CELL_GAP) - geom.cellLeft(k0) + 12;
        // 칸만이 아니라 `T[i]` 표식까지 품는다 — 창 선이 글자를 가로지르지 않게.
        const top = CELL_TOP - 8;
        windowRect = el('rect', {
          x: windowX,
          y: top,
          width: windowW,
          height: INDEX_BASELINE + 8 - top,
          rx: 10,
          fill: c.accent,
          'fill-opacity': '0.22',
          stroke: c.accent,
          'stroke-width': '2',
        });
        gWindow.appendChild(windowRect);
      }

      // ── 캡션
      const words = captionOf(scene);
      const caption = el('text', {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: c.text,
      });
      caption.textContent = words.text;
      const note = el('text', {
        x: W / 2,
        y: NOTE_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
      });
      note.textContent = words.note;
      gText.append(caption, note);

      return { geom, valueTexts, freshArcs, windowRect, windowX, windowW };
    }

    // ── 운동. 정적 그리기가 끝 자리를 세웠으므로 아직 못 온 만큼을 뒤로 물린다 ──

    /**
     * 정의가 주는 값이 표 **밖에서** 들어와 칸에 앉는다.
     *
     * `fill` 과 같은 어휘(건너와서 칸 속으로 가라앉는다)를 쓰되 화살이 없다 — 표 안에
     * 근거가 없다는 말이다. 옛 화면은 글자가 18px 미끄러지는 220ms 짜리라 걸음 벽시계가
     * 920ms 로 이 조각에서 가장 얇았다 (S-piece 800ms 잣대).
     */
    async function flowSeed(scene: BottomUpTableScene, drawn: Drawn, mine: number): Promise<void> {
      const fresh = freshIndex(scene);
      if (fresh === null) return;
      const cell = scene.cells[fresh];
      const text = drawn.valueTexts[fresh];
      if (text === undefined) return;

      const target: Pt = { x: drawn.geom.cx(fresh), y: arcY };
      const start: Pt = { x: drawn.geom.originX - SEED_ENTRY, y: arcY };
      const token = newToken(cell.value, start);
      text.setAttribute('opacity', '0');

      await tween(SEED_RIDE_MS, mine, (p) => {
        const e = easeInOut(p);
        moveToken(token, { x: start.x + (target.x - start.x) * e, y: arcY });
      });
      if (!alive(mine)) return;

      await tween(LAND_MS, mine, (p) => {
        const e = easeOut(p);
        moveToken(token, { x: target.x, y: arcY + (cellMid - arcY) * e });
        token.setAttribute('opacity', (1 - e).toFixed(3));
        text.setAttribute('opacity', e.toFixed(3));
      });
    }

    /**
     * 앞의 두 칸에서 화살이 뻗어 나와 목표 칸으로 모인다.
     *
     * 화살은 값 알갱이가 달려가며 그리고, 두 알갱이가 칸 위에서 만나 합이 되어 칸
     * 속으로 들어간다. 원본은 제자리에 남는다 — 표를 헐지 않는다는 말이다.
     */
    async function flowFill(scene: BottomUpTableScene, drawn: Drawn, mine: number): Promise<void> {
      const fresh = freshIndex(scene);
      if (fresh === null) return;
      const cell = scene.cells[fresh];
      const text = drawn.valueTexts[fresh];
      if (cell.kind !== 'fill' || text === undefined || drawn.freshArcs.length === 0) return;

      // 화살을 접고 알갱이를 출발점에 세운다. 여기까지 동기라 끝 자리가 번쩍이지 않는다.
      const rides = drawn.freshArcs.map((arc, k) => {
        arc.head.setAttribute('opacity', '0');
        drawArc(arc, 0);
        const value = valueAt(scene, cell.from[k]) ?? 0;
        return { arc, token: newToken(value, arc.p0) };
      });
      text.setAttribute('opacity', '0');

      // 둘이 한 뜻으로 묶인 운동이라 시계를 하나만 쓴다 (프로토콜 3-4).
      await tween(RIDE_MS, mine, (p) => {
        const e = easeInOut(p);
        for (const ride of rides) moveToken(ride.token, drawArc(ride.arc, e));
      });
      if (!alive(mine)) return;
      for (const ride of rides) ride.arc.head.setAttribute('opacity', '1');

      const enter: Pt = { x: drawn.geom.cx(fresh), y: cellMid };
      await tween(LAND_MS, mine, (p) => {
        const e = easeOut(p);
        for (const ride of rides) {
          moveToken(ride.token, {
            x: ride.arc.p1.x + (enter.x - ride.arc.p1.x) * e,
            y: ride.arc.p1.y + (enter.y - ride.arc.p1.y) * e,
          });
          ride.token.setAttribute('opacity', (1 - e).toFixed(3));
        }
        text.setAttribute('opacity', e.toFixed(3));
      });
    }

    /** 창이 왼쪽 밖에서 미끄러져 들어와 들고 있어야 할 칸에 앉는다. */
    function flowKeep(drawn: Drawn, mine: number): Promise<void> {
      const rect = drawn.windowRect;
      if (rect === null) return Promise.resolve();
      // 폭은 `drawStatic` 이 셈해 실어 준 것을 쓴다. 화면에서 되읽지 않는다 (S-scene).
      const startX = -drawn.windowW - 20;
      const endX = drawn.windowX;
      rect.setAttribute('x', startX.toFixed(2));
      return tween(WINDOW_MS, mine, (p) => {
        const e = easeOut(p);
        rect.setAttribute('x', (startX + (endX - startX) * e).toFixed(2));
      });
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: BottomUpTableScene,
      _prev: BottomUpTableScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed || !canAnimate) return;

      const step = next.step;
      if (step === null) return;

      switch (step.kind) {
        case 'seed':
          await flowSeed(next, drawn, mine);
          break;
        case 'fill':
          await flowFill(next, drawn, mine);
          break;
        case 'keep':
          await flowKeep(drawn, mine);
          break;
      }
      if (!alive(mine)) return;

      // 보간이 남긴 `opacity` 와 좌표 끝자리, 건너온 알갱이가 노드째 사라진다.
      // 되돌릴 목록을 손으로 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다
        // (S-piece). 취소된 rAF 는 tick 을 아예 부르지 않으므로 여기가 유일한 길이다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
