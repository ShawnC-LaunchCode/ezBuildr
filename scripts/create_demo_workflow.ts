
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { users, workflows, workflowVersions } from "@shared/schema";

import { db, initializeDatabase } from "../server/db";

async function main() {
    await initializeDatabase();
    const email = "scooter4356@gmail.com";
    console.log(`Looking for user with email: ${email}`);

    const user = await db.query.users.findFirst({
        where: eq(users.email, email),
    });

    if (!user) {
        console.error("User not found!");
        process.exit(1);
    }

    console.log(`Found user: ${user.id}`);

    // Create Workflow
    const workflowId = uuidv4();
    const title = "Visual Builder Demo";

    // Construct a graphJson that demonstrates branching
    const graphJson = {
        nodes: [
            {
                id: "start",
                type: "question",
                position: { x: 100, y: 100 },
                data: { label: "Start Here" },
                config: {
                    title: "Starting Point",
                    type: "display",
                    content: "Welcome to the Visual Builder Demo! This workflow shows how visual logic works."
                }
            },
            {
                id: "q1",
                type: "question",
                position: { x: 100, y: 300 },
                data: { label: "Do you like visuals?" },
                config: {
                    title: "Preference",
                    type: "yes_no",
                    alias: "likes_visuals",
                    question: "Do you prefer visual tools over code?"
                }
            },
            {
                id: "branch1",
                type: "branch",
                position: { x: 100, y: 500 },
                data: { label: "Check Preference" },
                config: {
                    condition: "likes_visuals == true"
                }
            },
            {
                id: "result_yes",
                type: "question",
                position: { x: 300, y: 700 },
                data: { label: "Great Choice" },
                config: {
                    title: "Visual Path",
                    type: "display",
                    content: "Great! The Visual Builder is perfect for you. You can see how this path branched off."
                }
            },
            {
                id: "result_no",
                type: "question",
                position: { x: -100, y: 700 },
                data: { label: "Code Path" },
                config: {
                    title: "Code Path",
                    type: "display",
                    content: "That's okay! You can still use Advanced Mode to write raw JSON or code."
                }
            }
        ],
        edges: [
            { id: "e1", source: "start", target: "q1" },
            { id: "e2", source: "q1", target: "branch1" },
            { id: "e3", source: "branch1", target: "result_yes", label: "Yes" },
            { id: "e4", source: "branch1", target: "result_no", label: "No" }
        ]
    };

    console.log("Creating workflow...");

    // Insert Workflow
    await db.insert(workflows).values({
        id: workflowId,
        title: title,
        creatorId: user.id,
        projectId: null, // Unfiled
        status: 'draft',
        modeOverride: 'easy',
        ownerId: user.id
    });

    // Insert Version
    const versionId = uuidv4();
    // @ts-expect-error - TODO: fix type
    await db.insert(workflowVersions).values({
        id: versionId,
        workflowId: workflowId,
        versionNumber: 1,
        graphJson: graphJson,
        definition: {}, // Legacy
        createdBy: user.id,
        isDraft: true,
        isPublished: false
    });

    console.log(`Workflow created successfully! ID: ${workflowId}`);
    console.log(`Open in browser: http://localhost:5173/workflows/${workflowId}`);
}

main().catch((error: unknown) => {
  console.error('Error:', error instanceof Error ? error.message : String(error));
});
