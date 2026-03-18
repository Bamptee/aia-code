const STEP_GUIDANCE = {
  en: {
    init: {
      summary: 'Feature initialized',
      next: 'brainstorming',
      actions: [
        'Review the init for completeness',
        'Run: aia next <feature>',
      ],
      tips: ['If too vague, iterate with more context'],
    },
    brainstorming: {
      summary: 'Brainstorming completed',
      next: 'spec-func',
      actions: [
        'Answer key questions in init.md or as iteration instructions',
        'Run: aia next <feature>',
      ],
      tips: ['Unanswered questions will affect quality of next steps'],
    },
    'spec-func': {
      summary: 'Functional spec completed',
      next: 'spec-tech',
      actions: [
        'Check requirements are measurable',
        'Run: aia next <feature>',
      ],
      tips: ['Missing acceptance criteria? Iterate.'],
    },
    'spec-tech': {
      summary: 'Technical specification ready',
      next: 'dev-plan',
      actions: [
        'Review technical choices and constraints',
        'Run: aia next <feature>',
      ],
      tips: ['Consider performance and scalability implications'],
    },
    'dev-plan': {
      summary: 'Development plan ready',
      next: 'implement',
      actions: [
        'Review task breakdown',
        'Run: aia next <feature> -a (agent mode)',
      ],
      tips: ['Implementation will modify your codebase'],
    },
    implement: {
      summary: 'Implementation completed',
      next: 'review',
      actions: [
        'Run tests',
        'Manual verification',
        'Run: aia next <feature>',
      ],
      tips: ['Check files created/modified'],
    },
    review: {
      summary: 'Feature complete!',
      next: null,
      actions: [
        'Address review comments',
        'Merge to main branch',
      ],
      tips: [],
    },
  },
  fr: {
    init: {
      summary: 'Feature initialisée',
      next: 'brainstorming',
      actions: [
        'Vérifier que l\'init est complet',
        'Lancer : aia next <feature>',
      ],
      tips: ['Si trop vague, itérer avec plus de contexte'],
    },
    brainstorming: {
      summary: 'Brainstorming terminé',
      next: 'spec-func',
      actions: [
        'Répondre aux questions clés dans init.md ou via instructions d\'itération',
        'Lancer : aia next <feature>',
      ],
      tips: ['Les questions sans réponse affecteront la qualité des étapes suivantes'],
    },
    'spec-func': {
      summary: 'Spec fonctionnelle terminée',
      next: 'spec-tech',
      actions: [
        'Vérifier que les exigences sont mesurables',
        'Lancer : aia next <feature>',
      ],
      tips: ['Critères d\'acceptation manquants ? Itérer.'],
    },
    'spec-tech': {
      summary: 'Spécification technique prête',
      next: 'dev-plan',
      actions: [
        'Revoir les choix techniques et contraintes',
        'Lancer : aia next <feature>',
      ],
      tips: ['Considérer les implications de performance et scalabilité'],
    },
    'dev-plan': {
      summary: 'Plan de développement prêt',
      next: 'implement',
      actions: [
        'Revoir le découpage des tâches',
        'Lancer : aia next <feature> -a (mode agent)',
      ],
      tips: ['L\'implémentation va modifier votre code'],
    },
    implement: {
      summary: 'Implémentation terminée',
      next: 'review',
      actions: [
        'Lancer les tests',
        'Vérification manuelle',
        'Lancer : aia next <feature>',
      ],
      tips: ['Vérifier les fichiers créés/modifiés'],
    },
    review: {
      summary: 'Feature terminée !',
      next: null,
      actions: [
        'Traiter les commentaires de review',
        'Merger sur la branche principale',
      ],
      tips: [],
    },
  },
};

function getLanguageCode(language) {
  if (!language) return 'en';
  const lower = language.toLowerCase();
  if (lower.includes('french') || lower.includes('français')) return 'fr';
  if (lower.includes('english') || lower.includes('anglais')) return 'en';
  return 'en';
}

export function getGuidance(step, language = 'English') {
  const langCode = getLanguageCode(language);
  const guidance = STEP_GUIDANCE[langCode]?.[step] || STEP_GUIDANCE.en[step];
  return guidance || null;
}
