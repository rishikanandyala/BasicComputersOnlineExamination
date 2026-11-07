# Basic Computers Online Examination System

The application serves the Basic Computers student exam, saves each submitted attempt to MongoDB Atlas, displays a printable student result report, and provides an authenticated teacher dashboard for stored reports.

## Requirements

- Node.js 18 or newer
- npm
- A MongoDB Atlas cluster and database user

## Local setup (Windows Command Prompt)

From the project folder:

```cmd
npm install
if not exist .env copy .env.example .env
```

If `.env` already exists, do not overwrite it. Add the required teacher settings to the existing file. Edit `.env` and replace placeholders only when creating it for the first time. The server will refuse to start unless the required values are configured and MongoDB connects successfully:

- `MONGODB_URI`: the connection string copied from your MongoDB Atlas cluster.
- `PORT`: an available local port number.
- `TEACHER_DASHBOARD_PASSWORD`: a strong password used to access the teacher dashboard.
- `TEACHER_SESSION_SECRET`: a randomly generated secret with at least 32 characters, used to sign sessions.

Start the application:

```cmd
npm start
```

Open `http://localhost:<your PORT value>/` for the student examination and `http://localhost:<your PORT value>/teacher.html` for the teacher login. Check `http://localhost:<your PORT value>/api/health` for server, database, and submission-readiness statuses.

Run the automated tests with:

```cmd
npm test
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB Atlas connection string. It is read by the server only and must never be placed in frontend files. |
| `PORT` | Port used by the server. Render supplies this value automatically; set it in `.env` for local development. |
| `DNS_SERVERS` | Optional comma-separated DNS resolver addresses for local DNS troubleshooting. Leave empty to use Node.js and the host's default resolver. |
| `TEACHER_DASHBOARD_PASSWORD` | Required server-only teacher login password. Never put this value in frontend files or commit it. |
| `TEACHER_SESSION_SECRET` | Required server-only session signing secret, at least 32 characters. Never put this value in frontend files or commit it. |

The server explicitly selects the `basic_computers_exam_v2` database when it connects, regardless of the database name in the URI. It does not connect to the previous project database. Each successful submission is saved as a separate document in the `examreports` collection.

## Render deployment configuration

Create a **Web Service** for this repository (not a Static Site) and configure:

- **Build command:** `npm install`
- **Start command:** `npm start`
- **Health check path:** `/api/health`

In the Render service's Environment settings, set `MONGODB_URI`, `TEACHER_DASHBOARD_PASSWORD`, `TEACHER_SESSION_SECRET`, and `NODE_ENV=production`. Render provides `PORT`; do not set a fixed production port. Use the existing Atlas URI for the `basic_computers_exam_v2` database. `DNS_SERVERS` is optional and should be left unset unless Render has a demonstrated resolver issue. The server binds to `0.0.0.0` and uses Render's forwarded HTTPS connection for secure session cookies.

The health endpoint is a liveness check and returns HTTP 200 with separate database and application readiness fields. Startup itself requires a successful MongoDB connection, so a failed initial Atlas connection prevents the service from listening.

## Student examination API

- `GET /api/exam/questions` returns the exam questions and options without correct answers.
- `POST /api/exam/submit` accepts `studentName`, `rollNumber`, and a `selectedAnswers` object such as `{ "q1": "A", "q2": "B" }`. Omitted answers are recorded as unanswered and receive zero marks. Scores sent by a client are ignored.
- A successful submission returns HTTP `201` and the saved report, including question-by-question results. If MongoDB is unavailable or saving fails, the API returns an error instead of a success report.

The answer key remains on the server. It is included in a report only after the backend has scored and saved the submission.

## Teacher dashboard

The teacher signs in at `/teacher.html` with `TEACHER_DASHBOARD_PASSWORD`. The login is rate-limited, and authenticated report access uses an eight-hour, HTTP-only, `SameSite=Strict` session cookie. Session records are stored in the separate `teacherSessions` collection in the configured database; the existing `examreports` records are not modified by the dashboard. Production uses secure cookies and trusts the single Render proxy hop for HTTPS.

- `POST /api/teacher/login` authenticates and creates a server-managed session.
- `GET /api/teacher/session` checks whether the current browser session is authenticated.
- `POST /api/teacher/logout` destroys the session and expires the cookie.
- `GET /api/teacher/reports` returns stored attempts newest first.
- `GET /api/teacher/reports/:id` returns a particular stored report.

All report retrieval endpoints require an authenticated teacher session. Keep the two teacher settings private and configure them in Render's environment settings as well as local `.env`.

## Local DNS troubleshooting

If Windows `nslookup` resolves your Atlas host but Node.js fails with a `querySrv ECONNREFUSED` error, you can optionally set `DNS_SERVERS` in this project's `.env` to comma-separated resolver addresses approved for your network. For example, the public resolver addresses `8.8.8.8,8.8.4.4` can be used if they are permitted in your environment. Do not add a `DNS_SERVERS` entry to Render unless you have a specific deployment DNS issue; with it unset, Render's default DNS resolver is used.

The application loads `.env`, applies any configured DNS resolver addresses, and only then loads Mongoose and connects to Atlas. Leave `DNS_SERVERS` blank or remove it to restore the default resolver. Restart the application after changing `.env`. Keep all of these values local and do not share the contents of `.env`.

## MongoDB Atlas setup

1. In MongoDB Atlas, create or select the cluster you intend to use for this new application.
2. Under **Database Access**, create a dedicated database user with a strong, unique password and only the privileges the application needs. Do not reuse credentials from the previous project.
3. Under **Network Access**, add your current development machine's public IP address. Avoid allowing access from all IP addresses unless you have deliberately assessed that risk.
4. On the cluster, choose **Connect**, then **Drivers**, select Node.js, and copy the connection string Atlas provides. Use that URI only for this new application; replace the username/password placeholders locally. If the password contains reserved URI characters, percent-encode them as required for a MongoDB URI.
5. In this project's `.env`, set `MONGODB_URI` to that complete Atlas URI and set `PORT` to an available local port. Do not paste the URI into chat or put it in frontend files.
6. The code selects `basic_computers_exam_v2` through Mongoose's `dbName` option, so do not change that code to target the old database. No collection needs to be created for Stage 1; the database and `examreports` collection are created by MongoDB when later functionality writes data.
7. Keep `.env` out of version control; `.gitignore` excludes it. For Render, set `MONGODB_URI` in the service's environment settings and let Render supply `PORT`. Configure Atlas Network Access according to the outbound networking options available to your Render service.

Startup fails with an understandable error if `MONGODB_URI` is missing or MongoDB cannot be reached; it never silently serves as if the database were ready. MongoDB creates `examreports` on the first successful report insert.

## Manually verify a real submission

1. Start the server with a working Atlas connection and open the student exam at `http://localhost:<your PORT value>/`.
2. Enter a name and roll number, choose any answers (unanswered questions are allowed), and submit. Confirm that the report appears with the score and all ten question results.
3. In Atlas, open **Data Explorer**, select `basic_computers_exam_v2`, then `examreports`. Refresh if needed and confirm the new document contains the student details, selected and correct answers, question-wise marks, total marks, and `submittedAt`.
4. Choose **Take exam again**, submit another attempt, and confirm a second document was added, even if the same student details were used.

Do not share the `.env` contents when troubleshooting. Automated tests use fake report models and isolated in-memory session stores, so they do not require Atlas credentials or read or write real examination records.

## Generate a teacher session secret

From Windows Command Prompt, generate a random session secret directly into the clipboard without displaying it in the terminal:

```cmd
node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('hex'))" | clip
```

Paste the clipboard value into your local `.env` as `TEACHER_SESSION_SECRET`. Keep it private. Set `TEACHER_DASHBOARD_PASSWORD` to a strong, unique password of your choice. Do not send either value in chat.
