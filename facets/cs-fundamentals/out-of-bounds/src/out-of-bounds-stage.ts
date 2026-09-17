/**
 * out-of-bounds stage — 주소가 나란히 놓인 메모리 띠 한 줄과, 그 위를 미끄러지는
 * 커서 하나.
 *
 * 이 조각의 동사는 "넘어간다" 이므로 화면의 주된 운동은 **가로 이동**이다.
 * 칸들은 주소 순서대로 틈 없이 붙어 있고 — 배열의 끝과 이웃 변수 사이에 아무
 * 것도 없다는 것이 요점이다 — 커서는 주소 셈이 낸 자리로 실제로 이동한다.
 * 배열의 끝을 지나 이웃 칸에 올라서는 것, 그리고 경계 검사가 세운 벽에 부딪혀
 * 그 앞에서 멎는 것이 이 그림이 보여 주는 두 사건이다.
 *
 * 빌트인 view 어휘 (bars / array-cells / linked-list …) 로는 "주소가 연속이라
 * 배열 밖으로 한 칸 더 갈 수 있다" 를 말할 수 없어 stage 를 둔다 — 빌트인
 * 배열 view 는 인덱스를 그리지 주소를 그리지 않고, 배열 밖 자리를 갖지 않는다.
 *
 * ## 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`moveProbe()` · `readSlot()` · `dropGuard()` …) 를 두지
 * 않는다. 그 메서드들은 되돌릴 수 없는 명령이라, 임의의 걸음으로 가려면 처음부터
 * 다시 밟는 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가 **그
 * 장면의 화면 전체**를 세운다 — 어느 걸음에서 어느 걸음으로 가든 같은 길이다
 * (S-scene).
 *
 * **비우고 시작하는 자리를 따로 두지 않는다.** 이 화면에서 걸음마다 달라지는 것은
 * 수식 줄 · 칸의 칠 · 경계 검사 · 커서 · 캡션 · 완료 표식 여섯뿐이고, `drawStatic`
 * 이 그 여섯을 **하나도 빠뜨리지 않고 늘 통째로** 세운다. 그래서 지울 것이 없다.
 *
 * 부드러움은 `opts.animate` 가 정한다. 참이면 방금 밟은 걸음 하나만 프레임으로
 * 흐르게 하고, 거짓이면 곧바로 끝 자리에 세운다 — 되짚기와 첫 그림이 그 길이다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type Palette,
  type CanvasView,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { OutOfBoundsCaption, OutOfBoundsScene, ProbeAt } from './scene.js';

// ── 기하. 세로는 내용이 정하고, 가로는 PIECE_CANVAS_W 를 따른다 (S-piece).
const W = PIECE_CANVAS_W;
const H = 312;

// 칸 폭은 캔버스에서 역산한다. 고정해 두면 남는 폭이 좌우 여백으로 버려져
// 그림이 캔버스 가운데 쪼그라든다 — 70 으로 못박았을 때 620 중 420(68%)만 썼다.
const CELL_MAX_W = 96;
const SIDE_MIN = 26;
const CELL_H = 52;
const CELL_TOP = 112;
const CELL_BOTTOM = CELL_TOP + CELL_H;

const EXPR_Y = 34;
const GUARD_LABEL_Y = 44;
const PILL_TOP = 54;
const PILL_H = 24;
const STEM_BOTTOM = 96;
const TIP_Y = 104;
const ADDR_Y = 106;
const VALUE_Y = 145;
const INDEX_Y = 182;
const BRACKET_Y = 194;
const RANGE_Y = 210;
const CAPTION_Y = 240;
const CAPTION_LINE_H = 18;

const GUARD_W = 10;
const GUARD_TOP = 50;
const GUARD_BOTTOM = 170;
const GUARD_RISE = 130;

const MOVE_MS = 380;
const HOME_MS = 300;
const GUARD_MS = 420;
const BUMP_MS = 340;
const RECOIL_MS = 150;

/** 벽에 부딪힌 커서가 뒤로 물러앉는 거리. 정적으로도 이 자리에 선다. */
const RECOIL_DX = 12;

const MONO_CHAR_W = 7.2;
const BODY_CHAR_W = 7.1;
const CAPTION_MAX_W = 540;
const PILL_MIN_W = 56;

const NS = 'http://www.w3.org/2000/svg';

/**
 * 칸의 칠. 장면이 말하는 것을 그대로 옮긴 것이라 stage 가 따로 쥐지 않는다.
 *
 * `scarred` 가 **남는 강조**다 — 경계 밖으로 한 번 읽힌 칸은 걸음이 지나가도
 * 흉터를 남긴다. 옮기기 전에는 이것이 stage 의 `cellStates` 안에만 있어서,
 * 되짚으면 지나온 걸음을 다 밟기 전에는 복원되지 않았다.
 */
type CellState = 'rest' | 'active' | 'breached' | 'scarred';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function toHex(address: number): string {
  return `0x${address.toString(16).toUpperCase()}`;
}

/** 끝으로 갈수록 느려지는 미끄러짐. CSS 의 cubic-bezier(0.32, 0.72, 0.24, 1) 자리. */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** 살짝 넘어갔다 앉는 내려섬. CSS 의 cubic-bezier(0.22, 1.1, 0.36, 1) 자리. */
function easeBack(t: number): number {
  const c = 1.1;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

/**
 * 글자 폭 근사. SVG 는 줄바꿈이 없어 직접 재야 하는데, 한글 계열은 라틴
 * 글자보다 두 배 가까이 넓으므로 코드 포인트 범위로 갈라 센다.
 */
function measure(text: string, charWidth: number): number {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    width += code >= 0x1100 && code <= 0xffdc ? charWidth * 1.9 : charWidth;
  }
  return width;
}

/** 문장을 최대 두 줄로 나눈다. 낱말 단위로 끊고, 넘치면 나머지를 둘째 줄에 몰아 준다. */
function wrapTwoLines(text: string, maxWidth: number, charWidth: number): string[] {
  if (measure(text, charWidth) <= maxWidth) return [text];
  const words = text.split(' ');
  let head = '';
  let cut = words.length;
  for (let i = 0; i < words.length; i += 1) {
    const next = head === '' ? words[i] : `${head} ${words[i]}`;
    if (measure(next, charWidth) > maxWidth) {
      cut = i;
      break;
    }
    head = next;
  }
  if (head === '' || cut >= words.length) return [text];
  return [head, words.slice(cut).join(' ')];
}

/** 커서 라벨. 문자는 그리는 쪽이 만든다 — 장면은 번호와 읽은 값만 준다. */
function probeLabelOf(scene: OutOfBoundsScene): string {
  const { arrayName, probe } = scene;
  if (probe.index === null) return `${arrayName}[i]`;
  if (probe.read === null) return `${arrayName}[${probe.index}]`;
  return `${arrayName}[${probe.index}] → ${probe.read}`;
}

function pillWidth(label: string): number {
  return Math.max(PILL_MIN_W, Math.round(label.length * MONO_CHAR_W + 18));
}

/** 바탕이 같은 장면인가 — 같으면 띠를 다시 짓지 않는다. */
function baseKey(scene: OutOfBoundsScene): string {
  return [
    scene.arrayName,
    scene.values.join(','),
    scene.baseAddress,
    scene.stride,
    scene.neighborName,
    scene.neighborValue,
  ].join('|');
}

export const outOfBoundsStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const tr: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme ?? 'light');
    const svg = params.canvas;
    svg.setAttribute('role', 'img');
    svg.style.overflow = 'visible';

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    /**
     * 되짚는 중인가. 러너가 `params` 로 흘린다 (`ViewMountParams.isInstant`).
     *
     * 커서의 운동이 프레임마다 `transform` 을 제자리에서 고쳐 쓰는 짜임이라,
     * 되짚기가 화면을 새로 세운 뒤에도 앞 걸음의 운동이 살아 있으면 새 자리에
     * 옛 좌표를 덮어쓴다 — 되짚은 직후가 아니라 반 초쯤 뒤에 무너지므로 눈으로도
     * 늦게야 잡힌다.
     */
    const isInstant = params.isInstant ?? ((): boolean => false);
    // 되짚기 직전에 걸어 둔 것을 거둔다 (destroy 와 같은 모양).
    params.onScrubStart?.(() => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    });

    /**
     * 걸음 하나를 프레임으로 흐르게 한다.
     *
     * 첫 프레임을 **동기로** 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로,
     * 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
     */
    function animate(ms: number, draw: (e: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || isInstant()) {
          draw(1);
          return resolve();
        }
        const start = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let id = 0;
        const step = (): void => {
          frames.delete(id);
          if (destroyed) {
            finish();
            return;
          }
          const raw = Math.min(1, (Date.now() - start) / ms);
          draw(raw);
          if (raw >= 1) {
            finish();
            return;
          }
          id = requestAnimationFrame(step);
          frames.add(id);
        };
        draw(0);
        id = requestAnimationFrame(step);
        frames.add(id);
      });
    }

    // ── 지금 세워 둔 띠. 바탕이 바뀔 때만 다시 짓는다.
    let builtKey: string | null = null;
    let originX = 0;
    let cellW = CELL_MAX_W;
    let edgeX = 0;
    let cellCount = 0;
    let arrayLen = 0;

    let cellRects: SVGRectElement[] = [];
    let cellValues: SVGTextElement[] = [];
    let cellLabels: SVGTextElement[] = [];

    let probeGroup: SVGGElement | null = null;
    let probePill: SVGRectElement | null = null;
    let probeText: SVGTextElement | null = null;
    let probeStem: SVGLineElement | null = null;
    let probeTip: SVGPolygonElement | null = null;

    let guardGroup: SVGGElement | null = null;
    let guardLabel: SVGTextElement | null = null;
    let exprHead: SVGTSpanElement | null = null;
    let exprTail: SVGTSpanElement | null = null;
    let captionText: SVGTextElement | null = null;

    const cellCenter = (index: number): number => originX + index * cellW + cellW / 2;

    /** 벽 앞에서 멎는 자리. 라벨 폭을 장면에서 셈하므로 DOM 을 되읽지 않는다. */
    const bumpX = (label: string): number =>
      edgeX - GUARD_W / 2 - pillWidth(label) / 2 - 4;

    /**
     * 커서가 그 자리에 섰을 때의 가로 위치. 장면의 구조를 좌표로 옮기는 자리다.
     *
     * `edge` 는 벽에 부딪혀 물러앉은 끝 자리를 뜻한다 — 이 조각에서 `edge` 는
     * 마지막 걸음의 도착지라 출발 자리로는 오지 않는다.
     */
    const probeX = (at: ProbeAt, label: string): number =>
      at.kind === 'cell' ? cellCenter(at.index) : bumpX(label) - RECOIL_DX;

    function clear(): void {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      cellRects = [];
      cellValues = [];
      cellLabels = [];
      probeGroup = null;
      probePill = null;
      probeText = null;
      probeStem = null;
      probeTip = null;
      guardGroup = null;
      guardLabel = null;
      exprHead = null;
      exprTail = null;
      captionText = null;
      builtKey = null;
    }

    /** 바탕을 세운다. 걸음이 바꾸지 않는 것만 여기서 그린다. */
    function build(scene: OutOfBoundsScene): void {
      clear();
      arrayLen = scene.values.length;
      cellCount = arrayLen + 1;
      cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / cellCount));
      originX = Math.round((W - cellCount * cellW) / 2);
      edgeX = originX + arrayLen * cellW;

      // 주소 셈 한 줄. 인덱스가 정해지기 전에는 i 로 서 있다.
      const expr = el('text', {
        x: W / 2,
        y: EXPR_Y,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: colors.textMuted,
      });
      exprHead = el('tspan', { fill: colors.textMuted });
      exprTail = el('tspan', { fill: colors.text, 'font-weight': '600' });
      expr.appendChild(exprHead);
      expr.appendChild(exprTail);
      svg.appendChild(expr);

      // 메모리 띠. 칸 사이에 틈이 없다 — 배열의 끝과 이웃은 맞붙어 있다.
      for (let i = 0; i < cellCount; i += 1) {
        const x = originX + i * cellW;
        const inside = i < arrayLen;

        const addr = el('text', {
          x: x + cellW / 2,
          y: ADDR_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        addr.textContent = toHex(scene.baseAddress + i * scene.stride);
        svg.appendChild(addr);

        const rect = el('rect', {
          x,
          y: CELL_TOP,
          width: cellW,
          height: CELL_H,
          fill: inside ? colors.bgSubtle : colors.bg,
          stroke: colors.border,
          'stroke-width': 1,
        });
        svg.appendChild(rect);
        cellRects.push(rect);

        const value = el('text', {
          x: x + cellW / 2,
          y: VALUE_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          fill: colors.text,
        });
        value.textContent = String(inside ? (scene.values[i] ?? 0) : scene.neighborValue);
        svg.appendChild(value);
        cellValues.push(value);

        const label = el('text', {
          x: x + cellW / 2,
          y: INDEX_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        label.textContent = inside ? `${scene.arrayName}[${i}]` : scene.neighborName;
        svg.appendChild(label);
        cellLabels.push(label);
      }

      // 배열이 차지한 구간을 아래에서 받치는 괄호와 그 범위.
      const bracket = el('path', {
        d: `M ${originX} ${BRACKET_Y - 7} L ${originX} ${BRACKET_Y} L ${edgeX} ${BRACKET_Y} L ${edgeX} ${BRACKET_Y - 7}`,
        fill: 'none',
        stroke: colors.textMuted,
        'stroke-width': 1,
      });
      svg.appendChild(bracket);

      const range = el('text', {
        x: (originX + edgeX) / 2,
        y: RANGE_Y,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      range.textContent = tr('label.arrayRange', '{from} – {to} · {bytes} bytes', {
        from: toHex(scene.baseAddress),
        to: toHex(scene.baseAddress + arrayLen * scene.stride - 1),
        bytes: arrayLen * scene.stride,
      });
      svg.appendChild(range);

      // 배열의 끝. 셈이 넘어가는 것은 바로 이 선이다.
      const edge = el('line', {
        x1: edgeX,
        y1: CELL_TOP - 14,
        x2: edgeX,
        y2: CELL_BOTTOM + 8,
        stroke: colors.text,
        'stroke-width': 3,
      });
      svg.appendChild(edge);

      // 경계 검사 — 보일지 말지는 장면이 정한다.
      guardGroup = el('g');
      const guardBar = el('rect', {
        x: edgeX - GUARD_W / 2,
        y: GUARD_TOP,
        width: GUARD_W,
        height: GUARD_BOTTOM - GUARD_TOP,
        rx: 3,
        fill: colors.success,
      });
      guardGroup.appendChild(guardBar);
      guardLabel = el('text', {
        x: edgeX,
        y: GUARD_LABEL_Y,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.success,
      });
      guardGroup.appendChild(guardLabel);
      svg.appendChild(guardGroup);

      // 커서. 주소 셈이 낸 자리를 가리키며 띠 위를 이동한다.
      probeGroup = el('g');
      probeStem = el('line', {
        x1: 0,
        y1: PILL_TOP + PILL_H,
        x2: 0,
        y2: STEM_BOTTOM,
        stroke: colors.accent,
        'stroke-width': 2,
      });
      probePill = el('rect', {
        x: -PILL_MIN_W / 2,
        y: PILL_TOP,
        width: PILL_MIN_W,
        height: PILL_H,
        rx: 5,
        fill: colors.accent,
      });
      probeText = el('text', {
        x: 0,
        y: PILL_TOP + 16.5,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.text,
      });
      probeTip = el('polygon', {
        points: `-6,${STEM_BOTTOM} 6,${STEM_BOTTOM} 0,${TIP_Y}`,
        fill: colors.accent,
      });
      probeGroup.appendChild(probeStem);
      probeGroup.appendChild(probeTip);
      probeGroup.appendChild(probePill);
      probeGroup.appendChild(probeText);
      svg.appendChild(probeGroup);

      captionText = el('text', {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
      });
      svg.appendChild(captionText);

      builtKey = baseKey(scene);
    }

    // ── 걸음마다 달라지는 여섯. 늘 통째로 세운다.

    function drawExpr(scene: OutOfBoundsScene): void {
      if (!exprHead || !exprTail) return;
      const indexLabel = scene.expr === null ? 'i' : String(scene.expr.index);
      exprHead.textContent = `${toHex(scene.baseAddress)} + ${indexLabel} × ${scene.stride}`;
      exprTail.textContent = scene.expr === null ? '' : ` = ${scene.expr.addressHex}`;
      const outside = scene.expr !== null && scene.expr.index >= arrayLen;
      exprTail.setAttribute('fill', outside ? colors.danger : colors.text);
    }

    /** 장면이 말하는 칸의 칠. 흉터는 남는 강조라 정적으로도 들어간다. */
    function stateOf(scene: OutOfBoundsScene, index: number): CellState {
      if (scene.active && scene.active.index === index) {
        return scene.active.outOfBounds ? 'breached' : 'active';
      }
      return scene.scarred.includes(index) ? 'scarred' : 'rest';
    }

    function drawCells(scene: OutOfBoundsScene): void {
      for (let i = 0; i < cellCount; i += 1) {
        const rect = cellRects[i];
        const value = cellValues[i];
        const label = cellLabels[i];
        if (!rect || !value || !label) continue;
        const state = stateOf(scene, i);
        const insideArray = i < arrayLen;

        if (state === 'active') {
          rect.setAttribute('fill', colors.itemActive);
          rect.setAttribute('stroke', colors.itemActive);
          rect.setAttribute('stroke-width', '2');
          value.setAttribute('fill', colors.textInverse);
          label.setAttribute('fill', colors.text);
        } else if (state === 'breached') {
          rect.setAttribute('fill', colors.danger);
          rect.setAttribute('stroke', colors.danger);
          rect.setAttribute('stroke-width', '2');
          value.setAttribute('fill', colors.textInverse);
          label.setAttribute('fill', colors.danger);
        } else if (state === 'scarred') {
          rect.setAttribute('fill', colors.bg);
          rect.setAttribute('stroke', colors.danger);
          rect.setAttribute('stroke-width', '2');
          value.setAttribute('fill', colors.danger);
          label.setAttribute('fill', colors.danger);
        } else {
          rect.setAttribute('fill', insideArray ? colors.bgSubtle : colors.bg);
          rect.setAttribute('stroke', colors.border);
          rect.setAttribute('stroke-width', '1');
          value.setAttribute('fill', colors.text);
          label.setAttribute('fill', colors.textMuted);
        }
      }
    }

    /** 경계 검사가 보이는지와 그 물음. 자리는 걸음 함수 `dropGuard` 가 정한다. */
    function drawGuardLook(scene: OutOfBoundsScene): void {
      if (!guardGroup || !guardLabel) return;
      if (scene.guard === null) {
        guardGroup.style.display = 'none';
        guardLabel.textContent = '';
        return;
      }
      guardGroup.style.display = '';
      guardLabel.textContent = `${scene.guard.lo} ≤ i < ${scene.guard.hi}`;
    }

    /** 커서의 라벨과 색. 자리는 걸음 함수 `slideProbe` 가 정한다. */
    function drawProbeLook(scene: OutOfBoundsScene, label: string): void {
      if (!probeGroup || !probePill || !probeText || !probeStem || !probeTip) return;
      const danger = scene.probe.danger;
      const w = pillWidth(label);
      probePill.setAttribute('x', String(-w / 2));
      probePill.setAttribute('width', String(w));
      probePill.setAttribute('fill', danger ? colors.danger : colors.accent);
      probeText.textContent = label;
      probeText.setAttribute('fill', danger ? colors.textInverse : colors.text);
      probeStem.setAttribute('stroke', danger ? colors.danger : colors.accent);
      probeTip.setAttribute('fill', danger ? colors.danger : colors.accent);
    }

    function placeProbe(x: number): void {
      if (!probeGroup) return;
      probeGroup.style.transform = `translate(${x || 0}px, 0px)`;
    }

    /** 한 걸음의 말. 장면은 무엇을 말할지만 주고 문자는 여기서 만든다 (C10). */
    function captionTextOf(scene: OutOfBoundsScene, c: OutOfBoundsCaption): string {
      const name = scene.arrayName;
      switch (c.kind) {
        case 'compute':
          return tr(
            'caption.compute',
            'The index becomes an address: {base} + {i} × {stride} = {addr}.',
            { base: c.baseHex, i: c.index, stride: c.stride, addr: c.addressHex },
          );
        case 'keepsCounting':
          return tr(
            'caption.keepsCounting',
            'Now {i}. The arithmetic checks nothing — it just keeps counting: {addr}.',
            { i: c.index, addr: c.addressHex },
          );
        case 'inside':
          return tr('caption.inside', '{name}[{i}] lands on the last cell the array owns.', {
            name,
            i: c.index,
          });
        case 'crossed':
          return tr(
            'caption.crossed',
            '{addr} lies past the end of the array, on the next variable.',
            { addr: c.addressHex },
          );
        case 'readInside':
          return tr('caption.readInside', 'It reads {value}, the value the array keeps there.', {
            value: c.value,
          });
        case 'readsNeighbor':
          return tr(
            'caption.readsNeighbor',
            '{name}[{i}] reads {value} all the same. That value belongs to someone else.',
            { name, i: c.index, value: c.value },
          );
        case 'guard':
          return tr(
            'caption.guard',
            'A bounds check stands at the end and asks {lo} ≤ i < {hi} before any access.',
            { lo: c.lo, hi: c.hi },
          );
        case 'blocked':
          return tr(
            'caption.blocked',
            '{name}[{i}] never reaches the address. It stops at the edge instead.',
            { name, i: c.index },
          );
      }
    }

    function drawCaption(scene: OutOfBoundsScene): void {
      if (!captionText) return;
      const node = captionText;
      while (node.firstChild) node.removeChild(node.firstChild);
      if (scene.caption === null) return;
      const lines = wrapTwoLines(captionTextOf(scene, scene.caption), CAPTION_MAX_W, BODY_CHAR_W);
      lines.forEach((line, i) => {
        const span = el('tspan', { x: W / 2, dy: i === 0 ? 0 : CAPTION_LINE_H });
        span.textContent = line;
        node.appendChild(span);
      });
    }

    /**
     * 장면 하나를 통째로 세운다.
     *
     * 완료 표식은 **거둘 때 `removeAttribute`** 로 거둔다. `data-done="false"` 로
     * 덮으면 흐르며 선 화면과 곧바로 세운 화면이 속성의 유무만큼 달라, 눈에는
     * 안 보여도 DOM 을 견주는 감사가 어긋남으로 잡는다.
     */
    function drawStatic(scene: OutOfBoundsScene, label: string): void {
      drawExpr(scene);
      drawCells(scene);
      drawGuardLook(scene);
      drawProbeLook(scene, label);
      // 자리는 걸음 함수가 정한다 — 정적 쓰임이라 프레임을 걸지 않고 끝 자리에 선다.
      const at = probeX(scene.probe.at, label);
      void slideProbe(at, at, MOVE_MS, false);
      void dropGuard(false);
      drawCaption(scene);
      if (scene.done) svg.setAttribute('data-done', 'true');
      else svg.removeAttribute('data-done');
    }

    // ── 걸음 함수. `withAnim` 이 거짓이면 타이머도 프레임도 걸지 않고 끝 자리에 선다.

    /** 커서가 출발 자리에서 지금 자리로 미끄러진다. */
    function slideProbe(fromX: number, toX: number, ms: number, withAnim: boolean): Promise<void> {
      if (!withAnim || fromX === toX) {
        placeProbe(toX);
        return Promise.resolve();
      }
      return animate(ms, (raw) => {
        const e = easeOut(raw);
        placeProbe(raw >= 1 ? toX : fromX + (toX - fromX) * e);
      });
    }

    /** 경계 검사를 아직 오지 않은 자리로 물린다. 내려서는 운동의 출발점이다. */
    function parkGuard(): void {
      if (guardGroup) guardGroup.style.transform = `translate(0px, ${-GUARD_RISE}px)`;
    }

    /** 경계 검사가 위에서 내려선다. 정적 그리기는 이미 내려앉은 자리에 세워 두었다. */
    function dropGuard(withAnim: boolean): Promise<void> {
      const group = guardGroup;
      if (!group) return Promise.resolve();
      if (!withAnim) {
        group.style.transform = 'translate(0px, 0px)';
        return Promise.resolve();
      }
      return animate(GUARD_MS, (raw) => {
        const e = easeBack(raw);
        const dy = raw >= 1 ? 0 : -GUARD_RISE * (1 - e);
        group.style.transform = `translate(0px, ${dy || 0}px)`;
      });
    }

    /**
     * 커서가 나아가다 벽에 부딪혀 멎고, 조금 물러앉는다.
     *
     * 정적 쓰임이 없는 유일한 걸음 함수다 — 물러앉은 끝 자리는 `probe.at` 이
     * `edge` 라는 것으로 이미 정해져 `slideProbe` 가 세운다. 여기 남는 것은
     * 부딪히고 튀는 **사이**뿐이다.
     */
    async function bumpProbe(fromX: number, stopX: number, restX: number): Promise<void> {
      await slideProbe(fromX, stopX, BUMP_MS, true);
      await slideProbe(stopX, restX, RECOIL_MS, true);
    }

    async function render(
      next: OutOfBoundsScene,
      /** 이 조각은 출발 그림을 장면에서 셈하므로 앞 장면을 들추지 않는다. */
      _prev: OutOfBoundsScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      if (builtKey !== baseKey(next)) build(next);

      const label = probeLabelOf(next);
      drawStatic(next, label);

      if (!opts.animate) return;

      // 방금 밟은 걸음 하나만 흐르게 한다. 걸음을 건너뛰어 온 길은 `animate` 가
      // 거짓이라 위에서 이미 돌아갔고, 출발 자리는 `step.from` 이 싣고 있으므로
      // `prev` 를 들출 까닭이 없다.
      const step = next.step;
      if (!step) return;

      const fromX = probeX(step.from, label);
      switch (step.kind) {
        case 'move':
          await slideProbe(fromX, probeX(next.probe.at, label), MOVE_MS, true);
          return;
        case 'guard':
          // 커서가 물러나는 동안 경계 검사는 아직 위에 있어야 한다. 정적 그리기가
          // 이미 내려앉은 자리에 세워 두었으므로 기다리기 전에 **동기로** 물린다 —
          // 그 사이에는 프레임도 타이머도 없어 페인트가 끼지 않는다.
          parkGuard();
          await slideProbe(fromX, probeX(next.probe.at, label), HOME_MS, true);
          await dropGuard(true);
          return;
        case 'bump': {
          const stopX = bumpX(label);
          await bumpProbe(fromX, stopX, stopX - RECOIL_DX);
          return;
        }
      }
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        clear();
        if (svg.parentNode) svg.parentNode.removeChild(svg);
      },
    };
  },
};
