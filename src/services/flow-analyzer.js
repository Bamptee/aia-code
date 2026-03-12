const COMPLEXITY_INDICATORS = {
  simple: ['fix', 'bug', 'typo', 'update', 'small', 'quick', 'minor', 'patch', 'hotfix', 'tweak'],
  complex: ['refactor', 'architecture', 'migration', 'redesign', 'integration', 'new feature', 'complex', 'rewrite', 'overhaul', 'system']
};

export function suggestFlowType(description) {
  if (!description || description.length < 50) {
    return 'quick';
  }

  const lower = description.toLowerCase();
  let simpleScore = 0;
  let complexScore = 0;

  COMPLEXITY_INDICATORS.simple.forEach(word => {
    if (lower.includes(word)) simpleScore++;
  });

  COMPLEXITY_INDICATORS.complex.forEach(word => {
    if (lower.includes(word)) complexScore++;
  });

  if (complexScore > simpleScore) {
    return 'full';
  }

  if (simpleScore > 0 || description.length < 200) {
    return 'quick';
  }

  return 'full';
}
