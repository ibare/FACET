/**
 * t-SNE stage — 원래 자리와 편 그림을 나란히 놓고, 그 아래 손잡이마다 나온
 * 답을 쌓는 장부를 둔다.
 *
 * ── 무엇을 그리는가
 *
 *  왼쪽 판  점이 실제로 놓인 자리. 마운트 순간 그려지고 그 뒤로 바뀌지 않는다.
 *  오른쪽 판 t-SNE 가 펴 놓은 자리. 걸음마다 갈아 끼운다.
 *  두 판 모두  무리마다 가운데를 찍고 퍼진 폭을 동그라미로 두른다. 가운데를
 *             잇는 두 줄이 A-B 와 B-C 이고, 그 위에 **A-B 를 1 로 놓은 몫**을
 *             적는다 — 두 판의 자는 단위가 다르므로 길이를 그대로 견줄 수 없고,
 *             견줄 수 있는 것은 그 몫뿐이다.
 *  장부      원래 자리 한 줄 + 돌려 본 퍼플렉시티마다 한 줄. 견줌의 기준이
 *             같은 계기 위에 있어야 하므로 원래 자리도 같은 표에 둔다.
 *
 * ── 축 눈금을 두지 않는다
 *
 * t-SNE 의 좌표에는 단위가 없다. 눈금을 그리면 없는 자를 있는 것처럼 보이게 한다.
 *
 * ── 세로는 마운트한 뒤 바뀌지 않는다 (S-view)
 *
 * 장부의 줄 수는 넷으로 고정이고 (원래 + 퍼플렉시티 셋) 아직 돌지 않은 줄은
 * 비워 둔다. 그래서 답이 쌓여도 캔버스가 자라지 않는다.
 *
 * ── destroy
 *
 * 스스로 예약하는 타이머도 프레임도 없다. 걸음의 박자는 알고리즘이 쥐고 있고
 * 이 view 는 부르는 대로 그리기만 한다. 그래서 `destroy` 는 자기가 만든 노드만
 * 거둔다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import {
  categorical,
  fontSizes,
  getColors,
  makeTranslator,
  type Palette,
} from '@ffacet/core/runtime';

const W = 760;
const H = 430;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 두 판. 왼쪽이 원래 자리, 오른쪽이 편 그림. */
const PANEL_Y = 30;
const PANEL_H = 236;
const PANEL_W = 360;
const LEFT_X = 14;
const RIGHT_X = 386;
const PANEL_PAD = 16;

/** 장부. 줄 넷이 고정 자리를 차지한다. */
const LEDGER_Y = 284;
const LEDGER_ROW_H = 26;
const LEDGER_ROWS = 4;

const CAPTION_Y = 414;

const DOT_R = 3.1;

/** 무리 셋을 가르는 색. 카테고리 식별이므로 categorical 시드에서 뽑는다. */
const CLUSTER_TONE = 'vivid' as const;

type ClusterKey = 'source' | 'p';

export type LedgerRow = {
  /** 장부에서 한 줄을 가리키는 열쇠. 같은 열쇠로 다시 얹으면 그 줄을 갈아 끼운다. */
  key: string;
  kind: ClusterKey;
  perplexity: number;
  separation: number;
  ratio: number;
  verdict: 'broken' | 'clean' | 'blurred';
};

export type PanelState = {
  coords: number[][];
  labels: number[];
  spreads: number[];
  ratio: number;
};

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Attrs,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function text(content: string, attrs: Attrs): SVGTextElement {
  const node = el('text', attrs);
  node.textContent = content;
  return node;
}

/** hex 를 알파가 붙은 rgba 로. 입력은 토큰에서 온다 — 색 리터럴이 아니다 (S-view). */
function withAlpha(hex: string, alpha: number): string {
  const v = hex.replace('#', '');
  const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function fixed2(v: number): string {
  return v.toFixed(2);
}

/** 무리마다 가운데. */
function centroids(coords: number[][], labels: number[], groups: number): number[][] {
  const sums: number[][] = [];
  const counts: number[] = [];
  for (let k = 0; k < groups; k += 1) {
    sums.push([0, 0]);
    counts.push(0);
  }
  for (let i = 0; i < coords.length; i += 1) {
    const k = labels[i];
    if (k === undefined || k < 0 || k >= groups) continue;
    sums[k][0] += coords[i][0];
    sums[k][1] += coords[i][1];
    counts[k] += 1;
  }
  return sums.map((s, k) => (counts[k] === 0 ? [0, 0] : [s[0] / counts[k], s[1] / counts[k]]));
}

export const tsneStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const tr = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const clusterColors = categorical(3, CLUSTER_TONE);
    const svg = params.canvas;
    // 캔버스 **안쪽**만 비운다. 컨테이너를 비우면 러너가 붙여 준 캔버스가
    // 떨어져 나가 그림이 통째로 사라진다 (S-view).
    svg.textContent = '';
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', tr('label.aria', 't-SNE visualization: the real positions beside the flattened picture, with a ledger of what each perplexity gave'));

    const initial = (params.initialData ?? {}) as {
      points?: unknown;
      labels?: unknown;
      clusterNames?: unknown;
      perplexities?: unknown;
    };
    const isPointList = (v: unknown): v is number[][] =>
      Array.isArray(v) && v.every((p) => Array.isArray(p) && typeof p[0] === 'number');
    const sourcePoints = isPointList(initial.points) ? initial.points : [];
    const sourceLabels =
      Array.isArray(initial.labels) && initial.labels.every((v) => typeof v === 'number')
        ? (initial.labels as number[])
        : sourcePoints.map(() => 0);
    const clusterNames =
      Array.isArray(initial.clusterNames) &&
      initial.clusterNames.every((v) => typeof v === 'string')
        ? (initial.clusterNames as string[])
        : ['A', 'B', 'C'];
    const perplexities =
      Array.isArray(initial.perplexities) &&
      initial.perplexities.every((v) => typeof v === 'number')
        ? (initial.perplexities as number[])
        : [];

    // ── 껍데기. 판 둘 · 장부 · 캡션의 자리는 여기서 한 번 정해지고 안 바뀐다.
    const defs = el('defs', {});
    svg.appendChild(defs);
    for (const [id, x] of [
      ['tsne-clip-left', LEFT_X],
      ['tsne-clip-right', RIGHT_X],
    ] as const) {
      const clip = el('clipPath', { id });
      clip.appendChild(el('rect', { x, y: PANEL_Y, width: PANEL_W, height: PANEL_H, rx: 8 }));
      defs.appendChild(clip);
    }

    const panelLayer = el('g', {});
    svg.appendChild(panelLayer);
    const ledgerLayer = el('g', {});
    svg.appendChild(ledgerLayer);
    const captionLayer = el('g', {});
    svg.appendChild(captionLayer);

    type Panel = {
      x: number;
      title: string;
      frame: SVGRectElement;
      body: SVGGElement;
      readout: SVGTextElement;
      note: SVGTextElement;
    };

    function makePanel(x: number, title: string, clipId: string, note: string): Panel {
      const g = el('g', {});
      panelLayer.appendChild(g);
      g.appendChild(
        text(title, {
          x: x + 2,
          y: PANEL_Y - 10,
          fill: colors.textMuted,
          'font-size': fontSizes.xs,
        }),
      );
      const frame = el('rect', {
        x,
        y: PANEL_Y,
        width: PANEL_W,
        height: PANEL_H,
        rx: 8,
        fill: colors.bgSubtle,
        stroke: colors.border,
        'stroke-width': 1,
      });
      g.appendChild(frame);
      const body = el('g', { 'clip-path': `url(#${clipId})` });
      g.appendChild(body);
      const readout = text('', {
        x: x + 10,
        y: PANEL_Y + PANEL_H - 12,
        fill: colors.text,
        'font-size': fontSizes.sm,
      });
      g.appendChild(readout);
      const noteEl = text(note, {
        x: x + PANEL_W - 10,
        y: PANEL_Y + PANEL_H - 12,
        fill: colors.textMuted,
        'font-size': fontSizes.xs,
        'text-anchor': 'end',
      });
      g.appendChild(noteEl);
      return { x, title, frame, body, readout, note: noteEl };
    }

    const leftPanel = makePanel(
      LEFT_X,
      tr('label.source', 'where the points really are'),
      'tsne-clip-left',
      tr('label.spreadRing', 'ring = how wide the group sits'),
    );
    const rightPanel = makePanel(
      RIGHT_X,
      tr('label.embedding', 'the same points, flattened by t-SNE'),
      'tsne-clip-right',
      tr('label.noUnits', 'these coordinates have no unit'),
    );

    /** 한 판을 통째로 다시 그린다. 그릴 것이 예순 점뿐이라 부분 갱신이 값이 없다. */
    function paintPanel(panel: Panel, state: PanelState | null): void {
      panel.body.textContent = '';
      panel.readout.textContent = '';
      if (!state || state.coords.length === 0) return;

      const xs = state.coords.map((p) => p[0]);
      const ys = state.coords.map((p) => p[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const spanX = Math.max(maxX - minX, 1e-9);
      const spanY = Math.max(maxY - minY, 1e-9);
      const innerW = PANEL_W - PANEL_PAD * 2;
      const innerH = PANEL_H - PANEL_PAD * 2 - 14;
      const scale = Math.min(innerW / spanX, innerH / spanY);
      const originX = panel.x + PANEL_W / 2 - ((minX + maxX) / 2) * scale;
      const originY = PANEL_Y + (PANEL_H - 14) / 2 + ((minY + maxY) / 2) * scale;
      const sx = (v: number): number => originX + v * scale;
      // y 는 화면에서 뒤집는다 — 위가 큰 값이다.
      const sy = (v: number): number => originY - v * scale;

      const groups = clusterNames.length;
      const centres = centroids(state.coords, state.labels, groups);

      // 퍼진 폭을 두르는 동그라미. 무리가 부서지면 이것이 판을 넘어간다.
      for (let k = 0; k < groups; k += 1) {
        const radius = (state.spreads[k] ?? 0) * scale;
        if (!Number.isFinite(radius) || radius <= 0) continue;
        panel.body.appendChild(
          el('circle', {
            cx: sx(centres[k][0]),
            cy: sy(centres[k][1]),
            r: radius,
            fill: withAlpha(clusterColors[k], 0.1),
            stroke: withAlpha(clusterColors[k], 0.55),
            'stroke-width': 1,
            'stroke-dasharray': '4 3',
          }),
        );
      }

      // 가운데를 잇는 두 줄 — A-B 와 B-C. 아직 잰 값이 없으면 긋지 않는다.
      const links: Array<[number, number, string]> =
        state.ratio > 0
          ? [
              [0, 1, '1'],
              [1, 2, fixed2(state.ratio)],
            ]
          : [];
      for (const [a, b, label] of links) {
        panel.body.appendChild(
          el('line', {
            x1: sx(centres[a][0]),
            y1: sy(centres[a][1]),
            x2: sx(centres[b][0]),
            y2: sy(centres[b][1]),
            stroke: colors.text,
            'stroke-width': 1.4,
          }),
        );
        panel.body.appendChild(
          text(label, {
            x: (sx(centres[a][0]) + sx(centres[b][0])) / 2,
            y: (sy(centres[a][1]) + sy(centres[b][1])) / 2 - 5,
            fill: colors.text,
            'font-size': fontSizes.sm,
            'font-weight': '600',
            'text-anchor': 'middle',
            'paint-order': 'stroke',
            stroke: colors.bgSubtle,
            'stroke-width': 3,
          }),
        );
      }

      // 점 예순.
      for (let i = 0; i < state.coords.length; i += 1) {
        const k = state.labels[i] ?? 0;
        panel.body.appendChild(
          el('circle', {
            cx: sx(state.coords[i][0]),
            cy: sy(state.coords[i][1]),
            r: DOT_R,
            fill: clusterColors[k] ?? colors.textMuted,
            'fill-opacity': 0.9,
          }),
        );
      }

      // 무리 이름은 가운데에 새긴다 — 표식이라 옮기지 않는다 (C10).
      for (let k = 0; k < groups; k += 1) {
        panel.body.appendChild(
          text(clusterNames[k], {
            x: sx(centres[k][0]),
            y: sy(centres[k][1]) + 4,
            fill: colors.text,
            'font-size': fontSizes.sm,
            'font-weight': '700',
            'text-anchor': 'middle',
            'paint-order': 'stroke',
            stroke: colors.bgSubtle,
            'stroke-width': 3.5,
          }),
        );
      }
    }

    // ── 장부. 줄 넷의 자리를 미리 잡아 두므로 답이 쌓여도 세로가 안 자란다.
    ledgerLayer.appendChild(
      text(tr('ledger.title', 'what each setting gave'), {
        x: LEFT_X + 2,
        y: LEDGER_Y - 8,
        fill: colors.textMuted,
        'font-size': fontSizes.xs,
      }),
    );
    const COL_NAME = LEFT_X + 12;
    const COL_SEP = LEFT_X + 250;
    const COL_RATIO = LEFT_X + 400;
    const PILL_W = 140;
    const COL_VERDICT = W - LEFT_X - PILL_W;
    ledgerLayer.appendChild(
      text(tr('col.separation', 'separation'), {
        x: COL_SEP,
        y: LEDGER_Y - 8,
        fill: colors.textMuted,
        'font-size': fontSizes.xs,
      }),
    );
    ledgerLayer.appendChild(
      text(tr('col.ratio', 'gap ratio'), {
        x: COL_RATIO,
        y: LEDGER_Y - 8,
        fill: colors.textMuted,
        'font-size': fontSizes.xs,
      }),
    );

    type RowNodes = {
      group: SVGGElement;
      band: SVGRectElement;
      name: SVGTextElement;
      separation: SVGTextElement;
      ratio: SVGTextElement;
      pill: SVGRectElement;
      verdict: SVGTextElement;
    };

    const rowNodes: RowNodes[] = [];
    for (let r = 0; r < LEDGER_ROWS; r += 1) {
      const top = LEDGER_Y + r * LEDGER_ROW_H;
      const g = el('g', { 'data-ledger-slot': r });
      ledgerLayer.appendChild(g);
      const band = el('rect', {
        x: LEFT_X,
        y: top,
        width: W - LEFT_X * 2,
        height: LEDGER_ROW_H - 3,
        rx: 5,
        fill: 'none',
      });
      g.appendChild(band);
      const baseline = top + LEDGER_ROW_H - 9;
      const name = text('', {
        x: COL_NAME,
        y: baseline,
        fill: colors.text,
        'font-size': fontSizes.sm,
      });
      const separation = text('', {
        x: COL_SEP,
        y: baseline,
        fill: colors.text,
        'font-size': fontSizes.sm,
      });
      const ratio = text('', {
        x: COL_RATIO,
        y: baseline,
        fill: colors.text,
        'font-size': fontSizes.sm,
      });
      const pill = el('rect', {
        x: COL_VERDICT,
        y: top + 3,
        width: PILL_W,
        height: LEDGER_ROW_H - 9,
        rx: 5,
        fill: 'none',
      });
      const verdict = text('', {
        x: COL_VERDICT + PILL_W / 2,
        y: baseline - 1,
        fill: colors.text,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
      });
      g.appendChild(name);
      g.appendChild(separation);
      g.appendChild(ratio);
      g.appendChild(pill);
      g.appendChild(verdict);
      rowNodes.push({ group: g, band, name, separation, ratio, pill, verdict });
    }

    const rows = new Map<string, LedgerRow>();
    let currentKey: string | null = null;

    /**
     * 장부에 설 자리. 원래 자리가 먼저, 그 뒤 퍼플렉시티가 작은 것부터.
     *
     * 아직 돌지 않은 퍼플렉시티도 자리를 차지한다 — 자리를 비워 두어야 세로가
     * 자라지 않고, 손잡이에 무엇이 더 있는지도 그 빈 줄이 말해 준다.
     */
    const slots: Array<{ key: string; name: string }> = [
      { key: 'source', name: tr('ledger.source', 'real positions') },
      ...perplexities.map((p) => ({
        key: `p${p}`,
        name: tr('ledger.perplexity', 'perplexity {value}', { value: p }),
      })),
    ];

    function verdictInk(verdict: LedgerRow['verdict']): { fill: string; ink: string } {
      if (verdict === 'clean') return { fill: colors.accent, ink: colors.stateInk };
      if (verdict === 'broken') return { fill: colors.danger, ink: colors.stateInk };
      return { fill: colors.bgSubtle, ink: colors.textMuted };
    }

    function verdictWord(verdict: LedgerRow['verdict']): string {
      if (verdict === 'clean') return tr('verdict.clean', 'split cleanly');
      if (verdict === 'broken') return tr('verdict.broken', 'groups broke apart');
      return tr('verdict.blurred', 'edges blurred');
    }

    function paintLedger(): void {
      for (let r = 0; r < LEDGER_ROWS; r += 1) {
        const node = rowNodes[r];
        const slot = slots[r];
        if (!slot) {
          node.group.removeAttribute('data-ledger-key');
          node.band.setAttribute('fill', 'none');
          node.name.textContent = '';
          node.separation.textContent = '';
          node.ratio.textContent = '';
          node.pill.setAttribute('fill', 'none');
          node.verdict.textContent = '';
          continue;
        }
        node.group.setAttribute('data-ledger-key', slot.key);
        const row = rows.get(slot.key) ?? null;
        const active = slot.key === currentKey;
        node.band.setAttribute('fill', active ? withAlpha(colors.accent, 0.16) : 'none');
        node.name.textContent = slot.name;
        node.name.setAttribute('font-weight', active ? '700' : '400');
        node.name.setAttribute('fill', row ? colors.text : colors.textMuted);
        // 아직 돌지 않은 줄은 값 자리에 줄표만 둔다 — 표식이라 번역하지 않는다.
        node.separation.textContent = row ? fixed2(row.separation) : '—';
        node.ratio.textContent = row ? fixed2(row.ratio) : '—';
        node.separation.setAttribute('fill', row ? colors.text : colors.textMuted);
        node.ratio.setAttribute('fill', row ? colors.text : colors.textMuted);
        if (!row || row.kind === 'source') {
          node.pill.setAttribute('fill', 'none');
          node.verdict.textContent = '';
        } else {
          const paint = verdictInk(row.verdict);
          node.pill.setAttribute('fill', paint.fill);
          node.verdict.setAttribute('fill', paint.ink);
          node.verdict.textContent = verdictWord(row.verdict);
        }
      }
    }

    const caption = text('', {
      x: LEFT_X + 2,
      y: CAPTION_Y,
      fill: colors.text,
      'font-size': fontSizes.md,
    });
    captionLayer.appendChild(caption);
    // 두 판의 자는 단위가 다르다. 줄 위에 적힌 수가 무엇인지 판 위에서 밝혀 둔다.
    panelLayer.appendChild(
      text(tr('label.ratioBase', 'gaps as multiples of A-B'), {
        x: W - LEFT_X,
        y: PANEL_Y - 10,
        fill: colors.textMuted,
        'font-size': fontSizes.xs,
        'text-anchor': 'end',
      }),
    );

    // 마운트 순간 왼쪽 판은 이미 할 말이 있다 — 원래 자리는 선언에 있으므로
    // 알고리즘을 기다릴 까닭이 없다. 퍼진 폭은 아직 잰 값이 없으니 0 으로 둔다.
    paintPanel(leftPanel, {
      coords: sourcePoints,
      labels: sourceLabels,
      spreads: [0, 0, 0],
      ratio: 0,
    });
    paintLedger();

    return {
      /** 원래 자리를 잰 값이 왔다. 왼쪽 판을 그 값으로 다시 그린다. */
      setSource(state: PanelState, separation: number) {
        paintPanel(leftPanel, state);
        leftPanel.readout.textContent = tr('readout.separation', 'separation {value}', {
          value: fixed2(separation),
        });
      },
      /** 편 그림을 갈아 끼운다. */
      setEmbedding(state: PanelState, separation: number) {
        paintPanel(rightPanel, state);
        rightPanel.readout.textContent = tr('readout.separation', 'separation {value}', {
          value: fixed2(separation),
        });
      },
      /** 오른쪽 판만 비운다 — 새 퍼플렉시티로 다시 펴기 시작할 때. */
      clearEmbedding() {
        paintPanel(rightPanel, null);
      },
      /** 장부에 한 줄 얹는다. 같은 열쇠면 갈아 끼운다. */
      addLedgerRow(row: LedgerRow) {
        rows.set(row.key, row);
        paintLedger();
      },
      /** 지금 손잡이가 가리키는 줄. */
      setCurrentRow(key: string | null) {
        currentKey = key;
        paintLedger();
      },
      setCaption(line: string) {
        caption.textContent = line;
      },
      reset() {
        rows.clear();
        currentKey = null;
        paintLedger();
        paintPanel(rightPanel, null);
        rightPanel.readout.textContent = '';
        paintPanel(leftPanel, {
          coords: sourcePoints,
          labels: sourceLabels,
          spreads: [0, 0, 0],
          ratio: 0,
        });
        leftPanel.readout.textContent = '';
        caption.textContent = '';
      },
      destroy() {
        svg.textContent = '';
        if (container.contains(svg)) svg.remove();
      },
    };
  },
};
