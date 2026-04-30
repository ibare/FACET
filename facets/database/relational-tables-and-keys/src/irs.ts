/**
 * RelationalTablesAndKeys 학습용 IR — 1차 구현은 코드 패널 미포함.
 *
 * concept type / 정적 진행 모델 facet 이라 "언어별 코드 매핑" 의 학습 가치가
 * 작아 IR 을 정의하지 않는다. 표준 6파일 일관성을 위해 빈 배열로 자리만
 * 보존한다. 향후 SQL DDL (CREATE TABLE … PRIMARY KEY / FOREIGN KEY)
 * 패널을 도입하면 tables-and-keys-ddl IR 을 정의하고 algorithm.ts 의 phase
 * 어휘 (auto-demo / idle) 와 동기화한다.
 */

import type { IR } from '@facet/core';

export const relationalTablesAndKeysIRs: IR[] = [];
