/**
 * temporal-locality-stage — 장면을 받아 그린다.
 *
 * 두 층으로 세운다. 위는 칸 둘짜리 캐시, 아래는 라인이 늘어선 메모리다. 맨 위에
 * 접근열 두 줄이 있고, 한 번의 접근마다 **탐침이 그 자리에서 내려간다.**
 *
 *   맞으면  캐시 칸에서 되돌아온다 — 아래층까지 가지 않는다.
 *   빗나가면 아래층까지 내려가고, 그 라인이 칸으로 **올라온다.**
 *            칸이 차 있으면 가장 오래 기다린 것이 아래로 **밀려난다.**
 *
 * ── 어휘를 가른다 (형편과 표식을 각각 제 축에)
 *
 *   **채움** = 값의 형편. 칸 안에 라인 덩이가 있으면 차 있는 것이고 없으면 빈
 *   칸이다. 덩이의 글자가 어느 라인인지 말한다.
 *   **테두리** = 짚음의 표식. 칸의 외곽선은 평소 점선인데, **방금 답한 칸**만
 *   실선으로 굵어진다 (맞았으면 `accent`, 새로 채웠으면 `danger`). 옮기기 전에는
 *   탐침이 지나가면 그것이 사라져 "어느 칸이 답했나" 를 정지 화면이 말하지
 *   못했다.
 *   **칩** = 걸음의 판정. 접근마다 H/M 이 붙고 **지워지지 않는다**. 아래층까지
 *   내려간 자취도 실선으로 남는다. 그래서 완주 화면에 두 열의 적중·실패와
 *   내려간 횟수가 나란히 서고, 그것이 이 조각의 결론이다 — 셈을 옆의 계기로
 *   날려 보내지 않고 재는 자리에 남긴다 (S-piece).
 *
 * 색은 전부 design-tokens 에서 받는다 (S-view). 맞음은 `accent`, 빗나감은
 * `danger` — 미스는 비용을 치르는 사건이라 severity 로 읽는다. 올라온 라인은
 * `itemSorted` 에 `textInverse` 잉크다.
 *
 * ## 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`beginStream()` · `access()` · `verdict()`) 를 두지
 * 않는다. 그 메서드들은 되돌릴 수 없는 명령이라, 임의의 걸음으로 가려면 처음부터
 * 다시 밟는 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가 **그
 * 장면의 화면 전체**를 세운다 (S-scene).
 *
 * 정적 그리기는 레이어 다섯 안을 통째로 다시 짓고, 레이어 자신의 `opacity` 와
 * 캡션의 글자도 매번 명시로 쓴다 — 재건 밖에 남는 속성이 없다. 운동이 끝나면
 * 그 장면을 다시 세워 보간의 끝자리와 임시 노드를 통째로 지운다.
 *
 * 세로는 마운트 뒤 바뀌지 않는다 (S-view). 자리는 캔버스에서 역산하고 상수는
 * 상한으로만 둔다 (S-piece).
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import { temporalLocalityLineOf } from './algorithm.js';
import type { TemporalLocalityScene, TemporalLocalitySceneStep } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 가로는 러너가 정한다. 세로는 이 그림이 정하는 값이라 여기 둔다 (S-piece). */
const W = PIECE_CANVAS_W;
const STAGE_H = 292;

const SIDE = 16;
const LABEL_W = 60;
const ROW_H = 26;
const ROW_Y = [22, 58] as const;
const TOKEN_GAP = 8;
const TOKEN_MAX_W = 84;
const MARK_W = 16;

const SLOT_Y = 112;
const SLOT_H = 48;
const SLOT_GAP = 28;
const SLOT_MAX_W = 210;

const MEM_Y = 208;
const MEM_H = 32;
const MEM_GAP = 4;
const MEM_MAX_W = 52;

const CAPTION_Y = 272;

const DOWN_HIT_MS = 190;
const HOLD_MS = 180;
const UP_HIT_MS = 160;
const DOWN_MISS_MS = 300;
const EVICT_MS = 200;
const RISE_MS = 300;
/** 열이 깨어나며 한 번 들썩이는 시간. 옮기기 전에는 운동 없는 160ms 의 멈춤이었다. */
const WAKE_MS = 260;
/** 열이 끝나며 그 열의 자취가 한 번 굵어지는 시간. 옮기기 전에는 운동이 없었다. */
const END_MS = 260;
const VERDICT_MS = 320;

const PROBE_R = 7;
const EVICT_DROP = 58;

/** 물러선 층의 옅기. 견줌이 서면 자취만 남기고 두 층이 물러난다. */
const CACHE_DIM = 0.3;
const MEM_DIM = 0.45;
/** 자취의 굵기와 옅기. 견줌이 서면 굵어진다. */
const TRAIL_W = 1.2;
const TRAIL_W_VERDICT = 2.4;
const TRAIL_O_ACTIVE = 0.42;
const TRAIL_O_IDLE = 0.22;
const TRAIL_O_VERDICT = 0.75;

/**
 * 도형에 새겨진 표식 (C10). 번역하지 않는다 — `cache` · `memory` · `line` 은
 * 한국어 문서도 원어 그대로 쓰는 말이고, `a[3]` · `H` · `M` 은 도식 기호다.
 */
const CACHE_MARK = 'cache';
const MEMORY_MARK = 'memory';
const HIT_MARK = 'H';
const MISS_MARK = 'M';
const cellMark = (index: number): string => `a[${index}]`;
const lineMark = (line: number): string => `line ${line}`;

type Pt = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };

/** 자리 셈의 결과. 장면이 좌표를 담지 않으므로 그릴 때마다 여기서 만든다. */
type BoxAt = { x: number; w: number; cx: number };
type TokenAt = { x: number; y: number; w: number; cx: number };
type Layout = {
  /** 라인 번호로 색인한 아래층 칸. */
  mem: BoxAt[];
  /** 캐시 칸. */
  slots: BoxAt[];
  rows: { y: number; tokens: TokenAt[] }[];
};

/** 칸에 들어앉은 라인 덩이의 손잡이. */
type BlockRefs = { g: SVGGElement; rect: SVGRectElement; text: SVGTextElement };

/** 이번 그림의 손잡이. 정적 그리기가 매번 새로 채운다 — 상태가 아니다. */
type Refs = {
  layout: Layout;
  /** 열마다의 `<g>`. 깨어나는 운동이 이것을 들썩인다. */
  rowGroups: SVGGElement[];
  /** 열마다·접근마다의 H/M 칩. 아직 읽지 않은 자리에는 짓지 않는다. */
  marks: { rect: SVGRectElement; text: SVGTextElement }[][];
  /** 열마다의 자취. 빗나간 접근의 차례대로. */
  trails: SVGLineElement[][];
  /** 칸 번호로 찾는 라인 덩이. 빈 칸은 들어 있지 않다. */
  blocks: Map<number, BlockRefs>;
};

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) * (-2 * p + 2)) / 2;
}

/**
 * 부풀었다 제자리로 돌아오는 활. **양 끝에서 정확히 0** 이라 멎은 화면은 어느
 * 걸음에서 오든 같다 — `Math.sin(1 * Math.PI)` 는 0 이 아니라 1.2e-16 이고,
 * 그 끝자리가 속성 문자열을 가른다.
 */
function arc(e: number): number {
  return e <= 0 || e >= 1 ? 0 : Math.sin(e * Math.PI);
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** 한 줄에 균등하게 늘어놓되 남는 폭을 여백으로 버리지 않는다 (S-piece). */
function spread(
  count: number,
  from: number,
  span: number,
  gap: number,
  maxW: number,
): BoxAt[] {
  if (count <= 0) return [];
  const w = Math.max(8, Math.min(maxW, Math.floor((span - gap * (count - 1)) / count)));
  const total = w * count + gap * (count - 1);
  const x0 = from + Math.round((span - total) / 2);
  const out: BoxAt[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = x0 + i * (w + gap);
    out.push({ x, w, cx: x + w / 2 });
  }
  return out;
}

/**
 * 장면의 구조에서 자리를 한 번에 셈한다.
 *
 * 먼저 다 셈하고 그 다음에 그린다 — 그리면서 이웃의 지금 좌표를 재면 순회 순서가
 * 곧 숨은 상태가 된다.
 */
function layoutOf(scene: TemporalLocalityScene): Layout {
  let maxLine = 0;
  for (const indices of scene.streams) {
    for (const index of indices) {
      maxLine = Math.max(
        maxLine,
        temporalLocalityLineOf(index, scene.elemBytes, scene.lineBytes),
      );
    }
  }
  const lineCount = scene.streams.length > 0 ? maxLine + 1 : 0;

  const rows: Layout['rows'] = [];
  for (let s = 0; s < scene.streams.length; s += 1) {
    const indices = scene.streams[s] ?? [];
    const y = ROW_Y[Math.min(s, ROW_Y.length - 1)] ?? ROW_Y[0];
    const boxes = spread(
      indices.length,
      SIDE + LABEL_W,
      W - SIDE * 2 - LABEL_W,
      TOKEN_GAP,
      TOKEN_MAX_W,
    );
    rows.push({ y, tokens: boxes.map((b) => ({ x: b.x, y, w: b.w, cx: b.cx })) });
  }

  return {
    mem: spread(lineCount, SIDE, W - SIDE * 2, MEM_GAP, MEM_MAX_W),
    slots: spread(scene.slots, SIDE, W - SIDE * 2, SLOT_GAP, SLOT_MAX_W),
    rows,
  };
}

function slotRectOf(layout: Layout, slot: number): Rect | null {
  const box = layout.slots[slot];
  if (!box) return null;
  return { x: box.x + 5, y: SLOT_Y + 5, w: box.w - 10, h: SLOT_H - 10 };
}

function memRectOf(layout: Layout, line: number): Rect | null {
  const box = layout.mem[line];
  if (!box) return null;
  return { x: box.x, y: MEM_Y, w: box.w, h: MEM_H };
}

/** 그 열이 아래층까지 내려간 횟수. 화면의 자취와 같은 자료에서 나온다. */
function missesOf(scene: TemporalLocalityScene, stream: number): number {
  return (scene.reads[stream] ?? []).filter((r) => !r.hit).length;
}

/** 이 열이 지금 앞에 나와 있나. 견줌이 서면 둘 다 나온다. */
function rowLit(scene: TemporalLocalityScene, stream: number): boolean {
  return scene.verdict || scene.active === stream;
}

function trailOpacity(scene: TemporalLocalityScene, stream: number): number {
  if (scene.verdict) return TRAIL_O_VERDICT;
  return rowLit(scene, stream) ? TRAIL_O_ACTIVE : TRAIL_O_IDLE;
}

/** 방금 답한 칸. 열이 끝나면 없다 — 짚는 중일 때만 서는 표식이다. */
function touchedOf(scene: TemporalLocalityScene): { slot: number; hit: boolean } | null {
  if (scene.active === null) return null;
  const reads = scene.reads[scene.active] ?? [];
  const last = reads[reads.length - 1];
  return last ? { slot: last.slot, hit: last.hit } : null;
}

export const temporalLocalityStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 (S-view).
    svg.textContent = '';

    const c = getColors(params.theme);
    // 장면이 문안을 담지 않으므로 문자는 여기서 만든다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    const trailLayer = el('g', {});
    const memLayer = el('g', {});
    const cacheLayer = el('g', {});
    const rowLayer = el('g', {});
    const probeLayer = el('g', {});
    svg.appendChild(trailLayer);
    svg.appendChild(memLayer);
    svg.appendChild(cacheLayer);
    svg.appendChild(rowLayer);
    svg.appendChild(probeLayer);

    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.textMuted,
    });
    svg.appendChild(caption);

    // ── 움직임 ───────────────────────────────────────────────────────────
    // destroy 는 기다리던 promise 를 반드시 푼다. 취소된 프레임은 아예 불리지
    // 않으므로 플래그만으로는 promise 가 영영 안 풀린다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 정적 그리기가 모든 요소를 매번 새로 짓지만, 운동이 쥔 것은 **그때의 손잡이**
     * 라 되짚기나 destroy 가 가운데 끼어들면 이미 떨어져 나간 노드를 붙들고 있게
     * 된다. 깨어난 운동은 자기 세대를 확인하고 아니면 화면에 손대지 않는다.
     */
    let gen = 0;
    const alive = (my: number): boolean => !destroyed && my === gen;

    function tween(ms: number, my: number, apply: (e: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(my) || ms <= 0) {
          resolve();
          return;
        }
        let raf = 0;
        const finish = (): void => {
          waiters.delete(finish);
          if (raf !== 0) cancelAnimationFrame(raf);
          raf = 0;
          resolve();
        };
        waiters.add(finish);
        const began = now();
        const tick = (): void => {
          raf = 0;
          if (!alive(my)) {
            finish();
            return;
          }
          const p = Math.min(1, (now() - began) / ms);
          apply(ease(p));
          if (p < 1) raf = requestAnimationFrame(tick);
          else finish();
        };
        // 첫 프레임을 동기로 그린다. 정적 그리기가 이미 끝 자리에 세워 두었으므로
        // 출발 자리로 물리는 것을 다음 프레임에 미루면 끝 자리가 한 번 번쩍인다.
        apply(0);
        raf = requestAnimationFrame(tick);
      });
    }

    // ── 라인 덩이 ────────────────────────────────────────────────────────
    function makeBlock(line: number, at: Rect): BlockRefs {
      const g = el('g', {});
      const rect = el('rect', {
        x: at.x,
        y: at.y,
        width: at.w,
        height: at.h,
        rx: 6,
        fill: c.itemSorted,
      });
      const text = el('text', {
        x: at.x + at.w / 2,
        y: at.y + at.h / 2 + 4,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: c.textInverse,
      });
      text.textContent = lineMark(line);
      g.appendChild(rect);
      g.appendChild(text);
      cacheLayer.appendChild(g);
      return { g, rect, text };
    }

    function placeBlock(block: BlockRefs, at: Rect): void {
      block.rect.setAttribute('x', String(at.x));
      block.rect.setAttribute('y', String(at.y));
      block.rect.setAttribute('width', String(at.w));
      block.rect.setAttribute('height', String(at.h));
      block.text.setAttribute('x', String(at.x + at.w / 2));
      block.text.setAttribute('y', String(at.y + at.h / 2 + 4));
    }

    // ── 정적 그리기 ──────────────────────────────────────────────────────
    function drawCaption(scene: TemporalLocalityScene): void {
      const step = scene.step;
      if (!step) {
        caption.textContent = '';
        return;
      }
      switch (step.kind) {
        case 'begin': {
          // 캡션이 말하는 수는 화면과 같은 자료에서 나온다 — 발신이 싣지 않는다.
          const stream = scene.begun - 1;
          caption.textContent =
            stream === 0
              ? t('caption.near', 'Six reads, all at the same spot. Slots upstairs: {slots}.', {
                  slots: scene.slots,
                })
              : t('caption.far', 'Six reads again, but each one somewhere else.');
          return;
        }
        case 'read': {
          const reads = scene.active !== null ? (scene.reads[scene.active] ?? []) : [];
          const hit = reads[reads.length - 1]?.hit === true;
          caption.textContent = hit
            ? t('caption.hit', 'Already upstairs. The read turns back here.')
            : step.evicted !== null
              ? t('caption.evict', 'No free slot — the line that waited longest is pushed out.')
              : t('caption.miss', 'Not upstairs. The read goes down and the line rises.');
          return;
        }
        case 'end': {
          const stream = scene.begun - 1;
          const miss = missesOf(scene, stream);
          caption.textContent =
            stream === 0
              ? t('caption.nearResult', 'Staying put. Trips downstairs: {miss}.', { miss })
              : t('caption.farResult', 'Wandering off. Trips downstairs: {miss}.', { miss });
          return;
        }
        case 'verdict':
          caption.textContent = t(
            'caption.verdict',
            'Same six reads either way. Trips downstairs: {near} and {far}.',
            { near: missesOf(scene, 0), far: missesOf(scene, 1) },
          );
      }
    }

    function drawStatic(scene: TemporalLocalityScene): Refs {
      const layout = layoutOf(scene);

      trailLayer.textContent = '';
      memLayer.textContent = '';
      cacheLayer.textContent = '';
      rowLayer.textContent = '';
      probeLayer.textContent = '';
      // 레이어 자신의 opacity 는 자식을 비워도 남는다. 매번 명시로 쓴다.
      trailLayer.setAttribute('opacity', '1');
      memLayer.setAttribute('opacity', scene.verdict ? String(MEM_DIM) : '1');
      cacheLayer.setAttribute('opacity', scene.verdict ? String(CACHE_DIM) : '1');
      rowLayer.setAttribute('opacity', '1');
      probeLayer.setAttribute('opacity', '1');

      // ── 아래층: 라인이 늘어선 메모리 ────────────────────────────────
      const memLabel = el('text', {
        x: SIDE,
        y: MEM_Y - 9,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      memLabel.textContent = MEMORY_MARK;
      memLayer.appendChild(memLabel);

      for (let i = 0; i < layout.mem.length; i += 1) {
        const box = layout.mem[i];
        if (!box) continue;
        memLayer.appendChild(
          el('rect', {
            x: box.x,
            y: MEM_Y,
            width: box.w,
            height: MEM_H,
            rx: 5,
            fill: c.bgSubtle,
            stroke: c.border,
            'stroke-width': 1,
          }),
        );
        const label = el('text', {
          x: box.cx,
          y: MEM_Y + MEM_H / 2 + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        label.textContent = String(i);
        memLayer.appendChild(label);
      }

      // ── 위층: 캐시 칸과 들어앉은 라인 ──────────────────────────────
      const cacheLabel = el('text', {
        x: layout.slots[0]?.x ?? SIDE,
        y: SLOT_Y - 9,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      cacheLabel.textContent = CACHE_MARK;
      cacheLayer.appendChild(cacheLabel);

      const touched = touchedOf(scene);
      for (let i = 0; i < layout.slots.length; i += 1) {
        const box = layout.slots[i];
        if (!box) continue;
        const marked = touched !== null && touched.slot === i;
        // 테두리는 짚음의 표식만 말한다. 차 있나 없나는 안의 덩이가 말한다.
        const rect = el('rect', {
          x: box.x,
          y: SLOT_Y,
          width: box.w,
          height: SLOT_H,
          rx: 7,
          fill: 'none',
          stroke: marked ? (touched.hit ? c.accent : c.danger) : c.border,
          'stroke-width': marked ? 2.4 : 1.4,
        });
        if (!marked) rect.setAttribute('stroke-dasharray', '5 4');
        cacheLayer.appendChild(rect);
      }

      const blocks = new Map<number, BlockRefs>();
      for (let i = 0; i < scene.resident.length; i += 1) {
        const line = scene.resident[i];
        const at = slotRectOf(layout, i);
        if (typeof line !== 'number' || !at) continue;
        blocks.set(i, makeBlock(line, at));
      }

      // ── 맨 위: 접근열 두 줄 ────────────────────────────────────────
      const rowGroups: SVGGElement[] = [];
      const marks: Refs['marks'] = [];
      for (let s = 0; s < layout.rows.length; s += 1) {
        const row = layout.rows[s];
        if (!row) continue;
        const lit = rowLit(scene, s);
        const indices = scene.streams[s] ?? [];
        const reads = scene.reads[s] ?? [];

        const g = el('g', {});
        rowLayer.appendChild(g);
        rowGroups.push(g);

        const label = el('text', {
          x: SIDE + LABEL_W - 12,
          y: row.y + ROW_H / 2 + 4,
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: lit ? c.text : c.textMuted,
        });
        // 키와 en 원본을 리터럴로 둔다 — 추출기와 대조 검사가 리터럴만 읽는다 (C10).
        label.textContent = s === 0 ? t('label.near', 'same spot') : t('label.far', 'scattered');
        g.appendChild(label);

        const rowMarks: Refs['marks'][number] = [];
        for (let i = 0; i < row.tokens.length; i += 1) {
          const tok = row.tokens[i];
          if (!tok) continue;
          g.appendChild(
            el('rect', {
              x: tok.x,
              y: tok.y,
              width: tok.w,
              height: ROW_H,
              rx: 6,
              fill: c.bg,
              stroke: lit ? c.text : c.border,
              'stroke-width': lit ? 1.6 : 1,
            }),
          );
          const text = el('text', {
            x: tok.x + (tok.w - MARK_W - 6) / 2,
            y: tok.y + ROW_H / 2 + 4,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: lit ? c.text : c.textMuted,
          });
          text.textContent = cellMark(indices[i] ?? 0);
          g.appendChild(text);

          // 아직 읽지 않은 자리에는 칩을 **짓지 않는다** — 숨기면 앞 걸음의 값이
          // 함께 남는다.
          const read = reads[i];
          if (!read) continue;
          const markRect = el('rect', {
            x: tok.x + tok.w - MARK_W - 5,
            y: tok.y + (ROW_H - MARK_W) / 2,
            width: MARK_W,
            height: MARK_W,
            rx: 4,
            fill: read.hit ? c.accent : c.danger,
          });
          const markText = el('text', {
            x: tok.x + tok.w - MARK_W / 2 - 5,
            y: tok.y + ROW_H / 2 + 4,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: c.stateInk,
          });
          markText.textContent = read.hit ? HIT_MARK : MISS_MARK;
          g.appendChild(markRect);
          g.appendChild(markText);
          rowMarks[i] = { rect: markRect, text: markText };
        }
        marks.push(rowMarks);
      }

      // ── 아래층까지 내려간 자취 ─────────────────────────────────────
      const trails: SVGLineElement[][] = [];
      for (let s = 0; s < layout.rows.length; s += 1) {
        const row = layout.rows[s];
        const reads = scene.reads[s] ?? [];
        const rowTrails: SVGLineElement[] = [];
        for (let i = 0; i < reads.length; i += 1) {
          const read = reads[i];
          const tok = row?.tokens[i];
          if (!read || read.hit || !tok) continue;
          const index = scene.streams[s]?.[i] ?? 0;
          const box = layout.mem[temporalLocalityLineOf(index, scene.elemBytes, scene.lineBytes)];
          if (!box) continue;
          const trail = el('line', {
            x1: tok.cx,
            y1: tok.y + ROW_H,
            x2: box.cx,
            y2: MEM_Y,
            stroke: c.danger,
            'stroke-width': scene.verdict ? TRAIL_W_VERDICT : TRAIL_W,
            opacity: trailOpacity(scene, s),
          });
          trailLayer.appendChild(trail);
          rowTrails.push(trail);
        }
        trails.push(rowTrails);
      }

      drawCaption(scene);
      return { layout, rowGroups, marks, trails, blocks };
    }

    // ── 운동 ─────────────────────────────────────────────────────────────
    /** 칸에 있던 라인들이 아래로 떨어져 나간다. 출발 그림은 장면이 말한 계기값이다. */
    async function dropHeld(
      held: readonly { slot: number; line: number }[],
      layout: Layout,
      ms: number,
      my: number,
    ): Promise<void> {
      const falling: { block: BlockRefs; from: Rect }[] = [];
      for (const h of held) {
        const from = slotRectOf(layout, h.slot);
        if (!from) continue;
        falling.push({ block: makeBlock(h.line, from), from });
      }
      if (falling.length === 0) return;
      await tween(ms, my, (e) => {
        for (const f of falling) {
          placeBlock(f.block, { ...f.from, y: f.from.y + EVICT_DROP * e });
          f.block.g.setAttribute('opacity', String(1 - e));
        }
      });
      for (const f of falling) f.block.g.remove();
    }

    /** 앞 열이 남긴 것이 떨어져 나가고 이 열이 깨어나 한 번 들썩인다. */
    async function flowBegin(
      scene: TemporalLocalityScene,
      step: Extract<TemporalLocalitySceneStep, { kind: 'begin' }>,
      refs: Refs,
      my: number,
    ): Promise<void> {
      await dropHeld(step.dropped, refs.layout, EVICT_MS, my);
      if (!alive(my)) return;
      const g = refs.rowGroups[scene.begun - 1];
      if (!g) return;
      // 이미 서 있던 줄이라 부풀었다 돌아오는 꼴로 깨운다. 양 끝에서 0 이므로
      // 멎은 화면은 어느 걸음에서 오든 같다.
      await tween(WAKE_MS, my, (e) => {
        g.setAttribute('transform', `translate(0 ${-arc(e) * 5})`);
      });
    }

    /** 한 번의 접근. 탐침이 내려갔다 돌아온다. */
    async function flowRead(
      scene: TemporalLocalityScene,
      step: Extract<TemporalLocalitySceneStep, { kind: 'read' }>,
      refs: Refs,
      my: number,
    ): Promise<void> {
      const stream = scene.active;
      if (stream === null) return;
      const reads = scene.reads[stream] ?? [];
      const at = reads.length - 1;
      const read = reads[at];
      const tok = refs.layout.rows[stream]?.tokens[at];
      if (!read || !tok) return;

      const index = scene.streams[stream]?.[at] ?? 0;
      const line = temporalLocalityLineOf(index, scene.elemBytes, scene.lineBytes);
      const home: Pt = { x: tok.cx, y: tok.y + ROW_H + PROBE_R };

      // 판정은 걸음이 끝난 뒤에 선다. 마지막 정적 그리기가 다시 세운다.
      const mark = refs.marks[stream]?.[at];
      if (mark) {
        mark.rect.setAttribute('opacity', '0');
        mark.text.setAttribute('opacity', '0');
      }

      const probe = el('circle', { cx: home.x, cy: home.y, r: PROBE_R, fill: c.itemActive });
      probeLayer.appendChild(probe);
      const move = (from: Pt, to: Pt, e: number): void => {
        probe.setAttribute('cx', String(lerp(from.x, to.x, e)));
        probe.setAttribute('cy', String(lerp(from.y, to.y, e)));
      };

      if (read.hit) {
        const box = refs.layout.slots[read.slot];
        const base = slotRectOf(refs.layout, read.slot);
        if (!box || !base) return;
        const there: Pt = { x: box.cx, y: SLOT_Y + SLOT_H / 2 };
        await tween(DOWN_HIT_MS, my, (e) => move(home, there, e));
        if (!alive(my)) return;
        const block = refs.blocks.get(read.slot);
        if (block) {
          await tween(HOLD_MS, my, (e) => {
            placeBlock(block, { ...base, y: base.y - arc(e) * 5 });
          });
        }
        if (!alive(my)) return;
        // 아래층까지 갈 일이 없다 — 여기서 되돌아온다.
        await tween(UP_HIT_MS, my, (e) => move(there, home, e));
      } else {
        const box = refs.layout.mem[line];
        const from = memRectOf(refs.layout, line);
        const to = slotRectOf(refs.layout, read.slot);
        if (!box || !from || !to) return;
        const there: Pt = { x: box.cx, y: MEM_Y + MEM_H / 2 };

        // 이번 자취는 탐침이 내려가는 동안 그어진다.
        const rowTrails = refs.trails[stream] ?? [];
        const trail = rowTrails[rowTrails.length - 1];
        const target = trailOpacity(scene, stream);
        if (trail) trail.setAttribute('opacity', '0');
        // 올라올 라인은 아직 위층에 없다.
        const block = refs.blocks.get(read.slot);
        if (block) block.g.setAttribute('opacity', '0');

        await tween(DOWN_MISS_MS, my, (e) => {
          move(home, there, e);
          if (trail) trail.setAttribute('opacity', e >= 1 ? String(target) : String(target * e));
        });
        if (!alive(my)) return;

        if (step.evicted !== null) {
          await dropHeld([{ slot: read.slot, line: step.evicted }], refs.layout, EVICT_MS, my);
        }
        if (!alive(my)) return;

        // 라인이 칸으로 올라오고 탐침도 함께 제 자리로 돌아온다.
        if (block) block.g.removeAttribute('opacity');
        await tween(RISE_MS, my, (e) => {
          if (block) {
            placeBlock(block, {
              x: lerp(from.x, to.x, e),
              y: lerp(from.y, to.y, e),
              w: lerp(from.w, to.w, e),
              h: lerp(from.h, to.h, e),
            });
            block.text.setAttribute('opacity', e >= 1 ? '1' : String(e));
          }
          move(there, home, e);
        });
      }
      probe.remove();
    }

    /** 열이 끝난다. 그 열이 내려간 자취가 한 번 굵어졌다 돌아온다 — 세어 보이는 것이다. */
    function flowEnd(scene: TemporalLocalityScene, refs: Refs, my: number): Promise<void> {
      const stream = scene.begun - 1;
      const trails = refs.trails[stream] ?? [];
      if (trails.length === 0) return Promise.resolve();
      const base = trailOpacity(scene, stream);
      return tween(END_MS, my, (e) => {
        const swell = arc(e);
        for (const trail of trails) {
          trail.setAttribute('stroke-width', String(TRAIL_W + 1.2 * swell));
          trail.setAttribute('opacity', String(base + 0.5 * swell));
        }
      });
    }

    /** 견줌이 선다. 두 층이 물러나고 자취만 굵어진다. */
    async function flowVerdict(
      step: Extract<TemporalLocalitySceneStep, { kind: 'verdict' }>,
      refs: Refs,
      my: number,
    ): Promise<void> {
      const ghosts: BlockRefs[] = [];
      for (const h of step.cleared) {
        const at = slotRectOf(refs.layout, h.slot);
        if (at) ghosts.push(makeBlock(h.line, at));
      }
      const trails = refs.trails.flat();
      await tween(VERDICT_MS, my, (e) => {
        cacheLayer.setAttribute('opacity', e >= 1 ? String(CACHE_DIM) : String(lerp(1, CACHE_DIM, e)));
        memLayer.setAttribute('opacity', e >= 1 ? String(MEM_DIM) : String(lerp(1, MEM_DIM, e)));
        for (const trail of trails) {
          trail.setAttribute(
            'stroke-width',
            e >= 1 ? String(TRAIL_W_VERDICT) : String(lerp(TRAIL_W, TRAIL_W_VERDICT, e)),
          );
          trail.setAttribute(
            'opacity',
            e >= 1 ? String(TRAIL_O_VERDICT) : String(lerp(TRAIL_O_IDLE, TRAIL_O_VERDICT, e)),
          );
        }
        for (const ghost of ghosts) ghost.g.setAttribute('opacity', String(Math.max(0, 1 - e * 2)));
      });
      for (const ghost of ghosts) ghost.g.remove();
    }

    async function render(
      next: TemporalLocalityScene,
      /** 이 조각은 출발 그림을 장면의 계기값에서 셈하므로 앞 장면을 들추지 않는다. */
      _prev: TemporalLocalityScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const my = (gen += 1);

      const refs = drawStatic(next);
      if (!opts.animate) return;

      const step = next.step;
      if (!step) return;

      switch (step.kind) {
        case 'begin':
          await flowBegin(next, step, refs, my);
          break;
        case 'read':
          await flowRead(next, step, refs, my);
          break;
        case 'end':
          await flowEnd(next, refs, my);
          break;
        case 'verdict':
          await flowVerdict(step, refs, my);
          break;
      }

      if (!alive(my)) return;
      // 운동이 남긴 속성과 보간의 끝자리를 통째로 지운다. 속성을 하나씩 거두면
      // 반드시 하나를 빠뜨린다. 그 사이에 타이머도 프레임도 없어 깜빡이지 않는다.
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        // 프레임을 거두는 것만으로는 모자라다 — 취소된 tick 은 아예 불리지
        // 않으므로, 기다리던 promise 를 여기서 직접 푼다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
