import dotenv from "dotenv";
dotenv.config();

import { eq } from "drizzle-orm";

import { users, surveys, surveyPages, questions, responses, answers } from "../shared/schema";

import { randomUUID } from "crypto";

// Initialize database connection
async function initDb() {
  const isNeonDatabase = process.env.DATABASE_URL!.includes('neon.tech') ||
                         process.env.DATABASE_URL!.includes('neon.co');

  if (isNeonDatabase) {
    const { Pool, neonConfig } = await import('@neondatabase/serverless');
    const ws = await import('ws');
    neonConfig.webSocketConstructor = ws.default;
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const { drizzle } = await import('drizzle-orm/neon-serverless');
    const schema = await import('../shared/schema');
    return drizzle(pool as any, { schema });
  } else {
    const pg = await import('pg');
    const pool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL });
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const schema = await import('../shared/schema');
    return drizzle(pool as any, { schema });
  }
}

/**
 * Generate 10 fake users with Dev_ prefix
 * Each user gets 10 surveys with all question types
 * Each survey gets 100 responses
 */

const CITIES = ["Austin", "austin", "AUSTIN", "Dallas", "Houston", "San Antonio", "El Paso", "Fort Worth", "Arlington", "Plano", "Lubbock"];
const COLORS = ["Red", "Blue", "green", "Yellow", "purple", "Orange", "Pink", "Black", "White", "Gray"];
const DEPARTMENTS = ["Engineering", "Sales", "Marketing", "HR", "Finance", "Operations", "Support", "Product"];
const YES_NO = [true, false];
const RATINGS = ["Excellent", "Good", "Average", "Poor", "Very Poor"];
const LANGUAGES = ["JavaScript", "Python", "Java", "C++", "Go", "Rust", "TypeScript", "Ruby", "PHP", "Swift"];

function randomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function randomItems<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function generateFakeData(db: any) {
  console.log("🚀 Starting fake data generation...\n");

  const startDate = new Date("2024-01-01");
  const endDate = new Date();

  // Create 3 fake users or use existing ones
  const createdUsers = [];
  for (let i = 1; i <= 3; i++) {
    const email = `dev_user${i}@example.com`;
    const firstName = `Dev_User`;
    const lastName = `${i}`;

    console.log(`👤 Checking user: ${firstName} ${lastName} (${email})`);

    // Check if user already exists
    const existingUsers = await db.select().from(users).where(eq(users.email, email)).limit(1);

    let userId: string;
    if (existingUsers.length > 0) {
      userId = existingUsers[0].id;
      console.log(`   ✓ User already exists with ID: ${userId.slice(0, 8)}...`);
    } else {
      userId = randomUUID();
      await db
        .insert(users)
        .values({
          id: userId,
          email,
          firstName,
          lastName,
          profileImageUrl: null,
          role: "creator",
          createdAt: randomDate(startDate, endDate),
          updatedAt: new Date(),
        });
      console.log(`   ✓ Created new user with ID: ${userId.slice(0, 8)}...`);
    }

    createdUsers.push({ userId, email, firstName, lastName });
  }

  console.log(`\n✅ Created ${createdUsers.length} users\n`);

  // Create surveys for each user
  let totalSurveys = 0;
  let totalResponses = 0;

  for (const user of createdUsers) {
    console.log(`📊 Creating 10 surveys for ${user.firstName} ${user.lastName}...`);

    for (let surveyNum = 1; surveyNum <= 10; surveyNum++) {
      const surveyId = randomUUID();
      const surveyTitle = `${user.firstName}_${user.lastName} Survey ${surveyNum}`;

      // Create survey
      await db
        .insert(surveys)
        .values({
          id: surveyId,
          title: surveyTitle,
          description: `Test survey ${surveyNum} with all question types for testing analytics`,
          creatorId: user.userId,
          status: "open",
          allowAnonymous: true,
          anonymousAccessType: "unlimited",
          publicLink: `public-${surveyId}`,
          anonymousConfig: {},
          createdAt: randomDate(startDate, endDate),
          updatedAt: new Date(),
        })
        .onConflictDoNothing();

      // Create a single page
      const pageId = randomUUID();
      await db
        .insert(surveyPages)
        .values({
          id: pageId,
          surveyId,
          title: "Main Page",
          order: 0,
          createdAt: new Date(),
        })
        .onConflictDoNothing();

      // Create all question types
      const questionConfigs = [
        {
          id: randomUUID(),
          type: "short_text" as const,
          title: "What city do you live in?",
          description: "Enter your city name",
          options: null,
        },
        {
          id: randomUUID(),
          type: "long_text" as const,
          title: "Tell us about your experience",
          description: "Write a detailed response",
          options: null,
        },
        {
          id: randomUUID(),
          type: "multiple_choice" as const,
          title: "Which programming languages do you know? (Select all that apply)",
          description: "Select multiple options",
          options: LANGUAGES,
        },
        {
          id: randomUUID(),
          type: "radio" as const,
          title: "What is your favorite color?",
          description: "Select one option",
          options: ["Red", "Blue", "Green", "Yellow", "Purple"],
        },
        {
          id: randomUUID(),
          type: "yes_no" as const,
          title: "Do you enjoy working remotely?",
          description: "Yes or No",
          options: null,
        },
        {
          id: randomUUID(),
          type: "date_time" as const,
          title: "When did you start your current job?",
          description: "Select a date",
          options: null,
        },
        {
          id: randomUUID(),
          type: "radio" as const,
          title: "How would you rate our service?",
          description: "Rate from 1-5",
          options: RATINGS,
        },
        {
          id: randomUUID(),
          type: "radio" as const,
          title: "Which department are you in?",
          description: "Select your department",
          options: DEPARTMENTS,
        },
      ];

      for (let qIndex = 0; qIndex < questionConfigs.length; qIndex++) {
        const config = questionConfigs[qIndex];
        await db
          .insert(questions)
          .values({
            id: config.id,
            pageId,
            type: config.type,
            title: config.title,
            description: config.description,
            required: true,
            options: config.options,
            loopConfig: null,
            conditionalLogic: null,
            order: qIndex,
            createdAt: new Date(),
          })
          .onConflictDoNothing();
      }

      // Create 100 responses for this survey
      console.log(`  📝 Creating 100 responses for "${surveyTitle}"...`);

      for (let respNum = 1; respNum <= 100; respNum++) {
        const responseId = randomUUID();
        const isAnonymous = Math.random() > 0.3; // 70% anonymous
        const submittedAt = randomDate(startDate, endDate);

        await db
          .insert(responses)
          .values({
            id: responseId,
            surveyId,
            recipientId: null,
            completed: true,
            submittedAt,
            isAnonymous,
            ipAddress: isAnonymous ? `192.168.1.${Math.floor(Math.random() * 255)}` : null,
            userAgent: "Mozilla/5.0 (Fake Data Generator)",
            sessionId: isAnonymous ? `session-${Math.random()}` : null,
            anonymousMetadata: {},
            createdAt: submittedAt,
          })
          .onConflictDoNothing();

        // Create answers for each question
        for (const config of questionConfigs) {
          let answerValue: any;

          switch (config.type) {
            case "short_text":
              answerValue = randomItem(CITIES);
              break;

            case "long_text":
              answerValue = `This is a detailed response for response ${respNum}. ${randomItem([
                "I really enjoyed the experience and would recommend it to others.",
                "The service was good but could be improved in several areas.",
                "Overall, I had a positive experience with this product.",
                "There were some challenges, but the team was very helpful.",
                "Excellent service from start to finish. Very satisfied!",
              ])}`;
              break;

            case "multiple_choice":
              // Select 1-4 random languages
              const numLangs = Math.floor(Math.random() * 4) + 1;
              answerValue = randomItems(LANGUAGES, numLangs);
              break;

            case "radio":
              if (config.title.includes("color")) {
                answerValue = randomItem(COLORS);
              } else if (config.title.includes("service")) {
                answerValue = randomItem(RATINGS);
              } else if (config.title.includes("department")) {
                answerValue = randomItem(DEPARTMENTS);
              } else {
                answerValue = randomItem(config.options || []);
              }
              break;

            case "yes_no":
              answerValue = randomItem(YES_NO);
              break;

            case "date_time":
              answerValue = randomDate(new Date("2020-01-01"), new Date()).toISOString();
              break;

            default:
              answerValue = "Test response";
          }

          await db
            .insert(answers)
            .values({
              id: randomUUID(),
              responseId,
              questionId: config.id,
              subquestionId: null,
              loopIndex: null,
              value: answerValue,
              createdAt: submittedAt,
            })
            .onConflictDoNothing();
        }

        totalResponses++;
      }

      totalSurveys++;
    }

    console.log(`  ✅ Completed surveys for ${user.firstName} ${user.lastName}\n`);
  }

  console.log("\n🎉 Fake data generation complete!");
  console.log(`📊 Summary:`);
  console.log(`   Users: ${createdUsers.length}`);
  console.log(`   Surveys: ${totalSurveys}`);
  console.log(`   Responses: ${totalResponses}`);
  console.log(`   Total Answers: ${totalResponses * 8} (8 questions per survey)\n`);
}

// Run the script
(async () => {
  try {
    const db = await initDb();
    await generateFakeData(db);
    console.log("✨ Done!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error generating fake data:", error);
    process.exit(1);
  }
})();
