const crypto = require('node:crypto');
const express = require('express');
const mongoose = require('mongoose');
const createLoginRateLimiter = require('../middleware/loginRateLimiter');

function passwordsMatch(provided, expected) {
  const providedDigest = crypto.createHash('sha256').update(provided).digest();
  const expectedDigest = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(providedDigest, expectedDigest);
}

function createTeacherRouter({
  ExamReportModel,
  teacherPassword = process.env.TEACHER_DASHBOARD_PASSWORD,
  isDatabaseConnected,
  loginRateLimit = {}
}) {
  const router = express.Router();
  const limitLoginAttempts = createLoginRateLimiter(loginRateLimit);

  function requireTeacher(req, res, next) {
    if (!req.session || req.session.teacherAuthenticated !== true) {
      return res.status(401).json({ error: 'Teacher login is required.' });
    }
    return next();
  }

  router.post('/login', limitLoginAttempts, (req, res, next) => {
    if (
      typeof teacherPassword !== 'string' ||
      teacherPassword.length === 0 ||
      teacherPassword === 'YOUR_TEACHER_DASHBOARD_PASSWORD'
    ) {
      return res.status(503).json({
        error: 'Teacher login is not configured. Set TEACHER_DASHBOARD_PASSWORD on the server.'
      });
    }
    if (!req.session) {
      return res.status(503).json({
        error: 'Teacher sessions are not configured. Contact the application administrator.'
      });
    }

    const { password } = req.body || {};
    if (typeof password !== 'string' || password.length === 0) {
      return res.status(400).json({ error: 'Enter the teacher password.' });
    }
    if (password.length > 1024 || !passwordsMatch(password, teacherPassword)) {
      return res.status(401).json({ error: 'The teacher password is incorrect.' });
    }

    req.session.regenerate((regenerateError) => {
      if (regenerateError) {
        return next(regenerateError);
      }

      req.session.teacherAuthenticated = true;
      req.session.save((saveError) => {
        if (saveError) {
          return next(saveError);
        }
        limitLoginAttempts.reset(req.ip || req.socket.remoteAddress || 'unknown');
        return res.json({ authenticated: true });
      });
    });
  });

  router.get('/session', (req, res) => {
    if (!req.session || req.session.teacherAuthenticated !== true) {
      return res.status(401).json({
        authenticated: false,
        error: 'Teacher login is required.'
      });
    }

    return res.json({ authenticated: true });
  });

  router.post('/logout', (req, res, next) => {
    const cookieOptions = {
      httpOnly: true,
      sameSite: 'strict',
      secure: req.app.get('teacherSecureCookies'),
      path: '/'
    };

    if (!req.session) {
      res.clearCookie('teacher.sid', cookieOptions);
      return res.json({ authenticated: false });
    }

    req.session.destroy((error) => {
      if (error) {
        return next(error);
      }
      res.clearCookie('teacher.sid', cookieOptions);
      return res.json({ authenticated: false });
    });
  });

  router.get('/reports', requireTeacher, async (req, res) => {
    if (!isDatabaseConnected()) {
      return res.status(503).json({ error: 'Reports are unavailable because the database is disconnected.' });
    }

    try {
      const reports = await ExamReportModel.find({})
        .sort({ submittedAt: -1 })
        .select('_id studentName rollNumber examName totalMarks maxMarks submittedAt')
        .lean();
      return res.json({ reports });
    } catch (error) {
      console.error('Failed to retrieve teacher report list:', error.message);
      return res.status(500).json({ error: 'Reports could not be loaded. Please try again.' });
    }
  });

  router.get('/reports/:id', requireTeacher, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'The report ID is invalid.' });
    }
    if (!isDatabaseConnected()) {
      return res.status(503).json({ error: 'Reports are unavailable because the database is disconnected.' });
    }

    try {
      const report = await ExamReportModel.findById(req.params.id).lean();
      if (!report) {
        return res.status(404).json({ error: 'The requested report was not found.' });
      }
      return res.json({ report });
    } catch (error) {
      console.error('Failed to retrieve teacher report:', error.message);
      return res.status(500).json({ error: 'The report could not be loaded. Please try again.' });
    }
  });

  return router;
}

module.exports = createTeacherRouter;
