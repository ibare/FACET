/**
 * RelationalTablesAndKeys facet JSON 선언.
 *
 * 진행 모델: 정적 + 입력 반응형 (ReactiveMechanism). mount 직후 자동 호버
 * 시연 (FK 셀 1001 → PK 셀 1001 잠시 강조) 후 학습자 입력 대기.
 *
 * 컨트롤바 어휘 (기획 §6 §8 컨트롤 영역):
 *   [ toggle-pk ] [ toggle-rejects ] [ auto-demo ] [ reset ]
 *
 * 셀 호버 인터랙션 자체는 view 가 SVG 마우스 이벤트로 직접 처리한다.
 * 코드 패널은 1차 구현에서 생략 (concept 시각이라 IR/언어 매핑 불필요).
 *
 * 식별자 (C1): `table:<id>` `column:<t>.<c>` `row:<t>.<r>` `cell:<t>.<r>.<c>`
 *              `relation:<id>` 명시 prefix.
 */

import type { FacetJson } from '@ffacet/core/runtime';

export const relationalTablesAndKeysFacet: FacetJson = {
  id: 'facet:relationalTablesAndKeys',
  title: { en: 'Tables & Keys', ko: '테이블과 키' },
  description: {
    en: 'Two named grids — a primary key locks each row of one table while a foreign key in the other points at that locked value, binding two grids into one consistent structure',
    ko: '이름 붙은 두 격자 — 한 격자의 기본키가 모든 행의 정체를 잠그고, 다른 격자의 외래키가 그 잠긴 값을 가리켜 두 격자를 일관된 한 구조로 엮는다',
  },
  algorithm: 'module:relationalTablesAndKeys',
  projector: 'module:relationalTablesAndKeysProjector',
  initialData: {
    type: 'relational-tables-and-keys',
    tables: [
      {
        id: 'member',
        label: '회원 (Member)',
        columns: [
          { id: 'id', label: '학번', kind: 'pk' },
          { id: 'email', label: '이메일', kind: 'alt' },
          { id: 'name', label: '이름', kind: 'plain' },
          { id: 'joinedAt', label: '가입일', kind: 'plain' },
        ],
        rows: [
          { id: 'm0', cells: { id: '1001', email: 'a@x.io', name: '김민수', joinedAt: '2024-01' } },
          { id: 'm1', cells: { id: '1002', email: 'b@x.io', name: '이서연', joinedAt: '2024-02' } },
          { id: 'm2', cells: { id: '1003', email: 'c@x.io', name: '박지훈', joinedAt: '2024-03' } },
          { id: 'm3', cells: { id: '1004', email: 'd@x.io', name: '최예린', joinedAt: '2024-04' } },
        ],
      },
      {
        id: 'order',
        label: '주문 (Order)',
        columns: [
          { id: 'orderId', label: '주문번호', kind: 'pk' },
          { id: 'memberId', label: '학번', kind: 'fk', references: { tableId: 'member', columnId: 'id' } },
          { id: 'amount', label: '금액', kind: 'plain' },
          { id: 'orderedAt', label: '일자', kind: 'plain' },
        ],
        rows: [
          { id: 'o0', cells: { orderId: '9001', memberId: '1001', amount: '300', orderedAt: '04-15' } },
          { id: 'o1', cells: { orderId: '9002', memberId: '1001', amount: '120', orderedAt: '04-18' } },
          { id: 'o2', cells: { orderId: '9003', memberId: '1003', amount: '90', orderedAt: '04-22' } },
          { id: 'o3', cells: { orderId: '9004', memberId: '1002', amount: '450', orderedAt: '04-25' } },
        ],
      },
    ],
    relations: [
      {
        id: 'order_member',
        from: { tableId: 'member', columnId: 'id' },
        to: { tableId: 'order', columnId: 'memberId' },
      },
    ],
    candidateKeys: {
      member: ['id', 'email'],
      order: ['orderId'],
    },
    pkChoice: {
      member: 'id',
      order: 'orderId',
    },
    rejects: [
      {
        tableId: 'member',
        kind: 'duplicate-pk',
        cells: { id: '1003', email: 'e@x.io', name: '거부됨', joinedAt: '2024-05' },
        failingColumn: 'id',
        message: '이 값은 이미 있다 — 새 행은 들어올 수 없다.',
      },
      {
        tableId: 'order',
        kind: 'missing-fk',
        cells: { orderId: '9005', memberId: '1099', amount: '거부', orderedAt: '04-30' },
        failingColumn: 'memberId',
        message: '가리킬 회원이 없다 — 이 외래키 값은 거부된다.',
      },
    ],
    rejectsVisibleByDefault: true,
    autoDemoIntervalMs: 900,
    autoDemoSequence: [
      {
        tableId: 'order',
        rowIndex: 0,
        columnId: 'memberId',
        value: '1001',
        kind: 'fk',
        durationMs: 1400,
      },
      {
        tableId: 'member',
        rowIndex: 2,
        columnId: 'id',
        value: '1003',
        kind: 'pk',
        durationMs: 1400,
      },
    ],
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      { ref: 'stage', padding: '8px 0' },
      { ref: 'controls' },
    ],
  },
  messages: {
    'caption.altKeySwap': { en: '{alt} was a candidate key too — this time {pk} is the primary key.', ko: '{alt} 도 후보키였다 — 이번엔 {pk} 을 기본키로 둔다.' },
    'caption.base': { en: 'A table is a named grid gathering rows of the same shape; a primary key identifies one row uniquely, and a foreign key points at a primary key value in another grid, binding the two into one structure.', ko: '테이블은 같은 형태의 행을 모은 이름 붙은 격자이고, 기본키가 한 행을 유일하게 식별하며 외래키가 다른 격자의 기본키 값을 가리켜 두 격자를 한 구조로 엮는다.' },
    'caption.fkDangling': { en: 'There is no row for foreign key {value} to point at.', ko: '외래키 값 {value} 을 가리킬 행이 없다.' },
    'caption.fkPointsTo': { en: 'Foreign key {value} points at {column} {value} in {table}.', ko: '외래키 값 {value} 은 {table}의 {column} {value} 을 가리킨다.' },
    'caption.invalidInput': { en: 'Invalid input: {op} ({raw})', ko: '잘못된 입력: {op} ({raw})' },
    'caption.notReferenced': { en: 'No foreign key in another table points at this row yet.', ko: '이 행을 가리키는 다른 테이블의 외래키가 아직 없다.' },
    'caption.pkSwitched': { en: '{to} was a candidate key too — this time {to} takes over from {from} as the primary key.', ko: '{to} 도 후보키였다 — 이번엔 {from} 대신 {to} 을 기본키로 둔다.' },
    'caption.referencedBy': { en: '{count} rows in {fkTable} point at this {table}.', ko: '이 {table}을 가리키는 {fkTable}이 {count} 건이다.' },
    'label.pkChip': { en: 'primary key: {column} ▼', ko: '기본키: {column} ▼' },
    'label.pkChipDefault': { en: 'primary key: student no ▼', ko: '기본키: 학번 ▼' },
    'label.references': { en: 'See also: Wikipedia · Crow\'s Foot · dbdiagram.io', ko: '참고: Wikipedia · Crow\'s Foot · dbdiagram.io · 위키백과(외래 키)' },
    'legend.alt': { en: '🔑 alt alternate key', ko: '🔑 alt 대체키' },
    'legend.altShort': { en: 'alt alternate key', ko: 'alt 대체키' },
    'legend.fk': { en: '⚷ FK foreign key', ko: '⚷ FK 외래키' },
    'legend.fkShort': { en: 'FK foreign key', ko: 'FK 외래키' },
    'legend.many': { en: '─< many', ko: '─< 여럿' },
    'legend.manyShort': { en: 'many', ko: '여럿' },
    'legend.one': { en: '─┤ exactly one', ko: '─┤ 정확히 하나' },
    'legend.oneShort': { en: 'exactly one', ko: '정확히 하나' },
    'legend.pk': { en: '🔑 PK primary key', ko: '🔑 PK 기본키' },
    'legend.pkShort': { en: 'PK primary key', ko: 'PK 기본키' },
  },
  blocks: {
    header: { type: 'title-block' },
    stage: {
      type: 'tables-stage',
    },
    controls: {
      type: 'control-bar',
      controls: [
        { widget: 'button', action: 'toggle-pk', label: { en: 'Toggle PK', ko: '기본키 토글' } },
        {
          widget: 'button',
          action: 'toggle-rejects',
          label: { en: 'Rejects', ko: '거부 인서트' },
        },
        { widget: 'button', action: 'auto-demo', label: { en: 'Auto demo', ko: '자동 시연' } },
        { widget: 'button', action: 'reset', label: { en: 'Reset', ko: '초기화' } },
      ],
    },
  },
};
