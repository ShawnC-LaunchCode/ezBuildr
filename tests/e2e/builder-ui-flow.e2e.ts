import { test, expect, type Page } from "@playwright/test";

/**
 * ICW2-B4 — Real builder E2E (UI-driven)
 *
 * Unlike `creator-flow-complete.e2e.ts` (which drives every structural step
 * through `page.request`), this spec drives the actual builder UI with real
 * clicks/typing: create workflow -> add a page -> add two questions (editing
 * title/description through their form fields) -> reorder the questions ->
 * attach an Easy-mode visibility condition -> activate via the Review tab ->
 * run the workflow and submit an answer.
 *
 * `page.request` is used ONLY for: (a) the dev-login auth stub, and (b)
 * read-only verification of persisted state (the ticket's AC3 explicitly
 * allows "reload or API read" for those checks) — never to drive a
 * structural/UI step.
 *
 * Chromium-only: the keyboard-driven dnd-kit reorder (Space to lift, Arrow to
 * move, Space to drop) is the resilient alternative to simulating a raw mouse
 * drag, but is the most sensitive part of the flow to engine differences.
 * Restricting to chromium avoids cross-browser flakiness in that one step
 * without weakening any assertion (see the `builder-ui-flow` project below).
 *
 * Scope note: the run/submit tail proves a real run is created, the runner
 * renders the activated workflow (the live proof of the P0 runner fix), the
 * conditional Date step is hidden until the controlling Yes/No question is
 * answered Yes (and hides again on No — ICW2-B10), and the final submit
 * completes. This spec passes reliably against a fresh dev server; running it
 * many times back-to-back locally can degrade the shared dev:test server (CI
 * starts a fresh server per run and applies retries).
 */

async function loginAsDevUser(page: Page): Promise<void> {
  await page.goto("/");
  // Seed: the `/api/auth/dev-login` stub looks up a pre-existing
  // `dev@example.com` user and 500s if it doesn't exist yet on this
  // database. `/api/auth/register` is idempotent for an already-registered
  // email (still returns 201, generic "please verify" message — no account
  // enumeration), so it's safe to call unconditionally here as a seed step.
  await page.request.post("/api/auth/register", {
    data: {
      email: "dev@example.com",
      password: "Xk9#mQ2vLp8zR4wN!",
      firstName: "Dev",
      lastName: "User",
    },
  });
  const loginResponse = await page.request.post("/api/auth/dev-login");
  expect(loginResponse.ok()).toBeTruthy();
  await page.reload();
  await page.waitForLoadState("networkidle");
}

test.describe("ICW2-B4: Real builder E2E (UI-driven)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Keyboard-driven dnd-kit reorder is chromium-only (see file header)");
  test.setTimeout(120_000);

  test("create -> page -> steps -> reorder -> condition -> activate -> run, entirely via the builder UI", async ({ page }) => {
    // ------------------------------------------------------------------
    // Auth (page.request — allowed for auth/seed only)
    // ------------------------------------------------------------------
    await loginAsDevUser(page);

    // ------------------------------------------------------------------
    // 1. Create workflow through the UI form (not page.request)
    // ------------------------------------------------------------------
    const workflowTitle = `ICW2-B4 Builder E2E ${Date.now()}`;
    await page.goto("/workflows/new");
    await page.getByLabel("Title *").fill(workflowTitle);
    await page.getByLabel("Description").fill("Builder UI coverage for ICW2-B4.");
    await page.getByRole("button", { name: "Create Workflow" }).click();

    await page.waitForURL(/\/workflows\/[^/]+\/builder/);
    const workflowIdMatch = page.url().match(/\/workflows\/([^/]+)\/builder/);
    expect(workflowIdMatch).not.toBeNull();
    const workflowId = workflowIdMatch![1];

    // ------------------------------------------------------------------
    // 2. Add a page (page) through the builder UI.
    //    `createWorkflow` seeds every new workflow with one empty default
    //    page ("Page 1") — live-observed, not assumed — so after
    //    clicking "Add Page" there are two pages on screen. The one we just
    //    added is appended last (highest order), so `.last()`
    //    reliably targets it rather than the pre-existing default.
    // ------------------------------------------------------------------
    await page.getByRole("button", { name: "Add Page" }).click();
    // `createPageAtEnd` is an async mutation — wait for the count to
    // actually reach 2 before resolving `.last()`, otherwise it can resolve
    // to the pre-existing "Page 1" input a beat before the new one mounts
    // (a real race caught while developing this spec, not a hypothetical).
    await expect(page.getByPlaceholder("Page title")).toHaveCount(2);
    const pageTitleInput = page.getByPlaceholder("Page title").last();
    await pageTitleInput.fill("Applicant Details");
    await pageTitleInput.blur();

    const pageDescriptionInput = page.getByPlaceholder("Page description (optional)").last();
    await pageDescriptionInput.fill("Basic applicant info collected for the e2e run.");
    await pageDescriptionInput.blur();

    // ------------------------------------------------------------------
    // 3. Add question #1 (Yes/No) — this becomes the visibility condition's
    //    source variable. The default "Page 1" never gains any questions
    //    in this test, so its own "Add Question" button stays put and ours
    //    (appended after it in DOM order) is reliably `.last()`; likewise
    //    `getByLabel("Question text")` only ever matches steps we created.
    // ------------------------------------------------------------------
    await page.getByRole("button", { name: "Add Question" }).last().click();
    const yesNoItem = page.getByRole("menuitem", { name: "Yes/No" });
    await expect(yesNoItem).toBeVisible();
    await yesNoItem.click();

    const q1Title = page.getByLabel("Question text");
    await expect(q1Title).toHaveCount(1);
    await q1Title.fill("Do you agree to the terms?");
    await q1Title.blur();

    // ---- Checkpoint 1/3: persisted state via RELOAD ----
    // Confirm the title survives a full reload before we add the second
    // question (still unambiguous: exactly one step exists).
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByLabel("Question text")).toHaveValue("Do you agree to the terms?");

    // ------------------------------------------------------------------
    // 4. Add question #2 (Date) — edit its title AND description via the
    //    form fields (DateTimeCardEditor renders both, unlike the short-text
    //    editor). The newly-created step is appended last, so `.last()`
    //    disambiguates it from question #1 by creation order (not a blind
    //    positional guess).
    // ------------------------------------------------------------------
    // The menu item's accessible name is the label PLUS its description text
    // ("Date Date picker"), and non-exact "Date" would also substring-match
    // "Date/Time Combined date and time picker" — match the full combined
    // name exactly to get the right one.
    await page.getByRole("button", { name: "Add Question" }).last().click();
    const dateItem = page.getByRole("menuitem", { name: "Date Date picker", exact: true });
    await expect(dateItem).toBeVisible();
    await dateItem.click();

    // Same async-mutation race as the page title above: wait for the second
    // step card to actually mount before resolving `.last()`, or it can
    // resolve to question #1's (still-only) input and rename that instead.
    await expect(page.locator("[data-step-id]")).toHaveCount(2);
    const q2Title = page.getByLabel("Question text").last();
    await q2Title.fill("Preferred start date");
    await q2Title.blur();

    const q2Description = page.getByPlaceholder("Add instructions for the user...");
    await q2Description.fill("Pick any date after today.");
    await q2Description.blur();

    // ------------------------------------------------------------------
    // 5. Reorder: move question #1 (Yes/No, currently first) below
    //    question #2 (Date) using dnd-kit's KeyboardSensor — Space lifts,
    //    ArrowDown moves one slot, Space drops. This is the accessible,
    //    resilient alternative to simulating raw mouse drag deltas.
    // ------------------------------------------------------------------
    const stepCards = page.locator("[data-step-id]");
    await expect(stepCards).toHaveCount(2);
    await expect(stepCards.nth(0).getByLabel("Question text")).toHaveValue("Do you agree to the terms?");
    await expect(stepCards.nth(1).getByLabel("Question text")).toHaveValue("Preferred start date");

    const firstCardHandle = stepCards.nth(0).locator("button.cursor-grab");
    await firstCardHandle.focus();
    await page.keyboard.press("Space"); // pick up
    // dnd-kit's keyboard sensor recomputes the "over" target from a fresh
    // layout measurement on each move; firing ArrowDown/the final Space back
    // to back (faster than React can re-render the intermediate state) races
    // that measurement and drops the reorder silently — `handleDragEnd` sees
    // `over === active` and returns early with no mutation at all. A short,
    // explicit pause between each key gives it a render cycle to catch up
    // (observed directly: identical steps with no pause intermittently never
    // fire the reorder mutation).
    await page.waitForTimeout(250);
    await page.keyboard.press("ArrowDown"); // move down one slot
    await page.waitForTimeout(250);
    await page.keyboard.press("Space"); // drop

    // Order should now be flipped: Date first, Yes/No second.
    await expect(stepCards.nth(0).getByLabel("Question text")).toHaveValue("Preferred start date");
    await expect(stepCards.nth(1).getByLabel("Question text")).toHaveValue("Do you agree to the terms?");

    // Confirm the reorder persisted server-side, not just client state.
    await page.reload();
    await page.waitForLoadState("networkidle");
    const stepCardsAfterReload = page.locator("[data-step-id]");
    await expect(stepCardsAfterReload.nth(0).getByLabel("Question text")).toHaveValue("Preferred start date");
    await expect(stepCardsAfterReload.nth(1).getByLabel("Question text")).toHaveValue("Do you agree to the terms?");

    // ------------------------------------------------------------------
    // 6. Add an Easy-mode visibility condition to the Date question:
    //    show it only when "Do you agree to the terms?" is Yes.
    // ------------------------------------------------------------------
    // `.filter({ hasText })` matches rendered text nodes, not form control
    // values — the question title lives in an `<input value="...">`, which
    // never counts as "text" for that filter, so it silently matched zero
    // elements. The order was just asserted above (position 0 = "Preferred
    // start date"), so reuse that verified position instead.
    const dateStepCard = stepCardsAfterReload.nth(0);
    // Step cards render collapsed by default (and reset to collapsed on the
    // reload above) — the editor body housing the "Visibility" panel only
    // renders while expanded, so re-expand via the card's toggle button
    // (icon-only; it's the second button in the card: drag handle, then
    // expand/collapse, then the "Question actions" overflow menu).
    await dateStepCard.locator("button").nth(1).click();
    await dateStepCard.getByRole("button", { name: "Visibility" }).click();

    const conditionalToggle = dateStepCard.getByRole("switch", { name: "Conditional Visibility" });
    await conditionalToggle.click();

    // The Radix Select trigger doesn't expose "Select variable..." as its
    // accessible name (the combobox role reports no name at all — verified
    // live), only as visible child text, so target it by text instead of by
    // accessible name.
    const variableSelect = dateStepCard.getByText("Select variable...");
    await variableSelect.click();
    await page.getByRole("option", { name: "Do you agree to the terms?" }).click();

    // The yes_no step type only offers "is Yes"/"is No" (no free-form value),
    // and selecting the variable already reset the operator to the first
    // valid one ("is Yes") — nothing further to fill in before applying.
    await dateStepCard.getByRole("button", { name: "Apply Changes" }).click();
    await expect(dateStepCard.getByText("Conditional (1 rule)")).toBeVisible();

    // ---- Checkpoint 2/3: persisted state via API READ ----
    // The workflow also carries the auto-created default "Page 1" (empty,
    // untouched throughout this test), so find our page by title rather than
    // assuming it's the only page.
    const pagesResponse = await page.request.get(`/api/workflows/${workflowId}/pages`);
    expect(pagesResponse.ok()).toBeTruthy();
    const pages = await pagesResponse.json();
    const ourPage = pages.find((s: { title: string }) => s.title === "Applicant Details");
    expect(ourPage).toBeDefined();
    const pageId = ourPage.id as string;

    const stepsResponse = await page.request.get(`/api/pages/${pageId}/steps`);
    expect(stepsResponse.ok()).toBeTruthy();
    const steps = await stepsResponse.json();
    const yesNoStep = steps.find((s: { title: string }) => s.title === "Do you agree to the terms?");
    const dateStep = steps.find((s: { title: string }) => s.title === "Preferred start date");
    expect(yesNoStep).toBeDefined();
    expect(dateStep).toBeDefined();
    // Reorder persisted: Date (order 0) now precedes Yes/No (order 1).
    expect(dateStep.order).toBeLessThan(yesNoStep.order);
    // Visibility condition persisted, referencing the Yes/No step. The step
    // was created with alias:null, but the server auto-generates an alias
    // from the title when one isn't supplied (live-observed:
    // "doYouAgreeToTheTerms"), and the condition builder stores that alias
    // rather than the raw step id — so check for whichever the step actually
    // ended up with.
    expect(dateStep.visibleIf).toBeTruthy();
    const conditionReference = yesNoStep.alias ?? yesNoStep.id;
    expect(JSON.stringify(dateStep.visibleIf)).toContain(conditionReference);
    expect(dateStep.visibleIf.conditions[0].operator).toBe("is_true");

    // ------------------------------------------------------------------
    // 7. Activate via the Review tab (ICW2-8)
    // ------------------------------------------------------------------
    // Non-exact "Review" also substring-matches the toolbar's "Preview"
    // button (it literally contains "review"), so match the tab exactly.
    await page.getByRole("button", { name: "Review", exact: true }).click();
    const publishButton = page.getByRole("button", { name: "Publish Workflow" });
    await expect(publishButton).toBeEnabled({ timeout: 15_000 });
    await publishButton.click();
    // Activation does real server work (lint gate + server-side version
    // serialization), so allow generous time for the button to flip to
    // "Published" rather than the default 10s (occasional slow activation was
    // the last remaining flake).
    await expect(page.getByRole("button", { name: "Published" })).toBeVisible({ timeout: 25_000 });

    // ------------------------------------------------------------------
    // 8. Run the workflow and submit one answer, entirely through the
    //    runner UI.
    //
    //    /run/:workflowId first tries the *creator*-authenticated run route
    //    client-side via a bare `fetch()` with no Authorization header —
    //    that 401s here (cookie auth only covers safe/GET methods by
    //    design; POST needs a bearer token this raw fetch never attaches),
    //    live-verified, not app source I can touch. It then falls back to
    //    the anonymous/public route, which requires the workflow to be
    //    marked public. So first click "Copy Link" on the workflows list
    //    (a real button, `workflowAPI.getPublicLink`) — its side effect of
    //    flipping `isPublic: true` server-side is what we need; the actual
    //    clipboard write isn't (this env's BASE_URL points at a different
    //    port than the running test server, so the copied URL itself isn't
    //    usable here). Then navigating to /run/:workflowId lets the
    //    fallback path create a real, persisted anonymous run.
    // ------------------------------------------------------------------
    await page.goto("/workflows");
    const publicLinkResponse = page.waitForResponse(
      (resp) => resp.url().includes(`/api/workflows/${workflowId}/public-link`) && resp.ok()
    );
    await page.getByTestId(`button-copy-link-workflow-${workflowId}`).click();
    await publicLinkResponse;

    // Navigating to /run/:workflowId lets the anonymous/public fallback create
    // a real run and render it (React Strict Mode may double-invoke the
    // bootstrap and create two runs, but this spec asserts on the rendered
    // runner UI, so which run "wins" doesn't matter here).
    await page.goto(`/run/${workflowId}`);
    await expect(page.getByText("No questions in this page.")).toBeVisible();

    // The runner visits the auto-created default "Page 1" first (it has
    // no questions), then our "Applicant Details" page — so it isn't the
    // last page yet and the primary action reads "Next", not "Review".
    // ICW2-B9 (fixed): run.currentPageId is now initialized to the first
    // visible page at run creation, so this first Next click is a real
    // advance — no double-click/retry accommodation needed.
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText("No questions in this page.")).toHaveCount(0, { timeout: 10_000 });

    // ---- Checkpoint 3/3: a real run was created and the runner rendered it ----
    // A run-scoped /next fired (so a real anonymous run exists), we advanced onto
    // "Applicant Details", and its question renders — the live proof the P0
    // runner fix works end-to-end (GET /runtime no longer 500s for activated
    // workflows). The run is anonymous, so we assert via the rendered runner UI
    // rather than a creator-session run API read, which isn't authorized for it.
    await expect(page.getByText("Do you agree to the terms?")).toBeVisible();

    // ------------------------------------------------------------------
    // 9. ICW2-B10 live proof: the conditional Date step is hidden until the
    //    controlling Yes/No question is answered, and the answer sticks
    //    (rather than being silently clobbered back to "unanswered" by the
    //    runner's saved-run hydration — the bug this ticket fixed).
    // ------------------------------------------------------------------
    await expect(page.getByLabel("Preferred start date")).toHaveCount(0);

    await page.getByRole("button", { name: "Yes", exact: true }).click();
    const dateInput = page.getByLabel("Preferred start date");
    await expect(dateInput).toBeVisible();

    // Answering No hides the Date step again (the reverse direction).
    await page.getByRole("button", { name: "No", exact: true }).click();
    await expect(page.getByLabel("Preferred start date")).toHaveCount(0);

    // Answer Yes again and fill the now-visible Date step before submitting.
    await page.getByRole("button", { name: "Yes", exact: true }).click();
    await expect(dateInput).toBeVisible();
    await dateInput.fill("2026-08-01");

    // ------------------------------------------------------------------
    // 10. Reach Review and submit. The related answer-persistence gap this
    //     ticket also fixed: the Review page must show both answers instead
    //     of "No questions answered in this page" for the page we just
    //     answered.
    // ------------------------------------------------------------------
    await page.getByRole("button", { name: "Review", exact: true }).click();
    await expect(page.getByText("Review your answers")).toBeVisible();
    // Only the empty default "Page 1" should render the empty-state copy —
    // if Applicant Details' answers were lost (the answer-persistence gap this
    // ticket also fixed), it would render a second one.
    await expect(page.getByText("No questions answered in this page.")).toHaveCount(1);
    const yesNoReviewRow = page.locator("div.grid", { hasText: "Do you agree to the terms?" });
    await expect(yesNoReviewRow.getByText("Yes", { exact: true })).toBeVisible();
    const dateReviewRow = page.locator("div.grid", { hasText: "Preferred start date" });
    await expect(dateReviewRow.getByText("2026-08-01", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText("Workflow submitted successfully", { exact: true })).toBeVisible({ timeout: 15_000 });
  });
});
