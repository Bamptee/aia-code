# Epic & Product Management System

A comprehensive product management module for AIA Code, enabling epic/story management with workflow automation, QA integration, and roadmap planning.

## Overview

This module provides:
- **Epic Management**: Create, update, archive, and organize epics
- **Story Workflow**: Two-space workflow (experimentation → development) with step completion tracking
- **QA Integration**: Approve/reject workflow with automatic bug creation
- **Roadmap Planning**: Period-based planning with weekly/monthly/quarterly granularity
- **AI Generation**: Generate briefs, specs, questions, and POC code
- **Data Integrity**: Automatic validation and repair of data consistency

## Architecture

```
src/epic/
├── models/           # Data models and validation
│   ├── epic.js       # Epic model factory
│   ├── story.js      # Story model factory
│   └── validators.js # Validation schemas and helpers
├── providers/        # External integrations
│   ├── file-storage-provider.js  # File system operations with locking
│   └── ai-provider.js            # AI content generation
├── services/         # Business logic
│   ├── epic-service.js           # Epic CRUD operations
│   ├── story-service.js          # Story CRUD and workflow
│   ├── story-index-service.js    # Story ID → Epic ID mapping
│   ├── qa-service.js             # QA approval workflow
│   ├── roadmap-service.js        # Roadmap and period management
│   ├── poc-service.js            # POC code generation
│   ├── migration-service.js      # System initialization and migration
│   └── integrity-service.js      # Data integrity checks
└── utils/            # Utilities
    ├── id-generator.js  # UUID generation
    └── errors.js        # Custom error classes
```

## Data Storage

All data is stored in `.aia/` directory as JSON files, making it git-trackable:

```
.aia/
├── config.json           # System configuration
├── story-index.json      # Story ID → Epic ID mapping for O(1) lookups
├── epics/
│   ├── {epic-id}.json    # Individual epic files
│   └── ...
└── poc/                  # Generated POC code
    └── {filename}
```

## Story Workflow

### Spaces

Stories exist in two spaces:
- **Experimentation**: Initial discovery and specification phase
- **Development**: Active development and delivery phase

### Status Flow

```
DRAFT → READY_FOR_DEV → IN_PROGRESS → TESTING → DONE
         ↑                              ↓
         └──────── (rejection) ─────────┘
```

### Experimentation Steps

Before promotion to development, stories should complete:
1. **Brief**: Feature summary and problem statement
2. **BA Spec**: Detailed requirements with acceptance criteria
3. **Questions**: Clarifying questions for ambiguities

Each step can be:
- **Completed**: With content filled
- **Skipped**: Explicitly bypassed
- **Pending**: Not yet addressed

## CLI Commands

### Epic Management
```bash
aia epic list                    # List all epics
aia epic create <name>           # Create new epic
aia epic show <id>               # Show epic details
aia epic update <id>             # Update epic
aia epic archive <id>            # Archive epic
aia epic delete <id>             # Delete epic
```

### Story Management
```bash
aia story list                   # List stories
aia story create <epic-id>       # Create story
aia story show <id>              # Show story details
aia story step <id> <step>       # Update story step
aia story promote <id>           # Promote to development
aia story move <id> <epic-id>    # Move to another epic
```

### QA Workflow
```bash
aia qa queue                     # List testing queue
aia qa approve <id>              # Approve story
aia qa reject <id>               # Reject with bug creation
aia qa submit <id>               # Submit for testing
```

### Roadmap
```bash
aia roadmap show                 # Show roadmap
aia roadmap assign <epic> <period>  # Assign period
aia roadmap current              # Current period epics
aia roadmap upcoming             # Upcoming periods
```

### System
```bash
aia epic-init                    # Initialize system
aia diagnose                     # Check system health
aia repair                       # Auto-fix issues
aia export                       # Export all data
aia import <file>                # Import data
```

## API Usage

### Basic Setup
```javascript
import { FileStorageProvider } from './providers/file-storage-provider.js';
import { StoryIndexService } from './services/story-index-service.js';
import { EpicService } from './services/epic-service.js';
import { StoryService } from './services/story-service.js';

const storage = new FileStorageProvider('.aia');
const storyIndex = new StoryIndexService(storage);
const epicService = new EpicService(storage, storyIndex);
const storyService = new StoryService(storage, storyIndex, epicService);
```

### Creating an Epic with Stories
```javascript
// Initialize system
import { MigrationService } from './services/migration-service.js';
const migration = new MigrationService(storage, storyIndex);
await migration.initialize();

// Create epic
const epic = await epicService.create({
  name: 'User Authentication',
  description: 'Complete auth system implementation'
});

// Create feature story
const story = await storyService.create(epic.id, {
  title: 'Login Form',
  type: 'feature',
  description: 'Email/password login'
});

// Complete experimentation steps
await storyService.updateStep(story.id, 'brief', {
  completed: true,
  content: 'Login form with validation...'
});
await storyService.updateStep(story.id, 'baSpec', {
  completed: true,
  content: 'AC: 1. Email validation...'
});
await storyService.updateStep(story.id, 'questions', { skipped: true });

// Promote to development
await storyService.promote(story.id);
```

### QA Workflow
```javascript
import { QAService } from './services/qa-service.js';
const qaService = new QAService(storage, storyService, storyIndex);

// Move to testing
await qaService.moveToTesting(storyId);

// Approve
await qaService.approve(storyId, 'All tests passed');

// Or reject (creates linked bug)
const { story, bug } = await qaService.reject(storyId, 'Payment fails on mobile');
```

### AI Generation
```javascript
import { AIProvider } from './providers/ai-provider.js';
import { POCService } from './services/poc-service.js';

const ai = new AIProvider({
  provider: 'anthropic',  // or 'openai', 'local'
  apiKey: process.env.ANTHROPIC_API_KEY
});

const poc = new POCService(ai, storyService, storage);

// Generate POC code
const code = await poc.generate(storyId, {
  context: 'React with TypeScript'
});
```

### Data Integrity
```javascript
import { IntegrityService } from './services/integrity-service.js';
const integrity = new IntegrityService(storage, storyIndex);

// Check health
const { healthy, issues, summary } = await integrity.check();

// Auto-fix issues
const { fixed, skipped } = await integrity.fix();

// Rebuild index
await integrity.rebuildIndex();
```

## Error Handling

All services throw typed errors:
- `ValidationError`: Invalid input data
- `NotFoundError`: Resource not found
- `BusinessRuleError`: Business rule violation
- `StorageError`: File system errors
- `AIResponseError`: AI API errors
- `ConfigurationError`: Missing configuration

```javascript
import { ValidationError, NotFoundError } from './utils/errors.js';

try {
  await storyService.create(epicId, { title: '' });
} catch (error) {
  if (error instanceof ValidationError) {
    console.log('Validation failed:', error.errors);
  }
}
```

## Testing

Run all tests:
```bash
npm test
```

Run epic module tests:
```bash
npm test -- tests/epic/*.test.js
```

## Configuration

Environment variables:
- `ANTHROPIC_API_KEY`: For Claude AI integration
- `OPENAI_API_KEY`: For OpenAI integration
