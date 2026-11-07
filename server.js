require('dotenv').config();

const dns = require('node:dns');

function configureDnsServers(dnsServers = process.env.DNS_SERVERS, dnsModule = dns) {
  if (dnsServers === undefined || dnsServers.trim() === '') {
    return false;
  }

  const servers = dnsServers.split(',').map((server) => server.trim());
  if (servers.some((server) => server === '')) {
    throw new Error('DNS_SERVERS must contain comma-separated DNS server addresses.');
  }

  dnsModule.setServers(servers);
  return true;
}

configureDnsServers();

const express = require('express');
const helmet = require('helmet');
const mongoose = require('mongoose');
const path = require('node:path');
const ExamReport = require('./models/ExamReport');
const createExamRouter = require('./routes/exam');
const createTeacherRouter = require('./routes/teacher');
const {
  createMongoSessionMiddleware,
  validateTeacherConfiguration
} = require('./middleware/teacherSession');

const publicDirectory = path.join(__dirname, 'public');

function getMongoDBStatus(readyState) {
  const statuses = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return statuses[readyState] || 'unknown';
}

function createApp({
  ExamReportModel = ExamReport,
  isDatabaseConnected = () =>
    mongoose.connection.readyState === mongoose.ConnectionStates.connected,
  sessionMiddleware,
  teacherPassword = process.env.TEACHER_DASHBOARD_PASSWORD,
  secureCookies = process.env.NODE_ENV === 'production',
  trustProxy = process.env.NODE_ENV === 'production' ? 1 : false,
  loginRateLimit
} = {}) {
  const app = express();

  app.set('trust proxy', trustProxy);
  app.set('teacherSecureCookies', secureCookies);
  app.use(helmet());
  app.use(express.json({ limit: '10kb' }));
  if (sessionMiddleware) {
    app.use(sessionMiddleware);
  }

  app.get('/api/health', (req, res) => {
    const readyState = mongoose.connection.readyState;
    const databaseConnected = isDatabaseConnected();

    res.status(200).json({
      server: {
        status: 'running'
      },
      database: {
        status: getMongoDBStatus(readyState),
        connected: databaseConnected,
        readyState
      },
      application: {
        status: databaseConnected ? 'ready' : 'not_ready',
        readyForSubmissions: databaseConnected,
        reason: databaseConnected ? null : 'MongoDB is not connected.'
      }
    });
  });

  app.use(
    '/api/exam',
    createExamRouter({ ExamReportModel, isDatabaseConnected })
  );
  app.use(
    '/api/teacher',
    createTeacherRouter({
      ExamReportModel,
      teacherPassword,
      isDatabaseConnected,
      loginRateLimit
    })
  );
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  app.use(express.static(publicDirectory));

  app.use((req, res) => {
    res.status(404).send('Page not found.');
  });

  app.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body must contain valid JSON.' });
    }
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body is too large.' });
    }
    console.error('Request error:', error.message);
    return res.status(500).json({ error: 'An unexpected server error occurred.' });
  });

  return app;
}

const app = createApp();

async function startServer() {
  const port = process.env.PORT;
  if (!port || port === 'YOUR_LOCAL_PORT') {
    throw new Error('Set PORT in your .env file before starting the server.');
  }

  validateTeacherConfiguration();

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri || mongoUri === 'YOUR_MONGODB_ATLAS_CONNECTION_STRING') {
    throw new Error('MONGODB_URI must be configured before starting the server.');
  }

  try {
    await mongoose.connect(mongoUri, { dbName: 'basic_computers_exam_v2' });
    console.log('Connected to MongoDB database basic_computers_exam_v2.');
  } catch {
    throw new Error('Could not connect to MongoDB Atlas. Check the URI and Atlas network access.');
  }

  const productionApp = createApp({
    sessionMiddleware: createMongoSessionMiddleware(),
    secureCookies: process.env.NODE_ENV === 'production',
    trustProxy: process.env.NODE_ENV === 'production' ? 1 : false
  });

  return productionApp.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on port ${port}.`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  app,
  configureDnsServers,
  createApp,
  startServer,
  validateTeacherConfiguration
};
