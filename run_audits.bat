@echo off
echo ========================================
echo Running npm audit
echo ========================================
call npm audit

echo.
echo ========================================
echo Running npx audit-ci
echo ========================================
call npx audit-ci

echo.
echo ========================================
echo Running npx eslint .
echo ========================================
call npx eslint .

echo.
echo ========================================
echo Running npx tsc --noEmit
echo ========================================
call npx tsc --noEmit

echo.
echo ========================================
echo Running npx vitest run
echo ========================================
call npx vitest run

echo.
echo ========================================
echo Running npx playwright test
echo ========================================
call npx playwright test

echo.
echo ========================================
echo Running npx semgrep --config auto .
echo ========================================
call npx semgrep --config auto .
