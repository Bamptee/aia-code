# AIA Code

**AIA est un chef d'orchestre qui fait travailler plusieurs IA (Claude, ChatGPT, Gemini) ensemble pour passer d'une idée produit à du code livré, en suivant un processus structuré de type "product management".**

---

## Le problème qu'on résout

Aujourd'hui, les développeurs utilisent des IA (Claude, ChatGPT…) de manière artisanale : ils copient-collent du contexte, reformulent les mêmes prompts, oublient des étapes, et chaque développeur a sa propre méthode.

Résultat : qualité inégale, perte de temps, et difficile à industrialiser.

## Ce que fait AIA

AIA transforme ce travail artisanal en **chaîne de production structurée**. Pour chaque fonctionnalité, il déroule automatiquement un processus en 8 étapes, comme une équipe produit classique le ferait :

| Étape | Équivalent humain |
|---|---|
| **Brief** | Le Product Manager rédige le brief produit |
| **BA Spec** | Le Business Analyst détaille les règles métier |
| **Questions** | L'équipe pose les questions ouvertes à clarifier |
| **Tech Spec** | L'architecte décrit la solution technique |
| **Challenge** | Une revue critique cherche les trous et les risques |
| **Dev Plan** | Le lead dev découpe le travail en tâches |
| **Implement** | Les développeurs écrivent le code |
| **Review** | Une relecture de code finale |

À chaque étape, AIA envoie automatiquement à l'IA :
- Le contexte du projet (stack, architecture, conventions maison)
- La base de connaissances interne (règles backend, frontend, etc.)
- Les spécifications initiales de la fonctionnalité
- Le résultat de **toutes les étapes précédentes**

L'IA travaille donc toujours avec un contexte complet, pas à l'aveugle.

---

## Le choix intelligent du modèle

AIA sait qu'aucune IA n'est la meilleure partout. On peut donc définir, pour **chaque étape**, quelles IA utiliser et avec quelle probabilité.

Exemple :
- Pour écrire du code → Claude 100 %
- Pour poser des questions produit → 50 % Claude / 50 % ChatGPT
- Pour la spec technique → 60 % GPT-4 / 40 % Gemini

Cela permet de tirer le meilleur de chaque fournisseur tout en maîtrisant les coûts.

---

## Deux couches : exécution + gestion de projet

### 1. La couche "exécution" (la chaîne IA)

C'est ce qu'on vient de décrire : le pipeline qui transforme une idée en code.

### 2. La couche "product management"

AIA intègre aussi un **vrai outil de gestion de projet**, accessible en ligne de commande ou via une interface web :

- **Epics** : grandes initiatives (ex. "Authentification utilisateur", "Système de paiement")
- **Stories** : unités de travail individuelles (feature ou bug) rattachées à un Epic
- **Spaces** : phase du travail — `experimentation` (validation d'idée) ou `development` (implémentation)
- **QA** : workflow de validation — approbation ou rejet avec création automatique d'un bug lié
- **Roadmap** : vue temporelle (semaine / mois / trimestre) avec drag-and-drop

Tout est stocké en fichiers versionnés dans Git → pas de SaaS tiers, pas de fuite de données, l'historique est auditable.

---

## L'interface web

En plus du terminal, AIA fournit une interface web locale (`aia ui`) avec :
- Tableau de bord des fonctionnalités et de leur avancement
- Exécution des étapes avec logs en temps réel
- Éditeur de configuration
- Dashboards Epic, Roadmap et QA
- Terminal intégré dans le navigateur

---

## Pourquoi c'est stratégique

| Bénéfice | Impact |
|---|---|
| **Standardisation** | Chaque feature suit le même processus, quelle que soit la personne |
| **Traçabilité** | Toutes les décisions (brief, spec, plan) sont écrites et versionnées dans Git |
| **Vitesse** | Une story simple peut passer de l'idée au code en quelques minutes (mode `quick`) |
| **Qualité** | L'étape "challenge" force une revue critique avant d'écrire la moindre ligne |
| **Multi-IA** | On n'est pas verrouillé à un fournisseur ; on peut arbitrer qualité vs coût |
| **Souveraineté** | Tout reste local et dans Git, pas d'outil SaaS supplémentaire à payer |

---

## Stade actuel

- Version **2.3.1**, publiée comme package npm public (`@bamptee/aia-code`)
- Utilisable en CLI ou via interface web
- Intégrations tierces déjà en place : **ClickUp**, **Worktrunk** (gestion de branches Git)
- Couvert par une suite de tests automatisés

---

## Résumé en une ligne pour un board

> *"AIA est une usine à features : on décrit une idée, et une équipe virtuelle d'IA la fait passer par product, archi, code et review — avec un vrai outil de gestion de projet par-dessus."*
