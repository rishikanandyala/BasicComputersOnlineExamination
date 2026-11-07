const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');
const exam = require('../data/exam');
const { createApp } = require('../server');

function createTestApp({ connected = true, saveReport } = {}) {
  const savedReports = [];
  class TestReport {
    constructor(data) {
      Object.assign(this, data);
    }

    async save() {
      if (saveReport) {
        await saveReport(this);
      }
      this._id = `test-report-${savedReports.length + 1}`;
      savedReports.push(this);
      return this;
    }

    toObject() {
      return { ...this };
    }
  }

  return {
    app: createApp({
      ExamReportModel: TestReport,
      isDatabaseConnected: () => connected
    }),
    savedReports
  };
}

const correctAnswers = Object.fromEntries(
  exam.questions.map(({ id, correctAnswer }) => [id, correctAnswer])
);

test('GET /api/exam/questions returns all questions without answer-key leakage', async () => {
  const { app } = createTestApp();
  const response = await request(app).get('/api/exam/questions');

  assert.equal(response.status, 200);
  assert.equal(response.body.examName, 'Basic Computers');
  assert.equal(response.body.totalQuestions, 10);
  assert.equal(response.body.totalMarks, 10);
  assert.equal(response.body.questions.length, 10);
  assert.deepEqual(response.body.questions[0].options, [
    { key: 'A', text: 'Central Processing Unit' },
    { key: 'B', text: 'Computer Processing Unit' },
    { key: 'C', text: 'Central Program Unit' },
    { key: 'D', text: 'Control Processing Unit' }
  ]);
  assert.equal(JSON.stringify(response.body).includes('correctAnswer'), false);
  assert.equal(JSON.stringify(response.body).includes('"answerKey"'), false);
});

test('POST /api/exam/submit awards full marks for correct answers and saves report', async () => {
  const { app, savedReports } = createTestApp();
  const response = await request(app).post('/api/exam/submit').send({
    studentName: '  Ada Student ',
    rollNumber: '101',
    selectedAnswers: correctAnswers
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.report.studentName, 'Ada Student');
  assert.equal(response.body.report.rollNumber, '101');
  assert.equal(response.body.report.examName, 'Basic Computers');
  assert.equal(response.body.report.totalMarks, 10);
  assert.equal(response.body.report.maxMarks, 10);
  assert.equal(response.body.report.questionReports.length, 10);
  assert.equal(response.body.report.questionReports.every(({ mark }) => mark === 1), true);
  assert.equal(savedReports.length, 1);
});

test('POST /api/exam/submit awards zero for incorrect answers', async () => {
  const { app } = createTestApp();
  const response = await request(app).post('/api/exam/submit').send({
    studentName: 'Student',
    rollNumber: '102',
    selectedAnswers: { q1: 'B', q2: 'A' }
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.report.totalMarks, 0);
  assert.equal(response.body.report.questionReports[0].isCorrect, false);
  assert.equal(response.body.report.questionReports[0].mark, 0);
});

test('POST /api/exam/submit records unanswered questions and awards zero', async () => {
  const { app } = createTestApp();
  const response = await request(app).post('/api/exam/submit').send({
    studentName: 'Student',
    rollNumber: '103',
    selectedAnswers: { q1: 'A' }
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.report.totalMarks, 1);
  assert.equal(response.body.report.questionReports[0].selectedAnswer, 'A');
  assert.equal(response.body.report.questionReports[1].selectedAnswer, null);
  assert.equal(response.body.report.questionReports[1].selectedAnswerText, 'Not Answered');
  assert.equal(response.body.report.questionReports[1].mark, 0);
  assert.equal(response.body.report.questionReports[1].isCorrect, false);
});

test('POST /api/exam/submit rejects missing student details', async () => {
  const { app } = createTestApp();
  const noName = await request(app).post('/api/exam/submit').send({
    rollNumber: '104',
    selectedAnswers: {}
  });
  const noRoll = await request(app).post('/api/exam/submit').send({
    studentName: 'Student',
    selectedAnswers: {}
  });

  assert.equal(noName.status, 400);
  assert.match(noName.body.error, /student name/i);
  assert.equal(noRoll.status, 400);
  assert.match(noRoll.body.error, /roll number/i);
});

test('POST /api/exam/submit rejects invalid answer choices and question IDs', async () => {
  const { app } = createTestApp();
  const invalidChoice = await request(app).post('/api/exam/submit').send({
    studentName: 'Student',
    rollNumber: '105',
    selectedAnswers: { q1: 'Z' }
  });
  const unknownQuestion = await request(app).post('/api/exam/submit').send({
    studentName: 'Student',
    rollNumber: '105',
    selectedAnswers: { q11: 'A' }
  });

  assert.equal(invalidChoice.status, 400);
  assert.match(invalidChoice.body.error, /A, B, C, or D/);
  assert.equal(unknownQuestion.status, 400);
  assert.match(unknownQuestion.body.error, /Unknown question/);
});

test('each repeated submission is stored as a separate attempt', async () => {
  const { app, savedReports } = createTestApp();
  const data = {
    studentName: 'Same Student',
    rollNumber: '106',
    selectedAnswers: { q1: 'A' }
  };
  const first = await request(app).post('/api/exam/submit').send(data);
  const second = await request(app).post('/api/exam/submit').send(data);

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(savedReports.length, 2);
  assert.notEqual(first.body.report._id, second.body.report._id);
  assert.notEqual(first.body.report.submittedAt, undefined);
  assert.notEqual(second.body.report.submittedAt, undefined);
});

test('POST /api/exam/submit ignores a client-supplied score', async () => {
  const { app } = createTestApp();
  const response = await request(app).post('/api/exam/submit').send({
    studentName: 'Student',
    rollNumber: '107',
    selectedAnswers: { q1: 'A' },
    score: 10,
    totalMarks: 10
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.report.totalMarks, 1);
  assert.equal(response.body.report.maxMarks, 10);
});

test('POST /api/exam/submit reports database save failures without a success result', async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  const { app, savedReports } = createTestApp({
    saveReport: async () => {
      throw new Error('test database failure');
    }
  });

  try {
    const response = await request(app).post('/api/exam/submit').send({
      studentName: 'Student',
      rollNumber: '108',
      selectedAnswers: { q1: 'A' }
    });

    assert.equal(response.status, 500);
    assert.match(response.body.error, /could not be saved/i);
    assert.equal(response.body.report, undefined);
    assert.equal(savedReports.length, 0);
  } finally {
    console.error = originalConsoleError;
  }
});

test('POST /api/exam/submit returns unavailable when MongoDB is disconnected', async () => {
  const { app, savedReports } = createTestApp({ connected: false });
  const response = await request(app).post('/api/exam/submit').send({
    studentName: 'Student',
    rollNumber: '109',
    selectedAnswers: { q1: 'A' }
  });

  assert.equal(response.status, 503);
  assert.match(response.body.error, /database is unavailable/i);
  assert.equal(savedReports.length, 0);
});

test('student name is returned as data for safe text rendering', async () => {
  const { app } = createTestApp();
  const response = await request(app).post('/api/exam/submit').send({
    studentName: '<img src=x onerror=alert(1)>',
    rollNumber: '110',
    selectedAnswers: {}
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.report.studentName, '<img src=x onerror=alert(1)>');
});
