const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const request = require('supertest');
const { app, configureDnsServers, startServer } = require('../server');

test('importing the app does not open a MongoDB connection', () => {
  assert.equal(mongoose.connection.readyState, mongoose.ConnectionStates.disconnected);
});

test('optional DNS_SERVERS configures comma-separated addresses without performing DNS queries', () => {
  let configuredServers;
  const dnsStub = {
    setServers(servers) {
      configuredServers = servers;
    }
  };

  assert.equal(configureDnsServers(' 192.0.2.1, 192.0.2.2 ', dnsStub), true);
  assert.deepEqual(configuredServers, ['192.0.2.1', '192.0.2.2']);
});

test('DNS_SERVERS leaves the default resolver unchanged when unset', () => {
  let setServersCalled = false;
  const dnsStub = {
    setServers() {
      setServersCalled = true;
    }
  };

  assert.equal(configureDnsServers('', dnsStub), false);
  assert.equal(setServersCalled, false);
});

test('GET / serves the student examination page', async () => {
  const response = await request(app).get('/');

  assert.equal(response.status, 200);
  assert.match(response.text, /Basic Computers/);
  assert.match(response.text, /student-name/);
  assert.match(response.text, /Submit exam/);
});

test('GET /teacher.html serves the teacher login page', async () => {
  const response = await request(app).get('/teacher.html');

  assert.equal(response.status, 200);
  assert.match(response.text, /Teacher password/);
  assert.match(response.text, /teacher.js/);
});

test('GET /api/health reports backend and live MongoDB connection status', async () => {
  const response = await request(app).get('/api/health');

  assert.equal(response.status, 200);
  assert.equal(response.body.server.status, 'running');
  assert.equal(response.body.database.readyState, mongoose.connection.readyState);
  assert.equal(
    response.body.database.status,
    ['disconnected', 'connected', 'connecting', 'disconnecting'][
      mongoose.connection.readyState
    ] || 'unknown'
  );
  assert.equal(
    response.body.database.connected,
    mongoose.connection.readyState === mongoose.ConnectionStates.connected
  );
  assert.equal(response.body.application.status, 'not_ready');
  assert.equal(response.body.application.readyForSubmissions, false);
  assert.match(response.body.application.reason, /MongoDB is not connected/i);
});

test('startup refuses to run without a MongoDB URI', async () => {
  const originalPort = process.env.PORT;
  const originalMongoUri = process.env.MONGODB_URI;
  const originalTeacherPassword = process.env.TEACHER_DASHBOARD_PASSWORD;
  const originalSessionSecret = process.env.TEACHER_SESSION_SECRET;

  process.env.PORT = '0';
  process.env.TEACHER_DASHBOARD_PASSWORD = 'test-dashboard-password';
  process.env.TEACHER_SESSION_SECRET = 'test-session-secret-with-at-least-32-characters';
  delete process.env.MONGODB_URI;

  try {
    await assert.rejects(startServer(), /MONGODB_URI must be configured/);
    assert.equal(mongoose.connection.readyState, mongoose.ConnectionStates.disconnected);
  } finally {
    if (originalPort === undefined) {
      delete process.env.PORT;
    } else {
      process.env.PORT = originalPort;
    }

    if (originalMongoUri === undefined) {
      delete process.env.MONGODB_URI;
    } else {
      process.env.MONGODB_URI = originalMongoUri;
    }

    if (originalTeacherPassword === undefined) {
      delete process.env.TEACHER_DASHBOARD_PASSWORD;
    } else {
      process.env.TEACHER_DASHBOARD_PASSWORD = originalTeacherPassword;
    }

    if (originalSessionSecret === undefined) {
      delete process.env.TEACHER_SESSION_SECRET;
    } else {
      process.env.TEACHER_SESSION_SECRET = originalSessionSecret;
    }
  }
});

test('unknown API routes return a JSON 404 response', async () => {
  const response = await request(app).get('/api/not-a-route');

  assert.equal(response.status, 404);
  assert.equal(response.body.error, 'API endpoint not found.');
});
