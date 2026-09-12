# Accessibility Conformance Report & VPAT Checklist (WCAG 2.2 Level AA)

**Product:** ezBuildr (Workflow Builder & Interview Runner)  
**Evaluation Standard:** Web Content Accessibility Guidelines (WCAG) 2.2 Level AA / Revised Section 508 Standards  
**Date:** August 2026  
**Status:** Internal engineering conformance baseline established  
**Independent audit:** Not performed; this report is not a third-party certification  

---

## 1. Executive Summary

ezBuildr is committed to ensuring digital accessibility for all users, including individuals with disabilities. This document provides the Accessibility Conformance Report and VPAT (Voluntary Product Accessibility Template) checklist for both the **Workflow Builder** authoring environment and the **Client Runner** interview execution engine.

### Core Conformance Highlights
- **Keyboard Operability:** 100% of runner interactive inputs and builder controls are operable via standard keyboard navigation (`Tab`, `Shift+Tab`, `Enter`, `Space`, `Arrow` keys, `Home`, `End`).
- **WAI-ARIA Radio Groups:** Star ratings and radio choices implement complete WAI-ARIA radio group semantics, roving `tabIndex`, and arrow key selection.
- **WAI-ARIA Tabs & Panels:** Builder navigation tabs implement `role="tablist"` and `role="tab"` with `aria-controls` linked bidirectionally to corresponding `role="tabpanel"` surfaces labeled by `aria-labelledby`.
- **Focus Indicators:** High-contrast, unambiguous focus rings (`focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`) across all interactive controls.
- **Screen Reader Compatibility:** Semantic HTML5 landmarks, explicit form labels, ARIA roles, and state associations (`aria-required`, `aria-invalid`, `aria-describedby`, `aria-checked`, `aria-pressed`, `aria-expanded`).
- **Dynamic Announcements:** `aria-live` polite status regions for autosave states ("Saving...", "Saved") and `role="alert"` assertive regions for validation errors.
- **Color Contrast Assurance:** Programmatic relative-luminance verification reads the production light and dark CSS tokens and checks every WCAG-relevant semantic foreground/background pair plus interactive control-boundary and focus-indicator pairs (4.5:1 for normal text and 3:1 for graphical UI components). Decorative panel separators are intentionally excluded from Success Criterion 1.4.11.
- **Automated Verification:** Automated `axe-core` accessibility rule assertions integrated into the test pipeline with zero critical or serious violations.

---

## 2. WCAG 2.2 Level AA Conformance Matrix

| WCAG 2.2 Criteria | Level | ezBuildr Status | Remarks & Implementation Details |
|---|---|---|---|
| **1.1.1 Non-text Content** | A | **Supports** | All icons and non-text visual indicators provide programmatic alternatives (`aria-label`, alt text, or `aria-hidden="true"` when decorative). |
| **1.3.1 Info and Relationships** | A | **Supports** | Form controls use explicit `<Label>` association or `aria-labelledby`/`aria-label`. Star rating scales implement `role="radiogroup"` / `role="radio"`. Boolean buttons use `role="group"`. Builder tabs link to `role="tabpanel"` via `aria-controls` and `aria-labelledby`. |
| **1.3.2 Meaningful Sequence** | A | **Supports** | DOM order matches visual reading sequence across single-column runner flows and builder card stacks. |
| **1.3.3 Sensory Characteristics** | A | **Supports** | Instructions do not rely solely on shape, size, or color. |
| **1.4.1 Use of Color** | A | **Supports** | Color is never used as the sole visual means of conveying error states; error text and icon indicators accompany color changes. |
| **1.4.3 Contrast (Minimum)** | AA | **Supports** | Semantic normal-text pairs, including primary and destructive button labels, links, muted text, block labels, and all question-family badges, meet or exceed 4.5:1 in both themes. Verified from the production CSS tokens by `tests/unit/client/colorContrast.test.ts`. |
| **1.4.11 Non-text Contrast** | AA | **Supports** | Interactive input/outline boundaries and focus rings maintain at least 3:1 against both page and card surfaces in both themes. Decorative panel separators are not required to convey component identity or state. |
| **2.1.1 Keyboard** | A | **Supports** | All functionality is operable via keyboard. Sliders, star ratings, comboboxes, dropdowns, and builder tabs support standard keyboard interaction patterns (roving tabindex, arrow navigation, Home/End). |
| **2.1.2 No Keyboard Trap** | A | **Supports** | Focus can be moved away from all interactive components using standard navigation keys. |
| **2.4.3 Focus Order** | A | **Supports** | Focus progresses in a logical, sequential order matching the visual page layout. |
| **2.4.7 Focus Visible** | AA | **Supports** | All focusable components display prominent focus indicators via `focus-visible:ring-2`. |
| **2.5.3 Label in Name** | A | **Supports** | Accessible names for buttons and inputs match or include visible text labels. |
| **2.5.8 Target Size (Minimum)** | AA | **Supports** | Interactive touch/click targets meet minimum 24x24 CSS pixel sizing guidelines. |
| **3.2.1 On Focus** | A | **Supports** | Receiving focus does not automatically trigger context changes or form submissions. |
| **3.2.2 On Input** | A | **Supports** | Changing input values does not unpredictably alter context without user awareness. |
| **3.3.1 Error Identification** | A | **Supports** | Input validation errors are highlighted, described in text, and connected via `aria-describedby` and `aria-invalid="true"`. |
| **3.3.2 Labels or Instructions** | A | **Supports** | Every question block provides clear label text and optional placeholder/help descriptions. |
| **3.3.3 Error Suggestion** | AA | **Supports** | Validation errors describe the specific format or requirement (e.g. required field, valid email format). |
| **4.1.2 Name, Role, Value** | A | **Supports** | Custom controls (`BuilderTabNav`, `ScaleBlock`, `BooleanBlock`) implement valid WAI-ARIA roles (`tablist`, `tab`, `tabpanel`, `radiogroup`, `radio`, `group`) and state attributes (`aria-selected`, `aria-checked`, `aria-expanded`). |
| **4.1.3 Status Messages** | AA | **Supports** | Autosave status updates ("Saving...", "Saved", "Save failed") are announced via `role="status"` `aria-live="polite"` without interrupting user input. |

---

## 3. Color Contrast Audit & Verification Methodology

### Testing Methodology
- **Headless DOM testing limitation:** In Vitest / jsdom unit tests, `axe-core` disables the `color-contrast` rule because jsdom does not implement a layout or CSS font rendering engine (it cannot calculate pixel geometry, layout bounding boxes, or computed background compositing).
- **Automated Relative Luminance Suite (`tests/unit/client/colorContrast.test.ts`):** The suite reads `client/src/index.css`, parses the production HSL token values for `:root` and `.dark`, and calculates exact relative luminance ($Y$) and contrast ratios ($CR = \frac{L_1 + 0.05}{L_2 + 0.05}$). It fails when a referenced token disappears or when a WCAG-relevant semantic pair falls below its threshold, so copied test constants cannot drift from the shipped theme.

### Contrast Ratio Audit Matrix

#### Light Theme
| UI Token Pair | Foreground HSL | Background HSL | Contrast Ratio | WCAG AA Threshold | Status |
|---|---|---|---|---|---|
| **Body Text on Background** | `hsl(220, 10%, 10%)` | `hsl(220, 14%, 96%)` | **16.09:1** | 4.5:1 | **Pass (AAA)** |
| **Card Text on Card Surface** | `hsl(220, 10%, 10%)` | `hsl(0, 0%, 100%)` | **17.66:1** | 4.5:1 | **Pass (AAA)** |
| **Muted / Help Text** | `hsl(220, 10%, 40%)` | `hsl(220, 14%, 96%)` | **5.53:1** | 4.5:1 | **Pass (AA)** |
| **Primary Button Text** | `hsl(0, 0%, 100%)` | `hsl(220, 90%, 48%)` | **5.99:1** | 4.5:1 | **Pass (AA)** |
| **Destructive Button Text** | `hsl(0, 0%, 98%)` | `hsl(0, 75%, 42%)` | **6.10:1** | 4.5:1 | **Pass (AA)** |
| **Input Boundary on Background** | `hsl(220, 13%, 57%)` | `hsl(220, 14%, 96%)` | **3.06:1** | 3.0:1 | **Pass (AA)** |
| **Focus Ring on Card** | `hsl(220, 90%, 48%)` | `hsl(0, 0%, 100%)` | **5.99:1** | 3.0:1 | **Pass (AA)** |
| **Text Question Badge** | `hsl(215, 80%, 44%)` | `hsl(215, 80%, 96%)` | **5.24:1** | 4.5:1 | **Pass (AA)** |
| **Boolean Question Badge** | `hsl(145, 80%, 26%)` | `hsl(145, 80%, 96%)` | **5.34:1** | 4.5:1 | **Pass (AA)** |
| **Structure Question Badge** | `hsl(75, 80%, 25%)` | `hsl(75, 80%, 96%)` | **5.24:1** | 4.5:1 | **Pass (AA)** |
| **Validated Question Badge** | `hsl(178, 80%, 25%)` | `hsl(178, 80%, 96%)` | **5.43:1** | 4.5:1 | **Pass (AA)** |
| **Date/Time Question Badge** | `hsl(258, 80%, 50%)` | `hsl(258, 80%, 96%)` | **6.80:1** | 4.5:1 | **Pass (AA)** |
| **Choice Question Badge** | `hsl(330, 80%, 41%)` | `hsl(330, 80%, 96%)` | **5.38:1** | 4.5:1 | **Pass (AA)** |
| **Numeric Question Badge** | `hsl(25, 80%, 35%)` | `hsl(25, 80%, 96%)` | **5.37:1** | 4.5:1 | **Pass (AA)** |
| **Advanced Question Badge** | `hsl(292, 80%, 41%)` | `hsl(292, 80%, 96%)` | **5.38:1** | 4.5:1 | **Pass (AA)** |
| **Display Question Badge** | `hsl(220, 10%, 38%)` | `hsl(220, 13%, 94%)` | **5.69:1** | 4.5:1 | **Pass (AA)** |

#### Dark Theme
| UI Token Pair | Foreground HSL | Background HSL | Contrast Ratio | WCAG AA Threshold | Status |
|---|---|---|---|---|---|
| **Body Text on Background** | `hsl(220, 10%, 96%)` | `hsl(220, 15%, 10%)` | **16.19:1** | 4.5:1 | **Pass (AAA)** |
| **Card Text on Card Surface** | `hsl(220, 10%, 96%)` | `hsl(220, 15%, 13%)` | **14.98:1** | 4.5:1 | **Pass (AAA)** |
| **Muted / Help Text** | `hsl(220, 10%, 60%)` | `hsl(220, 15%, 10%)` | **5.94:1** | 4.5:1 | **Pass (AA)** |
| **Primary Button Text** | `hsl(220, 15%, 8%)` | `hsl(220, 90%, 65%)` | **5.66:1** | 4.5:1 | **Pass (AA)** |
| **Destructive Button Text** | `hsl(220, 15%, 10%)` | `hsl(0, 75%, 62%)` | **4.93:1** | 4.5:1 | **Pass (AA)** |
| **Input Boundary on Card** | `hsl(220, 15%, 45%)` | `hsl(220, 15%, 13%)` | **3.15:1** | 3.0:1 | **Pass (AA)** |
| **Focus Ring on Card** | `hsl(220, 90%, 65%)` | `hsl(220, 15%, 13%)` | **5.01:1** | 3.0:1 | **Pass (AA)** |
| **Text Question Badge** | `hsl(215, 60%, 66%)` | `hsl(215, 40%, 18%)` | **5.31:1** | 4.5:1 | **Pass (AA)** |
| **Boolean Question Badge** | `hsl(145, 60%, 55%)` | `hsl(145, 40%, 18%)` | **5.88:1** | 4.5:1 | **Pass (AA)** |
| **Structure Question Badge** | `hsl(75, 60%, 64%)` | `hsl(75, 40%, 18%)` | **7.03:1** | 4.5:1 | **Pass (AA)** |
| **Validated Question Badge** | `hsl(178, 60%, 55%)` | `hsl(178, 40%, 18%)` | **6.07:1** | 4.5:1 | **Pass (AA)** |
| **Date/Time Question Badge** | `hsl(258, 60%, 70%)` | `hsl(258, 40%, 18%)` | **5.23:1** | 4.5:1 | **Pass (AA)** |
| **Choice Question Badge** | `hsl(330, 60%, 68%)` | `hsl(330, 40%, 18%)` | **5.37:1** | 4.5:1 | **Pass (AA)** |
| **Numeric Question Badge** | `hsl(25, 60%, 62%)` | `hsl(25, 40%, 18%)` | **5.30:1** | 4.5:1 | **Pass (AA)** |
| **Advanced Question Badge** | `hsl(292, 60%, 67%)` | `hsl(292, 40%, 18%)` | **5.22:1** | 4.5:1 | **Pass (AA)** |
| **Display Question Badge** | `hsl(220, 12%, 66%)` | `hsl(220, 10%, 20%)` | **5.24:1** | 4.5:1 | **Pass (AA)** |

---

## 4. Supported UI Patterns & Component Specifications

### 1. Rating Scale Input (`ScaleBlock.tsx`)
- **Slider mode:** Radix Slider with keyboard increment/decrement (`ArrowLeft`, `ArrowRight`, `Home`, `End`), `aria-label`, and `aria-describedby`.
- **Stars mode:**
  - Container: `role="radiogroup"`, `aria-label={step.title}`, `aria-describedby`, `aria-required`, `aria-invalid`.
  - Individual Stars: `role="radio"`, `aria-checked={starValue === currentValue}`, `aria-label="${starValue} of ${numStars} stars"`.
  - Roving `tabIndex`: Checked star has `tabIndex=0` (or star 1 if unset); all other stars have `tabIndex=-1`.
  - Keyboard Navigation:
    - `ArrowRight` / `ArrowDown`: Selects and focuses the next star (`+1`).
    - `ArrowLeft` / `ArrowUp`: Selects and focuses the previous star (`-1`).
    - `Home`: Selects and focuses star 1.
    - `End`: Selects and focuses the highest star (`numStars`).

### 2. Workflow Builder Navigation & Panels (`BuilderTabNav.tsx` & `BuilderTabPanel.tsx`)
- **Tablist (`BuilderTabNav.tsx`):**
  - Container: `role="tablist"`, `aria-label="Workflow Builder Navigation"`, `aria-orientation="horizontal"`.
  - Tabs: `role="tab"`, `id="builder-tab-<id>"`, `aria-controls="builder-tabpanel-<id>"`, `aria-selected={isActive}`, `tabIndex={isActive ? 0 : -1}`.
  - Keyboard Traversal: Arrow key navigation with automatic roving focus and wrap-around (`ArrowRight`, `ArrowLeft`, `Home`, `End`).
- **Tabpanel (`WorkflowBuilder.tsx`):**
  - Container: `role="tabpanel"`, `id="builder-tabpanel-<activeTab>"`, `aria-labelledby="builder-tab-<activeTab>"`, `tabIndex={0}`.

### 3. Step & Block Cards (`BlockCard.tsx`)
- Drag handles provide explicit `aria-label="Reorder block"`.
- Expand/collapse toggle buttons include `aria-label={isExpanded ? "Collapse block" : "Expand block"}` and `aria-expanded={isExpanded}`.
- Delete buttons include `aria-label="Delete block"`.

### 4. Repeating List Items (`ListItemsView.tsx`)
- Item-open and keyboard-reorder buttons use the same token-backed, two-pixel focus ring as the rest of the runner.
- Reorder controls expose item-specific accessible names (for example, `aria-label="Reorder Ava"`), while decorative grip and chevron icons are hidden from assistive technology.

---

## 5. Automated Testing & Verification

Automated accessibility checks are maintained across three dedicated test suites:
- `tests/unit/client/PageSteps.a11y.test.tsx`: Tests all runner step types, empty/filled/error states, star rating radio group keyboard navigation, roving tabindex, list-item focus indicators, and axe-core conformance.
- `tests/unit/client/BuilderTabNav.a11y.test.tsx`: Tests builder tablist/tab semantics, `aria-controls` to `role="tabpanel"` associations, and roving keyboard traversal.
- `tests/unit/client/colorContrast.test.ts`: Reads the production theme tokens and validates every declared semantic text pair plus interactive input-boundary and focus-ring pairs in light and dark mode.

The `Run All Tests (Unit + Integration + Auth)` job in `.github/workflows/ci.yml` executes `npm run test`, which includes the `unit-fast` project and therefore makes these axe-core assertions and contrast checks blocking CI checks.

To run the automated accessibility test suite:
```bash
npx vitest run --project unit-fast tests/unit/client/PageSteps.a11y.test.tsx tests/unit/client/BuilderTabNav.a11y.test.tsx tests/unit/client/colorContrast.test.ts
```
