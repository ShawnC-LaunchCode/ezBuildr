import { test, expect } from "@playwright/test";

/**
 * Transform Editor (List Tools) E2E Tests
 * Covers paths from MANUAL_UI_TEST_GUIDE.md
 * Target context: Standard Builder (Sidebar > Add Logic > List Tools)
 */
test.describe("Transform Editor (List Tools) - Manual Paths", () => {
    test.setTimeout(60000);

    let workflowId: string;
    let sectionId: string;
    let authToken: string;

    test.beforeEach(async ({ page }) => {
        // 1. Login
        await page.goto("/");
        const loginResponse = await page.request.post("/api/auth/dev-login");
        expect(loginResponse.ok()).toBeTruthy();
        const loginData = await loginResponse.json();
        authToken = loginData.token;

        // RELOAD to ensure session is active for UI (though UI usually fetches token via /api/auth/token)
        // The UI works because it fetches token via GET (allowed by cookie strategy) then uses it.
        await page.reload();
        await page.waitForLoadState("networkidle");

        // 2. Create Workflow (MUST use Bearer token for POST)
        console.log("Creation Workflow...");
        const createRes = await page.request.post("/api/workflows", {
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            data: {
                title: `Transform Editor Test ${Date.now()}`,
                description: "Automated test for manual UI guide",
                status: "draft"
            }
        });
        console.log(`Create Workflow Status: ${createRes.status()}`);
        if (!createRes.ok()) {console.log(await createRes.text());}
        expect(createRes.ok()).toBeTruthy();
        const workflow = await createRes.json();
        workflowId = workflow.id;

        // 3. Create Section (Page)
        // We need a section to add blocks to
        console.log(`Creating Section for ${workflowId}...`);
        const createSectionRes = await page.request.post(`/api/workflows/${workflowId}/sections`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            data: {
                title: "Test Page 1",
                description: "Test Description",
                order: 0
            }
        });
        console.log(`Create Section Status: ${createSectionRes.status()}`);
        if (!createSectionRes.ok()) {console.log(await createSectionRes.text());}
        expect(createSectionRes.ok()).toBeTruthy();
        const section = await createSectionRes.json();
        sectionId = section.id;

        // 4. Navigate to Standard Builder
        console.log("Navigating to Builder...");
        await page.goto(`/workflows/${workflowId}/builder`);
        await page.waitForLoadState("networkidle");
        console.log("Waiting for Page text...");
        try {
            await page.getByText("Test Page 1").waitFor({ timeout: 10000 });
            console.log("Page text found.");
        } catch (e) {
            console.log("Page text NOT found. Dumping body text:");
            // console.log(await page.locator('body').innerText()); 
            throw e;
        }
    });

    test("Session 1 & 3: Operator Labels and Config Persistence", async ({ page }) => {
        // ===================================
        // SETUP: ADD LIST TOOLS BLOCK
        // ===================================
        console.log("Step: Adding List Tools block");

        // Find the Section Item in Sidebar and hover to reveal actions
        const sectionItem = page.getByText("Test Page 1").locator(".."); // Go up to parent div
        await sectionItem.hover();

        // Click "Add Logic" (Zap icon)
        // It might be hidden if not hovered, but Playwright hover() should trigger it.
        console.log("Looking for Add Logic button...");
        const addLogicBtn = page.locator('button[title="Add Logic"]').first();
        await addLogicBtn.click();

        // Click "List Tools" in dropdown
        await page.getByRole('menuitem', { name: "List Tools" }).click();

        // Wait for block to appear
        console.log("Waiting for List Tool block...");
        // Use generic node locator (only 1 block exists)
        const blockItem = page.locator('.react-flow__node').first();
        await blockItem.waitFor();

        // Open Editor
        await blockItem.dblclick();

        // Wait for Dialog
        const dialog = page.getByRole('dialog');
        await dialog.waitFor();
        await expect(dialog).toContainText("Source & Output");

        // ===================================
        // SESSION 1: OPERATOR LABELS
        // ===================================
        console.log("Step: Verifying Operator Labels");

        // Expand Filters (if not already open)
        await page.getByText("Filters").click(); // Open Filters section

        // Add Filter
        await page.getByRole('button', { name: "Add Filter" }).click();

        // Open Operator Dropdown
        // Open Operator Dropdown
        const operatorLabel = page.getByText("Operator", { exact: true }).first();
        const operatorSelect = operatorLabel.locator("..").getByRole('combobox');
        await operatorSelect.click();

        // Assert Labels
        await expect(page.getByRole('option', { name: "Equals (strict)", exact: true })).toBeVisible();
        await expect(page.getByRole('option', { name: "Contains (case-insensitive)", exact: true })).toBeVisible();

        await page.keyboard.press('Escape'); // Close dropdown

        // ===================================
        // SESSION 3: CONFIG PERSISTENCE
        // ===================================
        console.log("Step: Testing Persistence");

        // Set Output Variable
        await page.getByText("Source & Output").click();
        await page.getByPlaceholder("e.g., filtered_users").fill("test_output_persistent");

        // Save
        await page.getByRole('button', { name: "Save Changes" }).click(); // Check exact button text
        await dialog.waitFor({ state: 'hidden' });

        // Reload Page
        console.log("Step: Reloading to check persistence");
        await page.reload();
        await page.waitForLoadState("networkidle");
        await page.getByText("Test Page 1").waitFor();

        // Re-open Block
        const blockAgain = page.locator('.react-flow__node').first();
        if (!await blockAgain.isVisible()) {
            await sectionItem.click();
        }
        await blockItem.dblclick();

        // Check Value
        await dialog.waitFor();
        await expect(dialog).toContainText("Source & Output");
        await page.getByText("Source & Output").click(); // Ensure expanded
        await expect(page.locator(`input[value="test_output_persistent"]`)).toBeVisible();

        console.log("✓ Persistence Verified");
    });

    test("Session 6: Limit = 0 Behavior (UI Config)", async ({ page }) => {
        // Find Section & Add Block
        const sectionItem = page.getByText("Test Page 1").locator("..");
        await sectionItem.hover();
        await sectionItem.locator('button[title="Add Logic"]').click();
        await page.getByRole('menuitem', { name: "List Tools" }).click();

        // Use generic node locator (only 1 block exists)
        const blockItem = page.locator('.react-flow__node').first();
        await blockItem.dblclick();

        // Set Range: Limit 0
        await page.getByText("Range").click();
        await page.getByPlaceholder("No limit").fill("0");

        // Save
        await page.getByRole('button', { name: "Save Changes" }).click({ force: true });

        // Re-open
        await blockItem.dblclick();
        await page.getByText("Range").click();
        await expect(page.locator(`input[value="0"]`)).toBeVisible();

        console.log("✓ Limit 0 Config Persisted");
    });

    test("Session 2: Complex Transform (Filter + Sort + Limit)", async ({ page }) => {
        // Find Section & Add Block
        const sectionItem = page.getByText("Test Page 1").locator("..");
        await sectionItem.hover();
        await sectionItem.locator('button[title="Add Logic"]').click();
        await page.getByRole('menuitem', { name: "List Tools" }).click();

        // Use generic node locator (only 1 block exists)
        const blockItem = page.locator('.react-flow__node').first();
        await blockItem.dblclick();
        const dialog = page.getByRole('dialog');
        await dialog.waitFor();

        // 1. Source & Output
        await page.getByText("Source & Output").click();
        await page.getByPlaceholder("e.g., filtered_users").fill("active_sales");

        // 2. Filters (Multi)
        // Filter 1: status equals "active"
        await page.getByText("Filters").click();
        await page.getByRole('button', { name: "Add Filter" }).click();

        // F1 Field
        await page.getByPlaceholder("e.g., name, address.city").fill("status");
        // F1 Op (Default is equals)
        // F1 Value
        await page.getByPlaceholder("Enter value...").fill("active");

        // Filter 2: department equals "Sales"
        await page.getByRole('button', { name: "Add Filter" }).click();
        // F2 Field
        await page.getByPlaceholder("e.g., name, address.city").nth(1).fill("department");
        // F2 Value
        await page.getByPlaceholder("Enter value...").nth(1).fill("Sales");

        // 3. Sort
        await page.getByText("Sort").click();
        await page.getByRole('button', { name: "Add Sort Key" }).click();
        await page.getByPlaceholder("Field path...").fill("name");
        // Default is Ascending, verification will suffice

        // 4. Range
        await page.getByText("Range").click();
        await page.getByPlaceholder("No limit").fill("5");

        // Save
        await page.getByRole('button', { name: "Save Changes" }).click({ force: true });
        await dialog.waitFor({ state: 'hidden' });

        // Reload & Verify
        await page.reload();
        await page.waitForLoadState("networkidle");

        await blockItem.dblclick();
        await dialog.waitFor();

        // Verify Output
        await page.getByText("Source & Output").click();
        await expect(page.locator(`input[value="active_sales"]`)).toBeVisible();

        // Verify Filters
        await page.getByText("Filters").click();
        await expect(page.locator(`input[value="status"]`)).toBeVisible();
        await expect(page.locator(`input[value="active"]`)).toBeVisible();
        await expect(page.locator(`input[value="department"]`)).toBeVisible();
        await expect(page.locator(`input[value="Sales"]`)).toBeVisible();

        // Verify Sort
        await page.getByText("Sort").click();
        await expect(page.locator(`input[value="name"]`)).toBeVisible();

        // Verify Limit
        await page.getByText("Range").click();
        await expect(page.locator(`input[value="5"]`)).toBeVisible();

        console.log("✓ Complex Transform Persisted");
    });

    test("Session 4 & 5: Advanced Mode (Dedupe & Strict Edge Case)", async ({ page }) => {
        // 1. ERROR CHECK: Ensure we are NOT in advanced mode yet (default)
        // Wait for page to be ready
        await page.getByText("Test Page 1").waitFor();

        // Toggle Advanced Mode
        const modeButton = page.getByRole('button', { name: /Easy Mode|Advanced Mode/ });
        const modeText = await modeButton.innerText();

        if (modeText.includes("Easy Mode")) {
            await modeButton.click();
            await page.getByRole('menuitem', { name: "Switch to Advanced Mode" }).click();
        }

        // Add Block
        const sectionItem = page.getByText("Test Page 1").locator("..");
        await sectionItem.hover();
        await sectionItem.locator('button[title="Add Logic"]').click();
        await page.getByRole('menuitem', { name: "List Tools" }).click();

        // Use generic node locator (only 1 block exists)
        const blockItem = page.locator('.react-flow__node').first();
        await blockItem.dblclick();
        const dialog = page.getByRole('dialog');
        await dialog.waitFor();

        // Session 5: Strict Equality Edge Case (Number as String)
        await page.getByText("Filters").click();
        await page.getByRole('button', { name: "Add Filter" }).click();
        await page.getByPlaceholder("e.g., name, address.city").fill("age");
        await page.getByPlaceholder("Enter value...").fill("30"); // String "30"

        // Session 4: Dedupe (Advanced Check)
        // Verify 'Transform' section exists (only in Advanced)
        const transformSection = page.getByText("Transform", { exact: true }); // Section header
        await expect(transformSection).toBeVisible();
        await transformSection.click();

        await page.getByPlaceholder("e.g., email").fill("email");

        // Save
        await page.getByRole('button', { name: "Save Changes" }).click({ force: true });
        await dialog.waitFor({ state: 'hidden' });

        // Reload & Verify
        await page.reload();
        await page.waitForLoadState("networkidle");

        await blockItem.dblclick();

        // Verify Dedupe
        await page.getByText("Transform", { exact: true }).click();
        await expect(page.locator(`input[value="email"]`)).toBeVisible();

        // Verify Strict Filter (age "30")
        await page.getByText("Filters").click();
        await expect(page.locator(`input[value="age"]`)).toBeVisible();
        await expect(page.locator(`input[value="30"]`)).toBeVisible();

        console.log("✓ Advanced Mode & Edge Cases Persisted");
    });

});
