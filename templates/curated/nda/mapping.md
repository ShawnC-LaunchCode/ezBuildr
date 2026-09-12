# NDA — variable mapping

`template.docx` uses each workflow alias directly as its tag name (identity
mapping — the shipped grammar's default, per `docs/guides/VARIABLES_IN_DOCUMENTS.md`).
No `FinalBlockConfig.documents[].mapping` renaming is needed for this template;
list it here anyway so an editor can see the contract at a glance without opening
the `.docx` in Word.

| Workflow alias | Question | Required | Used in `template.docx` as |
|---|---|---|---|
| `disclosing_party` | Disclosing Party — legal name | yes | `{{disclosing_party}}` |
| `receiving_party` | Receiving Party — legal name | yes | `{{receiving_party}}` |
| `receiving_party_signer_pronoun` | Receiving Party signer's pronouns | no | `{{receiving_party_signer_pronoun \| pronounSubject \| capitalize}}`, `{{receiving_party_signer_pronoun \| pronounVerb:"acknowledges"}}` |
| `bound_individual_count` | # individuals at Receiving Party with access | yes | `{{bound_individual_count}}`, `{{bound_individual_count \| plural:"individual":"individuals"}}`, `{{bound_individual_count \| isAre}}`, `{{bound_individual_count \| itsTheir}}`, `{{bound_individual_count \| hasHave}}` |
| `effective_date` | Effective Date | yes | `{{effective_date \| longdate}}` |
| `term_years` | Confidentiality term (years) | yes | `{{term_years}}` |
| `governing_law_state` | Governing law — state | yes | `{{governing_law_state}}` |

## Notes

- Clause numbers (`1. Confidential Information.`, `2. Obligations...`, etc.)
  use `legalNumber` with **literal ordinals** (`{{1 | legalNumber}}`, `{{2 | legalNumber}}`, ...)
  since the NDA's clause order is fixed, not driven by a loop. This is the
  "or a literal for a fixed clause" case documented at
  `server/services/draftingPrimitives.ts:21` and in the guide's numbering
  section — numbering stays pure (no hidden counter) either way.
- `receiving_party_signer_pronoun` is left unanswered in the sample run used by
  `tests/unit/services/document/curatedTemplates.test.ts`, so the rendered
  document shows the **default they/them** form ("They acknowledge...").
  A second assertion in that test re-renders with an explicit `he/him` value
  for the same alias and checks the output changes to "He acknowledges...",
  proving there is no name-based inference (only the explicit pronoun value
  changes the output — `disclosing_party`/`receiving_party` stay constant).
