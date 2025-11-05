# Vault-Logic: User Stories

**Version:** 1.1
**Last Updated:** 2025-10-28

This document contains all user stories for the Vault-Logic platform, organized by user type.

---

## Table of Contents
1. [Survey Creator](#survey-creator)
2. [Survey Respondent (Authenticated)](#survey-respondent-authenticated)
3. [Survey Respondent (Anonymous)](#survey-respondent-anonymous)
4. [System Administrator](#system-administrator)

---

## Survey Creator

The primary user who creates, manages, and analyzes surveys.

### Authentication & Account Management

**US-C-001: Google Sign-In**
- **As a** survey creator
- **I want to** sign in using my Google account
- **So that** I can securely access the platform without creating another username/password

**US-C-002: View Profile**
- **As a** survey creator
- **I want to** view my profile information (name, email, profile picture)
- **So that** I can verify which account I'm logged into

**US-C-003: Sign Out**
- **As a** survey creator
- **I want to** sign out of my account
- **So that** I can protect my account when using shared devices

### Survey Creation & Management

**US-C-004: Create New Survey**
- **As a** survey creator
- **I want to** create a new survey with a title and description
- **So that** I can collect feedback from my target audience

**US-C-005: Save Survey as Draft**
- **As a** survey creator
- **I want to** save my survey as a draft
- **So that** I can work on it over time before publishing

**US-C-006: Edit Existing Survey**
- **As a** survey creator
- **I want to** edit my survey's title, description, and settings
- **So that** I can update information or fix mistakes

**US-C-007: Delete Survey**
- **As a** survey creator
- **I want to** delete surveys I no longer need
- **So that** I can keep my dashboard organized and remove obsolete surveys

**US-C-008: Duplicate Survey**
- **As a** survey creator
- **I want to** duplicate an existing survey (with or without responses)
- **So that** I can reuse survey structures and save time

**US-C-009: View Survey List**
- **As a** survey creator
- **I want to** view a list of all my surveys with their status
- **So that** I can quickly access and manage my surveys

**US-C-010: Change Survey Status**
- **As a** survey creator
- **I want to** change a survey's status (draft → open → closed)
- **So that** I can control when respondents can submit responses

### Multi-Page Survey Management

**US-C-011: Add Pages to Survey**
- **As a** survey creator
- **I want to** add multiple pages to my survey
- **So that** I can organize questions into logical sections

**US-C-012: Edit Page Titles**
- **As a** survey creator
- **I want to** edit page titles
- **So that** I can provide clear section headings for respondents

**US-C-013: Reorder Pages**
- **As a** survey creator
- **I want to** reorder pages by dragging and dropping
- **So that** I can organize my survey flow logically

**US-C-014: Delete Pages**
- **As a** survey creator
- **I want to** delete pages from my survey
- **So that** I can remove unnecessary sections

### Question Management

**US-C-015: Add Short Text Questions**
- **As a** survey creator
- **I want to** add short text questions
- **So that** I can collect brief responses like names or short answers

**US-C-016: Add Long Text Questions**
- **As a** survey creator
- **I want to** add long text questions
- **So that** I can collect detailed written responses

**US-C-017: Add Multiple Choice Questions**
- **As a** survey creator
- **I want to** add multiple choice questions (checkboxes)
- **So that** respondents can select multiple options

**US-C-018: Add Radio Button Questions**
- **As a** survey creator
- **I want to** add single-choice questions (radio buttons)
- **So that** respondents can select exactly one option

**US-C-019: Add Yes/No Questions**
- **As a** survey creator
- **I want to** add yes/no questions
- **So that** I can collect simple binary responses

**US-C-020: Add Date/Time Questions**
- **As a** survey creator
- **I want to** add date and time picker questions
- **So that** I can collect scheduling or temporal information

**US-C-021: Add File Upload Questions**
- **As a** survey creator
- **I want to** add file upload questions
- **So that** respondents can submit documents, images, or other files

**US-C-022: Add Loop Group Questions**
- **As a** survey creator
- **I want to** add repeating question groups
- **So that** respondents can provide multiple instances of the same information (e.g., multiple team members)

**US-C-023: Mark Questions as Required**
- **As a** survey creator
- **I want to** mark specific questions as required
- **So that** I ensure critical information is always collected

**US-C-024: Add Question Descriptions**
- **As a** survey creator
- **I want to** add help text or descriptions to questions
- **So that** respondents understand what information to provide

**US-C-025: Reorder Questions**
- **As a** survey creator
- **I want to** reorder questions within and across pages
- **So that** I can optimize survey flow

**US-C-026: Delete Questions**
- **As a** survey creator
- **I want to** delete questions from my survey
- **So that** I can remove unnecessary or duplicate questions

**US-C-027: Edit Question Options**
- **As a** survey creator
- **I want to** edit options for multiple choice and radio questions
- **So that** I can provide the right choices for respondents

### Conditional Logic

**US-C-028: Create Show/Hide Rules**
- **As a** survey creator
- **I want to** create rules to show or hide questions based on previous answers
- **So that** I can create dynamic surveys that adapt to respondents

**US-C-029: Create Requirement Rules**
- **As a** survey creator
- **I want to** make questions required or optional based on other answers
- **So that** I only collect relevant information from each respondent

**US-C-030: Use Multiple Condition Operators**
- **As a** survey creator
- **I want to** use various operators (equals, contains, greater than, etc.)
- **So that** I can create sophisticated conditional logic

**US-C-031: Combine Multiple Conditions**
- **As a** survey creator
- **I want to** combine multiple conditions with AND/OR logic
- **So that** I can create complex branching logic

**US-C-032: Create Page-Level Logic**
- **As a** survey creator
- **I want to** create rules that show or hide entire pages
- **So that** I can skip irrelevant sections based on responses

### Recipient Management

**US-C-033: Add Individual Recipients**
- **As a** survey creator
- **I want to** add recipients one at a time with name and email
- **So that** I can send personalized survey invitations

**US-C-034: Bulk Add Recipients**
- **As a** survey creator
- **I want to** bulk upload recipients (CSV or paste)
- **So that** I can efficiently add large groups of respondents

**US-C-035: View Recipient List**
- **As a** survey creator
- **I want to** view all recipients for a survey
- **So that** I can track who has been invited

**US-C-036: Remove Recipients**
- **As a** survey creator
- **I want to** remove recipients from a survey
- **So that** I can correct mistakes or remove people who shouldn't receive the survey

**US-C-037: Send Email Invitations**
- **As a** survey creator
- **I want to** send email invitations to all recipients
- **So that** they receive personalized links to complete the survey

**US-C-038: Resend Invitations**
- **As a** survey creator
- **I want to** resend invitations to specific recipients
- **So that** I can follow up with people who may have missed the original email

**US-C-039: Track Sent Status**
- **As a** survey creator
- **I want to** see which recipients have been sent invitations
- **So that** I know who has received the survey

### Global Recipient Management

**US-C-040: Create Global Recipient List**
- **As a** survey creator
- **I want to** maintain a global list of contacts
- **So that** I can reuse recipients across multiple surveys

**US-C-041: Tag Recipients**
- **As a** survey creator
- **I want to** add tags to recipients (e.g., "customer", "employee")
- **So that** I can organize and filter my contact list

**US-C-042: Import from Global List**
- **As a** survey creator
- **I want to** import recipients from my global list by tags or selection
- **So that** I can quickly add relevant contacts to a survey

**US-C-043: Edit Global Recipients**
- **As a** survey creator
- **I want to** update recipient information in my global list
- **So that** I maintain accurate contact information

**US-C-044: Delete Global Recipients**
- **As a** survey creator
- **I want to** remove contacts from my global list
- **So that** I keep my contact list current

### Anonymous Survey Settings

**US-C-045: Enable Anonymous Responses**
- **As a** survey creator
- **I want to** enable anonymous responses for a survey
- **So that** anyone with the link can respond

**US-C-046: Set Unlimited Anonymous Access**
- **As a** survey creator
- **I want to** allow unlimited anonymous responses
- **So that** I can collect responses from a large, unrestricted audience

**US-C-047: Set One Response Per IP**
- **As a** survey creator
- **I want to** limit anonymous responses to one per IP address
- **So that** I reduce duplicate responses from the same person

**US-C-048: Set One Response Per Session**
- **As a** survey creator
- **I want to** limit anonymous responses to one per browser session
- **So that** I prevent duplicate responses while allowing different users on the same network

**US-C-049: Get Public Survey Link**
- **As a** survey creator
- **I want to** get a public link for my survey
- **So that** I can share it via social media, websites, or other channels

### Response Viewing & Management

**US-C-050: View All Responses**
- **As a** survey creator
- **I want to** view all submitted responses to my survey
- **So that** I can review the collected data

**US-C-051: View Individual Responses**
- **As a** survey creator
- **I want to** view detailed responses from individual respondents
- **So that** I can analyze specific submissions

**US-C-052: Filter Responses**
- **As a** survey creator
- **I want to** filter responses by completion status, date, or other criteria
- **So that** I can focus on specific subsets of data

**US-C-053: View Response Timestamps**
- **As a** survey creator
- **I want to** see when each response was started and completed
- **So that** I can track response timing

**US-C-054: Download Uploaded Files**
- **As a** survey creator
- **I want to** download files uploaded by respondents
- **So that** I can review submitted documents

**US-C-055: Distinguish Anonymous vs Authenticated**
- **As a** survey creator
- **I want to** see which responses are anonymous vs. authenticated
- **So that** I can understand my respondent demographics

### Analytics & Reporting

**US-C-056: View Survey Completion Rate**
- **As a** survey creator
- **I want to** see my survey's completion rate
- **So that** I can measure survey effectiveness

**US-C-057: View Average Completion Time**
- **As a** survey creator
- **I want to** see average time to complete my survey
- **So that** I can assess if my survey is too long

**US-C-058: View Question-Level Analytics**
- **As a** survey creator
- **I want to** see analytics for each question (answer rate, time spent)
- **So that** I can identify problematic or engaging questions

**US-C-059: View Completion Funnel**
- **As a** survey creator
- **I want to** see a page-by-page completion funnel
- **So that** I can identify where respondents drop off

**US-C-060: View Response Trends**
- **As a** survey creator
- **I want to** see response trends over time
- **So that** I can understand when people are responding

**US-C-061: View Engagement Metrics**
- **As a** survey creator
- **I want to** see engagement metrics (bounce rate, session duration)
- **So that** I can optimize my survey design

**US-C-062: Export Responses to CSV**
- **As a** survey creator
- **I want to** export all responses as CSV
- **So that** I can analyze data in spreadsheet applications

**US-C-063: Export Responses to PDF**
- **As a** survey creator
- **I want to** export responses as PDF
- **So that** I can create formatted reports for sharing

**US-C-072: View Resilient Analytics**
- **As a** survey creator
- **I want to** see accurate analytics even when event tracking is incomplete
- **So that** I always have visibility into response data

### Dashboard & Overview

**US-C-064: View Dashboard Statistics**
- **As a** survey creator
- **I want to** see overview statistics on my dashboard
- **So that** I can quickly assess my survey activity

**US-C-065: View Recent Surveys**
- **As a** survey creator
- **I want to** see my most recent surveys on the dashboard
- **So that** I can quickly access active projects

**US-C-066: View Activity Feed**
- **As a** survey creator
- **I want to** see recent activity (new responses, survey updates)
- **So that** I stay informed about changes

**US-C-067: Navigate Based on Survey Status**
- **As a** survey creator
- **I want to** be directed to the survey builder for drafts and results page for active surveys
- **So that** I land on the most relevant page for my workflow

### Survey Validation & Quality

**US-C-068: Validate Survey Before Activation**
- **As a** survey creator
- **I want to** have my survey validated before I can activate it
- **So that** I don't publish incomplete or invalid surveys

**US-C-069: Auto-Generate Public Links**
- **As a** survey creator
- **I want to** have public links automatically generated when I enable anonymous responses
- **So that** anonymous respondents can immediately access the survey

**US-C-070: Preview Survey**
- **As a** survey creator
- **I want to** preview my survey as a respondent would see it
- **So that** I can verify the user experience before publishing

**US-C-071: Copy Survey Link**
- **As a** survey creator
- **I want to** quickly copy survey links to my clipboard
- **So that** I can easily share them via various channels

---

## Survey Respondent (Authenticated)

Users who receive personalized survey invitations via email.

### Accessing Surveys

**US-RA-001: Receive Email Invitation**
- **As a** survey respondent
- **I want to** receive an email invitation with a personalized link
- **So that** I know I've been specifically invited to participate

**US-RA-002: Access Survey via Personal Link**
- **As a** survey respondent
- **I want to** click my personalized link to access the survey
- **So that** I can start responding without additional authentication

**US-RA-003: See Survey Introduction**
- **As a** survey respondent
- **I want to** see the survey title and description before starting
- **So that** I know what the survey is about

### Responding to Surveys

**US-RA-004: Answer Text Questions**
- **As a** survey respondent
- **I want to** type text into short and long text fields
- **So that** I can provide written answers

**US-RA-005: Select Multiple Choices**
- **As a** survey respondent
- **I want to** select multiple options in checkbox questions
- **So that** I can indicate all applicable answers

**US-RA-006: Select Single Choice**
- **As a** survey respondent
- **I want to** select one option in radio button questions
- **So that** I can choose my preferred answer

**US-RA-007: Answer Yes/No Questions**
- **As a** survey respondent
- **I want to** click yes or no on binary questions
- **So that** I can provide simple confirmations

**US-RA-008: Select Dates and Times**
- **As a** survey respondent
- **I want to** use a date/time picker for temporal questions
- **So that** I can easily provide accurate dates

**US-RA-009: Upload Files**
- **As a** survey respondent
- **I want to** upload files (images, documents, PDFs)
- **So that** I can provide supporting documentation

**US-RA-010: Add Multiple Instances**
- **As a** survey respondent
- **I want to** add multiple instances in loop groups
- **So that** I can provide information for multiple items (e.g., team members)

**US-RA-011: See Required Indicators**
- **As a** survey respondent
- **I want to** see which questions are required
- **So that** I know which fields I must complete

**US-RA-012: See Help Text**
- **As a** survey respondent
- **I want to** see question descriptions and help text
- **So that** I understand what information is needed

### Navigation & Progress

**US-RA-013: Navigate Between Pages**
- **As a** survey respondent
- **I want to** navigate between pages using next/previous buttons
- **So that** I can move through the survey at my own pace

**US-RA-014: See Progress Indicator**
- **As a** survey respondent
- **I want to** see my progress through the survey
- **So that** I know how much remains

**US-RA-015: Save and Resume Later**
- **As a** survey respondent
- **I want to** save my progress and resume later
- **So that** I don't have to complete the survey in one session

**US-RA-016: See Dynamic Question Visibility**
- **As a** survey respondent
- **I want to** see questions appear or disappear based on my answers
- **So that** I only answer relevant questions

### Submission & Completion

**US-RA-017: Validate Before Submission**
- **As a** survey respondent
- **I want to** be notified if I missed required questions
- **So that** I can complete all necessary fields before submitting

**US-RA-018: Submit Survey**
- **As a** survey respondent
- **I want to** submit my completed survey
- **So that** my responses are recorded

**US-RA-019: See Confirmation Message**
- **As a** survey respondent
- **I want to** see a confirmation after successful submission
- **So that** I know my response was received

**US-RA-020: Edit Before Completion**
- **As a** survey respondent
- **I want to** edit my answers before final submission
- **So that** I can correct mistakes or change my mind

---

## Survey Respondent (Anonymous)

Users who access surveys via public links without authentication.

### Accessing Surveys

**US-RN-001: Access via Public Link**
- **As an** anonymous respondent
- **I want to** access a survey via a public link
- **So that** I can respond without providing personal information

**US-RN-002: No Account Required**
- **As an** anonymous respondent
- **I want to** complete the survey without creating an account
- **So that** I can participate quickly and easily

**US-RN-003: See Survey Information**
- **As an** anonymous respondent
- **I want to** see the survey title and description
- **So that** I know what I'm being asked to complete

### Responding to Surveys

**US-RN-004: Answer All Question Types**
- **As an** anonymous respondent
- **I want to** answer all the same question types as authenticated users
- **So that** I can fully participate in the survey

**US-RN-005: Upload Files Anonymously**
- **As an** anonymous respondent
- **I want to** upload files without revealing my identity
- **So that** I can provide supporting materials while staying anonymous

**US-RN-006: Navigate Multi-Page Surveys**
- **As an** anonymous respondent
- **I want to** navigate through multi-page surveys
- **So that** I can complete longer surveys

### Rate Limiting & Access Control

**US-RN-007: Single Response Limitation (IP)**
- **As an** anonymous respondent
- **I want to** understand if I'm limited to one response per IP
- **So that** I don't attempt to submit duplicate responses

**US-RN-008: Single Response Limitation (Session)**
- **As an** anonymous respondent
- **I want to** understand if I'm limited to one response per session
- **So that** I know the participation rules

**US-RN-009: Clear Rate Limit Messages**
- **As an** anonymous respondent
- **I want to** see clear messages if I've already responded
- **So that** I understand why I can't submit again

### Submission & Completion

**US-RN-010: Submit Anonymously**
- **As an** anonymous respondent
- **I want to** submit my survey without providing identifying information
- **So that** my responses remain anonymous

**US-RN-011: See Confirmation**
- **As an** anonymous respondent
- **I want to** see a confirmation message after submission
- **So that** I know my response was recorded

**US-RN-012: No Resume Capability**
- **As an** anonymous respondent
- **I want to** understand that I cannot save and resume
- **So that** I plan to complete the survey in one session

---

## System Administrator

Users with elevated privileges who manage the entire platform.

### User Management

**US-A-001: View All Users**
- **As a** system administrator
- **I want to** view a list of all registered users
- **So that** I can monitor platform usage

**US-A-002: View User Details**
- **As a** system administrator
- **I want to** view detailed information about specific users
- **So that** I can investigate issues or questions

**US-A-003: View User's Surveys**
- **As a** system administrator
- **I want to** view all surveys created by a specific user
- **So that** I can assist with support requests

**US-A-004: Assign User Roles**
- **As a** system administrator
- **I want to** assign or change user roles (admin vs. creator)
- **So that** I can manage platform permissions

### Survey Management

**US-A-005: View All Surveys**
- **As a** system administrator
- **I want to** view all surveys on the platform
- **So that** I can monitor content and usage

**US-A-006: Delete Any Survey**
- **As a** system administrator
- **I want to** delete any survey regardless of ownership
- **So that** I can remove inappropriate or problematic content

**US-A-007: View Survey Responses**
- **As a** system administrator
- **I want to** view responses for any survey
- **So that** I can assist with data recovery or troubleshooting

**US-A-008: Search Surveys**
- **As a** system administrator
- **I want to** search surveys by title, creator, or status
- **So that** I can quickly find specific surveys

**US-A-023: Preview Any Survey**
- **As a** system administrator
- **I want to** preview any survey as a respondent would see it
- **So that** I can review content and assist users with troubleshooting

**US-A-024: Copy Survey Links**
- **As a** system administrator
- **I want to** quickly copy survey links from admin views
- **So that** I can share links when assisting users

**US-A-025: Delete Surveys from Admin Views**
- **As a** system administrator
- **I want to** delete surveys directly from admin list and user survey pages
- **So that** I can efficiently manage platform content

**US-A-026: Track Cascade Deletions**
- **As a** system administrator
- **I want to** see responses deleted via survey cascade deletions
- **So that** I have complete visibility into data removal

### Platform Analytics

**US-A-009: View Platform Statistics**
- **As a** system administrator
- **I want to** see overall platform statistics (total users, surveys, responses)
- **So that** I can monitor platform health and growth

**US-A-010: View Historical Statistics**
- **As a** system administrator
- **I want to** see historical totals including deleted items
- **So that** I have complete visibility into platform usage

**US-A-011: View Active Surveys Count**
- **As a** system administrator
- **I want to** see how many surveys are currently active
- **So that** I can understand current platform activity

**US-A-012: View User Growth Trends**
- **As a** system administrator
- **I want to** see user registration trends over time
- **So that** I can plan for scaling and resources

**US-A-013: View Response Volume**
- **As a** system administrator
- **I want to** see total responses collected over time
- **So that** I can measure platform engagement

### System Monitoring

**US-A-014: View System Health**
- **As a** system administrator
- **I want to** monitor system health metrics (database connections, errors)
- **So that** I can proactively address issues

**US-A-015: Access Error Logs**
- **As a** system administrator
- **I want to** access system error logs
- **So that** I can troubleshoot problems

**US-A-016: Monitor Storage Usage**
- **As a** system administrator
- **I want to** monitor file storage usage
- **So that** I can plan for storage capacity

### Content Moderation

**US-A-017: Flag Inappropriate Content**
- **As a** system administrator
- **I want to** flag surveys with inappropriate content
- **So that** I can review and take action

**US-A-018: View Reported Issues**
- **As a** system administrator
- **I want to** see user-reported issues or content
- **So that** I can investigate and respond

**US-A-019: Suspend User Access**
- **As a** system administrator
- **I want to** suspend or deactivate user accounts
- **So that** I can prevent abuse

### Configuration & Settings

**US-A-020: Configure Platform Settings**
- **As a** system administrator
- **I want to** configure global platform settings
- **So that** I can control platform behavior

**US-A-021: Manage Email Templates**
- **As a** system administrator
- **I want to** customize email templates
- **So that** communications align with branding

**US-A-022: Configure Rate Limits**
- **As a** system administrator
- **I want to** adjust rate limiting settings
- **So that** I can balance security and user experience

---

## User Story Priority Matrix

### High Priority (MVP)
- US-C-001 to US-C-027 (Core survey creation)
- US-C-033 to US-C-039 (Basic recipient management)
- US-C-045 to US-C-049 (Anonymous surveys)
- US-C-050 to US-C-055 (Response viewing)
- US-C-062, US-C-063 (Export capabilities)
- US-C-068, US-C-069 (Survey validation & auto-generation)
- US-RA-001 to US-RA-020 (Authenticated responses)
- US-RN-001 to US-RN-012 (Anonymous responses)

### Medium Priority (Post-MVP)
- US-C-028 to US-C-032 (Conditional logic)
- US-C-040 to US-C-044 (Global recipients)
- US-C-056 to US-C-061, US-C-072 (Analytics with resilient fallbacks)
- US-C-064 to US-C-067 (Dashboard with smart navigation)
- US-C-070, US-C-071 (Preview & copy functionality)
- US-A-001 to US-A-013 (Basic admin features)
- US-A-023 to US-A-026 (Enhanced admin capabilities)

### Low Priority (Future Enhancement)
- US-A-014 to US-A-022 (Advanced admin features)
- Additional features based on user feedback

---

## Notes

- All user stories follow the format: "As a [user type], I want to [action], so that [benefit]"
- Each story has a unique identifier (e.g., US-C-001 = User Story - Creator - 001)
- User type prefixes:
  - **C** = Creator
  - **RA** = Respondent (Authenticated)
  - **RN** = Respondent (Anonymous)
  - **A** = Administrator
- Stories are grouped by functional area for better organization
- Implementation status should be tracked separately in project management tools

---

## Changelog

### Version 1.1 (2025-10-28)
**Added 8 New User Stories:**

**Survey Creator:**
- US-C-068: Validate Survey Before Activation
- US-C-069: Auto-Generate Public Links
- US-C-070: Preview Survey
- US-C-071: Copy Survey Link
- US-C-072: View Resilient Analytics

**System Administrator:**
- US-A-023: Preview Any Survey
- US-A-024: Copy Survey Links
- US-A-025: Delete Surveys from Admin Views
- US-A-026: Track Cascade Deletions

**Changes:**
- Updated priority matrix to reflect new features
- Reorganized admin stories to include enhanced capabilities
- Added Survey Validation & Quality section for creators
- Documented recent platform improvements from October 2025 updates

---

**Document Maintained By:** Development Team
**Review Cycle:** Monthly or when major features are added
