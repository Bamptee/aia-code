import React from 'react';
import { streamPost } from '/main.js';

// Multi-agent "squad" build panel (dev context).
// Launches: spec-tech -> dev-plan -> parallel build (sub-agents) -> review,
// streaming progress from POST /api/features/:slug/squad (SSE).

const h = React.createElement;

const TIER_COLORS = {
  high: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  medium: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  low: 'bg-slate-600/40 text-slate-300 border-slate-500/40',
};

const TASK_STATUS_STYLE = {
  running: 'border-amber-500/40 bg-amber-500/5',
  done: 'border-emerald-500/40 bg-emerald-500/5',
  error: 'border-red-500/40 bg-red-500/5',
};

const STEP_LABELS = { 'spec-tech': 'Spec tech', 'dev-plan': 'Dev plan', review: 'Review' };

function StepPill({ label, state }) {
  const cls = state === 'done'
    ? 'step-done'
    : state === 'running'
      ? 'step-in-progress'
      : 'step-pending';
  return h('span', { className: `px-2 py-0.5 rounded text-xs border ${cls}` },
    (state === 'running' ? '⏳ ' : state === 'done' ? '✓ ' : '') + label,
  );
}

function TaskCard({ task }) {
  const icon = task.status === 'done' ? '✅' : task.status === 'error' ? '❌' : '⏳';
  const tierCls = TIER_COLORS[task.tier] || TIER_COLORS.medium;
  return h('div', { className: `border rounded-lg p-3 ${TASK_STATUS_STYLE[task.status] || 'border-slate-700'}` },
    h('div', { className: 'flex items-center justify-between gap-2' },
      h('div', { className: 'text-sm font-medium text-slate-200 truncate' }, `${icon} #${task.number} ${task.title}`),
      h('span', { className: `px-1.5 py-0.5 rounded text-[10px] border ${tierCls} shrink-0` }, task.tier || 'medium'),
    ),
    h('div', { className: 'mt-1 text-xs text-slate-400 font-mono truncate' }, task.model || ''),
    task.error && h('div', { className: 'mt-1 text-xs text-red-400' }, task.error),
  );
}

export function SquadPanel({ slug }) {
  const [open, setOpen] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [parallel, setParallel] = React.useState(3);
  const [review, setReview] = React.useState(true);
  const [description, setDescription] = React.useState('');
  const [steps, setSteps] = React.useState({});      // step -> 'running'|'done'
  const [tasks, setTasks] = React.useState({});      // id -> {number,title,tier,model,status,error}
  const [logTail, setLogTail] = React.useState('');
  const [verdict, setVerdict] = React.useState(null);
  const [error, setError] = React.useState(null);
  const logRef = React.useRef(null);

  React.useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logTail]);

  const launch = async () => {
    setRunning(true);
    setError(null);
    setVerdict(null);
    setSteps({});
    setTasks({});
    setLogTail('');

    const onStatus = (data) => {
      if (!data || !data.kind) return;
      if (data.kind === 'step') {
        setSteps(prev => ({ ...prev, [data.step]: data.phase === 'done' ? 'done' : 'running' }));
      } else if (data.kind === 'build') {
        setSteps(prev => ({ ...prev, build: data.phase === 'done' ? 'done' : 'running' }));
      } else if (data.kind === 'task') {
        const t = data.task || {};
        setTasks(prev => ({
          ...prev,
          [t.id]: {
            id: t.id,
            number: t.number,
            title: t.title,
            tier: data.tier || t.tier,
            model: data.model,
            status: data.phase === 'done' ? 'done' : data.phase === 'error' ? 'error' : 'running',
            error: data.error || null,
          },
        }));
      } else if (data.kind === 'verdict') {
        setVerdict(data);
      }
    };

    const onLog = (text) => {
      setLogTail(prev => (prev + text).slice(-6000));
    };

    try {
      const result = await streamPost(`/features/${slug}/squad`, {
        description: description.trim() || undefined,
        parallel,
        review,
      }, { onLog, onStatus });

      if (!result.ok) {
        setError(result.error || 'Squad build failed');
      } else if (result.verdict) {
        setVerdict(result);
      }
    } catch (e) {
      setError(e.message);
    }
    setRunning(false);
  };

  const taskList = Object.values(tasks).sort((a, b) => (a.number || 0) - (b.number || 0));
  const doneCount = taskList.filter(t => t.status === 'done').length;

  const verdictColor = verdict
    ? (verdict.verdict === 'SHIP' ? 'text-emerald-400' : verdict.verdict === 'NEEDS REWORK' ? 'text-red-400' : 'text-amber-400')
    : '';

  return h('div', { className: 'border border-aia-border rounded-lg bg-aia-card/50 p-4' },
    // Header
    h('div', { className: 'flex items-center justify-between gap-3' },
      h('div', null,
        h('div', { className: 'text-sm font-semibold text-slate-100' }, '⚡ Squad build (multi-agent)'),
        h('div', { className: 'text-xs text-slate-400 mt-0.5' },
          'spec-tech → dev-plan → parallel build (sub-agents, one model per tier) → review'),
      ),
      h('button', {
        onClick: () => setOpen(o => !o),
        className: 'text-xs text-slate-400 hover:text-slate-200',
      }, open ? 'Hide' : 'Configure'),
    ),

    // What this mode does (shown when expanded)
    open && h('div', { className: 'mt-2 text-xs text-slate-400 leading-relaxed border-l-2 border-aia-accent/40 pl-3' },
      'Squad mode replaces the single-agent implement step with an orchestrated build: AIA first generates the tech spec and the dev plan, then splits the plan into tasks and spawns one AI sub-agent per task. Independent tasks run in parallel (waves respect the declared dependencies), and each sub-agent is routed to a model matching the task’s tier — high for complex logic, medium for standard work, low for boilerplate (configure the tier → model mapping in Config → model_tiers). Every sub-agent is scoped to its task’s files. Results are merged into build.md with a per-task report and a final verdict; a follow-up review step checks the whole implementation.'),

    open && h('div', { className: 'mt-3 space-y-3' },
      // Controls
      h('div', { className: 'flex flex-wrap items-center gap-4' },
        h('label', { className: 'flex items-center gap-2 text-xs text-slate-300' },
          'Parallelism',
          h('input', {
            type: 'number', min: 1, max: 8, value: parallel,
            disabled: running,
            onChange: (e) => setParallel(Math.max(1, Math.min(8, parseInt(e.target.value, 10) || 1))),
            className: 'w-14 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-200',
          }),
        ),
        h('label', { className: 'flex items-center gap-2 text-xs text-slate-300' },
          h('input', {
            type: 'checkbox', checked: review, disabled: running,
            onChange: (e) => setReview(e.target.checked),
          }),
          'Final review',
        ),
        h('button', {
          onClick: launch,
          disabled: running,
          className: `ml-auto px-3 py-1.5 rounded text-sm font-medium ${running ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-aia-accent text-slate-900 hover:bg-sky-300'}`,
        }, running ? '⏳ Building…' : '⚡ Launch squad build'),
      ),
      h('textarea', {
        value: description,
        disabled: running,
        onChange: (e) => setDescription(e.target.value),
        placeholder: 'Description / context (optional — injected into spec-tech)',
        className: 'w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-200 h-16',
      }),

      // Pipeline steps
      (running || Object.keys(steps).length > 0) && h('div', { className: 'flex flex-wrap items-center gap-2' },
        h(StepPill, { label: STEP_LABELS['spec-tech'], state: steps['spec-tech'] }),
        h(StepPill, { label: STEP_LABELS['dev-plan'], state: steps['dev-plan'] }),
        h(StepPill, { label: `Build${taskList.length ? ` (${doneCount}/${taskList.length})` : ''}`, state: steps.build }),
        review && h(StepPill, { label: STEP_LABELS.review, state: steps.review }),
      ),

      // Task grid
      taskList.length > 0 && h('div', { className: 'grid grid-cols-1 sm:grid-cols-2 gap-2' },
        taskList.map(t => h(TaskCard, { key: t.id, task: t })),
      ),

      // Streamed log tail
      (running || logTail) && h('pre', {
        ref: logRef,
        className: 'bg-slate-900 border border-slate-700 rounded p-2 text-[11px] text-slate-400 h-40 overflow-auto whitespace-pre-wrap',
      }, logTail || '…'),

      // Verdict
      verdict && h('div', { className: 'flex items-center gap-2 text-sm' },
        h('span', { className: 'text-slate-400' }, 'Verdict:'),
        h('span', { className: `font-semibold ${verdictColor}` }, verdict.verdict),
        h('span', { className: 'text-slate-500 text-xs' }, `(${verdict.ok}/${verdict.tasks} tasks ok)`),
        h('span', { className: 'text-slate-500 text-xs' }, '— see build.md'),
      ),

      error && h('div', { className: 'text-sm text-red-400' }, `Error: ${error}`),
    ),
  );
}
