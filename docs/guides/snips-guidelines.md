# Snips Guidelines

## Overview
**Snips** are reusable workflow fragments (mini-workflows) that can be inserted into any workflow. They help creators build faster by providing preconfigured sets of pages, questions, and logic.

---

## Core Concepts

### What is a Snip?
A Snip is a self-contained workflow component that may include:
- **Pages/sections** (one or more)
- **Questions** (with aliases using dot notation)
- **Logic blocks** (read/write/list tools, JS blocks)
- **Show/hide logic** rules
- **Default value mappings** (optional)
- **Document template attachments** (future feature)

### Examples
- **Respondent Info**: Name, address, contact details
- **Fee Waiver**: Conditional questions + optional document templates
- **Children Loop**: Repeating questions with database upserts

---

## Naming Conventions

### Snip Names
- Use **PascalCase** for snip identifiers: `RespondentInfo`, `FeeWaiver`, `ChildrenLoop`
- Keep names concise but descriptive
- Avoid abbreviations unless widely recognized

### Variable Naming (Aliases)
- Use **dot notation** for nested variables: `respondent.name.first`, `respondent.address.street`
- Prefix with snip category when logical: `fee_waiver.income`, `child.1.name`
- Follow existing project alias conventions (e.g., `snake_case` or `camelCase`)

---

## Variable Strategy

### Stable Internal IDs
- Each question/block in a snip has a **stable internal ID** (UUID)
- IDs remain constant across snip versions
- Never rely on IDs for variable resolution; always use **aliases**

### Alias Remapping at Import
- When importing a snip, the system will allow **alias remapping**
- This prevents asking the same question twice if data already exists
- Example:
  - Snip uses `respondent.name.first`
  - Workflow already has `client.first_name`
  - Creator can map `respondent.name.first` → `client.first_name`

### Conflict Resolution Rules

#### Alias Collision
If imported snip alias matches an existing workflow variable:
1. **Prompt user**: "Variable `respondent.name` already exists. Map to existing or rename?"
2. **Options**:
   - **Map to existing**: Use existing variable (skip question)
   - **Rename imported**: Change snip's alias to avoid conflict

#### Page Name Collision
If imported snip page name matches existing page:
1. **Auto-rename**: Append ` (2)` to the imported page name
2. **Notify user**: "Page 'Contact Information' renamed to 'Contact Information (2)'"

#### Logic References
- Conditional logic referencing variables **must use aliases**, not IDs
- On import, all logic expressions are **validated and updated**
- If a referenced variable is remapped, logic expressions are automatically updated

---

## Versioning Strategy

### Snip Version Semantics (MVP)

**Version format**: Simple semantic versioning (e.g., `1.0`, `1.1`, `2.0`)

**Core rules**:
- A workflow always runs against the **version it imported**
- Snips are **templates**, not live dependencies
- **No auto-updates**: Workflows remain stable even when new snip versions are released
- **No upgrade flow** in MVP (planned for future)

### Version Metadata Storage

When a snip is imported into a workflow, the following metadata is stored:

- `snipId` - Unique identifier of the snip
- `snipVersion` - Version number at time of import (e.g., "1.0.0")
- `importedAt` - ISO timestamp of import
- `importedPageIds` - Array of created section IDs
- `importedQuestionIds` - Array of created step IDs

**This metadata is immutable** once imported. It provides an audit trail and enables future features like upgrade notifications.

### Version Compatibility

- **Patch updates** (e.g., `1.0.1`): Typo fixes, minor UX improvements
  - **Auto-update safe**: Can update existing imports without breaking workflows
- **Minor updates** (e.g., `1.1.0`): New optional questions/logic
  - **Update recommended**: Notify user but don't force
- **Major updates** (e.g., `2.0.0`): Breaking changes (removed/renamed variables)
  - **Manual migration required**: Cannot auto-update; must re-import

### Update Notifications

- Track imported snip version in workflow metadata
- Periodically check for snip updates
- Show notification: "An update is available for 'Respondent Info' snip (v1.2.0)"

---

## Collision Detection & Safe Defaults

### What Gets Checked for Collisions

When importing a snip, the system automatically detects collisions against:

1. **Question aliases** - All existing `step.alias` values
2. **JS question outputs** - All `step.options.outputKey` values (for JS questions)
3. **Future**: JS block outputs, query block variables, list-derived variables

### Alias Collision Behavior (Critical Safety Feature)

If an alias collision is detected, the system **never overwrites** existing variables.

**Default behavior**:
- Auto-rename imported aliases with a **deterministic suffix**
- Example: `respondent.name.first` becomes `respondent_2.name.first`
- The suffix is applied to the **namespace** (first part before the dot)
- Logic inside the snip continues to work (references are updated)

**Renaming algorithm**:
```
Original:  respondent.name.first
Collision: YES (respondent.name.first already exists)
Renamed:   respondent_2.name.first

Original:  fee_waiver.income
Collision: YES 
Renamed:   fee_waiver_2.income
```

**Counter increment**: If `respondent_2` also exists, the system tries `respondent_3`, `respondent_4`, etc. until a unique name is found.

### Page Name Collision Behavior

If a page name collides with an existing section title:

**Behavior**: Auto-rename page with parenthetical suffix

**Examples**:
- "Respondent Info" → "Respondent Info (2)"
- "Respondent Info (2)" → "Respondent Info (3)"

**Important**: This renaming affects **display only**. Internal IDs and logic references remain independent.

### Import Feedback

After import, users receive minimal but clear feedback:

**No collisions**:
> "Snip imported. Pages and questions have been added to your workflow"

**Collisions detected**:
> "Snip imported. Pages and questions have been added to your workflow. Some variables were renamed to avoid conflicts"

**What we DON'T show** (to avoid confusion):
- Raw UUID mappings
- Detailed alias transformation logs
- Internal snip IDs

Users can inspect the workflow to see the renamed variables if needed.

---

## Document Attachments (Future)

### Conceptual Design
- Snips may include **document templates** (e.g., Fee Waiver Petition PDF)
- Templates are imported **alongside questions**
- Variable references in templates automatically **map to snip aliases**
- On import, template variables are remapped if aliases change

### Placeholder for Now
- **Not required in this sprint**
- Data model should **reserve space** for `templateAttachments: []` in snip schema
- UI should **not expose** this feature yet

---

## Import Behavior

### Adding at Bottom of Workflow
- **Initial implementation**: Snips always import at the **end** of the workflow
- Pages are appended after existing pages
- Order preserved from snip definition

### Future: Insertion Anywhere
- **Planned feature**: Allow insertion at specific position in workflow
- Will require reordering logic to insert mid-workflow

### Default Values
- Snip questions may define **default values**
- Defaults are imported as-is (not overridden by workflow defaults)
- Creator can adjust after import

---

## Technical Implementation Notes

### Data Model
```typescript
interface SnipDefinition {
  id: string;              // UUID
  name: string;            // PascalCase, e.g., "RespondentInfo"
  displayName: string;     // Human-readable, e.g., "Respondent Information"
  description: string;     // What this snip provides
  version: string;         // Semantic version: "1.0.0"
  category?: string;       // Optional grouping: "Intake", "Financial", etc.
  
  pages: SnipPage[];       // Pages/sections to import
  logicBlocks?: SnipLogicBlock[];  // Optional logic blocks
  templateAttachments?: string[];  // Reserved for future use
  
  metadata: {
    createdAt: string;
    updatedAt: string;
    author?: string;
  };
}

interface SnipPage {
  id: string;              // Stable ID (NOT used after import; replaced by new UUID)
  title: string;
  description?: string;
  order: number;
  
  questions: SnipQuestion[];
  visibleIf?: ConditionExpression;  // Optional page-level logic
}

interface SnipQuestion {
  id: string;              // Stable ID (replaced on import)
  title: string;
  type: StepType;
  required: boolean;
  alias: string;           // Dot notation: "respondent.name.first"
  description?: string;
  options?: any;
  defaultValue?: any;
  visibleIf?: ConditionExpression;
  order: number;
}

interface SnipLogicBlock {
  id: string;
  type: "read" | "write" | "js" | "validate";
  phase: "onSectionEnter" | "onSectionSubmit";
  config: any;
  sectionIndex: number;    // Which snip page this attaches to
  order: number;
}
```

### API/Service Requirements
- **List available snips**: `GET /api/snips`
- **Get snip definition**: `GET /api/snips/:snipId`
- **Import snip**: `POST /api/workflows/:workflowId/import-snip`
  - Payload: `{ snipId, aliasMappings: { "old.alias": "new.alias" } }`
  - Returns: `{ importedPageIds: [], importedQuestionIds: [] }`

### Local Registry (Initial Implementation)
- **Hardcoded snips** in a local JSON file or TypeScript module
- **No server-side storage** in this sprint
- Example: `/client/src/lib/snips/registry.ts`

---

## Best Practices

### For Snip Authors

1. **Use scoped, descriptive aliases**: 
   - ✅ GOOD: `respondent.name.first`, `fee_waiver.income`, `children.age`
   - ❌ BAD: `fn`, `income`, `age`
   
2. **Namespace all variables**:
   - Always prefix with snip category: `respondent.*`, `fee_waiver.*`, `children.*`
   - This minimizes collision risk when importing multiple snips
   
3. **Avoid overly generic names**:
   - ❌ BAD: `name`, `address`, `phone` (high collision risk)
   - ✅ GOOD: `respondent.name`, `respondent.address`, `respondent.phone`
   
4. **Minimize dependencies**: 
   - Snips should work standalone
   - Don't assume variables from outside the snip exist
   
5. **Document required context**: 
   - If snip needs external variables, document in `description`
   - Clearly state any prerequisites

6. **Test collision scenarios**:
   - Import snip into a workflow that already has similar variables
   - Verify auto-renaming works correctly
   - Ensure renamed variables still function in logic/documents

### For Workflow Creators

1. **Review before importing**: 
   - Understand what questions/logic the snip adds
   - Check if you already have similar variables
   
2. **Accept auto-renames when safe**:
   - The system protects you from collisions automatically
   - Renamed variables (e.g., `respondent_2.*`) still work correctly
   
3. **Manually rename if needed**:
   - If auto-rename creates confusing names, manually adjust after import
   - Update any logic/document references accordingly
   
4. **Test after import**: 
   - Ensure conditional logic works as expected
   - Verify required fields enforce correctly
   - Check document variable resolution

### Collision Avoidance Strategies

**If you expect to import multiple similar snips**:
- Use distinct namespaces in each snip
- Example: `primary_respondent.*` vs `secondary_respondent.*`

**If building a snip library for a team**:
- Establish naming conventions early
- Document reserved namespaces
- Coordinate with other snip authors

---

## Constraints & Limitations (Current Sprint)

### What We're NOT Building Yet
- ❌ Snip marketplace or sharing between accounts
- ❌ AI-generated snips
- ❌ Full remapping UI (basic only)
- ❌ Document template attachments

### What We ARE Building
- ✅ Snip data model (JSON structure)
- ✅ Local snip registry (hardcoded)
- ✅ Import snip UI entry point (minimal)
- ✅ One demo snip: "Respondent Info"
- ✅ Basic import behavior (add at bottom)

---

## Testing & Validation

### Snip Import Checklist
- [ ] All pages imported at bottom of workflow
- [ ] All questions have valid, unique aliases
- [ ] Required/conditional pills display correctly
- [ ] Logic expressions reference correct (possibly remapped) aliases
- [ ] No duplicate aliases after import
- [ ] Imported questions appear in variable pickers

---

## Future Enhancements (Not This Sprint)

1. **Snip Composition**: Snips referencing other snips
2. **Conditional Snip Inclusion**: Import snip only if condition met
3. **Snip Analytics**: Track usage/adoption of popular snips
4. **Community Snips**: Sharing/rating system
5. **Template Bundling**: Import document templates alongside questions

---

## Questions & Feedback

For questions about snips or to propose new snips, contact the VaultLogic team or submit via internal channels.

---

**Last Updated**: December 15, 2024  
**Version**: 1.0 (Initial Draft)
