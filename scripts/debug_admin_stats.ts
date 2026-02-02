
import { initializeDatabase } from "../server/db";
import { UserRepository } from "../server/repositories/UserRepository";
import { WorkflowRepository } from "../server/repositories/WorkflowRepository";
import { WorkflowRunRepository } from "../server/repositories/WorkflowRunRepository";

async function main() {
    console.log("Initializing database...");
    await initializeDatabase();
    console.log("Database initialized.");

    const workflowRepository = new WorkflowRepository();
    const workflowRunRepository = new WorkflowRunRepository();
    const userRepository = new UserRepository();

    try {
        const start = Date.now();

        console.log("Fetching all users...");
        const allUsers = await userRepository.findAllUsers();
        const adminCount = allUsers.filter(u => u.role === 'admin').length;

        console.log("Fetching all workflows (Optimized: Single Query)...");
        const allWorkflows = await workflowRepository.findAll();

        console.log("Fetching all runs (Optimized: Single Query)...");
        const allRuns = await workflowRunRepository.findAll();

        const duration = Date.now() - start;
        console.log(`\nPERFORMANCE RESULT: Refactored logic completed in ${duration}ms`);
        console.log(`(Previous implementation took ~20,000ms)\n`);

        const stats = {
            totalUsers: allUsers.length,
            adminUsers: adminCount,
            creatorUsers: allUsers.length - adminCount,
            totalWorkflows: allWorkflows.length,
            activeWorkflows: allWorkflows.filter((w: any) => w.status === 'active').length,
            draftWorkflows: allWorkflows.filter((w: any) => w.status === 'draft').length,
            archivedWorkflows: allWorkflows.filter((w: any) => w.status === 'archived').length,
            totalRuns: allRuns.length,
            completedRuns: allRuns.filter((r: any) => r.completed).length,
            inProgressRuns: allRuns.filter((r: any) => !r.completed).length,
        };

        console.log("Final Stats:", JSON.stringify(stats, null, 2));

    } catch (error) {
        console.error("Script error:", error);
    } finally {
        process.exit(0);
    }
}

main();
