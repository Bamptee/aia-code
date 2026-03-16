# Implementation Plan: booster-qa (v2 - AI-Powered)

## Overview

The QA booster feature has been refactored to use AI-powered generation instead of regex-based parsing. The system now reads feature documentation (dev-plan.md, implement.md, review.md) and uses the `.aia/prompts/qa.md` prompt to generate contextual QA test plans.

## Architecture Change

### Previous Architecture (v1 - Deprecated)
```
specs.md/tech.md → QAParser → QAGenerator → QARenderer → qa.md
                   (regex)    (templates)   (markdown)
```

### New Architecture (v2 - AI-Powered)
```
dev-plan.md + implement.md + review.md → AI Model → qa.md
                                          ↑
                                   .aia/prompts/qa.md
```

---

## Implemented Files

### Core Files

| File | Status | Description |
|------|--------|-------------|
| `.aia/prompts/qa.md` | ✅ Created | AI prompt template for QA generation |
| `src/epic/services/qa-booster-service.js` | ✅ Refactored | Main service using AI model calls |
| `src/commands/qa-gen.js` | ✅ Updated | CLI command (simplified options) |
| `src/epic/models/qa-booster.js` | ✅ Kept | Types, constants, utilities |

### Removed Files (No longer needed)

| File | Reason |
|------|--------|
| `src/epic/services/qa-parser-service.js` | Replaced by AI |
| `src/epic/services/qa-generator-service.js` | Replaced by AI |
| `src/epic/services/qa-renderer-service.js` | Replaced by AI |

---

## Key Features

### 1. AI-Powered Generation
- Uses the same model infrastructure as other steps (brief, implement, review)
- Reads the `.aia/prompts/qa.md` prompt template
- Generates contextual tests based on actual implementation

### 2. Source Documents
The service reads these documents in priority order:

**Primary sources (for generation):**
- `dev-plan.md` - Implementation tasks, files, architecture
- `implement.md` - Actual implementation notes
- `review.md` - Code review feedback, issues found

**Fallback sources (if primary missing):**
- `tech-spec.md` - Technical specification
- `ba-spec.md` - Business analysis spec
- `spec.md` - General specification

### 3. Checkbox Preservation
When regenerating a QA plan, checked checkboxes are preserved:
```markdown
- [x] **[TC-F001]** 🔴 Completed test  ← stays checked
- [ ] **[TC-F002]** 🟠 New test
```

### 4. Statistics & Progress Tracking
The `getStats()` method provides:
- Total tests count
- Completed/pending counts
- Breakdown by category (functional, API, UI, security, edge cases)

---

## CLI Usage

```bash
# Generate QA plan using AI
aia qa-gen run features/my-feature

# Preview without writing to file
aia qa-gen preview features/my-feature

# Show test statistics
aia qa-gen stats features/my-feature

# Options
aia qa-gen run features/my-feature --model claude  # Use specific model
aia qa-gen run features/my-feature --output custom-qa.md  # Custom output path
```

---

## Prompt Template Structure

The `.aia/prompts/qa.md` instructs the AI to:

1. **Analyze source documents** - Read dev-plan, implement, review
2. **Generate test categories**:
   - Functional Tests (TC-F###)
   - API Tests (TC-A###)
   - UI Tests (TC-U###)
   - Security Tests (TC-S###)
   - Edge Cases (TC-E###)

3. **Use priority levels**:
   - 🔴 Critical (P0)
   - 🟠 High (P1)
   - 🟡 Medium (P2)
   - 🟢 Low (P3)

4. **Format with checkboxes** for progress tracking

---

## Test Coverage

Tests are in `tests/epic/qa-booster-service.test.js`:

| Test Suite | Tests | Description |
|------------|-------|-------------|
| loadSourceDocuments | 3 | Reading dev-plan.md, implement.md, review.md |
| validate | 2 | Validation of source documents |
| buildPrompt | 2 | Prompt construction |
| resolveOutputPath | 3 | Path resolution and security |
| parseCheckboxStates | 2 | Checkbox state extraction |
| preserveCheckboxStates | 1 | State preservation during regen |
| writeAtomically | 3 | Atomic file operations |
| getStats | 2 | Statistics calculation |
| config management | 2 | Configuration handling |
| QA Model Functions | 8 | Sanitization and metadata |
| Security | 2 | Path traversal prevention |

**Total: 30 tests, all passing**

---

## Security Measures

1. **Path traversal prevention** - Output paths validated to stay within feature directory
2. **Atomic writes** - Temp file + rename to prevent corruption
3. **Content sanitization** - Test titles sanitized for markdown injection
4. **HTML/script removal** - sanitizeMarkdown removes dangerous content

---

## Next Steps (UI Integration)

To enable QA generation from the UI:

1. **Add API endpoint** in `src/ui/api/epics-simple.js`:
   ```javascript
   router.post('/api/stories/:slug/generate-qa', async (req, res) => {
     const service = new QABoosterService();
     const result = await service.generateFromDirectory(storyPath);
     res.json(result);
   });
   ```

2. **Add UI button** in `src/ui/public/components/story-view.js`:
   - Add "🧪 Generate QA Plan" button in QAActions component
   - Show loading state during generation
   - Display results (test count, model used)

---

## Model Configuration

Add QA model config in `.aia/config.yaml`:

```yaml
models:
  qa:
    - model: claude
      weight: 1
  # Falls back to 'review' config if 'qa' not defined
```
