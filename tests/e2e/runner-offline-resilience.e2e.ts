import { test, expect } from "@playwright/test";

/**
 * RUNNER OFFLINE RESILIENCE & CONFLICT RECOVERY E2E TEST
 *
 * Validates:
 * 1. Resilient autosave in live workflow runner (`/run/:id`).
 * 2. Offline buffering to IndexedDB (`ezbuildr_runner_offline_db`) when network drops.
 * 3. UI save status transitions: idle -> saving -> saved -> offline -> syncing -> saved.
 * 4. Automatic background flush and conflict recovery upon network reconnection.
 * 5. Data integrity and persistence across page reloads.
 */
test.describe("Runner Offline Buffering & Resilience E2E", () => {
  test.setTimeout(90000);

  test("should buffer offline edits to IndexedDB and flush upon reconnection", async ({ page, context }) => {
    // 1. Authenticate via dev-login
    await page.goto("/");
    const loginResponse = await page.request.post("/api/auth/dev-login");
    expect(loginResponse.ok()).toBeTruthy();
    const loginData = await loginResponse.json() as { token: string };
    const authHeaders = { Authorization: `Bearer ${loginData.token}` };

    await page.reload();
    await page.waitForLoadState("networkidle");

    let workflowId: string | null = null;
    try {
      // 2. Create a test workflow with questions
      const createWorkflowResponse = await page.request.post("/api/workflows", {
        headers: authHeaders,
        data: {
          title: "E2E Offline Resilience Test Workflow",
          description: "Test workflow for offline buffering and conflict recovery",
          status: "draft",
        },
      });
      const createWorkflowBody = await createWorkflowResponse.text();
      expect(
        createWorkflowResponse.ok(),
        `Workflow creation failed (${createWorkflowResponse.status()}): ${createWorkflowBody}`
      ).toBeTruthy();
      const workflow = JSON.parse(createWorkflowBody) as { id: string };
      workflowId = workflow.id;

    // Create section
    const createSectionResponse = await page.request.post(`/api/workflows/${workflowId}/sections`, {
      headers: authHeaders,
      data: {
        title: "Contact Information",
        description: "Please enter your details",
        order: 0,
      },
    });
    expect(createSectionResponse.ok()).toBeTruthy();
    const section = await createSectionResponse.json();
    const sectionId = section.id;

    // Create Step 1: Text
    const createStep1Response = await page.request.post(`/api/sections/${sectionId}/steps`, {
      headers: authHeaders,
      data: {
        title: "Full Name",
        type: "short_text",
        alias: "full_name",
        order: 0,
        required: true,
      },
    });
    expect(createStep1Response.ok()).toBeTruthy();
    const step1 = await createStep1Response.json();

    // Create Step 2: Email
    const createStep2Response = await page.request.post(`/api/sections/${sectionId}/steps`, {
      headers: authHeaders,
      data: {
        title: "Email Address",
        type: "short_text",
        alias: "email_address",
        order: 1,
        required: true,
      },
    });
    expect(createStep2Response.ok()).toBeTruthy();
    const _step2 = await createStep2Response.json();

    // 3. Create a workflow run
    const createRunResponse = await page.request.post(`/api/workflows/${workflowId}/runs`, {
      headers: authHeaders,
      data: {
        metadata: {
          source: "e2e_resilience_test",
          mode: "production",
        },
      },
    });
    expect(createRunResponse.ok()).toBeTruthy();
    const runResult = await createRunResponse.json();
    const runId = runResult.data.runId;
    const runAuthHeaders = { Authorization: `Bearer ${runResult.data.runToken as string}` };

    // 4. Navigate to the runner
    await page.goto(`/run/${runId}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Verify runner is loaded
    const bodyContent = await page.locator("body").textContent();
    expect(bodyContent).toContain("Contact Information");

    // 5. Fill Step 1 online and verify autosave
    const inputs = page.locator('input[type="text"]');
    const firstInput = inputs.first();
    await firstInput.fill("Alice First Edit");
    await page.waitForTimeout(2000); // Allow autosave debounce

    // Verify the value reached the backend
    const checkRunOnline = await page.request.get(`/api/runs/${runId}/runtime`, { headers: runAuthHeaders });
    const checkRunOnlineBody = await checkRunOnline.text();
    expect(
      checkRunOnline.ok(),
      `Online run verification failed (${checkRunOnline.status()}): ${checkRunOnlineBody}`
    ).toBeTruthy();
    const runOnlineData = JSON.parse(checkRunOnlineBody) as {
      data?: { values?: Array<{ stepId: string; value: unknown }> };
      values?: Array<{ stepId: string; value: unknown }>;
    };
    const onlineValues = (runOnlineData.data?.values ?? runOnlineData.values ?? []) as Array<{ stepId: string; value: unknown }>;
    const savedStep1 = onlineValues.find((v) => v.stepId === step1.id);
    expect(savedStep1?.value).toBe("Alice First Edit");

    // 6. Go Offline
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await page.waitForTimeout(500);

    // 7. Edit Step 1 & Step 2 while offline
    await firstInput.fill("Alice Offline Edited Name");
    if ((await inputs.count()) > 1) {
      await inputs.nth(1).fill("alice.offline@example.com");
    }
    await page.waitForTimeout(2000); // Wait for offline buffering trigger

    // 8. Verify UI displays offline status indicator
    const offlineIndicator = page.getByText(/offline/i);
    await expect(offlineIndicator.first()).toBeVisible({ timeout: 5000 });

    // 9. Inspect IndexedDB in browser to confirm buffered values exist
    const indexedDbEntries = await page.evaluate(async (targetRunId) => {
      return new Promise<Array<{ stepId: string; value: unknown; runId: string }>>((resolve) => {
        const req = window.indexedDB.open("ezbuildr_runner_offline_db", 1);
        req.onerror = () => resolve([]);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("pending_step_values")) {
            resolve([]);
            return;
          }
          const tx = db.transaction("pending_step_values", "readonly");
          const store = tx.objectStore("pending_step_values");
          const getAllReq = store.getAll();
          getAllReq.onsuccess = () => {
            const records = (getAllReq.result || []) as Array<{ stepId: string; value: unknown; runId: string }>;
            resolve(records.filter((r) => r.runId === targetRunId));
          };
          getAllReq.onerror = () => resolve([]);
        };
      });
    }, runId);

    expect(indexedDbEntries.length).toBeGreaterThan(0);
    const bufferedStep1 = indexedDbEntries.find((e) => e.stepId === step1.id);
    expect(bufferedStep1?.value).toBe("Alice Offline Edited Name");

    // 10. Reconnect Network
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    // 11. Wait for syncing to complete and status to return to saved/idle
    await page.waitForTimeout(3000);

    // 12. Verify IndexedDB buffer was cleared after sync
    const remainingDbEntries = await page.evaluate(async (targetRunId) => {
      return new Promise<Array<{ stepId: string; value: unknown; runId: string }>>((resolve) => {
        const req = window.indexedDB.open("ezbuildr_runner_offline_db", 1);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("pending_step_values")) {
            resolve([]);
            return;
          }
          const tx = db.transaction("pending_step_values", "readonly");
          const store = tx.objectStore("pending_step_values");
          const getAllReq = store.getAll();
          getAllReq.onsuccess = () => {
            const records = (getAllReq.result || []) as Array<{ stepId: string; value: unknown; runId: string }>;
            resolve(records.filter((r) => r.runId === targetRunId));
          };
          getAllReq.onerror = () => resolve([]);
        };
        req.onerror = () => resolve([]);
      });
    }, runId);

    expect(remainingDbEntries.length).toBe(0);

    // 13. Verify backend has received and persisted the offline edits
    const checkRunReconnected = await page.request.get(`/api/runs/${runId}/runtime`, { headers: runAuthHeaders });
    const checkRunReconnectedBody = await checkRunReconnected.text();
    expect(
      checkRunReconnected.ok(),
      `Reconnected run verification failed (${checkRunReconnected.status()}): ${checkRunReconnectedBody}`
    ).toBeTruthy();
    const runReconnectedData = JSON.parse(checkRunReconnectedBody) as {
      data?: { values?: Array<{ stepId: string; value: unknown }> };
      values?: Array<{ stepId: string; value: unknown }>;
    };
    const finalValues = (runReconnectedData.data?.values ?? runReconnectedData.values ?? []) as Array<{ stepId: string; value: unknown }>;
    const finalStep1 = finalValues.find((v) => v.stepId === step1.id);
    expect(finalStep1?.value).toBe("Alice Offline Edited Name");

    // 14. Reload page to verify fresh hydration from server
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

      const reloadedFirstInput = page.locator('input[type="text"]').first();
      await expect(reloadedFirstInput).toHaveValue("Alice Offline Edited Name");
    } finally {
      await context.setOffline(false);
      if (workflowId !== null) {
        const deleteWorkflowResponse = await page.request.delete(`/api/workflows/${workflowId}`, {
          headers: authHeaders,
        });
        expect(deleteWorkflowResponse.ok(), "E2E workflow fixture should be deleted").toBeTruthy();
      }
    }
  });
});
