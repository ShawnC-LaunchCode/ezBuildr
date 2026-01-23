import dotenv from "dotenv";
dotenv.config();

// This script creates a demo workflow using the ezBuildr API
// Make sure the server is running on localhost:5000

const BASE_URL = "http://localhost:5000/api";
const USER_ID = "116568744155653496130";

interface ApiResponse {
  ok: boolean;
  status: number;
  data?: any;
  error?: string;
}

async function apiCall(method: string, endpoint: string, body?: any): Promise<ApiResponse> {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `connect.sid=your-session-cookie-here` // We'll need a valid session
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();
    return {
      ok: response.ok,
      status: response.status,
      data: response.ok ? data : undefined,
      error: response.ok ? undefined : (data.message || data.error || 'Unknown error')
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Network error'
    };
  }
}

async function createDemoWorkflow() {
  console.log("🎨 Creating Demo Workflow via API\n");
  console.log("⚠️  This script requires a valid session cookie.");
  console.log("   Please log in to ezBuildr in your browser first,");
  console.log("   then use the browser's developer tools to get your session cookie.\n");
  console.log("Alternative: We can create it directly via database with correct schema.\n");
  console.log("Let me create a simpler script that works with the actual database schema...\n");

  process.exit(0);
}

createDemoWorkflow();
