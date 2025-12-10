import { Profiler } from "../../server/lib/performance/profiler";
import { logger } from "../../server/lib/observability/logger";

// Mock runner function simulating a workflow run
const simulateWorkflowRun = async (runId: number) => {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 200));
    return { success: true, runId };
};

export class LoadRunner {
    static async runLoadTest(concurrentUsers: number, durationSeconds: number) {
        logger.info({ msg: "Starting Load Test", concurrentUsers, durationSeconds });

        const startTime = Date.now();
        const endTime = startTime + (durationSeconds * 1000);
        let completedRuns = 0;
        let errors = 0;

        const worker = async (id: number) => {
            while (Date.now() < endTime) {
                try {
                    await Profiler.measureAsync("load_test_run", () => simulateWorkflowRun(completedRuns));
                    completedRuns++;
                } catch (e) {
                    errors++;
                }
            }
        };

        const workers = [];
        for (let i = 0; i < concurrentUsers; i++) {
            workers.push(worker(i));
        }

        await Promise.all(workers);

        logger.info({
            msg: "Load Test Completed",
            completedRuns,
            errors,
            avgRps: completedRuns / durationSeconds
        });
    }
}

// Allow running directly
if (require.main === module) {
    LoadRunner.runLoadTest(50, 10).catch(console.error);
}
