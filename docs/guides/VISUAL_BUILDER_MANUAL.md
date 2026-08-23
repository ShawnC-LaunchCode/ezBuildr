# Visual Builder Manual

> **⚠️ Removed feature (2026-07).** The React Flow–based visual/graph builder described here has been removed from the product. Workflows are authored in the **Workflow Builder** (`/workflows/:id/builder`) — the page/step interface. This document is retained for historical reference only.

**VaultLogic Visual Builder** is a React Flow-based graphical interface for designing workflows. It allows creators to build complex document automation logic by dragging and dropping blocks, connecting them with edges, and configuring properties in a visual sidebar.

## Why Use the Visual Builder?

The Visual Builder is designed to make complex logic **intuitive and visible**. Unlike linear lists or raw code, the Visual Builder allows you to:

*   **See the Flow:** instantly understand the path a user takes through your questions, including branches and loops.
*   **Prevent Logic Errors:** visual lines make broken connections or dead ends obvious.
*   **Build Faster:** Drag-and-drop mechanics and pre-configured blocks speed up assembly.
*   **Empower Non-Coders:** "Easy Mode" allows legal experts to build sophisticated automation without writing a single line of code or JSON.
*   **Debug in Place:** The integrated Preview Panel allows you to run and trace your logic without leaving the design canvas.

## Who, When, and What

### **Who** uses it?
*   **Legal Engineers:** To design complex compliance logic and logic trees.
*   **Subject Matter Experts (SMEs):** To sketch out the flow of questions for a new legal domain without needing to code.
*   **Developers:** To rapidly prototype the structure before diving into complex JavaScript ("Advanced Mode").

### **When** is it used?
The Visual Builder is central to the **Design** and **Testing** phases of the lifecycle:
1.  **Drafting:** When mapping out a new automated process from scratch.
2.  **Refining:** When adjusting the order of questions or adding new branches based on feedback.
3.  **Debugging:** When a user reports an error, you use the visual trace to identify exactly where the logic failed.

### **What** do they use it to do?
*   **Map Decision Trees:** Visually connect "If Yes" and "If No" paths.
*   **Connect Data:** Link workflow inputs to Dropdowns, APIs, or Document Templates.
*   **Validate Logic:** Ensure that every possible user answer leads to a valid endpoint (no "dead ends").

## 1. Interface Overview

The Visual Builder is divided into four main areas:

![Builder Layout Placeholder](builder_layout.png)

1.  **Toolbar (Top)**: Global actions like Save, Undo/Redo, Version Control, and Mode Switching.
2.  **Connections Panel (Left)**: Manages external connections, data sources, and integrations.
3.  **Canvas (Center)**: The main workspace where you arrange blocks (Nodes) and define the flow (Edges).
4.  **Properties Sidebar (Right)**: Context-aware panel for configuring the currently selected block.

### Navigation
- **Pan**: Click and drag on empty space or use Space + Drag.
- **Zoom**: Scroll wheel or use Zoom controls (+ / -) in the bottom left.
- **Fit View**: Click the "Fit View" button (⛶) to see the whole workflow.

## 2. Key Concepts

### Blocks (Nodes)
Blocks are the fundamental units of a workflow.
- **Question Blocks**: Collect user input (Text, Multiple Choice, Date, etc.).
- **Logic Blocks**: Control flow (Branching, Loops).
- **Action Blocks**: Perform tasks (Send Email, API Call, Generate Document).
- **Transform Blocks**: Execute custom JavaScript (only available in Advanced Mode).

### Connections (Edges)
Lines connecting blocks represent the control flow.
- **Solid Line**: Direct progression.
- **Dashed Line**: Conditional path (e.g., "If Yes").

### Modes
The builder operates in two modes (toggle in Toolbar):
- **Easy Mode**: Simplified interface. Hides complex block types (JS, API) and uses visual rule builders.
- **Advanced Mode**: Unlocks all features, including raw JSON editing, Transform blocks, and complex logic operators.

## 3. Workflow Management

### Version Control
- **Save**: Manually save via Toolbar or `Cmd+S`. Auto-save runs periodically.
- **History**: Click the clock icon in the toolbar to view Version History.
  - **Restore**: Revert to any previous version.
  - **Snapshot**: Create a named snapshot for testing.

### Run & Preview
- **Preview Panel**: Click "Run/Preview" (or `Cmd+Enter`) to open the embedded runner.
  - Test the flow without leaving the builder.
  - Trace execution step-by-step.
  - Inspect variable values.

## 4. Node Configuration (Sidebar)

When a node is selected, the right sidebar shows its configuration:

### General Settings
- **ID/Alias**: Unique identifier for the block (used in variables).
- **Title**: User-facing label.

### Logic & Rules
- **Visibility**: "Show if..." conditions.
- **Validation**: "Error if..." rules (e.g., Age < 18).
  - *Tip*: Use the **Visual Validation Builder** for easy rule setup.

### Integration
- **Platform**: Send data to integrated platforms (e.g., Clio, Salesforce).

## 5. Keyboard Shortcuts

| Action | Shortcut |
| :--- | :--- |
| **Save** | `Cmd/Ctrl + S` |
| **Preview** | `Cmd/Ctrl + Enter` |
| **Duplicate Block** | `Cmd/Ctrl + D` |
| **Delete Block** | `Backspace` / `Delete` |
| **Select All** | `Cmd/Ctrl + A` |
| **Undo** | `Cmd/Ctrl + Z` |
| **Redo** | `Cmd/Ctrl + Shift + Z` |
| **Zoom In/Out** | `+/-` |

## 6. Advanced Features

### Variable Picker
When configuring logic or text templates, type `{{` to open the Variable Picker. It allows you to reference answers from previous steps (e.g., `{{ client_name }}`).

### Transform Blocks (Advanced Code)
Use JavaScript to perform complex calculations.
- **Input**: `inputs.variableName`
- **Output**: `return value`

## 7. Troubleshooting

**"Blank Screen" on Load:**
- Usually a data fetch error. Check the console. Fixed in recent patch (Check `WorkflowHistoryDialog`).

**"Run Failed" (400 Bad Request):**
- Input mismatch. Ensure the runner sends `inputJson` correctly. Fixed in `useWorkflowAPI.ts`.

---
*Last Updated: Dec 16, 2025*
