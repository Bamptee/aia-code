import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseDevPlan } from '../src/services/dev-plan-parser.js';

const PLAN = `### Plan Header
- **Route:** standard

### Task 1: Add archivedAt to Order
- **Files:** \`api/src/models/order.ts\`, \`api/src/models/order.test.ts\`
- **Action:** modify
- **Details:** Add \`archivedAt?: Date\` (AD-1). Imitate \`api/src/models/customer.ts\`.
- **Covers:** FR-001, AC-001.1
- **Dependencies:** none
- **Tests:** unit test for the default value
- **Done when:** \`yarn typecheck\` passes
- **Model tier:** medium
- **Parallelizable:** no

### Task 2: Archive endpoint
- **Files:** \`api/src/routes/archive.ts\`
- **Action:** create
- **Details:** POST /orders/:id/archive, read-only access to the model.
- **Dependencies:** Task 1
- **Tests:** integration tests (matrix #1-3)
- **Model tier:** high
- **Parallelizable:** no

### Task 3: Wire UI
- **Files:** \`web/src/orders/list.tsx\`
- **Details:** Add the action.
- **Dependencies:** None (merge together with Tasks 1–2)

### Task 4: Docs
- **Files:** \`README.md\`
- **Dependencies:** Tasks 1–3
`;

describe('parseDevPlan', () => {
  const tasks = parseDevPlan(PLAN);

  it('parses only "Task N" headings as tasks', () => {
    assert.deepEqual(tasks.map(t => t.number), [1, 2, 3, 4]);
  });

  it('limits file scope to the Files line when present', () => {
    assert.deepEqual(tasks[0].files, ['api/src/models/order.ts', 'api/src/models/order.test.ts']);
  });

  it('extracts bold fields without swallowing the next ones', () => {
    assert.equal(tasks[0].details, 'Add `archivedAt?: Date` (AD-1). Imitate `api/src/models/customer.ts`.');
    assert.equal(tasks[0].tests, 'unit test for the default value');
    assert.equal(tasks[0].covers, 'FR-001, AC-001.1');
    assert.equal(tasks[0].doneWhen, '`yarn typecheck` passes');
    assert.equal(tasks[0].tier, 'medium');
    assert.equal(tasks[0].parallelizable, false);
  });

  it('prefers Details over Action', () => {
    assert.match(tasks[1].details, /^POST \/orders/);
  });

  it('does not treat a hyphen inside the value as "none"', () => {
    assert.deepEqual(tasks[1].dependencies, ['task-1']);
  });

  it('treats a leading "None" as no dependency, whatever follows', () => {
    assert.deepEqual(tasks[2].dependencies, []);
  });

  it('expands task ranges', () => {
    assert.deepEqual(tasks[3].dependencies, ['task-1', 'task-2', 'task-3']);
  });
});
