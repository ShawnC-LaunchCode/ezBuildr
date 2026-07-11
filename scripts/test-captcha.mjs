import fetch from 'node-fetch';

async function testLockout() {
  console.log("Creating user for test...");
  
  const email = `test-captcha-${Date.now()}@example.com`;
  const password = "Password123!";

  // 1. Register
  const regRes = await fetch("http://localhost:5000/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, firstName: "Test", lastName: "Captcha" })
  });
  console.log("Register:", regRes.status, await regRes.text());

  // 2. Failed logins
  console.log("Attempting bad logins...");
  for (let i = 0; i < 3; i++) {
    const loginRes = await fetch("http://localhost:5000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "WrongPassword1!" })
    });
    console.log(`Login attempt ${i + 1}:`, loginRes.status, await loginRes.text());
  }

  // 3. 4th attempt should trigger CAPTCHA
  console.log("Attempt 4 (should ask for CAPTCHA)...");
  const loginRes4 = await fetch("http://localhost:5000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  console.log("Login attempt 4:", loginRes4.status, await loginRes4.text());
}

testLockout().catch(console.error);
