const STEP_GUIDANCE = {
  en: {
    brief: {
      summary: 'Product brief completed',
      next: 'ba-spec',
      actions: [
        'Review the brief for completeness',
        'Run: aia next <feature>',
      ],
      tips: ['If too vague, iterate with more context'],
    },
    'ba-spec': {
      summary: 'Business analysis completed',
      next: 'questions',
      actions: [
        'Check requirements are measurable',
        'Run: aia next <feature>',
      ],
      tips: ['Missing acceptance criteria? Iterate.'],
    },
    questions: {
      summary: 'Questions identified',
      next: 'tech-spec',
      actions: [
        'Answer key questions in init.md or as iteration instructions',
        'Run: aia next <feature>',
      ],
      tips: ['Unanswered questions will affect quality of next steps'],
    },
    'tech-spec': {
      summary: 'Technical specification ready',
      next: 'challenge',
      actions: [
        'Review technical choices and constraints',
        'Run: aia next <feature>',
      ],
      tips: ['Consider performance and scalability implications'],
    },
    challenge: {
      summary: 'Challenges identified',
      next: 'dev-plan',
      actions: [
        'Address critical challenges before proceeding',
        'Run: aia next <feature>',
      ],
      tips: ['Unresolved challenges may cause issues during implementation'],
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
    brief: {
      summary: 'Brief produit terminé',
      next: 'ba-spec',
      actions: [
        'Vérifier que le brief est complet',
        'Lancer : aia next <feature>',
      ],
      tips: ['Si trop vague, itérer avec plus de contexte'],
    },
    'ba-spec': {
      summary: 'Analyse métier terminée',
      next: 'questions',
      actions: [
        'Vérifier que les exigences sont mesurables',
        'Lancer : aia next <feature>',
      ],
      tips: ['Critères d\'acceptation manquants ? Itérer.'],
    },
    questions: {
      summary: 'Questions identifiées',
      next: 'tech-spec',
      actions: [
        'Répondre aux questions clés dans init.md ou via instructions d\'itération',
        'Lancer : aia next <feature>',
      ],
      tips: ['Les questions sans réponse affecteront la qualité des étapes suivantes'],
    },
    'tech-spec': {
      summary: 'Spécification technique prête',
      next: 'challenge',
      actions: [
        'Revoir les choix techniques et contraintes',
        'Lancer : aia next <feature>',
      ],
      tips: ['Considérer les implications de performance et scalabilité'],
    },
    challenge: {
      summary: 'Défis identifiés',
      next: 'dev-plan',
      actions: [
        'Traiter les défis critiques avant de continuer',
        'Lancer : aia next <feature>',
      ],
      tips: ['Les défis non résolus peuvent causer des problèmes lors de l\'implémentation'],
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
