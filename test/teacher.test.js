const assert = require('node:assert/strict');
const test = require('node:test');
const session = require('express-session');
const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../server');

const TEACHER_PASSWORD = 'correct-test-password';
const FIRST_ID = '65b000000000000000000001';
const SECOND_ID = '65b000000000000000000002';

function createReport(id, studentName, submittedAt) {
  return {
    _id: id,
    studentName,
    rollNumber: '101',
    examName: 'Basic Computers',
    totalMarks: 8,
    maxMarks: 10,
    submittedAt: new Date(submittedAt),
    selectedAnswers: { q1: 'A' },
    correctAnswers: { q1: 'A' },
    questionReports: [
      {
        questionId: 'q1',
        number: 1,
        question: 'What is the full form of CPU?',
        selectedAnswer: 'A',
        selectedAnswerText: 'Central Processing Unit',
        correctAnswer: 'A',
        correctAnswerText: 'Central Processing Unit',
        mark: 1,
        isCorrect: true
      }
    ]
  };
}

function createTeacherTestApp({
  teacherPassword = TEACHER_PASSWORD,
  reports = [
    createReport(FIRST_ID, 'Earlier Student', '2026-01-01T10:00:00Z'),
    createReport(SECOND_ID, 'Later Student', '2026-01-02T10:00:00Z')
  ],
  connected = true,
  secureCookies = false,
  trustProxy = false,
  loginRateLimit = {}
} = {}) {
  class TestReportModel {
    static find() {
      const query = {
        sortOrder: {},
        sort(order) {
          this.sortOrder = order;
          return this;
        },
        select() {
          return this;
        },
        lean() {
          const sorted = [...reports];
          if (this.sortOrder.submittedAt === -1) {
            sorted.sort((left, right) => right.submittedAt - left.submittedAt);
          }
          return Promise.resolve(sorted);
        }
      };
      return query;
    }

    static findById(id) {
      return {
        lean: async () => reports.find((report) => report._id === id) || null
      };
    }
  }

  const sessionMiddleware = session({
    name: 'teacher.sid',
    secret: 'isolated-test-session-secret-with-more-than-32-characters',
    store: new session.MemoryStore(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: secureCookies,
      maxAge: 8 * 60 * 60 * 1000
    }
  });

  const app = createApp({
    ExamReportModel: TestReportModel,
    teacherPassword,
    isDatabaseConnected: () => connected,
    sessionMiddleware,
    secureCookies,
    trustProxy,
    loginRateLimit
  });
  return { app, reports };
}

async function login(agent, password = TEACHER_PASSWORD) {
  return agent.post('/api/teacher/login').send({ password });
}

test('correct teacher password creates an authenticated session', async () => {
  const { app } = createTeacherTestApp();
  const agent = request.agent(app);
  const response = await login(agent);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { authenticated: true });
  const sessionResponse = await agent.get('/api/teacher/session');
  assert.equal(sessionResponse.body.authenticated, true);
});

test('all five teacher API endpoints are registered at their expected paths', async () => {
  const { app } = createTeacherTestApp();
  const agent = request.agent(app);

  const sessionResponse = await agent.get('/api/teacher/session');
  const loginResponse = await login(agent);
  const reportsResponse = await agent.get('/api/teacher/reports');
  const trailingSlashReportsResponse = await agent.get('/api/teacher/reports/');
  const logoutResponse = await agent.post('/api/teacher/logout');
  const detailResponse = await agent.get(`/api/teacher/reports/${FIRST_ID}`);

  assert.equal(sessionResponse.status, 401);
  assert.equal(loginResponse.status, 200);
  assert.equal(reportsResponse.status, 200);
  assert.equal(trailingSlashReportsResponse.status, 200);
  assert.equal(logoutResponse.status, 200);
  assert.equal(detailResponse.status, 401);
  for (const response of [
    sessionResponse,
    loginResponse,
    reportsResponse,
    trailingSlashReportsResponse,
    logoutResponse
  ]) {
    assert.notEqual(response.status, 404);
  }
});

test('incorrect teacher password is rejected', async () => {
  const { app } = createTeacherTestApp();
  const response = await login(request.agent(app), 'incorrect-password');

  assert.equal(response.status, 401);
  assert.match(response.body.error, /password is incorrect/i);
  assert.equal(JSON.stringify(response.body).includes(TEACHER_PASSWORD), false);
});

test('missing teacher password configuration fails safely', async () => {
  const { app } = createTeacherTestApp({ teacherPassword: null });
  const response = await request(app)
    .post('/api/teacher/login')
    .send({ password: 'some-password' });

  assert.equal(response.status, 503);
  assert.match(response.body.error, /TEACHER_DASHBOARD_PASSWORD/);
});

test('unauthenticated users cannot retrieve teacher reports', async () => {
  const { app } = createTeacherTestApp();
  const sessionResponse = await request(app).get('/api/teacher/session');
  const listResponse = await request(app).get('/api/teacher/reports');
  const detailResponse = await request(app).get(`/api/teacher/reports/${FIRST_ID}`);

  assert.equal(sessionResponse.status, 401);
  assert.equal(listResponse.status, 401);
  assert.equal(detailResponse.status, 401);
});

test('authenticated teacher can retrieve report list', async () => {
  const { app } = createTeacherTestApp();
  const agent = request.agent(app);
  await login(agent);
  const response = await agent.get('/api/teacher/reports');

  assert.equal(response.status, 200);
  assert.equal(response.body.reports.length, 2);
  assert.equal(response.body.reports[0].studentName, 'Later Student');
});

test('teacher report list is returned newest first', async () => {
  const { app } = createTeacherTestApp();
  const agent = request.agent(app);
  await login(agent);
  const response = await agent.get('/api/teacher/reports');

  assert.equal(response.body.reports[0]._id, SECOND_ID);
  assert.equal(response.body.reports[1]._id, FIRST_ID);
});

test('authenticated teacher can retrieve one complete stored report', async () => {
  const { app } = createTeacherTestApp();
  const agent = request.agent(app);
  await login(agent);
  const response = await agent.get(`/api/teacher/reports/${FIRST_ID}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.report._id, FIRST_ID);
  assert.equal(response.body.report.questionReports[0].correctAnswer, 'A');
  assert.equal(response.body.report.questionReports.length, 1);
});

test('teacher report endpoint rejects invalid MongoDB IDs', async () => {
  const { app } = createTeacherTestApp();
  const agent = request.agent(app);
  await login(agent);
  const response = await agent.get('/api/teacher/reports/not-a-valid-id');

  assert.equal(response.status, 400);
  assert.match(response.body.error, /invalid/i);
});

test('teacher report endpoint returns 404 for a missing valid ID', async () => {
  const { app } = createTeacherTestApp({ reports: [] });
  const agent = request.agent(app);
  await login(agent);
  const response = await agent.get(`/api/teacher/reports/${FIRST_ID}`);

  assert.equal(response.status, 404);
  assert.match(response.body.error, /not found/i);
});

test('logout invalidates the session and prevents further report access', async () => {
  const { app } = createTeacherTestApp();
  const agent = request.agent(app);
  await login(agent);
  const logoutResponse = await agent.post('/api/teacher/logout');
  const reportsResponse = await agent.get('/api/teacher/reports');
  const sessionResponse = await agent.get('/api/teacher/session');

  assert.equal(logoutResponse.status, 200);
  assert.equal(logoutResponse.body.authenticated, false);
  assert.equal(sessionResponse.status, 401);
  assert.equal(reportsResponse.status, 401);
});

test('session cookie has HTTP-only, strict same-site, secure attributes in production', async () => {
  const { app } = createTeacherTestApp({ secureCookies: true, trustProxy: 1 });
  const response = await request(app)
    .post('/api/teacher/login')
    .set('X-Forwarded-Proto', 'https')
    .send({ password: TEACHER_PASSWORD });
  const cookie = response.headers['set-cookie'].find((value) =>
    value.startsWith('teacher.sid=')
  );

  assert.equal(response.status, 200);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(cookie, /Secure/i);
  assert.equal(app.get('trust proxy'), 1);
});

test('teacher login rate limiter blocks repeated invalid attempts', async () => {
  const { app } = createTeacherTestApp({ loginRateLimit: { maxAttempts: 2, windowMs: 60000 } });
  const agent = request.agent(app);
  const first = await login(agent, 'wrong-one');
  const second = await login(agent, 'wrong-two');
  const third = await login(agent, TEACHER_PASSWORD);

  assert.equal(first.status, 401);
  assert.equal(second.status, 401);
  assert.equal(third.status, 429);
  assert.match(third.body.error, /too many login attempts/i);
  assert.ok(Number(third.headers['retry-after']) > 0);
});

test('teacher configuration rejects missing or weak session secrets before database startup', () => {
  const { validateTeacherConfiguration } = require('../server');

  assert.throws(
    () => validateTeacherConfiguration({
      teacherPassword: TEACHER_PASSWORD,
      sessionSecret: null
    }),
    /TEACHER_SESSION_SECRET/
  );
  assert.equal(mongoose.connection.readyState, mongoose.ConnectionStates.disconnected);
});
