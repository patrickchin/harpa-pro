export type ReportGenerationOperation = 'generate' | 'regenerate';

export interface ReportGenerationAttempt {
  key: string;
  operation: ReportGenerationOperation;
}

export interface ReportGenerationIdempotency {
  attempt(operation: ReportGenerationOperation): ReportGenerationAttempt;
  key(): string;
  succeeded(key: string): void;
  failed(key: string, status: number): void;
}

function mintUuid(): string {
  const { uuid } = require('../../lib/util/uuid') as typeof import('../../lib/util/uuid');
  return uuid();
}

export function createReportGenerationIdempotency(
  mint: () => string = mintUuid,
): ReportGenerationIdempotency {
  let currentAttempt: ReportGenerationAttempt | null = null;

  const attempt = (
    operation: ReportGenerationOperation,
  ): ReportGenerationAttempt => {
    currentAttempt ??= {
      key: `report-generation:${mint()}`,
      operation,
    };
    return currentAttempt;
  };

  const clearMatching = (key: string): void => {
    if (currentAttempt?.key === key) {
      currentAttempt = null;
    }
  };

  return {
    attempt,
    key() {
      return attempt('generate').key;
    },
    succeeded(key) {
      clearMatching(key);
    },
    failed(key, status) {
      if (status >= 400 && status < 500) {
        clearMatching(key);
      }
    },
  };
}
