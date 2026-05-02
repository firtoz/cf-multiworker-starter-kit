---
name: creating-skills
description: Guide for creating new Agent Skills when patterns emerge or improvements are needed. Use when encountering repeated patterns, making the same mistakes, discovering better approaches, or receiving user corrections. Covers keeping each skill small (one topic), when to split SKILL.md or add references/, and line-count heuristics.
---

# Creating Skills

This skill helps recognize when new skills would be valuable and guides the creation process. It follows the official [Agent Skills specification](https://agentskills.io).

## When to Create a New Skill

Create a new skill when you notice:

1. **Repeated patterns**: You find yourself explaining the same pattern multiple times
2. **Mistakes**: You make the same error repeatedly
3. **User corrections**: The user corrects you with "do it this way, not that way"
4. **Better approaches**: You discover a more effective pattern
5. **Struggling**: You're uncertain how to proceed with a specific task type
6. **Domain knowledge**: You need specialized context that's not already captured

## One topic per skill (size heuristic)

A skill should cover **one coherent “kind of work”** — small enough that an agent can skim it in one pass and know if it applies. If `SKILL.md` grows into a multi-manual, **split** rather than stack unrelated topics.

**Rough size (body lines, excluding YAML frontmatter)** — not a hard gate, a smell test:

| Size | Guidance |
| --- | --- |
| **~80–200 lines** | Healthy default for a focused playbook (when/references + checklists). |
| **~200–350 lines** | Still OK if **one** topic; tighten prose, use bullets, or move long tables to `references/`. |
| **> ~350–400 lines** | **Pause:** likely doing too much in one file—see split signals below. |
| **> ~500 lines** | **Should** split or offload depth to `references/`; keep `SKILL.md` as the thin entry point. |

(Aligns with progressive disclosure: full `SKILL.md` is often loaded when the skill activates—see below.)

**Signals you should split or carve out `references/`:**

- **Several unrelated top-level `##` sections** that could stand alone (e.g. “deploy” + “component style” + “DB migrations” in one skill).
- **`description`** reads like fire-and-forget keywords for **three or more** different user intents—pick one primary trigger; spin off another skill.
- **Overlap** with an existing skill (duplicate checklists → link instead).
- **Long narrative or edge-case dumps** that most runs never need → `references/<topic>.md` and link “read when …”.

**Ways to split:**

1. **Sibling skill** — New `agents/skills/<narrow-name>/SKILL.md`; cross-link from the old one. Prefer **narrow names** (`cf-durable-object-package` vs `everything-about-workers`).
2. **`references/`** — Deep dives, long examples, version-specific notes; `SKILL.md` stays “when + essential steps + links”.
3. **Hub + leaves** — Optional thin index skill that only points to 2–4 leaves (use sparingly; don’t replace `AGENTS.md`).

**Anti-pattern:** One mega-skill that tries to be the whole monorepo. Prefer **many small skills** + [AGENTS.md](../../AGENTS.md) index.

## Skill Structure

A skill is a directory under **`agents/skills/<skill-name>/`** containing at minimum a `SKILL.md` file:

```
agents/skills/
└── skill-name/
    ├── SKILL.md          # Required
    ├── scripts/          # Optional - executable code
    ├── references/       # Optional - additional documentation
    └── assets/           # Optional - templates, images, data files
```

## SKILL.md Format

The `SKILL.md` file must contain YAML frontmatter followed by Markdown content.

### Required Frontmatter

```yaml
---
name: skill-name
description: What the skill does and when to use it. Use when [triggers].
---
```

### Optional Frontmatter Fields

```yaml
---
name: skill-name
description: What the skill does and when to use it. Use when [triggers].
license: Apache-2.0
compatibility: Requires git, docker, and access to the internet
metadata:
  author: your-org
  version: "1.0"
allowed-tools: Bash(git:*) Read Write
---
```

### Body Content Template

```markdown
# Skill Title

## When to Use
[Trigger scenarios]

## Instructions
[Concise, actionable steps]

## Examples
[Concrete input/output examples]
```

## Frontmatter Field Specifications

### `name` Field (Required)

The `name` field must:
- Be 1-64 characters
- Use lowercase unicode alphanumeric characters and hyphens only (`a-z` and `-`)
- Not start or end with hyphens
- Not contain consecutive hyphens (`--`)
- Match the parent directory name

**Valid examples:**
- `pdf-processing`
- `data-analysis`
- `code-review`

**Invalid examples:**
- `PDF-Processing` (uppercase not allowed)
- `-pdf` (cannot start with hyphen)
- `pdf--processing` (consecutive hyphens not allowed)

### `description` Field (Required)

The `description` field must:
- Be 1-1024 characters
- Be non-empty
- Describe both what the skill does and when to use it
- Include specific keywords that help agents identify relevant tasks

**Good example:**
```yaml
description: Extracts text and tables from PDF files, fills PDF forms, and merges multiple PDFs. Use when working with PDF documents or when the user mentions PDFs, forms, or document extraction.
```

**Poor example:**
```yaml
description: Helps with PDFs.
```

### `license` Field (Optional)

The `license` field:
- Specifies the license applied to the skill
- Should be kept short (either the name of a license or reference to a bundled license file)

**Example:**
```yaml
license: Apache-2.0
```

```yaml
license: Proprietary. LICENSE.txt has complete terms
```

### `compatibility` Field (Optional)

The `compatibility` field:
- Must be 1-500 characters if provided
- Should only be included if your skill has specific environment requirements
- Can indicate intended product, required system packages, network access needs, etc.

**Examples:**
```yaml
compatibility: Designed for Claude Code (or similar products)
```

```yaml
compatibility: Requires git, docker, jq, and access to the internet
```

**Note:** Most skills do not need the `compatibility` field.

### `metadata` Field (Optional)

The `metadata` field:
- A map from string keys to string values
- Can store additional properties not defined by the Agent Skills spec
- Recommended to use reasonably unique key names to avoid conflicts

**Example:**
```yaml
metadata:
  author: example-org
  version: "1.0"
  category: data-processing
```

### `allowed-tools` Field (Optional, Experimental)

The `allowed-tools` field:
- A space-delimited list of tools that are pre-approved to run
- Support may vary between agent implementations

**Example:**
```yaml
allowed-tools: Bash(git:*) Bash(jq:*) Read Write
```

## Description Best Practices

Write descriptions in third person (they're injected into the system prompt):

```yaml
# ✅ Good
description: Processes Excel files and generates reports. Use when analyzing spreadsheets or .xlsx files.

# ❌ Bad
description: I can help you process Excel files.
description: You can use this to process Excel files.
```

Include both WHAT and WHEN:
- WHAT: What the skill does (specific capabilities)
- WHEN: When to use it (trigger scenarios)

## Progressive Disclosure

Skills should be structured for efficient use of context:

1. **Metadata** (~100 tokens): The `name` and `description` fields are loaded at startup for all skills
2. **Instructions** (< 5000 tokens recommended): The full `SKILL.md` body is loaded when the skill is activated
3. **Resources** (as needed): Files in `scripts/`, `references/`, or `assets/` are loaded only when required

### Keep `SKILL.md` lean

Prefer a **short main file** so agents don’t burn context when the skill activates. See **[One topic per skill (size heuristic)](#one-topic-per-skill-size-heuristic)** for line-count heuristics and when to split.

Target: main `SKILL.md` holds *when to use*, *essential steps*, and *pointers*; move long reference material to `references/` (or a sibling skill).

### File References

When referencing other files in your skill, use relative paths from the skill root:

```markdown
See [the reference guide](references/REFERENCE.md) for details.

Run the extraction script:
scripts/extract.py
```

**Keep file references one level deep** from SKILL.md. Avoid deeply nested reference chains.

## Writing Concise Skills

Be concise - only add context the agent doesn't already have.

Challenge each piece of information:
- "Does the agent really need this explanation?"
- "Can I assume the agent knows this?"
- "Does this paragraph justify its token cost?"

```markdown
# ✅ Good - Concise (50 tokens)
## Extract PDF text

Use pdfplumber for text extraction:

\`\`\`python
import pdfplumber

with pdfplumber.open("file.pdf") as pdf:
    text = pdf.pages[0].extract_text()
\`\`\`
```

```markdown
# ❌ Bad - Too verbose (150 tokens)
## Extract PDF text

PDF (Portable Document Format) files are a common file format that contains
text, images, and other content. To extract text from a PDF, you'll need to
use a library. There are many libraries available...
```

## Optional Directories

### scripts/

Contains executable code that agents can run. Scripts should:
- Be self-contained or clearly document dependencies
- Include helpful error messages
- Handle edge cases gracefully

Supported languages depend on the agent implementation. Common options include Python, Bash, and JavaScript.

### references/

Contains additional documentation that agents can read when needed:
- `REFERENCE.md` - Detailed technical reference
- `FORMS.md` - Form templates or structured data formats
- Domain-specific files (`finance.md`, `legal.md`, etc.)

Keep individual reference files focused. Agents load these on demand, so smaller files mean less use of context.

### assets/

Contains static resources:
- Templates (document templates, configuration templates)
- Images (diagrams, examples)
- Data files (lookup tables, schemas)

## Skill Creation Process

1. **Identify the need**: Notice a pattern that would benefit from documentation
2. **Choose a name**: Use lowercase with hyphens (e.g., `api-integration`)
3. **Write description**: Be specific, include triggers, use third person
4. **Document the pattern**: Keep it concise, provide examples
5. **Create the file**: Place in `agents/skills/skill-name/SKILL.md` (canonical; also visible as `.cursor/skills/…` in Cursor via symlink)
6. **Test**: Verify the skill activates correctly for relevant tasks

## Example: Creating a Git Commit Skill

Suppose you notice you're repeatedly asked to write commit messages and have a preferred format:

```markdown
---
name: git-commits
description: Generate descriptive commit messages by analyzing git diffs. Use when writing commit messages or reviewing staged changes.
---

# Git Commit Messages

## Format

Follow conventional commits format:

\`\`\`
type(scope): brief description

Detailed explanation of what changed and why.
\`\`\`

## Types

- `feat` - New feature
- `fix` - Bug fix
- `chore` - Maintenance
- `docs` - Documentation
- `refactor` - Code restructuring

## Examples

**Example 1:**
Input: Added user authentication with JWT tokens

Output:
\`\`\`
feat(auth): implement JWT-based authentication

Add login endpoint and token validation middleware
\`\`\`

**Example 2:**
Input: Fixed date formatting bug

Output:
\`\`\`
fix(reports): correct date formatting in timezone conversion

Use UTC timestamps consistently across report generation
\`\`\`
```

## Validation

When creating skills, ensure they follow the Agent Skills specification:

1. **Frontmatter validation:**
   - Required fields present: `name` and `description`
   - `name` matches directory name and follows naming rules
   - `description` is specific and includes trigger terms
   - Optional fields follow their constraints

2. **Structure validation:**
   - YAML frontmatter is valid
   - Body content is helpful and concise
   - File references are one level deep
   - No time-sensitive information

3. **Testing:**
   - Verify the skill activates for relevant tasks
   - Check that the description triggers the skill appropriately
   - Ensure all referenced files exist

## Important Notes

- Skills are discovered based on their `description` field
- Keep skills focused on a single concept
- Use examples to clarify expected behavior
- Update skills when patterns evolve
- Remove or deprecate outdated skills
- Follow the official [Agent Skills specification](https://agentskills.io)
