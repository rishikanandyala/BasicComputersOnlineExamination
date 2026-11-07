const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');

const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

function validateTeacherConfiguration({
  teacherPassword = process.env.TEACHER_DASHBOARD_PASSWORD,
  sessionSecret = process.env.TEACHER_SESSION_SECRET
} = {}) {
  if (
    typeof teacherPassword !== 'string' ||
    teacherPassword.length === 0 ||
    teacherPassword === 'YOUR_TEACHER_DASHBOARD_PASSWORD'
  ) {
    throw new Error('TEACHER_DASHBOARD_PASSWORD must be configured before starting the server.');
  }

  if (
    typeof sessionSecret !== 'string' ||
    sessionSecret.length < 32 ||
    sessionSecret === 'REPLACE_WITH_A_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS'
  ) {
    throw new Error(
      'TEACHER_SESSION_SECRET must be configured with a secret of at least 32 characters.'
    );
  }
}

function createMongoSessionMiddleware({
  secret = process.env.TEACHER_SESSION_SECRET,
  secureCookies = process.env.NODE_ENV === 'production',
  client = mongoose.connection.getClient()
} = {}) {
  validateTeacherConfiguration({
    teacherPassword: process.env.TEACHER_DASHBOARD_PASSWORD,
    sessionSecret: secret
  });

  const store = MongoStore.create({
    client,
    collectionName: 'teacherSessions',
    ttl: SESSION_MAX_AGE_MS / 1000,
    autoRemove: 'native'
  });

  return session({
    name: 'teacher.sid',
    secret,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: secureCookies,
      maxAge: SESSION_MAX_AGE_MS
    }
  });
}

module.exports = {
  SESSION_MAX_AGE_MS,
  createMongoSessionMiddleware,
  validateTeacherConfiguration
};
