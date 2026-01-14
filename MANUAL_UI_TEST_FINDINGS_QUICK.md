# Manual UI Test Findings - Quick Notes

**Tester:** [Your Name]
**Date:** 2026-01-10
**Browser:** [Browser + Version]
**Time Spent:** _____ minutes

---

## 1. Operator Labels & Grouping (First Impressions)

### Dropdown Organization
- **First impression:**
- **Clarity (1-5):** ___ / 5
- **Any confusion?**

### Strict vs Case-Insensitive
- **Is the distinction clear?** ☐ Yes ☐ No ☐ Somewhat
- **Suggested improvements:**

### Label Suggestions
| Current | Better? | Why |
|---------|---------|-----|
| Equals (strict) | | |
| Contains (case-insensitive) | | |

---

## 2. Building Real Transforms

### Multi-Step Transform (Active Sales Team, Sorted, Limited)
- **Time to configure:** _____ min
- **Any friction?**
- **AND combinator clear?** ☐ Yes ☐ No
- **Notes:**

### Case-Insensitive Search (Find "alice" any case)
- **Easy to find contains_ci?** ☐ Yes ☐ No
- **Results as expected?** ☐ Yes ☐ No
- **Notes:**

### Null Handling (is_empty vs exists)
- **Distinction clear?** ☐ Yes ☐ No
- **Would beginners understand?** ☐ Yes ☐ No
- **Suggested improvements:**

---

## 3. Config Persistence

### Complex Config Save/Reload
- **All config preserved?** ☐ Yes ☐ No
- **Any data loss?** ☐ Yes ☐ No
- **Notes:**

### Edit and Re-save
- **Changes persisted?** ☐ Yes ☐ No
- **Unintended changes?** ☐ Yes ☐ No

---

## 4. Specific Behaviors

### Dedupe with Nulls
- **All nulls kept as expected?** ☐ Yes ☐ No
- **UI communicate this?** ☐ Yes ☐ No
- **Add hint about null preservation?** ☐ Yes ☐ No

### Strict Equality (age equals "30" string)
- **Behaved as expected?** ☐ Yes ☐ No
- **"(strict)" label helpful?** ☐ Yes ☐ No
- **Need type mismatch warning?** ☐ Yes ☐ No

### limit=0
- **Returned empty as expected?** ☐ Yes ☐ No
- **Is this intuitive?** ☐ Yes ☐ No

---

## Quick Takeaways

### ✅ What Worked Well
1.
2.
3.

### ⚠️ What Felt Confusing
1.
2.
3.

### 🔧 Top 3 UI Improvements
1.
2.
3.

---

## Decision Recommendations

**Operator Labels:**
- ☐ Keep as-is
- ☐ Rename some (specify above)
- ☐ Add grouping/separators

**Visual Hints:**
- ☐ Add tooltips for complex operators
- ☐ Add inline help text
- ☐ Add "what will happen" preview
- ☐ None needed

**Null Handling Communication:**
- ☐ Add note in dedupe UI
- ☐ Add note in is_empty/exists
- ☐ Current labels sufficient

**Strict Equality:**
- ☐ Add type mismatch detection
- ☐ Keep as-is (intentional strictness)

**Next Phase Priority:**
- ☐ Small UI tweaks first (specify what)
- ☐ Move to Choice editor reuse
- ☐ Start autocomplete/preview features
- ☐ Other: ___________

---

## Overall Assessment

**UX Clarity (1-5):** ___ / 5
**Confidence in semantics (1-5):** ___ / 5
**Feels honest & predictable?** ☐ Yes ☐ Mostly ☐ No

**Ready for users?**
- ☐ Yes, ship it
- ☐ With minor tweaks (specified above)
- ☐ Needs more work (specify)

---

## Additional Notes

[Free-form notes, screenshots, specific issues]
