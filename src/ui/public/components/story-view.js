import React from 'react';
import { api, streamPost } from '/main.js';
import { EpicSelector } from '/components/epic-selector.js';
import { StoryWorktrunkPanel } from '/components/worktrunk-panel.js';
import { PushModal } from '/components/integrations-browser.js';

// ============== Prompt Preview Modal ==============

function PromptPreviewModal({ isOpen, onClose, slug, step }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const lastKey = React.useRef('');

  React.useEffect(() => {
    if (!isOpen || !slug || !step) return;
    const key = `${slug}:${step}`;
    if (key === lastKey.current && data) return;
    lastKey.current = key;
    setLoading(true); setError(null); setData(null);
    api.get(`/stories/${slug}/steps/${step}/preview-prompt`)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [isOpen, slug, step]);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  if (!isOpen) return null;

  return React.createElement('div', {
    className: 'fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4',
    onClick: onClose,
  },
    React.createElement('div', {
      className: 'bg-slate-900 border border-slate-700 rounded-lg w-full max-w-4xl max-h-[85vh] flex flex-col',
      role: 'dialog',
      'aria-label': `Prompt preview for ${step}`,
      onClick: e => e.stopPropagation(),
    },
      // Header
      React.createElement('div', { className: 'flex items-center justify-between px-4 py-3 border-b border-slate-700' },
        React.createElement('div', { className: 'flex items-center gap-3' },
          React.createElement('h3', { className: 'text-sm font-semibold text-slate-200' }, `Assembled Prompt — ${step}`),
          data && React.createElement('span', { className: 'text-xs text-slate-500' }, `${data.charCount.toLocaleString()} chars`),
        ),
        React.createElement('button', { onClick: onClose, 'aria-label': 'Close', className: 'text-slate-400 hover:text-slate-200 text-lg' }, '\u2715'),
      ),
      // Files used
      data?.filesUsed && React.createElement('div', { className: 'px-4 py-2 border-b border-slate-700 flex flex-wrap gap-2 text-xs text-slate-500' },
        React.createElement('span', null, `Template: ${data.filesUsed.promptTemplate}`),
        data.filesUsed.contextFiles?.length > 0 && React.createElement('span', null, `| Context: ${data.filesUsed.contextFiles.length} files`),
        data.filesUsed.knowledgeCategories?.length > 0 && React.createElement('span', null, `| Knowledge: ${data.filesUsed.knowledgeCategories.join(', ')}`),
        data.filesUsed.initFile && React.createElement('span', null, '| Init: loaded'),
      ),
      // Content
      React.createElement('div', { className: 'flex-1 overflow-auto p-4' },
        loading && React.createElement('p', { className: 'text-slate-500 text-sm' }, 'Building prompt...'),
        error && React.createElement('p', { className: 'text-red-400 text-sm' }, error),
        data && React.createElement('pre', {
          className: 'text-xs text-slate-300 font-mono whitespace-pre-wrap break-words',
        }, data.prompt),
      ),
    )
  );
}

// ============== Constants v3 ==============

// V3: 7 steps with Product/Dev phases
const ALL_STEPS = ['init', 'brainstorming', 'specFunc', 'specTech', 'devPlan', 'implement', 'review'];
// Product steps: init has dedicated InitPanel, so only show brainstorming and specFunc as steps
const PRODUCT_STEPS = ['brainstorming', 'specFunc'];
const DEV_STEPS = ['specTech', 'devPlan', 'implement', 'review'];

// Steps that can be skipped (all except init)
const SKIPPABLE_STEPS = ['brainstorming', 'specFunc', 'specTech', 'devPlan', 'review'];

// Steps that produce code changes
const CODE_STEPS = ['implement', 'review'];

// Map kebab-case from API to camelCase
const STEP_KEY_MAP = {
  'init': 'init',
  'brainstorming': 'brainstorming',
  'spec-func': 'specFunc',
  'specFunc': 'specFunc',
  'spec-tech': 'specTech',
  'specTech': 'specTech',
  'dev-plan': 'devPlan',
  'devPlan': 'devPlan',
  'implement': 'implement',
  'review': 'review',
  // Legacy v1 mappings for backward compatibility
  'brief': 'init',
  'ba-spec': 'specFunc',
  'baSpec': 'specFunc',
  'questions': 'brainstorming',
  'tech-spec': 'specTech',
  'techSpec': 'specTech',
  'challenge': 'review',
};

// Map camelCase to kebab-case for API calls
const STEP_API_MAP = {
  'init': 'init',
  'brainstorming': 'brainstorming',
  'specFunc': 'spec-func',
  'specTech': 'spec-tech',
  'devPlan': 'dev-plan',
  'implement': 'implement',
  'review': 'review',
};

// V3 Step configuration with phases
const STEP_CONFIG = {
  init: { name: 'Init', icon: '📋', color: 'emerald', phase: 'product', description: 'Story context and requirements', type: 'generate' },
  brainstorming: { name: 'Brainstorming', icon: '💡', color: 'amber', phase: 'product', description: 'Discovery and ideation', type: 'chat-only' },
  specFunc: { name: 'Spec Func', icon: '📊', color: 'blue', phase: 'product', description: 'Functional specification', type: 'generate' },
  specTech: { name: 'Spec Tech', icon: '🛠️', color: 'violet', phase: 'dev', description: 'Technical specification', type: 'generate' },
  devPlan: { name: 'Dev Plan', icon: '📝', color: 'cyan', phase: 'dev', description: 'Implementation tasks', type: 'generate' },
  implement: { name: 'Implement', icon: '💻', color: 'green', phase: 'dev', description: 'Code implementation', type: 'generate' },
  review: { name: 'Review', icon: '✅', color: 'purple', phase: 'dev', description: 'Code review', type: 'chat-only' },
  // Legacy aliases for backward compatibility
  brief: { name: 'Brief', icon: '📋', color: 'emerald', phase: 'product', description: 'High-level summary', type: 'generate', legacy: true },
  baSpec: { name: 'BA Spec', icon: '📊', color: 'blue', phase: 'product', description: 'Business analysis', type: 'generate', legacy: true },
  questions: { name: 'Questions', icon: '❓', color: 'amber', phase: 'product', description: 'Open questions', type: 'chat-only', legacy: true },
  techSpec: { name: 'Tech Spec', icon: '🛠️', color: 'violet', phase: 'dev', description: 'Technical architecture', type: 'generate', legacy: true },
  challenge: { name: 'Challenge', icon: '⚠️', color: 'red', phase: 'dev', description: 'Risks and blockers', type: 'generate', legacy: true },
};

// Actions per step type
const STEP_ACTIONS = {
  'chat-only': ['chat'],
  'generate': ['generate', 'chat'],
};

// Phase filters for dashboard
const PHASE_FILTERS = {
  'all': () => true,
  'product': (step) => STEP_CONFIG[step]?.phase === 'product',
  'dev': (step) => STEP_CONFIG[step]?.phase === 'dev',
};

// Format token count for display (1234 → "1.2k", 12345 → "12.3k")
function formatTokenCount(count) {
  if (!count || count === 0) return null;
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  return `${Math.round(count / 1000)}k`;
}

// Get skip warning based on skipped steps
function getSkipWarning(fromStep, toStep) {
  const fromIndex = ALL_STEPS.indexOf(fromStep);
  const toIndex = ALL_STEPS.indexOf(toStep);

  if (fromIndex === -1 || toIndex === -1 || toIndex <= fromIndex) {
    return null;
  }

  const skipped = ALL_STEPS.slice(fromIndex + 1, toIndex);

  if (skipped.includes('specFunc') && skipped.includes('specTech')) {
    return {
      level: 'high',
      message: 'Contexte tres limite - Pas de spec fonctionnelle ni technique',
      autoAnalysis: true,
    };
  }
  if (skipped.includes('specTech')) {
    return {
      level: 'medium',
      message: 'Pas de spec technique - Analyse automatique du codebase',
      autoAnalysis: true,
    };
  }
  if (skipped.includes('specFunc')) {
    return {
      level: 'low',
      message: 'Pas de spec fonctionnelle - Contexte limite',
      autoAnalysis: false,
    };
  }
  return null;
}

const CONTEXT_CONFIG = {
  product: { label: 'Product', icon: '🔍', gradient: 'from-purple-500/10 to-fuchsia-500/10', border: 'border-purple-500/30', text: 'text-purple-400' },
  dev: { label: 'Dev', icon: '🚀', gradient: 'from-violet-500/10 to-indigo-500/10', border: 'border-violet-500/30', text: 'text-violet-400' },
  qa: { label: 'QA', icon: '✅', gradient: 'from-sky-500/10 to-cyan-500/10', border: 'border-sky-500/30', text: 'text-sky-400' },
};

const PHASE_CONFIG = {
  // V3 phases
  product: { label: 'Product', color: 'purple', icon: '🔍' },
  dev: { label: 'Dev', color: 'violet', icon: '🚀' },
  // Legacy phases
  discovery: { label: 'Discovery', color: 'purple', icon: '🔍' },
  development: { label: 'Development', color: 'violet', icon: '🚀' },
  qa: { label: 'QA', color: 'sky', icon: '✅' },
  done: { label: 'Done', color: 'emerald', icon: '✓' },
};

// ============== Access Control ==============

function getAccessLevel(phase, context) {
  const matrix = {
    discovery:   { product: 'edit',     dev: 'hidden',   qa: 'hidden' },
    development: { product: 'readonly', dev: 'edit',     qa: 'hidden' },
    qa:          { product: 'readonly', dev: 'readonly', qa: 'edit' },
    done:        { product: 'readonly', dev: 'readonly', qa: 'readonly' },
  };
  return matrix[phase]?.[context] || 'hidden';
}

function getVisibleSteps(context) {
  if (context === 'product') return PRODUCT_STEPS;
  if (context === 'dev') return DEV_STEPS;
  return ALL_STEPS; // QA sees all
}

// ============== Helper Components ==============

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function LoadingSpinner({ text = 'Loading...' }) {
  return React.createElement('div', { className: 'flex items-center justify-center py-12' },
    React.createElement('div', { className: 'flex items-center gap-3' },
      React.createElement('div', { className: 'w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin' }),
      React.createElement('span', { className: 'text-slate-400' }, text)
    )
  );
}

function AccessDenied({ phase, context }) {
  const phaseConfig = PHASE_CONFIG[phase] || PHASE_CONFIG.discovery;
  const contextConfig = CONTEXT_CONFIG[context];

  const expectedContext = phase === 'discovery' ? 'product' : phase === 'development' ? 'dev' : 'qa';
  const expectedConfig = CONTEXT_CONFIG[expectedContext];

  return React.createElement('div', { className: 'max-w-lg mx-auto text-center py-12' },
    React.createElement('div', { className: 'text-6xl mb-4' }, '🔒'),
    React.createElement('h2', { className: 'text-xl font-semibold text-slate-200 mb-2' }, 'Not Available in This View'),
    React.createElement('p', { className: 'text-slate-400 mb-6' },
      `This story is in ${phaseConfig.label} phase and is not visible in the ${contextConfig.label} view.`
    ),
    React.createElement('a', {
      href: `#/${expectedContext}/${window.location.hash.split('/').pop()}`,
      className: `inline-flex items-center gap-2 px-4 py-2 bg-${PHASE_CONFIG[phase].color}-500/20 text-${PHASE_CONFIG[phase].color}-400 border border-${PHASE_CONFIG[phase].color}-500/30 rounded-lg hover:bg-${PHASE_CONFIG[phase].color}-500/30 transition-colors`,
    },
      React.createElement('span', null, expectedConfig.icon),
      React.createElement('span', null, `Open in ${expectedConfig.label} View`)
    )
  );
}

// ============== V3 UI Components ==============

function SkipWarning({ skippedSteps, warning }) {
  if (!warning) return null;

  const levelColors = {
    high: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', icon: '🚨' },
    medium: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', icon: '⚠️' },
    low: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', icon: 'ℹ️' },
  };
  const colors = levelColors[warning.level] || levelColors.medium;

  return React.createElement('div', {
    className: `${colors.bg} ${colors.border} border rounded-lg p-3 flex items-start gap-3`,
  },
    React.createElement('span', { className: 'text-xl' }, colors.icon),
    React.createElement('div', { className: 'flex-1' },
      React.createElement('p', { className: `${colors.text} text-sm font-medium` }, warning.message),
      warning.autoAnalysis && React.createElement('p', { className: 'text-slate-400 text-xs mt-1' },
        'L\'agent effectuera une auto-analyse du codebase pour compenser le contexte manquant.'
      ),
      skippedSteps?.length > 0 && React.createElement('p', { className: 'text-slate-500 text-xs mt-1' },
        `Steps ignores: ${skippedSteps.join(', ')}`
      )
    )
  );
}

function FilesUsedPanel({ filesUsed, fileOperations, expanded = false }) {
  const [isExpanded, setIsExpanded] = React.useState(expanded);

  if (!filesUsed && (!fileOperations || fileOperations.length === 0)) return null;

  const hasContextContent = filesUsed && (
    filesUsed.promptTemplate ||
    filesUsed.priorSteps?.length > 0 ||
    filesUsed.contextFiles?.length > 0 ||
    filesUsed.knowledgeCategories?.length > 0 ||
    filesUsed.testLevel
  );

  // Deduplicate file operations: Read + Edit on same file = Modified only
  const deduplicatedOps = React.useMemo(() => {
    if (!fileOperations || fileOperations.length === 0) return { modified: [], created: [], read: [] };
    const fileMap = new Map();
    const priority = { read: 0, created: 1, modified: 2 };
    for (const op of fileOperations) {
      const existing = fileMap.get(op.path);
      // Highest priority wins: modified > created > read
      if (!existing || (priority[op.action] || 0) > (priority[existing] || 0)) {
        fileMap.set(op.path, op.action);
      }
    }
    const modified = [], created = [], read = [];
    for (const [filePath, action] of fileMap) {
      if (action === 'modified') modified.push(filePath);
      else if (action === 'created') created.push(filePath);
      else read.push(filePath);
    }
    return { modified, created, read };
  }, [fileOperations]);

  const hasFileOps = deduplicatedOps.modified.length > 0 || deduplicatedOps.created.length > 0 || deduplicatedOps.read.length > 0;

  if (!hasContextContent && !hasFileOps) return null;

  const totalFiles = (filesUsed?.priorSteps?.length || 0) + (filesUsed?.contextFiles?.length || 0);
  const totalOps = deduplicatedOps.modified.length + deduplicatedOps.created.length + deduplicatedOps.read.length;

  return React.createElement('div', {
    className: 'bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden text-xs',
  },
    React.createElement('button', {
      onClick: () => setIsExpanded(!isExpanded),
      className: 'w-full flex items-center justify-between px-3 py-2 text-slate-400 hover:text-slate-200 transition-colors',
    },
      React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement('span', null, '📂'),
        React.createElement('span', null, 'Context Used'),
        React.createElement('span', { className: 'text-slate-600' },
          totalOps > 0 ? `(${totalFiles} context, ${totalOps} touched)` : `(${totalFiles} files)`
        )
      ),
      React.createElement('span', { className: `transition-transform ${isExpanded ? 'rotate-180' : ''}` }, '▼')
    ),
    isExpanded && React.createElement('div', { className: 'px-3 pb-3 space-y-2 border-t border-slate-700 pt-2' },
      // Section 1: Injected Context
      hasContextContent && React.createElement('div', { className: 'space-y-1' },
        React.createElement('div', { className: 'text-slate-500 font-medium mb-1' }, 'Contexte injecté'),
        // Prompt template
        filesUsed.promptTemplate && React.createElement('div', null,
          React.createElement('span', { className: 'text-slate-500' }, '📄 Prompt: '),
          React.createElement('span', { className: 'text-violet-400' }, filesUsed.promptTemplate),
          filesUsed.promptPhase && React.createElement('span', { className: 'text-slate-600 ml-2' },
            `(${filesUsed.promptPhase}/${filesUsed.promptType})`
          )
        ),
        // Prior steps
        filesUsed.priorSteps?.length > 0 && React.createElement('div', null,
          React.createElement('span', { className: 'text-slate-500' }, '📁 Prior Steps: '),
          React.createElement('div', { className: 'ml-4' },
            ...filesUsed.priorSteps.map(f =>
              React.createElement('div', { key: f.file || f, className: 'text-emerald-400' },
                `${f.file || f}${f.size ? ` (${f.size})` : ''}`
              )
            )
          )
        ),
        // Context files
        filesUsed.contextFiles?.length > 0 && React.createElement('div', null,
          React.createElement('span', { className: 'text-slate-500' }, '📂 Context: '),
          React.createElement('span', { className: 'text-blue-400' },
            filesUsed.contextFiles.join(', ')
          )
        ),
        // Knowledge
        filesUsed.knowledgeCategories?.length > 0 && React.createElement('div', null,
          React.createElement('span', { className: 'text-slate-500' }, '🔍 Knowledge: '),
          React.createElement('span', { className: 'text-amber-400' },
            filesUsed.knowledgeCategories.join(', ')
          )
        ),
        // Init file (skip if already shown in prior steps)
        filesUsed.initFile && !filesUsed.priorSteps?.some(f => (f.file || f) === filesUsed.initFile) && React.createElement('div', null,
          React.createElement('span', { className: 'text-slate-500' }, '📄 Init: '),
          React.createElement('span', { className: 'text-cyan-400' }, filesUsed.initFile)
        ),
        // Codebase scan
        (filesUsed.codebaseFiles?.length > 0 || filesUsed.techStack?.length > 0) && React.createElement('div', null,
          React.createElement('span', { className: 'text-slate-500' }, '📊 Codebase Scan: '),
          filesUsed.codebaseFiles?.length > 0 && React.createElement('span', { className: 'text-pink-400 mr-2' },
            `Dirs: ${filesUsed.codebaseFiles.join(', ')}`
          ),
          filesUsed.techStack?.length > 0 && React.createElement('span', { className: 'text-orange-400' },
            `Tech: ${filesUsed.techStack.join(', ')}`
          )
        ),
        // Test level
        filesUsed.testLevel && React.createElement('div', null,
          React.createElement('span', { className: 'text-slate-500' }, '🧪 Test Level: '),
          React.createElement('span', { className: 'text-teal-400' },
            filesUsed.testLevel.levels?.includes('none')
              ? 'No tests'
              : filesUsed.testLevel.levels?.join(', ') || 'auto'
          ),
          filesUsed.testLevel.custom_instructions && React.createElement('span', { className: 'text-slate-500 ml-2' },
            `(${filesUsed.testLevel.custom_instructions})`
          )
        )
      ),
      // Section 2: Files Touched (agent operations)
      hasFileOps && React.createElement('div', { className: `space-y-1 ${hasContextContent ? 'mt-3 pt-2 border-t border-slate-700/50' : ''}` },
        React.createElement('div', { className: 'text-slate-500 font-medium mb-1' }, 'Fichiers touchés'),
        // Modified files
        deduplicatedOps.modified.length > 0 && React.createElement('div', null,
          React.createElement('span', { className: 'text-slate-500' }, '📝 Modifiés: '),
          React.createElement('div', { className: 'ml-4' },
            ...deduplicatedOps.modified.map(f =>
              React.createElement('div', { key: f, className: 'text-yellow-400' }, f)
            )
          )
        ),
        // Created files
        deduplicatedOps.created.length > 0 && React.createElement('div', null,
          React.createElement('span', { className: 'text-slate-500' }, '✨ Créés: '),
          React.createElement('div', { className: 'ml-4' },
            ...deduplicatedOps.created.map(f =>
              React.createElement('div', { key: f, className: 'text-green-400' }, f)
            )
          )
        ),
        // Read files
        deduplicatedOps.read.length > 0 && React.createElement('div', null,
          React.createElement('span', { className: 'text-slate-500' }, '📄 Lus: '),
          React.createElement('div', { className: 'ml-4' },
            ...deduplicatedOps.read.map(f =>
              React.createElement('div', { key: f, className: 'text-slate-400' }, f)
            )
          )
        )
      )
    )
  );
}

function PhaseFilter({ current, onChange }) {
  const phases = [
    { key: 'all', label: 'All', icon: '📋' },
    { key: 'product', label: 'Product', icon: '🔍' },
    { key: 'dev', label: 'Dev', icon: '🚀' },
  ];

  return React.createElement('div', { className: 'flex items-center gap-1 bg-slate-800 rounded-lg p-1' },
    ...phases.map(phase =>
      React.createElement('button', {
        key: phase.key,
        onClick: () => onChange(phase.key),
        className: `flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg transition-colors ${
          current === phase.key
            ? 'bg-violet-500/30 text-violet-300'
            : 'text-slate-400 hover:text-slate-200'
        }`,
      },
        React.createElement('span', null, phase.icon),
        React.createElement('span', null, phase.label)
      )
    )
  );
}

function ActionBar({ step, stepKey, onGenerate, onChat, onReview, generating, readonly }) {
  const config = STEP_CONFIG[stepKey];
  if (!config) return null;

  const stepType = config.type || 'generate';
  const actions = STEP_ACTIONS[stepType] || STEP_ACTIONS.generate;

  return React.createElement('div', { className: 'flex items-center gap-2' },
    actions.includes('generate') && React.createElement('button', {
      onClick: onGenerate,
      disabled: generating || readonly,
      className: 'flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-violet-500/20 text-violet-400 border border-violet-500/30 hover:bg-violet-500/30 disabled:opacity-50 transition-colors',
    }, generating ? '⏳ Generating...' : '✨ Generate'),
    actions.includes('chat') && React.createElement('button', {
      onClick: onChat,
      disabled: generating || readonly,
      className: 'flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 disabled:opacity-50 transition-colors',
    }, '💬 Chat'),
    actions.includes('review') && React.createElement('button', {
      onClick: onReview,
      disabled: generating || readonly,
      className: 'flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 disabled:opacity-50 transition-colors',
    }, '🔍 Review')
  );
}

function StepPills({ steps, storySteps, currentStep, onStepClick, tokenUsage }) {
  // Group steps by phase for visual separation
  const productSteps = steps.filter(s => STEP_CONFIG[s]?.phase === 'product');
  const devSteps = steps.filter(s => STEP_CONFIG[s]?.phase === 'dev');

  const renderStep = (stepKey) => {
    const config = STEP_CONFIG[stepKey];
    const stepData = storySteps?.[stepKey];
    const isCompleted = stepData?.completed;
    const isSkipped = stepData?.skipped;
    const isCurrent = currentStep === stepKey;

    // Get token usage for this step
    const stepTokens = tokenUsage?.steps?.[stepKey];
    const formattedTokens = formatTokenCount(stepTokens?.total);

    return React.createElement('button', {
      key: stepKey,
      onClick: () => onStepClick(stepKey),
      className: `flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-colors ${
        isCurrent
          ? 'bg-violet-500/30 text-violet-300 border border-violet-500/50'
          : isSkipped
            ? 'bg-slate-700/50 text-slate-500 line-through'
            : isCompleted
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-slate-800 text-slate-400 hover:text-slate-200'
      }`,
      title: stepTokens ? `Input: ${stepTokens.input}, Output: ${stepTokens.output}` : undefined,
    },
      React.createElement('span', null, isSkipped ? '⏭️' : config?.icon || '📄'),
      React.createElement('span', null, config?.name || stepKey),
      // Token badge
      formattedTokens && React.createElement('span', {
        className: 'ml-1 px-1.5 py-0.5 text-[10px] rounded bg-slate-700/50 text-slate-400',
      }, formattedTokens)
    );
  };

  return React.createElement('div', { className: 'flex items-center gap-2 flex-wrap' },
    // Product phase steps
    productSteps.length > 0 && React.createElement('div', { className: 'flex items-center gap-1' },
      React.createElement('span', { className: 'text-xs text-purple-400 mr-1' }, '🔍'),
      ...productSteps.map(renderStep)
    ),
    // Separator
    productSteps.length > 0 && devSteps.length > 0 &&
      React.createElement('span', { className: 'text-slate-600 mx-1' }, '|'),
    // Dev phase steps
    devSteps.length > 0 && React.createElement('div', { className: 'flex items-center gap-1' },
      React.createElement('span', { className: 'text-xs text-violet-400 mr-1' }, '🚀'),
      ...devSteps.map(renderStep)
    )
  );
}

// ============== Original Helper Components ==============

function ModelSelect({ model, onChange, disabled }) {
  const [models, setModels] = React.useState([]);
  const [customMode, setCustomMode] = React.useState(false);
  const [customValue, setCustomValue] = React.useState(() => {
    try { return localStorage.getItem('aia-custom-model') || ''; } catch { return ''; }
  });
  const [previousModel, setPreviousModel] = React.useState('');

  React.useEffect(() => { api.get('/models').then(setModels).catch(() => {}); }, []);

  const handleSelectChange = (value) => {
    if (value === '__custom__') {
      setPreviousModel(model);
      setCustomMode(true);
      // Don't fire onChange yet — wait for user to confirm
    } else {
      setCustomMode(false);
      onChange(value);
    }
  };

  const commitCustomValue = () => {
    if (customValue.trim()) {
      try { localStorage.setItem('aia-custom-model', customValue.trim()); } catch {}
      onChange(customValue.trim());
    }
  };

  // Group models by provider
  const grouped = {};
  for (const m of models) {
    const provider = m.provider || 'other';
    if (!grouped[provider]) grouped[provider] = [];
    grouped[provider].push(m);
  }
  const providerLabels = { anthropic: 'Anthropic (Claude)', openai: 'OpenAI (Codex)', gemini: 'Google (Gemini)', other: 'Other' };

  if (customMode) {
    return React.createElement('div', { className: 'flex items-center gap-2' },
      React.createElement('input', {
        type: 'text',
        value: customValue,
        onChange: e => setCustomValue(e.target.value),
        onBlur: commitCustomValue,
        onKeyDown: e => { if (e.key === 'Enter') { e.target.blur(); } },
        placeholder: 'e.g. claude-opus-4-6',
        disabled,
        autoFocus: true,
        className: 'bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:border-violet-500 focus:outline-none flex-1',
      }),
      React.createElement('button', {
        onClick: () => { setCustomMode(false); onChange(previousModel); },
        disabled,
        className: 'text-xs text-slate-500 hover:text-slate-300',
        title: 'Back to dropdown',
      }, 'Cancel')
    );
  }

  const hasGroups = Object.keys(grouped).length > 1;

  return React.createElement('select', {
    value: model,
    onChange: e => handleSelectChange(e.target.value),
    disabled,
    className: 'bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:border-violet-500 focus:outline-none',
  },
    React.createElement('option', { value: '' }, 'Auto'),
    ...(hasGroups
      ? Object.entries(grouped).map(([provider, providerModels]) =>
          React.createElement('optgroup', { key: provider, label: providerLabels[provider] || provider },
            ...providerModels.map(m => React.createElement('option', {
              key: m.id || m.model || m,
              value: m.id || m.model || m,
            }, m.label || m.id || m.model || m))
          )
        )
      : models.map(m => React.createElement('option', {
          key: m.id || m.model || m,
          value: m.id || m.model || m,
        }, m.label || m.id || m.model || m))
    ),
    React.createElement('option', { value: '__custom__' }, 'Custom...')
  );
}

// ============== Attachment Zone ==============

function AttachmentZone({ slug, attachments = [], onUpdate, readonly = false }) {
  const inputRef = React.useRef(null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState(null);

  const handleFiles = async (files) => {
    if (!files.length || readonly) return;
    setUploading(true);
    setError(null);

    const formData = new FormData();
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        setError(`File "${file.name}" exceeds 10MB limit`);
        setUploading(false);
        return;
      }
      formData.append('files', file);
    }

    try {
      const res = await api.upload(`/stories/${slug}/init/attachments`, formData);
      if (res.story) onUpdate(res.story);
    } catch (e) {
      setError(e.message || 'Upload failed');
    }
    setUploading(false);
  };

  const handleRemove = async (filename) => {
    if (readonly) return;
    try {
      const res = await api.delete(`/stories/${slug}/init/attachments/${encodeURIComponent(filename)}`);
      if (res.story) onUpdate(res.story);
    } catch (e) {
      setError(e.message);
    }
  };

  return React.createElement('div', { className: 'space-y-2' },
    !readonly && React.createElement('input', {
      ref: inputRef,
      type: 'file',
      multiple: true,
      accept: 'image/*,application/pdf,text/*,.md,.txt,.json,.yaml,.yml',
      className: 'hidden',
      onChange: (e) => handleFiles(Array.from(e.target.files)),
    }),

    !readonly && React.createElement('div', { className: 'flex items-center gap-3' },
      React.createElement('button', {
        onClick: () => inputRef.current?.click(),
        disabled: uploading,
        className: 'flex items-center gap-2 px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors',
      },
        uploading ? '⟳ Uploading...' : '📎 Add files'
      ),
      React.createElement('span', { className: 'text-xs text-slate-600' }, 'Images, PDF, text (max 10MB)')
    ),

    error && React.createElement('p', { className: 'text-red-400 text-xs' }, error),

    attachments.length > 0 && React.createElement('div', { className: 'flex flex-wrap gap-2' },
      ...attachments.map(a => React.createElement('span', {
        key: a.filename,
        className: 'flex items-center gap-2 px-2 py-1 bg-slate-800 rounded-lg text-xs text-slate-300',
      },
        a.type?.startsWith('image/') ? '🖼️' : '📄',
        a.filename,
        a.size && React.createElement('span', { className: 'text-slate-500' }, formatFileSize(a.size)),
        !readonly && React.createElement('button', {
          onClick: () => handleRemove(a.filename),
          className: 'text-red-400 hover:text-red-300 ml-1',
        }, '×')
      ))
    )
  );
}

// ============== Streaming Output Panel ==============

/**
 * StreamingPanel - Shows agent output with status indicators
 * @param {Object} props
 * @param {string} props.output - Current output text
 * @param {Object} [props.sessionStatus] - Session status from agent-status API
 * @param {string} [props.sessionStatus.status] - 'running' | 'stalled' | 'retrying' | 'idle'
 * @param {number} [props.sessionStatus.attempt] - Current attempt number
 * @param {Object} [props.sessionStatus.retry] - Retry info if scheduled
 */
function StreamingPanel({ output, sessionStatus }) {
  const ref = React.useRef(null);
  const [elapsed, setElapsed] = React.useState(0);
  const [retryCountdown, setRetryCountdown] = React.useState(null);

  React.useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [output]);

  React.useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  // Update retry countdown
  React.useEffect(() => {
    if (sessionStatus?.retry?.dueAt) {
      const updateCountdown = () => {
        const remaining = Math.max(0, Math.round((sessionStatus.retry.dueAt - Date.now()) / 1000));
        setRetryCountdown(remaining);
      };
      updateCountdown();
      const interval = setInterval(updateCountdown, 1000);
      return () => clearInterval(interval);
    }
    setRetryCountdown(null);
  }, [sessionStatus?.retry?.dueAt]);

  const formatTime = (s) => s < 60 ? `${s}s` : `${Math.floor(s/60)}m ${s%60}s`;

  // Determine status styling
  const status = sessionStatus?.status || 'running';
  const attempt = sessionStatus?.attempt || 1;
  const maxRetries = 3; // Match agent-sessions.js MAX_RETRIES

  const statusConfig = {
    running: {
      border: 'border-blue-500/30',
      bg: 'bg-blue-500/10',
      spinnerColor: 'border-blue-400',
      textColor: 'text-blue-400',
      label: attempt > 1 ? `Retry #${attempt}/${maxRetries}` : 'Generating...',
      icon: null, // uses spinner
    },
    stalled: {
      border: 'border-orange-500/30',
      bg: 'bg-orange-500/10',
      spinnerColor: 'border-orange-400',
      textColor: 'text-orange-400',
      label: 'Stalled - Agent not responding',
      icon: '⚠️',
    },
    retrying: {
      border: 'border-amber-500/30',
      bg: 'bg-amber-500/10',
      spinnerColor: 'border-amber-400',
      textColor: 'text-amber-400',
      label: retryCountdown !== null
        ? `Retry #${sessionStatus?.retry?.attempt || 1}/${maxRetries} in ${formatTime(retryCountdown)}`
        : 'Scheduling retry...',
      icon: '🔄',
    },
    maxRetries: {
      border: 'border-red-500/30',
      bg: 'bg-red-500/10',
      spinnerColor: 'border-red-400',
      textColor: 'text-red-400',
      label: 'Max retries reached - Manual intervention required',
      icon: '❌',
    },
  };

  const config = statusConfig[status] || statusConfig.running;

  return React.createElement('div', { className: `bg-slate-900 border ${config.border} rounded-lg overflow-hidden` },
    React.createElement('div', { className: `flex items-center justify-between px-4 py-2 ${config.bg} border-b ${config.border}` },
      React.createElement('div', { className: 'flex items-center gap-2' },
        config.icon
          ? React.createElement('span', { className: 'text-sm' }, config.icon)
          : React.createElement('div', { className: `w-3 h-3 border-2 ${config.spinnerColor} border-t-transparent rounded-full animate-spin` }),
        React.createElement('span', { className: `text-sm ${config.textColor} font-medium` }, config.label)
      ),
      React.createElement('div', { className: 'flex items-center gap-3' },
        // Show attempt badge if retry
        attempt > 1 && status === 'running' && React.createElement('span', {
          className: 'px-2 py-0.5 text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full',
        }, `Attempt ${attempt}/${maxRetries}`),
        // Show tokens if available
        sessionStatus?.tokens?.total > 0 && React.createElement('span', {
          className: 'text-xs text-slate-500',
        }, `${sessionStatus.tokens.total} tokens`),
        React.createElement('span', { className: 'text-xs text-slate-500 font-mono' }, formatTime(elapsed))
      )
    ),
    // Show retry error message if retrying
    status === 'retrying' && sessionStatus?.retry?.error && React.createElement('div', {
      className: 'px-4 py-2 bg-amber-500/5 border-b border-amber-500/20 text-xs text-amber-300',
    }, `Previous error: ${sessionStatus.retry.error}`),
    // Show stall warning
    status === 'stalled' && React.createElement('div', {
      className: 'px-4 py-2 bg-orange-500/5 border-b border-orange-500/20 text-xs text-orange-300',
    }, 'No output received for 5 minutes. A retry will be scheduled automatically.'),
    // Output content
    output
      ? React.createElement('pre', {
          ref,
          className: 'p-4 text-xs text-slate-300 whitespace-pre-wrap overflow-auto max-h-64 font-mono',
        }, output.slice(-5000))
      : React.createElement('div', { className: 'flex flex-col items-center gap-3 py-8' },
          React.createElement('div', { className: 'flex gap-1' },
            React.createElement('span', { className: `w-2 h-2 ${config.spinnerColor.replace('border-', 'bg-')} rounded-full animate-bounce`, style: { animationDelay: '0ms' } }),
            React.createElement('span', { className: `w-2 h-2 ${config.spinnerColor.replace('border-', 'bg-')} rounded-full animate-bounce`, style: { animationDelay: '150ms' } }),
            React.createElement('span', { className: `w-2 h-2 ${config.spinnerColor.replace('border-', 'bg-')} rounded-full animate-bounce`, style: { animationDelay: '300ms' } })
          ),
          React.createElement('span', { className: 'text-sm text-slate-500' }, 'AI is working...')
        )
  );
}

// ============== Conversation Panel ==============

function ConversationPanel({ slug, stepName, model, onModelChange, onContentUpdated }) {
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [starting, setStarting] = React.useState(false);
  const [recapping, setRecapping] = React.useState(false);
  const [recapOutput, setRecapOutput] = React.useState('');
  const messagesEndRef = React.useRef(null);

  // Convert stepName to API format (kebab-case)
  const apiStepName = stepName.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');

  // Check special step types
  const isCodeStep = CODE_STEPS.includes(stepName) || ['implement', 'review'].includes(apiStepName);
  const isBrainstorming = stepName === 'brainstorming' || apiStepName === 'brainstorming';
  const isReview = stepName === 'review' || apiStepName === 'review';

  // Mode-specific config
  const modeConfig = isBrainstorming
    ? { icon: '💭', title: 'Brainstorming', color: 'cyan', placeholder: 'Share your ideas, ask questions, explore possibilities...' }
    : isReview
      ? { icon: '🔍', title: 'Code Review', color: 'amber', placeholder: 'Discuss issues, request changes, ask questions...' }
      : { icon: '💬', title: 'Chat', color: 'violet', placeholder: 'Ask a question or request changes...' };

  // Unified conversation key — one conversation per step
  const conversationKey = apiStepName;

  const loadConversation = async () => {
    try {
      const data = await api.get(`/stories/${slug}/steps/${conversationKey}/conversation`);
      setMessages(data.messages || []);
    } catch {}
    setLoading(false);
  };

  React.useEffect(() => { loadConversation(); }, [slug, stepName]);
  React.useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Handle AI-initiated chat (brainstorming or review)
  const handleStartChat = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const result = await api.post(`/stories/${slug}/steps/${conversationKey}/start-chat`, {
        model: model || undefined,
      });
      setMessages([result.message]);
    } catch (err) {
      alert('Erreur: ' + (err.message || 'Impossible de démarrer'));
    }
    setStarting(false);
  };

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      const result = await api.post(`/stories/${slug}/steps/${conversationKey}/chat`, {
        message: input.trim(),
        model: model || undefined,
      });
      setMessages(prev => [...prev,
        { role: 'user', content: input.trim(), createdAt: new Date().toISOString() },
        result.message
      ]);
      setInput('');
    } catch {}
    setSending(false);
  };

  const handleRecap = async () => {
    if (messages.length === 0) return;
    setRecapping(true);
    setRecapOutput('');
    try {
      const result = await streamPost(`/stories/${slug}/steps/${conversationKey}/recap`, { model: model || undefined }, {
        onLog: (text) => {
          setRecapOutput(prev => (prev + text).slice(-10000));
        },
        onStatus: (status) => {},
      });
      if (result.ok) {
        setRecapOutput('');
        // Reload conversation to get the summary message
        await loadConversation();
        if (onContentUpdated) onContentUpdated();
      } else if (result.error) {
        alert(`Error: ${result.error}`);
        setRecapOutput('');
      }
    } catch (err) {
      console.error('[Recap] Error:', err);
      alert(`Error: ${err.message}`);
    }
    setRecapping(false);
  };

  if (loading) return React.createElement('div', { className: 'p-4 text-center text-slate-500 text-sm' }, 'Loading conversation...');

  // Color classes based on step type
  const borderColor = isBrainstorming ? 'border-cyan-500/30' : isReview ? 'border-amber-500/30' : 'border-slate-700';
  const headerBg = isBrainstorming ? 'bg-cyan-500/10' : isReview ? 'bg-amber-500/10' : 'bg-slate-800';
  const titleColor = isBrainstorming ? 'text-cyan-300' : isReview ? 'text-amber-300' : 'text-slate-200';

  // Get last assistant message with filesUsed for context display
  const lastAssistantMsgWithFiles = [...messages].reverse().find(m => m.role === 'assistant' && m.filesUsed);

  return React.createElement('div', { className: `bg-slate-800/50 rounded-lg border ${borderColor} overflow-hidden` },
    React.createElement('div', { className: `flex items-center justify-between px-4 py-3 ${headerBg} border-b ${borderColor}` },
      React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement('span', { className: `text-sm font-medium ${titleColor}` }, `${modeConfig.icon} ${modeConfig.title}`),
        messages.length > 0 && React.createElement('span', { className: 'text-xs text-slate-500 bg-slate-700 px-2 py-0.5 rounded-full' }, `${messages.length}`),
        isCodeStep && React.createElement('span', { className: 'text-xs text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full' }, '🚀 Code mode'),
        isBrainstorming && React.createElement('span', { className: 'text-xs text-cyan-400 bg-cyan-500/20 px-2 py-0.5 rounded-full' }, '💭 Ideation')
      ),
      React.createElement('div', { className: 'flex items-center gap-2' },
        // Model selector in conversation header
        onModelChange && React.createElement(ModelSelect, { model, onChange: onModelChange, disabled: sending || recapping }),
        messages.length > 0 && !messages[messages.length - 1]?.isRecapSummary && React.createElement('button', {
        onClick: handleRecap,
        disabled: recapping,
        className: `flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg transition-colors disabled:opacity-50 ${
          isBrainstorming
            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30'
            : isCodeStep
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
              : 'bg-violet-500/20 text-violet-400 border border-violet-500/30 hover:bg-violet-500/30'
        }`,
      }, recapping ? '⏳ Generating...' : (isBrainstorming ? '📝 Save Summary' : isCodeStep ? '🚀 Apply to code' : '✨ Apply feedback'))
      )
    ),
    // Show streaming output when recapping
    recapping && React.createElement('div', { className: 'p-4 bg-slate-900/50 border-b border-slate-700' },
      React.createElement('div', { className: 'flex items-center gap-2 mb-2' },
        React.createElement('div', { className: 'w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin' }),
        React.createElement('span', { className: 'text-sm text-violet-400' }, 'AI is updating the document...')
      ),
      recapOutput && React.createElement('pre', {
        className: 'text-xs text-slate-400 whitespace-pre-wrap max-h-32 overflow-y-auto font-mono bg-slate-900 p-2 rounded',
      }, recapOutput.slice(-2000))
    ),
    !recapping && React.createElement('div', { className: 'max-h-64 overflow-y-auto p-4 space-y-3' },
      messages.length === 0 && (isBrainstorming || isReview) && React.createElement('div', { className: 'flex flex-col items-center gap-3 py-4' },
        React.createElement('button', {
          onClick: handleStartChat,
          disabled: starting,
          className: `px-4 py-2 ${isBrainstorming ? 'bg-cyan-500 hover:bg-cyan-600' : 'bg-amber-500 hover:bg-amber-600'} disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-2`,
        }, starting ? '⏳ Chargement...' : (isBrainstorming ? '🚀 Démarrer le brainstorming' : '🔍 Lancer la review'))
      ),
      messages.length === 0 && !isBrainstorming && !isReview && React.createElement('p', { className: 'text-center text-slate-500 text-sm py-4' },
        'Ask questions or request changes. Click "Apply feedback" to update the content.'
      ),
      ...messages.map((msg, i) => React.createElement('div', {
        key: i,
        className: `flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`,
      },
        React.createElement('div', {
          className: `max-w-[85%] rounded-lg px-3 py-2 ${
            msg.isRecapSummary
              ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-500/30'
              : msg.role === 'user'
                ? 'bg-violet-500/20 text-slate-200'
                : 'bg-slate-700 text-slate-300'
          }`,
        },
          msg.isRecapSummary && React.createElement('div', { className: 'flex items-center gap-2 mb-2 text-emerald-400 text-xs font-medium' },
            React.createElement('span', null, '🎯'),
            React.createElement('span', null, 'Actions Applied')
          ),
          React.createElement('p', { className: 'text-sm whitespace-pre-wrap' }, msg.translatedContent || msg.content),
          React.createElement('div', { className: 'flex items-center gap-2 mt-1' },
            React.createElement('span', { className: 'text-xs text-slate-500' }, new Date(msg.createdAt).toLocaleTimeString()),
            msg.role === 'assistant' && msg.tokenUsage && React.createElement('span', {
              className: 'text-xs text-slate-500',
              title: `Input: ${msg.tokenUsage.input || 0}, Output: ${msg.tokenUsage.output || 0}`,
            }, `🎯 ${formatTokenCount(msg.tokenUsage.total)}`)
          )
        )
      )),
      // Show context files from last assistant message
      lastAssistantMsgWithFiles?.filesUsed && React.createElement(FilesUsedPanel, {
        filesUsed: lastAssistantMsgWithFiles.filesUsed,
        fileOperations: lastAssistantMsgWithFiles.fileOperations || [],
        expanded: false,
      }),
      React.createElement('div', { ref: messagesEndRef })
    ),
    React.createElement('div', { className: `flex items-center gap-2 p-3 ${headerBg} border-t ${borderColor}` },
      React.createElement('input', {
        type: 'text',
        value: input,
        onChange: (e) => setInput(e.target.value),
        onKeyDown: (e) => e.key === 'Enter' && !e.shiftKey && handleSend(),
        placeholder: modeConfig.placeholder,
        className: `flex-1 bg-slate-900 border rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none ${
          isBrainstorming ? 'border-cyan-500/30 focus:border-cyan-500'
            : isReview ? 'border-amber-500/30 focus:border-amber-500'
            : 'border-slate-700 focus:border-violet-500'
        }`,
        disabled: sending,
      }),
      React.createElement('button', {
        onClick: handleSend,
        disabled: sending || !input.trim(),
        className: `px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors ${
          isBrainstorming ? 'bg-cyan-500 hover:bg-cyan-600'
            : isReview ? 'bg-amber-500 hover:bg-amber-600'
            : 'bg-violet-500 hover:bg-violet-600'
        }`,
      }, sending ? '⏳' : '➤')
    )
  );
}

// ============== Init Panel ==============

function InitPanel({ slug, story, onComplete, onStoryUpdate, readonly = false }) {
  const [description, setDescription] = React.useState(story?.init?.input || '');
  const [loading, setLoading] = React.useState(false);
  const [output, setOutput] = React.useState('');
  const [viewMode, setViewMode] = React.useState('input'); // 'input' | 'preview' | 'edit' | 'translate'
  const [editContent, setEditContent] = React.useState(story?.init?.enriched || '');
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  // Model selection state
  const [model, setModel] = React.useState('');

  // Translation state
  const [langConfig, setLangConfig] = React.useState(null);
  const [translating, setTranslating] = React.useState(false);
  const [translated, setTranslated] = React.useState(null);

  // Load language config
  React.useEffect(() => {
    api.get('/config/languages').then(setLangConfig).catch(() => {});
  }, []);

  // Sync editContent when story changes
  React.useEffect(() => {
    setEditContent(story?.init?.enriched || '');
    setDirty(false);
    setTranslated(null); // Reset translation when content changes
    setModel(''); // Reset model selection when story changes
  }, [story?.init?.enriched]);

  const needsTranslation = langConfig?.needsTranslation && story?.init?.enriched;

  const handleSubmit = async () => {
    setLoading(true);
    setOutput('');

    try {
      const result = await streamPost(`/stories/${slug}/init/enrich`, {
        description,
        model: model || undefined,
      }, {
        onLog: (text) => setOutput(prev => (prev + text).slice(-10000)),
        onStatus: () => {},
      });

      setLoading(false);
      setOutput('');

      if (result.error) {
        // Show error to user
        alert(`Enrichment failed: ${result.error}`);
        return;
      }

      if (result.ok || result.story) {
        // Use the story from the response directly, or fallback to fetching
        let updatedStory = result.story || await api.get(`/stories/${slug}`);

        // Ensure init.enriched is populated from result.content if not already set
        // The SSE response may include content separately from story.init.enriched
        if (result.content && (!updatedStory.init || !updatedStory.init.enriched)) {
          updatedStory = {
            ...updatedStory,
            init: {
              ...(updatedStory.init || {}),
              enriched: result.content,
              input: updatedStory.init?.input || '',
              attachments: updatedStory.init?.attachments || [],
            }
          };
        }

        onStoryUpdate(updatedStory);
        // Switch to preview mode to show the enriched content immediately
        setViewMode('preview');
        // Clear the input since it was processed
        setDescription('');
        onComplete();
      }
    } catch (err) {
      setLoading(false);
      setOutput('');
      alert(`Enrichment failed: ${err.message || 'Unknown error'}`);
    }
  };

  const handleSaveInit = async () => {
    setSaving(true);
    try {
      await api.put(`/stories/${slug}/init`, { content: editContent });
      setDirty(false);
      onStoryUpdate(await api.get(`/stories/${slug}`));
    } catch (e) {
      alert(e.message);
    }
    setSaving(false);
  };

  const handleTranslate = async () => {
    setTranslating(true);
    try {
      const result = await api.post(`/stories/${slug}/init/translate`);
      if (result.needed) {
        setTranslated(result.translated);
      }
    } catch (e) {
      alert(e.message);
    }
    setTranslating(false);
  };

  const hasEnrichedContext = story?.init?.enriched && story.init.enriched.trim().length > 0;

  if (readonly) {
    return React.createElement('div', { className: 'space-y-2' },
      hasEnrichedContext
        ? React.createElement('pre', { className: 'text-sm text-slate-400 whitespace-pre-wrap max-h-64 overflow-y-auto font-mono bg-slate-900/50 rounded-lg p-4' }, story.init.enriched)
        : React.createElement('p', { className: 'text-sm text-slate-500 italic' }, 'No context provided yet.')
    );
  }

  return React.createElement('div', { className: 'space-y-4' },
    // Mode tabs
    React.createElement('div', { className: 'flex items-center gap-1 bg-slate-800 rounded-lg p-1 w-fit' },
      React.createElement('button', {
        onClick: () => setViewMode('input'),
        className: `px-3 py-1.5 text-xs rounded-lg transition-colors ${viewMode === 'input' ? 'bg-violet-500/30 text-violet-300' : 'text-slate-400 hover:text-slate-200'}`,
      }, '✏️ New Input'),
      React.createElement('button', {
        onClick: () => setViewMode('preview'),
        className: `px-3 py-1.5 text-xs rounded-lg transition-colors ${viewMode === 'preview' ? 'bg-violet-500/30 text-violet-300' : 'text-slate-400 hover:text-slate-200'}`,
      }, '👁 Preview'),
      React.createElement('button', {
        onClick: () => setViewMode('edit'),
        className: `px-3 py-1.5 text-xs rounded-lg transition-colors ${viewMode === 'edit' ? 'bg-violet-500/30 text-violet-300' : 'text-slate-400 hover:text-slate-200'}`,
      }, '📝 Edit .md'),
      // Translate tab - only show if languages differ
      needsTranslation && React.createElement('button', {
        onClick: () => setViewMode('translate'),
        className: `px-3 py-1.5 text-xs rounded-lg transition-colors ${viewMode === 'translate' ? 'bg-sky-500/30 text-sky-300' : 'text-slate-400 hover:text-slate-200'}`,
      }, `🌐 ${langConfig.communication_language}`)
    ),

    // Loading state
    loading && React.createElement(StreamingPanel, { output }),

    // Input mode - for new descriptions to enrich
    !loading && viewMode === 'input' && React.createElement(React.Fragment, null,
      React.createElement(AttachmentZone, {
        slug,
        attachments: story?.init?.attachments || [],
        onUpdate: onStoryUpdate,
      }),
      React.createElement('textarea', {
        value: description,
        onChange: e => setDescription(e.target.value),
        placeholder: 'Describe the story requirements, acceptance criteria, context...',
        rows: 6,
        className: 'w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:border-violet-500 focus:outline-none resize-y',
      }),
      hasEnrichedContext && React.createElement('div', { className: 'bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3' },
        React.createElement('div', { className: 'flex items-center gap-2' },
          React.createElement('span', { className: 'text-emerald-400 text-sm' }, '✓ init.md has content'),
          React.createElement('button', {
            onClick: () => setViewMode('preview'),
            className: 'ml-auto text-xs text-violet-400 hover:text-violet-300',
          }, 'View →'),
          React.createElement('button', {
            onClick: onComplete,
            className: 'text-xs text-slate-400 hover:text-slate-200',
          }, 'Skip to steps →')
        )
      ),
      React.createElement('div', { className: 'flex items-center justify-between' },
        React.createElement('div', { className: 'flex items-center gap-3' },
          React.createElement('span', { className: 'text-xs text-slate-500' }, `${description.length} characters`),
          React.createElement(ModelSelect, { model, onChange: setModel, disabled: loading || saving || translating })
        ),
        React.createElement('div', { className: 'flex items-center gap-3' },
          hasEnrichedContext && React.createElement('button', {
            onClick: onComplete,
            className: 'px-4 py-2 text-slate-400 hover:text-slate-200 text-sm',
          }, 'Skip'),
          React.createElement('button', {
            onClick: handleSubmit,
            disabled: !description.trim() || loading,
            className: 'px-6 py-2 bg-violet-500 text-white rounded-lg text-sm font-medium hover:bg-violet-600 disabled:opacity-50 transition-colors',
          }, loading ? '⏳ Enriching...' : (hasEnrichedContext ? '↻ Re-enrich with AI' : '✨ Enrich & Continue'))
        )
      )
    ),

    // Preview mode - view init.md content
    !loading && viewMode === 'preview' && React.createElement('div', { className: 'space-y-4' },
      hasEnrichedContext
        ? React.createElement('pre', {
            className: 'bg-slate-900/50 rounded-lg p-4 text-sm text-slate-300 whitespace-pre-wrap max-h-96 overflow-y-auto font-mono border border-slate-700',
          }, story.init.enriched)
        : React.createElement('div', { className: 'bg-slate-900/50 rounded-lg p-8 text-center border border-slate-700' },
            React.createElement('p', { className: 'text-slate-500' }, 'No content in init.md yet.'),
            React.createElement('button', {
              onClick: () => setViewMode('input'),
              className: 'mt-3 text-sm text-violet-400 hover:text-violet-300',
            }, '← Go to Input to create content')
          ),
      hasEnrichedContext && React.createElement('div', { className: 'flex items-center justify-end gap-3' },
        React.createElement('button', {
          onClick: () => setViewMode('edit'),
          className: 'px-4 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-600 transition-colors',
        }, '📝 Edit'),
        React.createElement('button', {
          onClick: onComplete,
          className: 'px-4 py-2 bg-violet-500 text-white rounded-lg text-sm font-medium hover:bg-violet-600 transition-colors',
        }, 'Continue to steps →')
      )
    ),

    // Edit mode - direct edit of init.md
    !loading && viewMode === 'edit' && React.createElement('div', { className: 'space-y-4' },
      React.createElement('textarea', {
        value: editContent,
        onChange: e => { setEditContent(e.target.value); setDirty(true); },
        placeholder: '# Story Title\n\n## Summary\n\n## Requirements\n\n...',
        rows: 16,
        className: 'w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-300 font-mono placeholder-slate-600 focus:border-violet-500 focus:outline-none resize-y',
        spellCheck: false,
      }),
      React.createElement('div', { className: 'flex items-center justify-between' },
        React.createElement('div', { className: 'flex items-center gap-3' },
          dirty && React.createElement('span', { className: 'text-xs text-amber-400' }, '● unsaved changes'),
          React.createElement('span', { className: 'text-xs text-slate-500' }, `${editContent.length} characters`)
        ),
        React.createElement('div', { className: 'flex items-center gap-2' },
          dirty && React.createElement('button', {
            onClick: () => { setEditContent(story?.init?.enriched || ''); setDirty(false); },
            className: 'px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200',
          }, 'Discard'),
          React.createElement('button', {
            onClick: handleSaveInit,
            disabled: saving || !dirty,
            className: 'px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm hover:bg-emerald-500/30 disabled:opacity-50 transition-colors',
          }, saving ? '⏳ Saving...' : '💾 Save init.md'),
          React.createElement('button', {
            onClick: onComplete,
            className: 'px-4 py-2 bg-violet-500 text-white rounded-lg text-sm font-medium hover:bg-violet-600 transition-colors',
          }, 'Continue →')
        )
      )
    ),

    // Translate mode - view translated content
    !loading && viewMode === 'translate' && needsTranslation && React.createElement('div', { className: 'space-y-4' },
      // Info banner
      React.createElement('div', { className: 'bg-sky-500/10 border border-sky-500/30 rounded-lg p-3 flex items-center gap-3' },
        React.createElement('span', { className: 'text-sky-400' }, '🌐'),
        React.createElement('div', { className: 'flex-1' },
          React.createElement('span', { className: 'text-sm text-sky-300' },
            `Traduction: ${langConfig.document_output_language} → ${langConfig.communication_language}`
          )
        ),
        !translated && React.createElement('button', {
          onClick: handleTranslate,
          disabled: translating,
          className: 'px-4 py-2 bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-lg text-sm hover:bg-sky-500/30 disabled:opacity-50 transition-colors',
        }, translating ? '⏳ Translating...' : '🔄 Generate Translation'),
        translated && React.createElement('button', {
          onClick: handleTranslate,
          disabled: translating,
          className: 'px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200',
        }, translating ? '⏳...' : '↻ Refresh')
      ),

      // Translation content
      translating && React.createElement('div', { className: 'bg-slate-900/50 rounded-lg p-8 text-center border border-slate-700' },
        React.createElement('div', { className: 'flex items-center justify-center gap-2' },
          React.createElement('div', { className: 'w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin' }),
          React.createElement('span', { className: 'text-slate-400' }, 'AI is translating...')
        )
      ),

      !translating && translated && React.createElement('pre', {
        className: 'bg-slate-900/50 rounded-lg p-4 text-sm text-slate-300 whitespace-pre-wrap max-h-96 overflow-y-auto font-mono border border-sky-500/20',
      }, translated),

      !translating && !translated && React.createElement('div', { className: 'bg-slate-900/50 rounded-lg p-8 text-center border border-slate-700' },
        React.createElement('p', { className: 'text-slate-500 mb-3' }, 'Click "Generate Translation" to translate the content.'),
        React.createElement('p', { className: 'text-xs text-slate-600' },
          `The document is in ${langConfig.document_output_language}, translation will be in ${langConfig.communication_language}.`
        )
      ),

      // Actions
      hasEnrichedContext && React.createElement('div', { className: 'flex items-center justify-end gap-3' },
        React.createElement('button', {
          onClick: () => setViewMode('preview'),
          className: 'px-4 py-2 text-slate-400 hover:text-slate-200 text-sm',
        }, '← Original'),
        React.createElement('button', {
          onClick: onComplete,
          className: 'px-4 py-2 bg-violet-500 text-white rounded-lg text-sm font-medium hover:bg-violet-600 transition-colors',
        }, 'Continue to steps →')
      )
    )
  );
}

// ============== Step Section ==============

function StepSection({ step, stepKey, slug, currentStep, storyContext, attachments, onStoryUpdate, readonly = false, tokenUsage = null, savedStepContext = null }) {
  const config = STEP_CONFIG[stepKey];
  const formattedTokens = formatTokenCount(tokenUsage?.total);

  // Chat-first steps - no Generate, direct conversation
  const isBrainstorming = stepKey === 'brainstorming';
  const isReview = stepKey === 'review';
  const isChatFirst = isBrainstorming || isReview;
  const hasContent = step.content && step.content.trim().length > 0;

  // Only expand the current step (or first incomplete step if currentStep not in visible steps)
  const isCurrentStep = stepKey === currentStep;
  const [expanded, setExpanded] = React.useState(isCurrentStep && !readonly);
  const [description, setDescription] = React.useState('');
  const [model, setModel] = React.useState('');
  const [generating, setGenerating] = React.useState(false);
  const [output, setOutput] = React.useState('');
  // For chat-first steps without content, show chat by default
  const [showConversation, setShowConversation] = React.useState(isChatFirst && !hasContent);
  // chatMode removed — unified into single 'iterate' mode
  const [viewMode, setViewMode] = React.useState('preview'); // 'preview' | 'edit' | 'translate'
  const [editContent, setEditContent] = React.useState(step.content || '');
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [skipping, setSkipping] = React.useState(false);

  // Translation state
  const [langConfig, setLangConfig] = React.useState(null);
  const [translating, setTranslating] = React.useState(false);
  const [translated, setTranslated] = React.useState(null);

  // Prompt preview modal
  const [showPreview, setShowPreview] = React.useState(false);

  // Files used tracking (populated after generation, or restored from savedStepContext)
  const [filesUsed, setFilesUsed] = React.useState(savedStepContext?.filesUsed || null);
  // File operations tracking (agent mode: Read/Edit/Write)
  const [fileOperations, setFileOperations] = React.useState(savedStepContext?.fileOperations || []);
  // Model used tracking (populated after generation)
  const [modelUsed, setModelUsed] = React.useState(savedStepContext?.modelUsed || null);

  // Convert stepKey to API format (kebab-case)
  const apiStepKey = stepKey.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');

  // Check if this step can be skipped
  const isSkippable = SKIPPABLE_STEPS.includes(stepKey);
  const isSkipped = step.skipped;

  // Load language config
  React.useEffect(() => {
    api.get('/config/languages').then(setLangConfig).catch(() => {});
  }, []);

  React.useEffect(() => {
    setEditContent(step.content || '');
    setDirty(false);
    setTranslated(null); // Reset translation when content changes
  }, [step.content]);

  const needsTranslation = langConfig?.needsTranslation && step.content;

  const handleTranslate = async () => {
    setTranslating(true);
    try {
      const result = await api.post(`/stories/${slug}/steps/${apiStepKey}/translate`);
      if (result.needed) {
        setTranslated(result.translated);
      }
    } catch (e) {
      alert(e.message);
    }
    setTranslating(false);
  };

  const handleSkip = async () => {
    setSkipping(true);
    try {
      const result = await api.post(`/features/${slug}/skip/${apiStepKey}`);
      if (result.story) {
        onStoryUpdate(result.story);
      } else {
        onStoryUpdate(await api.get(`/stories/${slug}`));
      }
    } catch (e) {
      alert(e.message);
    }
    setSkipping(false);
  };

  const handleRestore = async () => {
    setSkipping(true);
    try {
      const result = await api.delete(`/features/${slug}/skip/${apiStepKey}`);
      if (result.story) {
        onStoryUpdate(result.story);
      } else {
        onStoryUpdate(await api.get(`/stories/${slug}`));
      }
    } catch (e) {
      alert(e.message);
    }
    setSkipping(false);
  };

  const isCompleted = step.completed;

  const handleSaveManual = async () => {
    setSaving(true);
    try {
      await api.put(`/stories/${slug}/steps/${apiStepKey}`, {
        completed: true,
        content: editContent
      });
      setDirty(false);
      onStoryUpdate(await api.get(`/stories/${slug}`));
    } catch (e) {
      alert(e.message);
    }
    setSaving(false);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setOutput('');
    setFilesUsed(null); // Reset filesUsed
    setFileOperations([]); // Reset fileOperations
    setModelUsed(null); // Reset modelUsed

    const result = await streamPost(`/stories/${slug}/steps/${apiStepKey}/generate`, {
      instructions: description.trim() || null,
      model: model || undefined,
    }, {
      onLog: (text) => setOutput(prev => (prev + text).slice(-10000)),
      onStatus: () => {},
    });

    setOutput('');
    setGenerating(false);

    // Store filesUsed, fileOperations and modelUsed from result if available
    if (result.filesUsed) {
      setFilesUsed(result.filesUsed);
    }
    if (result.fileOperations?.length > 0) {
      setFileOperations(result.fileOperations);
    }
    if (result.modelUsed) {
      setModelUsed(result.modelUsed);
    }

    if (result.ok || result.story) {
      setDescription('');
      onStoryUpdate(result.story || await api.get(`/stories/${slug}`));
    }
  };

  const handleConversationUpdate = async () => {
    onStoryUpdate(await api.get(`/stories/${slug}`));
  };

  // Start brainstorming with AI-initiated conversation
  const [startingBrainstorm, setStartingBrainstorm] = React.useState(false);
  const handleStartBrainstorming = async () => {
    setStartingBrainstorm(true);
    try {
      // Send initial prompt to get AI to start the conversation
      await api.post(`/stories/${slug}/steps/brainstorming/chat`, {
        message: 'Démarre le brainstorming pour cette feature. Propose-moi des idées et des questions à explorer basées sur le contexte de la story.',
        model: model || undefined,
      });
      // Open the conversation panel - it will reload and show the messages
      setShowConversation(true);
    } catch (err) {
      console.error('Failed to start brainstorming:', err);
      alert('Erreur lors du démarrage du brainstorming');
    }
    setStartingBrainstorm(false);
  };

  const colorClasses = {
    emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400' },
    blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' },
    amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400' },
    violet: { bg: 'bg-violet-500/10', border: 'border-violet-500/30', text: 'text-violet-400' },
    red: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400' },
    cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-400' },
    green: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400' },
    purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400' },
  };
  const colors = colorClasses[config.color] || colorClasses.violet;

  return React.createElement('div', {
    className: `rounded-xl border transition-all ${isSkipped ? 'bg-slate-800/30 border-slate-600 opacity-75' : isCompleted ? 'bg-slate-800/30 border-slate-700' : `${colors.bg} ${colors.border}`}`,
  },
    React.createElement('button', {
      onClick: () => setExpanded(!expanded),
      className: 'w-full flex items-center justify-between p-4 text-left',
    },
      React.createElement('div', { className: 'flex items-center gap-3' },
        React.createElement('span', { className: `text-2xl ${isSkipped ? 'grayscale' : ''}` }, isSkipped ? '⏭️' : config.icon),
        React.createElement('div', null,
          React.createElement('h3', { className: `font-semibold ${isSkipped ? 'text-slate-400 line-through' : 'text-slate-100'}` }, config.name),
          React.createElement('p', { className: 'text-xs text-slate-500' }, config.description)
        )
      ),
      React.createElement('div', { className: 'flex items-center gap-3' },
        readonly && React.createElement('span', { className: 'px-2 py-1 text-xs rounded-full bg-slate-700 text-slate-400' }, '👁 Read-only'),
        isSkipped && React.createElement('span', { className: 'px-2 py-1 text-xs rounded-full bg-slate-600/50 text-slate-400 border border-slate-500/30' }, '⏭️ Skipped'),
        !isSkipped && isCompleted && React.createElement('span', { className: 'px-2 py-1 text-xs rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' }, '✓ Done'),
        step.currentVersion > 0 && React.createElement('span', { className: 'text-xs text-slate-500' }, `v${step.currentVersion}`),
        // Token usage badge
        formattedTokens && React.createElement('span', {
          className: 'px-2 py-1 text-xs rounded-full bg-slate-700/50 text-slate-400 border border-slate-600/30',
          title: tokenUsage ? `Input: ${tokenUsage.input}, Output: ${tokenUsage.output}` : '',
        }, `🎯 ${formattedTokens}`),
        // Model used badge
        modelUsed && React.createElement('span', {
          className: 'px-2 py-1 text-xs rounded-full bg-slate-700/50 text-slate-500 border border-slate-600/30',
          title: `Ran with model: ${modelUsed}`,
        }, modelUsed),
        React.createElement('span', { className: `transition-transform ${expanded ? 'rotate-180' : ''}` }, '▼')
      )
    ),

    expanded && React.createElement('div', { className: 'px-4 pb-4 space-y-4' },
      hasContent && React.createElement('div', { className: 'bg-slate-900/50 rounded-lg overflow-hidden' },
        React.createElement('div', { className: 'flex items-center justify-between px-4 py-2 bg-slate-800/50 border-b border-slate-700' },
          React.createElement('div', { className: 'flex items-center gap-1 bg-slate-800 rounded-lg p-1' },
            React.createElement('button', {
              onClick: () => setViewMode('preview'),
              className: `px-3 py-1.5 text-xs rounded-lg transition-colors ${viewMode === 'preview' ? 'bg-violet-500/30 text-violet-300' : 'text-slate-400 hover:text-slate-200'}`,
            }, '👁 Preview'),
            !readonly && React.createElement('button', {
              onClick: () => setViewMode('edit'),
              className: `px-3 py-1.5 text-xs rounded-lg transition-colors ${viewMode === 'edit' ? 'bg-violet-500/30 text-violet-300' : 'text-slate-400 hover:text-slate-200'}`,
            }, '📝 Edit .md'),
            // Translate tab - only show if languages differ
            needsTranslation && React.createElement('button', {
              onClick: () => setViewMode('translate'),
              className: `px-3 py-1.5 text-xs rounded-lg transition-colors ${viewMode === 'translate' ? 'bg-sky-500/30 text-sky-300' : 'text-slate-400 hover:text-slate-200'}`,
            }, `🌐 ${langConfig.communication_language}`)
          ),
          React.createElement('div', { className: 'flex items-center gap-2' },
            dirty && React.createElement('span', { className: 'text-xs text-amber-400' }, '● unsaved'),
            // Unified Chat button
            React.createElement('button', {
              onClick: () => setShowConversation(!showConversation),
              className: `text-xs px-2 py-1 rounded transition-colors ${
                showConversation
                  ? 'bg-violet-500/30 text-violet-300 border border-violet-500/50'
                  : 'bg-violet-500/10 text-violet-400 border border-violet-500/30 hover:bg-violet-500/20'
              }`,
            }, showConversation ? '✕ Close' : '💬 Chat')
          )
        ),
        // Preview mode
        viewMode === 'preview' && React.createElement('pre', {
          className: 'p-4 text-sm text-slate-300 whitespace-pre-wrap max-h-96 overflow-y-auto font-mono',
        }, step.content),
        // Edit mode
        viewMode === 'edit' && !readonly && React.createElement('div', { className: 'p-4 space-y-3' },
          React.createElement('textarea', {
            value: editContent,
            onChange: (e) => { setEditContent(e.target.value); setDirty(true); },
            className: 'w-full h-80 bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-300 font-mono resize-y focus:border-violet-500 focus:outline-none',
            spellCheck: false,
          }),
          React.createElement('div', { className: 'flex items-center justify-end gap-2' },
            dirty && React.createElement('button', {
              onClick: () => { setEditContent(step.content || ''); setDirty(false); },
              className: 'px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200',
            }, 'Discard'),
            React.createElement('button', {
              onClick: handleSaveManual,
              disabled: saving || !dirty,
              className: 'px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm hover:bg-emerald-500/30 disabled:opacity-50 transition-colors',
            }, saving ? '⏳ Saving...' : '💾 Save')
          )
        ),
        // Translate mode
        viewMode === 'translate' && needsTranslation && React.createElement('div', { className: 'p-4 space-y-4' },
          // Info banner
          React.createElement('div', { className: 'bg-sky-500/10 border border-sky-500/30 rounded-lg p-3 flex items-center gap-3' },
            React.createElement('span', { className: 'text-sky-400' }, '🌐'),
            React.createElement('div', { className: 'flex-1' },
              React.createElement('span', { className: 'text-sm text-sky-300' },
                `${langConfig.document_output_language} → ${langConfig.communication_language}`
              )
            ),
            !translated && React.createElement('button', {
              onClick: handleTranslate,
              disabled: translating,
              className: 'px-4 py-2 bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-lg text-sm hover:bg-sky-500/30 disabled:opacity-50 transition-colors',
            }, translating ? '⏳ Translating...' : '🔄 Generate Translation'),
            translated && React.createElement('button', {
              onClick: handleTranslate,
              disabled: translating,
              className: 'px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200',
            }, translating ? '⏳...' : '↻ Refresh')
          ),
          // Translation content
          translating && React.createElement('div', { className: 'flex items-center justify-center gap-2 py-8' },
            React.createElement('div', { className: 'w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin' }),
            React.createElement('span', { className: 'text-slate-400' }, 'AI is translating...')
          ),
          !translating && translated && React.createElement('pre', {
            className: 'text-sm text-slate-300 whitespace-pre-wrap max-h-96 overflow-y-auto font-mono',
          }, translated),
          !translating && !translated && React.createElement('div', { className: 'text-center py-8' },
            React.createElement('p', { className: 'text-slate-500 mb-2' }, 'Click "Generate Translation" to translate the content.'),
            React.createElement('p', { className: 'text-xs text-slate-600' },
              `Document is in ${langConfig.document_output_language}, translation will be in ${langConfig.communication_language}.`
            )
          )
        )
      ),

      // Show ConversationPanel: for brainstorming always (chat-first), for others only with content
      showConversation && (hasContent || isBrainstorming || isReview) && React.createElement(ConversationPanel, {
        slug,
        stepName: stepKey,
        model,
        onModelChange: setModel,
        onContentUpdated: handleConversationUpdate,
      }),

      // Brainstorming: chat-first mode - show invite to chat, no Generate button
      isBrainstorming && !hasContent && React.createElement('div', {
        className: 'bg-gradient-to-r from-cyan-500/10 to-violet-500/10 rounded-lg p-6 border border-cyan-500/30',
      },
        React.createElement('div', { className: 'text-center' },
          React.createElement('div', { className: 'text-3xl mb-3' }, '💭'),
          React.createElement('h3', { className: 'text-lg font-semibold text-slate-200 mb-2' }, 'Brainstorming Mode'),
          React.createElement('p', { className: 'text-sm text-slate-400 mb-4' },
            'Start a conversation to explore ideas. The AI will help you brainstorm, ask questions, and identify edge cases.'
          )
        ),
        React.createElement('div', { className: 'flex items-center justify-center gap-4 mb-4' },
          React.createElement(ModelSelect, { model, onChange: setModel, disabled: startingBrainstorm }),
          !showConversation && React.createElement('button', {
            onClick: handleStartBrainstorming,
            disabled: startingBrainstorm,
            className: 'px-6 py-3 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-sm font-medium hover:bg-cyan-500/30 transition-colors disabled:opacity-50',
          }, startingBrainstorm ? '⏳ Démarrage...' : '💬 Start Brainstorming')
        ),
        React.createElement('p', { className: 'text-xs text-slate-500 text-center' },
          'When done, click "Save Summary" to generate the brainstorming.md summary.'
        )
      ),

      // Review: chat-first mode - show invite to start review, no Generate button
      isReview && !hasContent && React.createElement('div', {
        className: 'bg-gradient-to-r from-amber-500/10 to-red-500/10 rounded-lg p-6 border border-amber-500/30',
      },
        React.createElement('div', { className: 'text-center' },
          React.createElement('div', { className: 'text-3xl mb-3' }, '🔍'),
          React.createElement('h3', { className: 'text-lg font-semibold text-slate-200 mb-2' }, 'Code Review'),
          React.createElement('p', { className: 'text-sm text-slate-400 mb-4' },
            'Start a review session. The AI will analyze your implementation, identify issues, and give a verdict.'
          )
        ),
        React.createElement('div', { className: 'flex items-center justify-center gap-4 mb-4' },
          React.createElement(ModelSelect, { model, onChange: setModel }),
        ),
        React.createElement('p', { className: 'text-xs text-slate-500 text-center' },
          'The AI reviews automatically. Click "Apply to code" to apply suggested fixes.'
        )
      ),

      // Regular steps: Generate section (not for chat-first steps)
      !readonly && !isChatFirst && React.createElement('div', { className: 'space-y-4 bg-slate-800/50 rounded-lg p-4 border border-slate-700' },
        !hasContent && React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'flex items-center gap-2 text-sm text-slate-400 mb-2' },
            React.createElement('span', null, '✨ Generate'),
            React.createElement('span', { className: 'text-slate-600' }, '—'),
            React.createElement('span', null, 'Provide context and generate content')
          ),
          React.createElement(AttachmentZone, { slug, attachments: attachments || [], onUpdate: onStoryUpdate }),
          React.createElement('textarea', {
            value: description,
            onChange: e => setDescription(e.target.value),
            placeholder: 'Optional: add specific instructions for AI...',
            rows: 3,
            className: 'w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:border-violet-500 focus:outline-none resize-y',
            disabled: generating,
          })
        ),
        React.createElement('div', { className: 'flex items-center justify-between' },
          React.createElement(ModelSelect, { model, onChange: setModel, disabled: generating }),
          React.createElement('div', { className: 'flex items-center gap-2' },
            React.createElement('button', {
              onClick: () => setShowPreview(true),
              title: 'Preview assembled prompt',
              'aria-label': 'Preview assembled prompt',
              className: 'px-2 py-2 rounded-lg text-sm transition-colors bg-slate-700/50 text-slate-400 border border-slate-600 hover:text-slate-200 hover:bg-slate-700',
            }, '\uD83D\uDC41'),
            React.createElement('button', {
              onClick: () => {
                if (hasContent) {
                  if (confirm('⚠️ This will regenerate the content from scratch and overwrite your current content. Continue?')) {
                    handleGenerate();
                  }
                } else {
                  handleGenerate();
                }
              },
              disabled: generating,
              className: `px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                hasContent ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30' : `${colors.bg} ${colors.text} ${colors.border} border hover:brightness-110`
              }`,
            }, generating ? '⏳ Generating...' : (hasContent ? '⚠️ Regenerate' : `✨ Generate ${config.name}`)),
          )
        )
      ),

      // Skip/Restore button for skippable steps
      !readonly && isSkippable && !isCompleted && React.createElement('div', {
        className: 'flex items-center justify-end pt-2 border-t border-slate-700',
      },
        isSkipped
          ? React.createElement('button', {
              onClick: handleRestore,
              disabled: skipping,
              className: 'flex items-center gap-2 px-4 py-2 bg-slate-700/50 text-slate-300 border border-slate-600 rounded-lg text-sm hover:bg-slate-700 disabled:opacity-50 transition-colors',
            }, skipping ? '⏳ Restoring...' : '↩️ Restore step')
          : React.createElement('button', {
              onClick: handleSkip,
              disabled: skipping,
              className: 'flex items-center gap-2 px-4 py-2 bg-slate-700/50 text-slate-400 border border-slate-600 rounded-lg text-sm hover:bg-slate-700 hover:text-slate-200 disabled:opacity-50 transition-colors',
            }, skipping ? '⏳ Skipping...' : '⏭️ Skip this step')
      ),

      // Files used panel (shows context loaded during generation)
      (filesUsed || fileOperations.length > 0) && React.createElement(FilesUsedPanel, { filesUsed, fileOperations, expanded: false }),

      generating && React.createElement(StreamingPanel, { output }),

      // Prompt preview modal
      React.createElement(PromptPreviewModal, { isOpen: showPreview, onClose: () => setShowPreview(false), slug, step: apiStepKey }),
    )
  );
}

// ============== QA Actions ==============

// ============== Phase Selector ==============

function PhaseSelector({ story, onStoryUpdate }) {
  // Phase change is always allowed (administrative action, not content editing)
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  // Use static classes to ensure Tailwind includes them
  const phaseStyles = {
    discovery: {
      bg: 'bg-purple-500/20',
      bgHover: 'hover:bg-purple-500/30',
      text: 'text-purple-400',
      border: 'border-purple-500/30',
    },
    development: {
      bg: 'bg-violet-500/20',
      bgHover: 'hover:bg-violet-500/30',
      text: 'text-violet-400',
      border: 'border-violet-500/30',
    },
    qa: {
      bg: 'bg-sky-500/20',
      bgHover: 'hover:bg-sky-500/30',
      text: 'text-sky-400',
      border: 'border-sky-500/30',
    },
    done: {
      bg: 'bg-emerald-500/20',
      bgHover: 'hover:bg-emerald-500/30',
      text: 'text-emerald-400',
      border: 'border-emerald-500/30',
    },
  };

  const phases = [
    { value: 'discovery', label: 'Discovery', icon: '🔍' },
    { value: 'development', label: 'Development', icon: '🚀' },
    { value: 'qa', label: 'QA', icon: '✅' },
    { value: 'done', label: 'Done', icon: '🎉' },
  ];

  const currentPhase = phases.find(p => p.value === story.phase) || phases[0];
  const currentStyle = phaseStyles[currentPhase.value] || phaseStyles.discovery;

  const handlePhaseChange = async (newPhase) => {
    if (newPhase === story.phase) {
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      await api.patch(`/stories/${story.slug || story.id}/status`, { phase: newPhase });
      onStoryUpdate(await api.get(`/stories/${story.slug || story.id}`));
    } catch (e) {
      alert(e.message);
    }
    setLoading(false);
    setOpen(false);
  };

  return React.createElement('div', { className: 'relative' },
    React.createElement('button', {
      onClick: () => setOpen(!open),
      disabled: loading,
      className: `px-3 py-1 text-xs font-medium rounded-full ${currentStyle.bg} ${currentStyle.text} border ${currentStyle.border} ${currentStyle.bgHover} transition-colors flex items-center gap-1.5 disabled:opacity-50`,
    },
      loading ? '⏳' : currentPhase.icon,
      currentPhase.label,
      React.createElement('span', { className: 'text-[10px] opacity-60' }, '▼')
    ),
    open && React.createElement(React.Fragment, null,
      React.createElement('div', {
        className: 'fixed inset-0 z-40',
        onClick: () => setOpen(false),
      }),
      React.createElement('div', {
        className: 'absolute top-full left-0 mt-1 py-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl min-w-[160px] z-50',
      },
        ...phases.map(phase => {
          const style = phaseStyles[phase.value];
          const isActive = phase.value === story.phase;
          return React.createElement('button', {
            key: phase.value,
            onClick: () => handlePhaseChange(phase.value),
            className: `w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
              isActive ? `${style.bg} ${style.text}` : 'text-slate-300 hover:bg-slate-700/50'
            }`,
          },
            React.createElement('span', null, phase.icon),
            phase.label,
            isActive && React.createElement('span', { className: 'ml-auto text-xs' }, '✓')
          );
        })
      )
    )
  );
}

// ============== Apps Scope Selector ==============

function AppsScopeSelector({ story, onStoryUpdate, readonly = false }) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [availableApps, setAvailableApps] = React.useState([]);
  const [selectedApps, setSelectedApps] = React.useState(story.apps || []);
  // F8: Track pending request to prevent race conditions
  const pendingRef = React.useRef(null);

  // F12: Load available apps with cleanup to prevent memory leak
  React.useEffect(() => {
    let cancelled = false;
    api.get('/apps')
      .then(apps => {
        if (!cancelled) {
          setAvailableApps(apps.filter(a => a.enabled !== false));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableApps([]);
        }
      });
    return () => { cancelled = true; };
  }, []);

  // Sync with story when it updates
  React.useEffect(() => {
    setSelectedApps(story.apps || []);
  }, [story.apps]);

  // F13: Get valid story identifier
  const getStoryId = () => {
    const id = story.slug || story.id;
    if (!id || typeof id !== 'string') {
      console.error('Invalid story identifier');
      return null;
    }
    return id;
  };

  const updateApps = async (newApps) => {
    const storyId = getStoryId();
    if (!storyId) return;

    // F8: Cancel previous pending request logic
    const requestId = Date.now();
    pendingRef.current = requestId;

    setLoading(true);
    setError(null);
    try {
      await api.patch(`/stories/${storyId}/apps`, { apps: newApps });
      // F8: Only update state if this is still the latest request
      if (pendingRef.current === requestId) {
        setSelectedApps(newApps);
        if (onStoryUpdate) {
          onStoryUpdate({ ...story, apps: newApps });
        }
      }
    } catch (e) {
      // F7: Show user feedback on error
      if (pendingRef.current === requestId) {
        setError('Failed to update apps');
        console.error('Failed to update apps:', e);
        // Revert to server state
        setSelectedApps(story.apps || []);
      }
    }
    if (pendingRef.current === requestId) {
      setLoading(false);
    }
  };

  const handleToggleApp = (appName) => {
    const newApps = selectedApps.includes(appName)
      ? selectedApps.filter(a => a !== appName)
      : [...selectedApps, appName];
    updateApps(newApps);
  };

  const handleRemoveApp = (appName) => {
    const newApps = selectedApps.filter(a => a !== appName);
    updateApps(newApps);
  };

  // Find app info (for icon)
  const getAppInfo = (appName) => availableApps.find(a => a.name === appName);

  // Apps not yet selected
  const unselectedApps = availableApps.filter(a => !selectedApps.includes(a.name));

  if (readonly && selectedApps.length === 0) return null;

  return React.createElement('div', { className: 'flex items-center gap-1.5 flex-wrap' },
    // F7: Show error message if any
    error && React.createElement('span', {
      className: 'text-xs text-red-400 px-2 py-0.5 bg-red-500/10 rounded',
      onClick: () => setError(null),
      title: 'Click to dismiss',
    }, error),
    // Selected apps as chips
    ...selectedApps.map(appName => {
      const appInfo = getAppInfo(appName);
      return React.createElement('span', {
        key: appName,
        className: 'inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
      },
        appInfo?.icon || '📦',
        appName,
        !readonly && React.createElement('button', {
          onClick: () => handleRemoveApp(appName),
          disabled: loading,
          className: 'ml-0.5 hover:text-red-400 transition-colors disabled:opacity-50',
          title: `Remove ${appName}`,
        }, '×')
      );
    }),
    // Add button (dropdown)
    !readonly && unselectedApps.length > 0 && React.createElement('div', { className: 'relative' },
      React.createElement('button', {
        onClick: () => setOpen(!open),
        disabled: loading,
        className: 'inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-slate-700/50 text-slate-400 border border-slate-600/30 hover:bg-slate-700 hover:text-slate-300 transition-colors disabled:opacity-50',
        title: 'Add app to scope',
      }, '+', 'App'),
      open && React.createElement(React.Fragment, null,
        React.createElement('div', {
          className: 'fixed inset-0 z-40',
          onClick: () => setOpen(false),
        }),
        React.createElement('div', {
          className: 'absolute top-full left-0 mt-1 py-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl min-w-[140px] z-50',
        },
          ...unselectedApps.map(app =>
            React.createElement('button', {
              key: app.name,
              onClick: () => { handleToggleApp(app.name); setOpen(false); },
              className: 'w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 text-slate-300 hover:bg-slate-700/50 transition-colors',
            },
              React.createElement('span', null, app.icon || '📦'),
              app.name
            )
          )
        )
      )
    ),
    // Show placeholder if no apps and not readonly
    !readonly && selectedApps.length === 0 && unselectedApps.length === 0 && React.createElement('span', {
      className: 'text-xs text-slate-500 italic',
    }, 'No apps configured')
  );
}

// ============== QA Rejection Alert (Dev view) ==============

function QARejectionAlert({ story, onStoryUpdate }) {
  const [loading, setLoading] = React.useState(false);

  const handleResendToQA = async () => {
    if (!confirm('Renvoyer cette story en QA pour re-test ?')) return;
    setLoading(true);
    try {
      await api.post(`/stories/${story.slug}/resend-to-qa`);
      onStoryUpdate(await api.get(`/stories/${story.slug}`));
    } catch (e) {
      alert(e.message);
    }
    setLoading(false);
  };

  return React.createElement('div', {
    className: 'bg-red-500/10 border border-red-500/30 rounded-xl p-6 space-y-4',
  },
    React.createElement('div', { className: 'flex items-center gap-3' },
      React.createElement('span', { className: 'text-2xl' }, '🔴'),
      React.createElement('div', null,
        React.createElement('h3', { className: 'text-lg font-semibold text-red-400' }, 'QA Rejected'),
        React.createElement('p', { className: 'text-sm text-slate-400' }, 'Cette story a été rejetée par la QA et nécessite des corrections')
      )
    ),
    story.qaRejectionReason && React.createElement('div', {
      className: 'bg-slate-900/50 rounded-lg p-4 border border-slate-700',
    },
      React.createElement('p', { className: 'text-sm text-slate-300 whitespace-pre-wrap' }, story.qaRejectionReason)
    ),
    // Show recent QA history
    story.qaHistory && story.qaHistory.length > 0 && React.createElement('div', {
      className: 'text-xs text-slate-500 pt-2 border-t border-red-500/20',
    },
      `Dernier rejet: ${new Date(story.qaHistory[story.qaHistory.length - 1]?.performedAt).toLocaleString('fr-FR')}`
    ),
    // Resend to QA button
    React.createElement('button', {
      onClick: handleResendToQA,
      disabled: loading,
      className: 'w-full px-4 py-3 bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-lg text-sm font-medium hover:bg-sky-500/30 disabled:opacity-50 transition-colors flex items-center justify-center gap-2',
    },
      loading ? '⏳ Envoi en cours...' : '✅ Corrections terminées - Renvoyer en QA'
    )
  );
}

// ============== Product Actions (Phase transitions) ==============

function ProductActions({ story, onStoryUpdate }) {
  const [loading, setLoading] = React.useState(false);
  const [canPromote, setCanPromote] = React.useState(null);
  const [missingSteps, setMissingSteps] = React.useState([]);

  // Check if story can be promoted
  React.useEffect(() => {
    api.get(`/stories/${story.slug || story.id}/can-promote`)
      .then(data => {
        setCanPromote(data.canPromote);
        setMissingSteps(data.missingSteps || []);
      })
      .catch(() => setCanPromote(false));
  }, [story]);

  const handleSendToDev = async () => {
    if (!confirm('Send this story to Development? Developers will be able to start working on it.')) return;
    setLoading(true);
    try {
      await api.post(`/stories/${story.slug || story.id}/promote`);
      onStoryUpdate(await api.get(`/stories/${story.slug || story.id}`));
    } catch (e) {
      alert(e.message);
    }
    setLoading(false);
  };

  // Only show for discovery phase
  if (story.phase !== 'discovery') return null;

  const stepLabels = {
    'brief': 'Brief',
    'ba-spec': 'BA Spec',
    'questions': 'Questions'
  };

  return React.createElement('div', { className: 'bg-violet-500/10 border border-violet-500/30 rounded-xl p-6 space-y-4' },
    React.createElement('div', { className: 'flex items-center gap-3' },
      React.createElement('span', { className: 'text-2xl' }, '🚀'),
      React.createElement('div', null,
        React.createElement('h3', { className: 'text-lg font-semibold text-slate-100' }, 'Send to Development'),
        React.createElement('p', { className: 'text-sm text-slate-400' }, 'Once discovery is complete, send the story to developers')
      )
    ),

    // Loading state
    canPromote === null && React.createElement('div', { className: 'text-sm text-slate-400' }, 'Checking requirements...'),

    // Can promote
    canPromote === true && React.createElement('button', {
      onClick: handleSendToDev,
      disabled: loading,
      className: 'w-full px-4 py-3 bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded-lg text-sm font-medium hover:bg-violet-500/30 disabled:opacity-50 transition-colors flex items-center justify-center gap-2',
    }, loading ? '⏳ Processing...' : '🚀 Send to Dev Team'),

    // Cannot promote - missing steps
    canPromote === false && missingSteps.length > 0 && React.createElement('div', { className: 'space-y-2' },
      React.createElement('div', { className: 'flex items-center gap-2 text-amber-400' },
        React.createElement('span', null, '⚠️'),
        React.createElement('span', { className: 'text-sm' }, 'Complete these steps first:')
      ),
      React.createElement('div', { className: 'flex flex-wrap gap-2' },
        ...missingSteps.map(step =>
          React.createElement('span', {
            key: step,
            className: 'px-3 py-1 text-xs rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30'
          }, stepLabels[step] || step)
        )
      )
    )
  );
}

// ============== QA Checklist Component ==============

/**
 * Parse a test case ID from text (e.g., "TC-001", "TC-SEC-001")
 */
function parseTestCaseId(text) {
  const match = text.match(/\*?\*?(TC-[\w-]+)\*?\*?/);
  return match ? match[1] : null;
}

/**
 * Parse priority emoji from text
 */
function parsePriorityFromText(text) {
  if (text.includes('🔴')) return { emoji: '🔴', label: 'Critical', color: 'red' };
  if (text.includes('🟠')) return { emoji: '🟠', label: 'High', color: 'orange' };
  if (text.includes('🟡')) return { emoji: '🟡', label: 'Medium', color: 'yellow' };
  if (text.includes('🟢')) return { emoji: '🟢', label: 'Low', color: 'green' };
  return null;
}

/**
 * Clean test title by removing ID, priority emoji, markdown formatting, and brackets
 */
function cleanTestTitle(text) {
  return text
    .replace(/\*?\*?\[?TC-[\w-]+\]?\*?\*?:?\s*/g, '') // Remove TC ID (with or without brackets)
    .replace(/\[\]\s*/g, '') // Remove empty brackets
    .replace(/[🔴🟠🟡🟢]\s*/g, '') // Remove priority emojis
    .replace(/\*\*/g, '') // Remove bold markers
    .trim();
}

function QAChecklist({ slug, content, onUpdate }) {
  const [items, setItems] = React.useState([]);
  const [updating, setUpdating] = React.useState(null);
  const [expandedItems, setExpandedItems] = React.useState(new Set());
  const [filter, setFilter] = React.useState('all'); // 'all', 'unchecked', 'checked'
  const [priorityFilter, setPriorityFilter] = React.useState('all'); // 'all', 'critical', 'high', 'medium', 'low'

  // Parse the QA plan markdown into checkable items with rich metadata
  React.useEffect(() => {
    if (!content) {
      setItems([]);
      return;
    }

    const lines = content.split('\n');
    const parsed = [];
    let currentSectionHeader = '';
    let currentSectionIcon = '';
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Detect section headers (## Title or ## 🔐 Title)
      if (line.startsWith('## ')) {
        const sectionMatch = line.match(/^##\s*([🔐🎯🔌🖥️⚠️🧪✅]*)\s*(.+)$/);
        if (sectionMatch) {
          currentSectionIcon = sectionMatch[1] || '';
          currentSectionHeader = sectionMatch[2].trim();
        } else {
          currentSectionHeader = line.replace('## ', '').trim();
          currentSectionIcon = '';
        }
        i++;
        continue;
      }

      // Parse checkbox items - support multiple formats
      let checkboxMatch = null;
      let indent = 0;

      // Format 1: List style "- [ ] text" or "- [x] text"
      checkboxMatch = line.match(/^(\s*)-\s*\[([ xX~-])\]\s*(.+)$/);

      if (!checkboxMatch) {
        // Format 2: Header style "### [ ] TC-001: text"
        checkboxMatch = line.match(/^(#{1,3})\s*\[([ xX~-])\]\s*(.+)$/);
      }

      if (!checkboxMatch) {
        // Format 3: Plain checkbox "[ ] text" (compact/checklist)
        checkboxMatch = line.match(/^(\s*)\[([ xX~-])\]\s*(.+)$/);
      }

      if (checkboxMatch) {
        const prefix = checkboxMatch[1] || '';
        indent = prefix.replace(/#/g, '').length;
        const checkMark = checkboxMatch[2].toLowerCase();
        const checked = checkMark === 'x';
        const blocked = checkMark === '~';
        const skipped = checkMark === '-';
        const text = checkboxMatch[3].trim();

        // Extract metadata from text
        const testId = parseTestCaseId(text);
        const priority = parsePriorityFromText(text);
        const cleanTitle = cleanTestTitle(text);

        // Look ahead for description, preconditions, steps, expected result (detailed format)
        let description = '';
        let preconditions = [];
        let steps = [];
        let expectedResult = '';
        let tags = [];
        let j = i + 1;
        let currentSection = null; // 'preconditions', 'steps', 'expected'

        // Parse following lines for additional details
        while (j < lines.length) {
          const nextLine = lines[j];

          // Stop if we hit another checkbox, separator, or section header
          if (nextLine.match(/^\s*-?\s*\[([ xX~-])\]/) || nextLine.startsWith('## ') || nextLine.startsWith('### [') || nextLine.startsWith('### ')) {
            break;
          }

          // Handle separator (end of current test case)
          if (nextLine.trim() === '---') {
            j++;
            break;
          }

          // Detect section markers (support both plain and bullet point formats)
          // Format 1: **Preconditions:** or Preconditions:
          // Format 2: - **Preconditions**: (bullet point with bold)
          const precondMatch = nextLine.match(/^\s*-?\s*\*\*Preconditions?:?\*\*:?\s*(.*)$/i) || nextLine.match(/^Preconditions?:\s*(.*)$/i);
          if (precondMatch) {
            currentSection = 'preconditions';
            const sameLineContent = precondMatch[1]?.trim();
            if (sameLineContent) {
              preconditions.push(sameLineContent);
            }
            j++;
            continue;
          }

          const stepsMatch = nextLine.match(/^\s*-?\s*\*\*Steps?:?\*\*:?\s*$/i) || nextLine.match(/^Steps?:\s*$/i);
          if (stepsMatch) {
            currentSection = 'steps';
            j++;
            continue;
          }

          const expectedMatch = nextLine.match(/^\s*-?\s*\*\*Expected Results?:?\*\*:?\s*(.*)$/i) || nextLine.match(/^Expected Results?:\s*(.*)$/i);
          if (expectedMatch) {
            currentSection = 'expected';
            const sameLineContent = expectedMatch[1]?.trim();
            if (sameLineContent) {
              expectedResult = sameLineContent;
            }
            j++;
            continue;
          }

          // Handle content based on current section
          if (currentSection === 'preconditions') {
            // Parse bullet points or plain lines
            const bulletMatch = nextLine.match(/^\s*[-*]\s*(.+)$/);
            if (bulletMatch) {
              // Skip if it's another section marker (like "- **Steps**:")
              if (!bulletMatch[1].match(/^\*\*(Description|Preconditions?|Steps?|Expected Results?|Tags):?\*\*/i)) {
                preconditions.push(bulletMatch[1].trim());
              }
            } else if (nextLine.trim() && !nextLine.startsWith('**') && !nextLine.match(/^\s*-\s*\*\*/)) {
              preconditions.push(nextLine.trim());
            }
          } else if (currentSection === 'steps') {
            // Parse numbered steps (both indented and non-indented)
            const stepMatch = nextLine.match(/^\s*(\d+)\.\s*(.+)$/);
            if (stepMatch) {
              steps.push(stepMatch[2].trim());
            }
          } else if (currentSection === 'expected') {
            // Continue appending to expected result (skip other section markers)
            if (nextLine.trim() && !nextLine.startsWith('**') && !nextLine.match(/^\s*-\s*\*\*/)) {
              expectedResult = expectedResult ? expectedResult + ' ' + nextLine.trim() : nextLine.trim();
            }
          } else {
            // Parse other markers (support both plain and bullet point formats)
            // Format: **Description**: or - **Description**:
            const descMatch = nextLine.match(/^\s*-?\s*\*\*Description:?\*\*:?\s*(.*)$/i);
            const tagsMatch = nextLine.match(/^\s*-?\s*\*\*Tags:?\*\*:?\s*(.*)$/i);
            const priorityMatch = nextLine.match(/^\s*-?\s*\*\*Priority:?\*\*/i);

            if (priorityMatch) {
              // Skip priority line
            } else if (descMatch) {
              description = descMatch[1]?.trim() || '';
            } else if (tagsMatch) {
              const tagContent = tagsMatch[1] || nextLine;
              const tagMatches = tagContent.match(/`([^`]+)`/g);
              if (tagMatches) {
                tags = tagMatches.map(t => t.replace(/`/g, ''));
              }
            } else if (!description && nextLine.trim() && !nextLine.startsWith('**') && !nextLine.match(/^\s*-\s*\*\*/) && nextLine.trim() !== '') {
              // First non-marker line after title = description
              description = nextLine.trim();
            }
          }

          j++;
        }

        parsed.push({
          lineIndex: i,
          indent,
          checked,
          blocked,
          skipped,
          text,
          testId,
          priority,
          cleanTitle,
          description,
          preconditions,
          steps,
          expectedResult,
          tags,
          section: currentSectionHeader,
          sectionIcon: currentSectionIcon,
          originalLine: line,
        });

        i++;
        continue;
      }

      i++;
    }

    setItems(parsed);
  }, [content]);

  const handleToggle = async (item) => {
    setUpdating(item.lineIndex);
    try {
      await api.put(`/stories/${slug}/qa-plan/toggle`, {
        lineIndex: item.lineIndex,
        checked: !item.checked,
      });
      // Reload the QA plan
      const data = await api.get(`/stories/${slug}/qa-plan`);
      if (data.exists) {
        onUpdate(data.content);
      }
    } catch (e) {
      console.error('Failed to toggle checkbox:', e);
      // Don't show alert for non-checkbox lines
    }
    setUpdating(null);
  };

  const toggleExpanded = (lineIndex) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(lineIndex)) {
        next.delete(lineIndex);
      } else {
        next.add(lineIndex);
      }
      return next;
    });
  };

  if (items.length === 0) {
    return React.createElement('p', { className: 'text-sm text-slate-500 italic' }, 'No test cases found in QA plan.');
  }

  // Filter items
  const filteredItems = items.filter(item => {
    // Status filter
    if (filter === 'unchecked' && item.checked) return false;
    if (filter === 'checked' && !item.checked) return false;

    // Priority filter
    if (priorityFilter !== 'all') {
      const priorityMap = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' };
      if (!item.priority || item.priority.emoji !== priorityMap[priorityFilter]) return false;
    }

    return true;
  });

  // Group items by section
  const sections = {};
  filteredItems.forEach(item => {
    const sectionKey = item.section || 'Other';
    if (!sections[sectionKey]) {
      sections[sectionKey] = { items: [], icon: item.sectionIcon };
    }
    sections[sectionKey].items.push(item);
  });

  // Calculate progress
  const totalChecked = items.filter(i => i.checked).length;
  const totalItems = items.length;
  const progressPercent = totalItems > 0 ? Math.round((totalChecked / totalItems) * 100) : 0;

  // Priority stats
  const priorityStats = {
    critical: { total: 0, done: 0 },
    high: { total: 0, done: 0 },
    medium: { total: 0, done: 0 },
    low: { total: 0, done: 0 },
  };
  items.forEach(item => {
    if (item.priority) {
      const key = item.priority.label.toLowerCase();
      if (priorityStats[key]) {
        priorityStats[key].total++;
        if (item.checked) priorityStats[key].done++;
      }
    }
  });

  return React.createElement('div', { className: 'space-y-4' },
    // Progress section with stats
    React.createElement('div', { className: 'bg-slate-800 rounded-lg p-4 space-y-3' },
      // Main progress
      React.createElement('div', { className: 'flex items-center justify-between' },
        React.createElement('span', { className: 'text-sm font-medium text-slate-200' }, '📊 Test Progress'),
        React.createElement('span', { className: 'text-lg font-bold text-emerald-400' }, `${totalChecked}/${totalItems}`)
      ),
      React.createElement('div', { className: 'w-full h-3 bg-slate-700 rounded-full overflow-hidden' },
        React.createElement('div', {
          className: `h-full transition-all duration-500 ${progressPercent === 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-cyan-500 to-emerald-500'}`,
          style: { width: `${progressPercent}%` },
        })
      ),

      // Priority breakdown
      React.createElement('div', { className: 'flex flex-wrap gap-2 pt-2' },
        priorityStats.critical.total > 0 && React.createElement('span', {
          className: `px-2 py-1 text-xs rounded-full ${priorityStats.critical.done === priorityStats.critical.total ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`,
        }, `🔴 ${priorityStats.critical.done}/${priorityStats.critical.total}`),
        priorityStats.high.total > 0 && React.createElement('span', {
          className: `px-2 py-1 text-xs rounded-full ${priorityStats.high.done === priorityStats.high.total ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400'}`,
        }, `🟠 ${priorityStats.high.done}/${priorityStats.high.total}`),
        priorityStats.medium.total > 0 && React.createElement('span', {
          className: `px-2 py-1 text-xs rounded-full ${priorityStats.medium.done === priorityStats.medium.total ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'}`,
        }, `🟡 ${priorityStats.medium.done}/${priorityStats.medium.total}`),
        priorityStats.low.total > 0 && React.createElement('span', {
          className: `px-2 py-1 text-xs rounded-full ${priorityStats.low.done === priorityStats.low.total ? 'bg-emerald-500/20 text-emerald-400' : 'bg-green-500/20 text-green-400'}`,
        }, `🟢 ${priorityStats.low.done}/${priorityStats.low.total}`)
      )
    ),

    // Filters
    React.createElement('div', { className: 'flex flex-wrap items-center gap-2' },
      React.createElement('span', { className: 'text-xs text-slate-500' }, 'Filter:'),
      React.createElement('div', { className: 'flex gap-1' },
        ['all', 'unchecked', 'checked'].map(f =>
          React.createElement('button', {
            key: f,
            onClick: () => setFilter(f),
            className: `px-2 py-1 text-xs rounded transition-colors ${filter === f ? 'bg-violet-500/30 text-violet-300' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`,
          }, f === 'all' ? 'All' : f === 'unchecked' ? '⬜ Todo' : '✅ Done')
        )
      ),
      React.createElement('span', { className: 'text-slate-700' }, '|'),
      React.createElement('div', { className: 'flex gap-1' },
        ['all', 'critical', 'high', 'medium', 'low'].map(p =>
          React.createElement('button', {
            key: p,
            onClick: () => setPriorityFilter(p),
            className: `px-2 py-1 text-xs rounded transition-colors ${priorityFilter === p ? 'bg-violet-500/30 text-violet-300' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`,
          }, p === 'all' ? 'All' : p === 'critical' ? '🔴' : p === 'high' ? '🟠' : p === 'medium' ? '🟡' : '🟢')
        )
      )
    ),

    // Sections with test cards
    React.createElement('div', { className: 'space-y-6 max-h-[600px] overflow-y-auto pr-2' },
      ...Object.entries(sections).map(([sectionName, sectionData]) => {
        const sectionChecked = sectionData.items.filter(i => i.checked).length;
        const sectionTotal = sectionData.items.length;

        return React.createElement('div', { key: sectionName, className: 'space-y-3 pb-4 border-b border-slate-800 last:border-b-0' },
          // Section header
          React.createElement('div', { className: 'flex items-center justify-between sticky top-0 bg-slate-900 px-4 py-3 z-10 border-b border-slate-700 rounded-t-lg' },
            React.createElement('h4', { className: 'text-sm font-semibold text-slate-200 flex items-center gap-2' },
              sectionData.icon && React.createElement('span', null, sectionData.icon),
              sectionName
            ),
            React.createElement('span', {
              className: `text-xs px-2 py-0.5 rounded-full ${sectionChecked === sectionTotal ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`,
            }, `${sectionChecked}/${sectionTotal}`)
          ),

          // Test cards with spacing
          React.createElement('div', { className: 'space-y-3' },
          ...sectionData.items.map(item => {
            const isExpanded = expandedItems.has(item.lineIndex);
            const hasDetails = item.description || (item.preconditions && item.preconditions.length > 0) || item.steps.length > 0 || item.expectedResult;

            return React.createElement('div', {
              key: item.lineIndex,
              className: `rounded-lg border transition-all ${
                item.checked
                  ? 'bg-emerald-500/5 border-emerald-500/20'
                  : item.blocked
                    ? 'bg-amber-500/5 border-amber-500/20'
                    : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
              }`,
            },
              // Card header
              React.createElement('div', {
                className: 'flex items-start gap-3 p-3 cursor-pointer',
                onClick: () => hasDetails && toggleExpanded(item.lineIndex),
              },
                // Checkbox
                React.createElement('input', {
                  type: 'checkbox',
                  checked: item.checked,
                  onChange: (e) => { e.stopPropagation(); handleToggle(item); },
                  disabled: updating === item.lineIndex,
                  className: 'mt-1 w-4 h-4 rounded border-slate-600 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900 cursor-pointer',
                }),

                // Content
                React.createElement('div', { className: 'flex-1 min-w-0' },
                  // Title line
                  React.createElement('div', { className: 'flex items-center gap-2 flex-wrap' },
                    item.testId && React.createElement('span', {
                      className: 'text-xs font-mono px-1.5 py-0.5 rounded bg-slate-700 text-slate-300',
                    }, item.testId),
                    item.priority && React.createElement('span', { className: 'text-sm' }, item.priority.emoji),
                    React.createElement('span', {
                      className: `text-sm font-medium ${item.checked ? 'text-slate-500 line-through' : 'text-slate-200'}`,
                    }, item.cleanTitle || item.text)
                  ),

                  // Preview of description if collapsed
                  !isExpanded && item.description && React.createElement('p', {
                    className: 'text-xs text-slate-500 mt-1 truncate',
                  }, item.description)
                ),

                // Expand indicator
                hasDetails && React.createElement('span', {
                  className: `text-slate-500 text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}`,
                }, '▼'),

                // Loading indicator
                updating === item.lineIndex && React.createElement('span', { className: 'text-xs text-slate-500' }, '⏳')
              ),

              // Expanded details
              isExpanded && hasDetails && React.createElement('div', {
                className: 'px-4 pb-5 pt-2 ml-7 space-y-4 border-t border-slate-700/50 mt-2 bg-slate-800/30 rounded-b-lg',
              },
                // Description (with subtle card style)
                item.description && React.createElement('div', {
                  className: 'pt-3 pb-2 px-3 bg-slate-700/20 rounded-lg border-l-2 border-slate-500'
                },
                  React.createElement('p', { className: 'text-sm text-slate-300 leading-relaxed' }, item.description)
                ),

                // Preconditions (amber theme)
                item.preconditions && item.preconditions.length > 0 && React.createElement('div', {
                  className: 'bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 shadow-sm',
                },
                  React.createElement('div', { className: 'flex items-center gap-2 mb-3' },
                    React.createElement('span', { className: 'text-lg' }, '⚡'),
                    React.createElement('span', { className: 'text-sm font-semibold text-amber-300' }, 'Préconditions')
                  ),
                  React.createElement('ul', { className: 'space-y-2 ml-2' },
                    ...item.preconditions.map((precond, idx) =>
                      React.createElement('li', {
                        key: idx,
                        className: 'text-sm text-slate-300 flex items-start gap-2',
                      },
                        React.createElement('span', { className: 'text-amber-400 mt-1' }, '•'),
                        React.createElement('span', null, precond)
                      )
                    )
                  )
                ),

                // Steps (cyan theme with numbered badges)
                item.steps.length > 0 && React.createElement('div', {
                  className: 'bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4 shadow-sm',
                },
                  React.createElement('div', { className: 'flex items-center gap-2 mb-3' },
                    React.createElement('span', { className: 'text-lg' }, '📝'),
                    React.createElement('span', { className: 'text-sm font-semibold text-cyan-300' }, 'Étapes à suivre')
                  ),
                  React.createElement('ol', { className: 'space-y-3 ml-1' },
                    ...item.steps.map((step, idx) =>
                      React.createElement('li', {
                        key: idx,
                        className: 'flex items-start gap-3',
                      },
                        React.createElement('span', {
                          className: 'flex-shrink-0 w-6 h-6 bg-cyan-500/20 text-cyan-300 rounded-full flex items-center justify-center text-xs font-bold'
                        }, idx + 1),
                        React.createElement('span', { className: 'text-sm text-slate-300 pt-0.5' }, step)
                      )
                    )
                  )
                ),

                // Expected result (emerald theme)
                item.expectedResult && React.createElement('div', {
                  className: 'bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 shadow-sm',
                },
                  React.createElement('div', { className: 'flex items-center gap-2 mb-3' },
                    React.createElement('span', { className: 'text-lg' }, '✅'),
                    React.createElement('span', { className: 'text-sm font-semibold text-emerald-300' }, 'Résultat attendu')
                  ),
                  React.createElement('p', { className: 'text-sm text-slate-300 leading-relaxed ml-1' }, item.expectedResult)
                ),

                // Tags (improved style)
                item.tags.length > 0 && React.createElement('div', { className: 'flex flex-wrap gap-2 pt-2' },
                  React.createElement('span', { className: 'text-xs text-slate-500' }, '🏷️'),
                  ...item.tags.map(tag =>
                    React.createElement('span', {
                      key: tag,
                      className: 'px-2 py-1 text-xs rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30',
                    }, tag)
                  )
                )
              )
            );
          }))
        );
      })
    )
  );
}

// ============== QA Profile Modal ==============

const QA_PROFILES_UI = {
  product: {
    name: 'Produit',
    description: 'Tests UI, fonctionnels, UX',
    icon: '👤',
    recommended: true,
  },
  api: {
    name: 'API',
    description: 'Endpoints, validation, erreurs',
    icon: '🔌',
  },
  security: {
    name: 'Sécurité',
    description: 'XSS, CSRF, injections',
    icon: '🔒',
  },
  full: {
    name: 'Complet',
    description: 'Tous les types de tests',
    icon: '📦',
  },
};

const QA_CATEGORIES_UI = {
  ui: { name: 'Interface utilisateur', icon: '🖥️' },
  functional: { name: 'Fonctionnel', icon: '⚙️' },
  api: { name: 'API', icon: '🔌' },
  security: { name: 'Sécurité', icon: '🔒' },
  'edge-cases': { name: 'Cas limites', icon: '⚠️' },
  validation: { name: 'Validation', icon: '✅' },
};

function QAProfileModal({ isOpen, onClose, onGenerate, generating }) {
  const [selectedProfile, setSelectedProfile] = React.useState('product');
  const [customCategories, setCustomCategories] = React.useState([]);
  const [selectedModel, setSelectedModel] = React.useState('');

  const isCustom = selectedProfile === 'custom';

  const toggleCategory = (cat) => {
    setCustomCategories(prev =>
      prev.includes(cat)
        ? prev.filter(c => c !== cat)
        : [...prev, cat]
    );
  };

  const handleGenerate = () => {
    onGenerate({
      profile: isCustom ? null : selectedProfile,
      categories: isCustom ? customCategories : null,
      model: selectedModel || undefined,
    });
  };

  if (!isOpen) return null;

  return React.createElement('div', {
    className: 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4',
    onClick: (e) => e.target === e.currentTarget && !generating && onClose(),
  },
    React.createElement('div', {
      className: 'bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full overflow-hidden',
    },
      // Header
      React.createElement('div', { className: 'px-6 py-4 border-b border-slate-700 flex items-center justify-between' },
        React.createElement('div', { className: 'flex items-center gap-3' },
          React.createElement('span', { className: 'text-2xl' }, '🧪'),
          React.createElement('h2', { className: 'text-lg font-semibold text-slate-100' }, 'Générer le plan de QA')
        ),
        !generating && React.createElement('button', {
          onClick: onClose,
          className: 'text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors',
        }, '✕')
      ),

      // Content
      React.createElement('div', { className: 'p-6 space-y-4 max-h-[60vh] overflow-y-auto' },
        // Profile selection
        React.createElement('div', { className: 'space-y-2' },
          ...Object.entries(QA_PROFILES_UI).map(([key, profile]) =>
            React.createElement('label', {
              key,
              className: `flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                selectedProfile === key
                  ? 'bg-violet-500/20 border-violet-500/50 ring-1 ring-violet-500/30'
                  : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
              }`,
              onClick: () => setSelectedProfile(key),
            },
              React.createElement('input', {
                type: 'radio',
                name: 'qaProfile',
                value: key,
                checked: selectedProfile === key,
                onChange: () => setSelectedProfile(key),
                className: 'mt-1 text-violet-500 focus:ring-violet-500',
              }),
              React.createElement('div', { className: 'flex-1' },
                React.createElement('div', { className: 'flex items-center gap-2' },
                  React.createElement('span', null, profile.icon),
                  React.createElement('span', { className: 'font-medium text-slate-200' }, profile.name),
                  profile.recommended && React.createElement('span', {
                    className: 'px-2 py-0.5 text-xs rounded-full bg-emerald-500/20 text-emerald-400',
                  }, 'Recommandé')
                ),
                React.createElement('p', { className: 'text-xs text-slate-400 mt-0.5' }, profile.description)
              )
            )
          ),

          // Custom option
          React.createElement('label', {
            className: `flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
              isCustom
                ? 'bg-violet-500/20 border-violet-500/50 ring-1 ring-violet-500/30'
                : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
            }`,
            onClick: () => setSelectedProfile('custom'),
          },
            React.createElement('input', {
              type: 'radio',
              name: 'qaProfile',
              value: 'custom',
              checked: isCustom,
              onChange: () => setSelectedProfile('custom'),
              className: 'mt-1 text-violet-500 focus:ring-violet-500',
            }),
            React.createElement('div', { className: 'flex-1' },
              React.createElement('div', { className: 'flex items-center gap-2' },
                React.createElement('span', null, '⚙️'),
                React.createElement('span', { className: 'font-medium text-slate-200' }, 'Personnalisé')
              ),
              React.createElement('p', { className: 'text-xs text-slate-400 mt-0.5' }, 'Choisir les catégories')
            )
          )
        ),

        // Custom categories selection (only visible when custom is selected)
        isCustom && React.createElement('div', { className: 'pt-2 space-y-2' },
          React.createElement('p', { className: 'text-xs text-slate-400 font-medium' }, 'Catégories à générer :'),
          React.createElement('div', { className: 'grid grid-cols-2 gap-2' },
            ...Object.entries(QA_CATEGORIES_UI).map(([key, cat]) =>
              React.createElement('label', {
                key,
                className: `flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                  customCategories.includes(key)
                    ? 'bg-cyan-500/20 border-cyan-500/50'
                    : 'bg-slate-800/30 border-slate-700 hover:border-slate-600'
                }`,
              },
                React.createElement('input', {
                  type: 'checkbox',
                  checked: customCategories.includes(key),
                  onChange: () => toggleCategory(key),
                  className: 'text-cyan-500 focus:ring-cyan-500 rounded',
                }),
                React.createElement('span', { className: 'text-sm' }, cat.icon),
                React.createElement('span', { className: 'text-xs text-slate-300' }, cat.name)
              )
            )
          ),
          customCategories.length === 0 && React.createElement('p', {
            className: 'text-xs text-amber-400 flex items-center gap-1',
          }, '⚠️ Sélectionnez au moins une catégorie')
        ),

        // Model selection
        React.createElement('div', { className: 'pt-2' },
          React.createElement('div', { className: 'flex items-center gap-2 mb-2' },
            React.createElement('span', { className: 'text-xs text-slate-400' }, 'Modèle AI :'),
            React.createElement(ModelSelect, {
              model: selectedModel,
              onChange: setSelectedModel,
              disabled: generating,
            })
          )
        )
      ),

      // Footer
      React.createElement('div', { className: 'px-6 py-4 border-t border-slate-700 flex items-center justify-end gap-3' },
        !generating && React.createElement('button', {
          onClick: onClose,
          className: 'px-4 py-2 text-slate-400 hover:text-slate-200 text-sm',
        }, 'Annuler'),
        React.createElement('button', {
          onClick: handleGenerate,
          disabled: generating || (isCustom && customCategories.length === 0),
          className: 'px-6 py-2 bg-gradient-to-r from-cyan-500 to-emerald-500 text-white rounded-lg text-sm font-medium hover:from-cyan-600 hover:to-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2',
        },
          generating
            ? React.createElement(React.Fragment, null,
                React.createElement('span', { className: 'w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin' }),
                'Génération...'
              )
            : React.createElement(React.Fragment, null, '🚀 Générer')
        )
      )
    )
  );
}

// ============== Test Level Selector ==============

const TEST_LEVEL_OPTIONS = [
  { key: 'unit', label: 'Unit', icon: '🔬' },
  { key: 'integration', label: 'Integration', icon: '🔗' },
  { key: 'e2e', label: 'E2E', icon: '🌐' },
  { key: 'none', label: 'No tests', icon: '🚫' },
];

function TestLevelSelector({ story, onStoryUpdate, readonly = false }) {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [selectedLevels, setSelectedLevels] = React.useState([]);
  const [customInstructions, setCustomInstructions] = React.useState('');
  const [source, setSource] = React.useState('none');
  const [expanded, setExpanded] = React.useState(false);
  // F5: Use ref to always have fresh customInstructions value in toggle handler
  const customRef = React.useRef('');

  const storyId = story.slug || story.id;

  // Load test level on mount
  React.useEffect(() => {
    let cancelled = false;
    api.get(`/stories/${storyId}/test-level`)
      .then(data => {
        if (cancelled) return;
        if (data.testLevel) {
          setSelectedLevels(data.testLevel.levels || []);
          const custom = data.testLevel.custom_instructions || '';
          setCustomInstructions(custom);
          customRef.current = custom;
        }
        setSource(data.source || 'none');
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [storyId]);

  const saveTestLevel = async (levels, custom) => {
    setSaving(true);
    try {
      const result = await api.patch(`/stories/${storyId}/test-level`, {
        levels,
        custom_instructions: custom,
      });
      // F3/F7: Update source based on whether override exists
      setSource(result.testLevel ? 'story' : 'none');
    } catch (e) {
      console.error('Failed to save test level:', e);
    }
    setSaving(false);
  };

  const handleToggleLevel = (level) => {
    if (readonly) return;
    let newLevels;
    if (level === 'none') {
      newLevels = selectedLevels.includes('none') ? [] : ['none'];
    } else {
      const withoutNone = selectedLevels.filter(l => l !== 'none');
      newLevels = withoutNone.includes(level)
        ? withoutNone.filter(l => l !== level)
        : [...withoutNone, level];
    }
    setSelectedLevels(newLevels);
    // F5: Read from ref to get the latest custom instructions value
    saveTestLevel(newLevels, customRef.current);
  };

  const handleCustomChange = (value) => {
    setCustomInstructions(value);
    customRef.current = value;
  };

  const handleCustomBlur = () => {
    saveTestLevel(selectedLevels, customInstructions);
  };

  // F7: Reset to project default
  const handleReset = async () => {
    setSaving(true);
    try {
      await api.patch(`/stories/${storyId}/test-level`, {
        levels: [],
        custom_instructions: '',
      });
      // Reload from server to get project default
      const data = await api.get(`/stories/${storyId}/test-level`);
      if (data.testLevel) {
        setSelectedLevels(data.testLevel.levels || []);
        const custom = data.testLevel.custom_instructions || '';
        setCustomInstructions(custom);
        customRef.current = custom;
      } else {
        setSelectedLevels([]);
        setCustomInstructions('');
        customRef.current = '';
      }
      setSource(data.source || 'none');
    } catch (e) {
      console.error('Failed to reset test level:', e);
    }
    setSaving(false);
  };

  if (loading) return null;

  const summaryText = selectedLevels.length === 0
    ? 'Auto (AI decides)'
    : selectedLevels.includes('none')
      ? 'No tests'
      : selectedLevels.join(', ');

  return React.createElement('div', {
    className: 'rounded-xl border border-slate-700 overflow-hidden',
  },
    // Header (always visible)
    React.createElement('button', {
      onClick: () => setExpanded(!expanded),
      className: 'w-full flex items-center justify-between p-4 bg-slate-800/50 hover:bg-slate-800 transition-colors text-left',
    },
      React.createElement('div', { className: 'flex items-center gap-3' },
        React.createElement('span', { className: 'text-xl' }, '🧪'),
        React.createElement('div', null,
          React.createElement('span', { className: 'font-medium text-slate-200' }, 'Test Level'),
          React.createElement('span', { className: 'text-slate-500 text-sm ml-2' },
            source === 'project' ? '(project default)' : source === 'story' ? '(story override)' : ''
          )
        ),
        React.createElement('span', {
          className: `px-2 py-0.5 text-xs rounded-full ${
            selectedLevels.includes('none')
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : selectedLevels.length > 0
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-slate-700 text-slate-400 border border-slate-600'
          }`,
        }, summaryText),
        saving && React.createElement('span', {
          className: 'w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin',
        })
      ),
      React.createElement('span', { className: `text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}` }, '▼')
    ),

    // Expanded content
    expanded && React.createElement('div', { className: 'p-4 border-t border-slate-700 space-y-3' },
      // Checkboxes
      React.createElement('div', { className: 'grid grid-cols-2 gap-2' },
        ...TEST_LEVEL_OPTIONS.map(opt =>
          React.createElement('label', {
            key: opt.key,
            className: `flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
              selectedLevels.includes(opt.key)
                ? opt.key === 'none'
                  ? 'bg-amber-500/20 border-amber-500/50'
                  : 'bg-emerald-500/20 border-emerald-500/50'
                : 'bg-slate-800/30 border-slate-700 hover:border-slate-600'
            } ${readonly ? 'opacity-60 cursor-not-allowed' : ''}`,
          },
            React.createElement('input', {
              type: 'checkbox',
              checked: selectedLevels.includes(opt.key),
              onChange: () => handleToggleLevel(opt.key),
              disabled: readonly,
              className: `rounded ${opt.key === 'none' ? 'text-amber-500 focus:ring-amber-500' : 'text-emerald-500 focus:ring-emerald-500'}`,
            }),
            React.createElement('span', { className: 'text-sm' }, opt.icon),
            React.createElement('span', { className: 'text-sm text-slate-300' }, opt.label)
          )
        )
      ),

      // Custom instructions
      React.createElement('div', { className: 'space-y-1' },
        React.createElement('label', { className: 'text-xs text-slate-400' }, 'Additional test instructions'),
        React.createElement('input', {
          type: 'text',
          value: customInstructions,
          onChange: (e) => handleCustomChange(e.target.value),
          onBlur: handleCustomBlur,
          onKeyDown: (e) => { if (e.key === 'Enter') e.target.blur(); },
          placeholder: 'E.g. Snapshot tests for React components...',
          disabled: readonly,
          className: 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 placeholder-slate-600 focus:border-violet-500 focus:outline-none disabled:opacity-50',
        })
      ),

      // Info text + reset button
      React.createElement('div', { className: 'flex items-center justify-between' },
        React.createElement('p', { className: 'text-xs text-slate-500' },
          selectedLevels.length === 0
            ? "No selection — AI will decide test level (default behavior)."
            : selectedLevels.includes('none')
              ? "AI will not generate or flag missing tests."
              : `AI will plan and write tests: ${selectedLevels.join(', ')}.`
        ),
        // F7: Reset to project default button (only show when story has an override)
        source === 'story' && !readonly && React.createElement('button', {
          onClick: handleReset,
          disabled: saving,
          className: 'text-xs text-slate-500 hover:text-slate-300 underline transition-colors',
        }, 'Reset to default')
      )
    )
  );
}

// ============== QA Actions ==============

function QAActions({ story, onStoryUpdate }) {
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [qaResult, setQaResult] = React.useState(null);
  const [qaPlan, setQaPlan] = React.useState(null);
  const [showQaPlan, setShowQaPlan] = React.useState(true); // Default to showing checklist
  const [showProfileModal, setShowProfileModal] = React.useState(false); // Profile selection modal

  // Load existing QA plan on mount
  React.useEffect(() => {
    api.get(`/stories/${story.slug}/qa-plan`)
      .then(data => {
        if (data.exists) {
          setQaPlan(data.content);
        }
      })
      .catch(() => {});
  }, [story.slug]);

  const handleGenerateQA = async (options = {}) => {
    setGenerating(true);
    setQaResult(null);
    try {
      const result = await api.post(`/stories/${story.slug}/generate-qa`, {
        templateStyle: 'detailed',
        profile: options.profile || 'full',
        categories: options.categories || null,
        model: options.model || undefined,
      });
      setQaResult(result);
      // Reload the QA plan content
      const planData = await api.get(`/stories/${story.slug}/qa-plan`);
      if (planData.exists) {
        setQaPlan(planData.content);
        setShowQaPlan(true);
      }
      setShowProfileModal(false);
    } catch (e) {
      alert(e.message || 'Failed to generate QA plan');
    }
    setGenerating(false);
  };

  const handleApprove = async () => {
    if (!confirm('Approve this story and mark as done?')) return;
    setLoading(true);
    try {
      const result = await api.post(`/stories/${story.slug}/qa/approve`);
      onStoryUpdate(result);
    } catch (e) {
      alert(e.message);
    }
    setLoading(false);
  };

  const handleReject = async () => {
    if (!reason.trim() || reason.length < 10) {
      alert('Please provide a rejection reason (at least 10 characters)');
      return;
    }
    setLoading(true);
    try {
      const result = await api.post(`/stories/${story.slug}/qa/reject`, { reason });
      onStoryUpdate(result);
      setRejecting(false);
      setReason('');
    } catch (e) {
      alert(e.message);
    }
    setLoading(false);
  };

  return React.createElement('div', { className: 'bg-sky-500/10 border border-sky-500/30 rounded-xl p-6 space-y-4' },
    // QA Profile Modal
    React.createElement(QAProfileModal, {
      isOpen: showProfileModal,
      onClose: () => setShowProfileModal(false),
      onGenerate: handleGenerateQA,
      generating,
    }),

    React.createElement('div', { className: 'flex items-center gap-3' },
      React.createElement('span', { className: 'text-2xl' }, '✅'),
      React.createElement('div', null,
        React.createElement('h3', { className: 'text-lg font-semibold text-slate-100' }, 'QA Review'),
        React.createElement('p', { className: 'text-sm text-slate-400' }, 'Generate test plan, review implementation, and approve or reject')
      )
    ),

    // QA Plan Generation Section
    React.createElement('div', { className: 'bg-slate-800/50 rounded-lg p-4 space-y-3' },
      React.createElement('div', { className: 'flex items-center justify-between' },
        React.createElement('div', { className: 'flex items-center gap-2' },
          React.createElement('span', { className: 'text-lg' }, '🧪'),
          React.createElement('span', { className: 'text-sm font-medium text-slate-200' }, 'QA Test Plan'),
          qaPlan && React.createElement('span', { className: 'px-2 py-0.5 text-xs rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' }, '✓ Generated'),
          // Show profile used if available
          qaResult?.metadata?.profile && React.createElement('span', {
            className: 'px-2 py-0.5 text-xs rounded-full bg-slate-700 text-slate-400',
          }, `${QA_PROFILES_UI[qaResult.metadata.profile]?.icon || '📦'} ${QA_PROFILES_UI[qaResult.metadata.profile]?.name || qaResult.metadata.profile}`)
        ),
        React.createElement('div', { className: 'flex items-center gap-2' },
          qaPlan && React.createElement('button', {
            onClick: () => setShowQaPlan(!showQaPlan),
            className: 'px-3 py-1.5 text-xs rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors',
          }, showQaPlan ? '▲ Hide' : '▼ Show'),
          React.createElement('button', {
            onClick: () => setShowProfileModal(true),
            disabled: generating,
            className: `px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
              qaPlan
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30'
                : 'bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 text-cyan-400 border border-cyan-500/30 hover:from-cyan-500/30 hover:to-emerald-500/30'
            }`,
          }, generating ? '⏳ Génération...' : (qaPlan ? '↻ Régénérer' : '🧪 Générer plan QA'))
        )
      ),

      // Generation result
      qaResult && React.createElement('div', { className: 'bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3' },
        React.createElement('div', { className: 'flex items-center gap-2 text-emerald-400 text-sm' },
          React.createElement('span', null, '✓'),
          React.createElement('span', null, qaResult.message)
        ),
        qaResult.metadata && React.createElement('div', { className: 'mt-2 flex flex-wrap gap-2' },
          React.createElement('span', { className: 'px-2 py-1 text-xs rounded bg-slate-800 text-slate-300' },
            `${qaResult.metadata.totalTests} tests`
          ),
          qaResult.metadata.categories && React.createElement('span', { className: 'px-2 py-1 text-xs rounded bg-slate-800 text-slate-300' },
            `${qaResult.metadata.categories.length} catégories`
          ),
          qaResult.metadata.preservedTests > 0 && React.createElement('span', { className: 'px-2 py-1 text-xs rounded bg-slate-800 text-slate-300' },
            `${qaResult.metadata.preservedTests} preserved`
          )
        )
      ),

      // QA Checklist (interactive)
      showQaPlan && qaPlan && React.createElement('div', { className: 'mt-3' },
        React.createElement(QAChecklist, {
          slug: story.slug,
          content: qaPlan,
          onUpdate: setQaPlan,
        })
      )
    ),

    // Approve/Reject Actions
    !rejecting && React.createElement('div', { className: 'flex items-center gap-3' },
      React.createElement('button', {
        onClick: handleApprove,
        disabled: loading,
        className: 'flex-1 px-4 py-3 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm font-medium hover:bg-emerald-500/30 disabled:opacity-50 transition-colors',
      }, loading ? '⏳ Processing...' : '✓ Approve & Complete'),
      React.createElement('button', {
        onClick: () => setRejecting(true),
        disabled: loading,
        className: 'flex-1 px-4 py-3 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm font-medium hover:bg-red-500/30 disabled:opacity-50 transition-colors',
      }, '✗ Request Changes')
    ),

    rejecting && React.createElement('div', { className: 'space-y-3' },
      React.createElement('textarea', {
        value: reason,
        onChange: e => setReason(e.target.value),
        placeholder: 'Describe what needs to be changed or fixed...',
        rows: 4,
        className: 'w-full bg-slate-900 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:border-red-500 focus:outline-none resize-y',
      }),
      React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement('button', {
          onClick: () => { setRejecting(false); setReason(''); },
          className: 'px-4 py-2 text-slate-400 hover:text-slate-200 text-sm',
        }, 'Cancel'),
        React.createElement('button', {
          onClick: handleReject,
          disabled: loading || reason.length < 10,
          className: 'px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition-colors',
        }, loading ? '⏳ Sending...' : '✗ Send Feedback')
      )
    )
  );
}

// ============== Main Story View Component ==============

export function StoryView({ slug, context = 'product' }) {
  const [story, setStory] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [initExpanded, setInitExpanded] = React.useState(false);
  const [tokenUsage, setTokenUsage] = React.useState(null);
  const [externalLink, setExternalLink] = React.useState(null);
  const [syncConfigured, setSyncConfigured] = React.useState(false);
  const [showPushModal, setShowPushModal] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);

  const contextConfig = CONTEXT_CONFIG[context];

  const loadData = async () => {
    setLoading(true);
    try {
      const [storyData, tokensData, linkData, syncConfig] = await Promise.all([
        api.get(`/stories/${slug}`),
        api.get(`/stories/${slug}/tokens`).catch(() => null),
        api.get(`/integrations/link/${slug}`).catch(() => null),
        api.get('/integrations/config').catch(() => null),
      ]);
      setStory(storyData);
      setTokenUsage(tokensData);
      setExternalLink(linkData?.url ? linkData : null);
      setSyncConfigured(syncConfig?.configured || false);

      // Auto-expand init panel if no enriched context yet
      const hasEnriched = storyData?.init?.enriched && storyData.init.enriched.trim().length > 0;
      const anyStepCompleted = Object.values(storyData?.steps || {}).some(s => s.completed);
      setInitExpanded(!hasEnriched && !anyStepCompleted);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  // Wrapper that updates both story and tokens
  const handleStoryUpdate = async (storyData) => {
    setStory(storyData);
    // Also refresh token usage from backend
    api.get(`/stories/${slug}/tokens`).then(setTokenUsage).catch(() => {});
  };

  React.useEffect(() => { loadData(); }, [slug]);

  if (loading) return React.createElement(LoadingSpinner, { text: 'Loading story...' });

  if (error) {
    return React.createElement('div', { className: 'text-center py-12' },
      React.createElement('p', { className: 'text-red-400 mb-4' }, error),
      React.createElement('button', { onClick: loadData, className: 'px-4 py-2 bg-violet-500 text-white rounded-lg' }, 'Retry')
    );
  }

  if (!story) return null;

  const phase = story.phase || 'discovery';
  const accessLevel = getAccessLevel(phase, context);
  const phaseConfig = PHASE_CONFIG[phase] || PHASE_CONFIG.discovery;
  const visibleSteps = getVisibleSteps(context);
  const readonly = accessLevel === 'readonly';

  // Access denied
  if (accessLevel === 'hidden') {
    return React.createElement(AccessDenied, { phase, context });
  }

  // Normalize steps from API (may be kebab-case)
  const skippedSteps = story.skippedSteps || [];
  const normalizedSteps = {};
  for (const [key, value] of Object.entries(story.steps || {})) {
    const normalizedKey = STEP_KEY_MAP[key] || key;
    // Check if this step is skipped (using kebab-case key for comparison)
    const isStepSkipped = skippedSteps.includes(key);
    // If value is an object (like { completed, content, etc }), add skipped field
    if (typeof value === 'object' && value !== null) {
      normalizedSteps[normalizedKey] = { ...value, skipped: isStepSkipped };
    } else {
      // Value is just a status string
      normalizedSteps[normalizedKey] = { status: value, skipped: isStepSkipped };
    }
  }

  return React.createElement('div', { className: 'max-w-4xl mx-auto space-y-6' },

    // Breadcrumb
    React.createElement('div', { className: 'flex items-center gap-2 text-sm' },
      React.createElement('a', { href: `#/${context === 'product' ? 'epics' : context}`, className: 'text-slate-400 hover:text-slate-200' },
        context === 'product' ? 'Epics' : contextConfig.label
      ),
      React.createElement('span', { className: 'text-slate-600' }, '/'),
      story.epicId
        ? React.createElement('a', { href: `#/epics/${story.epicId}`, className: 'text-slate-400 hover:text-slate-200' }, story.epicName || story.epicId)
        : React.createElement('span', { className: 'text-slate-500' }, 'No Epic'),
      React.createElement('span', { className: 'text-slate-600' }, '/'),
      React.createElement('span', { className: 'text-slate-200 font-medium truncate' }, story.title || story.name || slug)
    ),

    // Header Card
    React.createElement('div', { className: `bg-gradient-to-br ${contextConfig.gradient} border ${contextConfig.border} rounded-2xl p-6` },
      React.createElement('div', { className: 'flex items-start justify-between mb-4' },
        React.createElement('div', null,
          React.createElement('div', { className: 'flex items-center gap-3 mb-2' },
            React.createElement(PhaseSelector, {
              story,
              onStoryUpdate: handleStoryUpdate,
            }),
            // Epic Selector - allows changing the epic assignment (always enabled, epic change is administrative)
            React.createElement(EpicSelector, {
              currentEpicId: story.epicId || story.epic,
              onEpicChange: async (newEpicId) => {
                const updated = await api.patch(`/stories/${slug}/epic`, { epic: newEpicId });
                setStory(prev => ({ ...prev, epicId: newEpicId, epic: newEpicId }));
              },
              disabled: false,
              showCount: false,
            }),
            // Apps Scope Selector - filters context for prompts
            React.createElement(AppsScopeSelector, {
              story,
              onStoryUpdate: handleStoryUpdate,
              readonly,
            }),
            React.createElement('span', { className: `px-3 py-1 text-xs rounded-full ${contextConfig.gradient} ${contextConfig.text} ${contextConfig.border} border` },
              `${contextConfig.icon} ${contextConfig.label} View`
            ),
            readonly && React.createElement('span', { className: 'px-3 py-1 text-xs rounded-full bg-slate-700 text-slate-400' }, '👁 Read-only'),
            // QA Rejected badge - show when story was rejected from QA
            story.qaStatus === 'rejected' && React.createElement('span', {
              className: 'px-3 py-1 text-xs rounded-full bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse',
            }, '🔴 QA Rejected'),
            // Total token usage badge
            tokenUsage?.total?.total > 0 && React.createElement('span', {
              className: 'px-3 py-1 text-xs rounded-full bg-slate-700/50 text-slate-400 border border-slate-600/30',
              title: `Total: ${tokenUsage.total.total} (Input: ${tokenUsage.total.input}, Output: ${tokenUsage.total.output})`,
            }, `🎯 ${formatTokenCount(tokenUsage.total.total)} tokens`),
            externalLink && React.createElement('a', {
              href: externalLink.url,
              target: '_blank',
              rel: 'noopener noreferrer',
              className: 'px-3 py-1 text-xs rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition-colors',
              title: `View in ${externalLink.provider || 'ClickUp'}`,
            }, `🔗 ${externalLink.provider || 'ClickUp'}`),
            syncConfigured && React.createElement('button', {
              className: `px-3 py-1 text-xs rounded-full border transition-colors ${syncing ? 'bg-slate-700 text-slate-400 border-slate-600' : 'bg-violet-500/20 text-violet-300 border-violet-500/30 hover:bg-violet-500/30'}`,
              disabled: syncing,
              onClick: async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (externalLink) {
                  // Already pushed → direct re-push, no modal needed
                  setSyncing(true);
                  try {
                    await api.post('/integrations/push', { slug });
                    const linkData = await api.get(`/integrations/link/${slug}`).catch(() => null);
                    setExternalLink(linkData?.url ? linkData : null);
                  } catch (err) {
                    alert(`Push failed: ${err.message}`);
                  }
                  setSyncing(false);
                } else {
                  // First push → open modal to select list
                  setShowPushModal(true);
                }
              },
            }, syncing ? '\u21D7 Pushing...' : (externalLink ? '\u21D7 Push update' : '\u21D7 Push to ClickUp'))
          ),
          React.createElement('h1', { className: 'text-2xl font-bold text-white mb-1' }, story.title || story.name || slug),
          story.description && React.createElement('p', { className: 'text-slate-400' }, story.description)
        )
      ),
      React.createElement('div', { className: 'flex items-center gap-4 text-xs text-slate-500' },
        React.createElement('span', null, `Created ${new Date(story.createdAt).toLocaleDateString()}`),
        story.updatedAt && React.createElement('span', null, `Updated ${new Date(story.updatedAt).toLocaleDateString()}`),
        story.createdFrom && React.createElement('span', null, `Created from ${story.createdFrom} view`)
      )
    ),

    // Init Panel Section (collapsible)
    React.createElement('div', { className: 'rounded-xl border border-slate-700 overflow-hidden' },
      // Collapse header
      React.createElement('button', {
        onClick: () => setInitExpanded(!initExpanded),
        className: 'w-full flex items-center justify-between p-4 bg-slate-800/50 hover:bg-slate-800 transition-colors text-left',
      },
        React.createElement('div', { className: 'flex items-center gap-3' },
          React.createElement('span', { className: 'text-xl' }, '📋'),
          React.createElement('div', null,
            React.createElement('span', { className: 'font-medium text-slate-200' }, 'Story Context'),
            React.createElement('span', { className: 'text-slate-500 text-sm ml-2' }, '(init.md)')
          ),
          story?.init?.enriched && story.init.enriched.trim().length > 0
            ? React.createElement('span', { className: 'px-2 py-0.5 text-xs rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' }, '✓ Has content')
            : React.createElement('span', { className: 'px-2 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30' }, 'Empty')
        ),
        React.createElement('span', { className: `text-slate-400 transition-transform ${initExpanded ? 'rotate-180' : ''}` }, '▼')
      ),
      // Collapse content
      initExpanded && React.createElement('div', { className: 'p-4 border-t border-slate-700' },
        React.createElement(InitPanel, {
          slug,
          story,
          onStoryUpdate: handleStoryUpdate,
          onComplete: () => setInitExpanded(false),
          readonly,
        })
      )
    ),

    // QA Rejection Alert (show in dev context when story was rejected)
    context === 'dev' && story.qaStatus === 'rejected' && React.createElement(QARejectionAlert, {
      story,
      onStoryUpdate: handleStoryUpdate,
    }),

    // Worktrunk Panel (only in dev context with edit access)
    context === 'dev' && accessLevel === 'edit' && React.createElement(StoryWorktrunkPanel, {
      storyId: story.id,
      onWorktrunkChange: (enabled) => {
        loadData(); // Reload story data when worktrunk status changes
      },
    }),

    // Test Level Selector (only in dev context with edit access)
    context === 'dev' && accessLevel === 'edit' && React.createElement(TestLevelSelector, {
      story,
      onStoryUpdate: handleStoryUpdate,
      readonly: false,
    }),

    // Product Actions (only in product context with edit access, discovery phase)
    context === 'product' && accessLevel === 'edit' && React.createElement(ProductActions, {
      story,
      onStoryUpdate: handleStoryUpdate,
    }),

    // QA Actions (only in QA context with edit access)
    context === 'qa' && accessLevel === 'edit' && React.createElement(QAActions, {
      story,
      onStoryUpdate: handleStoryUpdate,
    }),

    // Steps (hidden in QA view - QA only sees the QA Actions panel)
    context !== 'qa' && React.createElement('div', { className: 'space-y-4' },
      ...visibleSteps.map(stepKey => {
        const step = normalizedSteps[stepKey] || {
          completed: false,
          skipped: false,
          content: null,
          history: [],
          currentVersion: 0,
        };
        // Normalize currentStep from status.yaml (may use legacy names like 'brief')
        const STEP_NAME_MAP = { brief: 'init', 'ba-spec': 'specFunc', 'tech-spec': 'specTech' };
        const rawCurrentStep = story.currentStep || story.current_step || 'init';
        const currentStep = STEP_NAME_MAP[rawCurrentStep] || rawCurrentStep;

        // Convert stepKey to kebab-case for token lookup (status.yaml uses kebab-case)
        const apiStepKey = stepKey.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');

        return React.createElement(StepSection, {
          key: stepKey,
          stepKey,
          step,
          slug,
          currentStep,
          storyContext: story.init?.enriched || story.description || '',
          attachments: story.init?.attachments,
          onStoryUpdate: handleStoryUpdate,
          readonly,
          tokenUsage: tokenUsage?.steps?.[apiStepKey] || tokenUsage?.steps?.[stepKey],
          savedStepContext: story.stepContext?.[apiStepKey] || story.stepContext?.[stepKey],
        });
      })
    ),

    // Push to ClickUp modal
    showPushModal && React.createElement(PushModal, {
      slug,
      onClose: () => setShowPushModal(false),
      onPushed: async () => {
        const linkData = await api.get(`/integrations/link/${slug}`).catch(() => null);
        setExternalLink(linkData?.url ? linkData : null);
      },
    })
  );
}
