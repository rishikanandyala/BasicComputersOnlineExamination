const express = require('express');
const exam = require('../data/exam');

const answerKeys = ['A', 'B', 'C', 'D'];

function createExamRouter({ ExamReportModel, isDatabaseConnected }) {
  const router = express.Router();

  router.get('/questions', (req, res) => {
    res.json({
      examName: exam.name,
      questionType: exam.questionType,
      totalQuestions: exam.questions.length,
      marksPerQuestion: exam.marksPerQuestion,
      totalMarks: exam.questions.length * exam.marksPerQuestion,
      questions: exam.questions.map(({ id, text, options }, index) => ({
        id,
        number: index + 1,
        text,
        options: Object.entries(options).map(([key, optionText]) => ({
          key,
          text: optionText
        }))
      }))
    });
  });

  router.post('/submit', async (req, res) => {
    const { studentName, rollNumber, selectedAnswers } = req.body || {};
    const normalizedName = typeof studentName === 'string' ? studentName.trim() : '';
    const normalizedRoll = typeof rollNumber === 'string' ? rollNumber.trim() : '';

    if (!normalizedName || normalizedName.length > 100) {
      return res.status(400).json({
        error: 'Enter a student name between 1 and 100 characters.'
      });
    }

    if (!normalizedRoll || normalizedRoll.length > 50) {
      return res.status(400).json({
        error: 'Enter a roll number between 1 and 50 characters.'
      });
    }

    if (
      selectedAnswers !== undefined &&
      (selectedAnswers === null ||
        typeof selectedAnswers !== 'object' ||
        Array.isArray(selectedAnswers))
    ) {
      return res.status(400).json({ error: 'Answers must be provided as an object.' });
    }

    const answers = selectedAnswers || {};
    const allowedQuestionIds = new Set(exam.questions.map(({ id }) => id));
    for (const [questionId, answer] of Object.entries(answers)) {
      if (!allowedQuestionIds.has(questionId)) {
        return res.status(400).json({ error: `Unknown question: ${questionId}.` });
      }

      if (!answerKeys.includes(answer)) {
        return res.status(400).json({
          error: `Answer for ${questionId} must be A, B, C, or D.`
        });
      }
    }

    if (!isDatabaseConnected()) {
      return res.status(503).json({
        error: 'Exam reports cannot be saved because the database is unavailable.'
      });
    }

    const correctAnswers = {};
    const normalizedAnswers = {};
    let totalMarks = 0;
    const questionReports = exam.questions.map((question, index) => {
      const selectedAnswer = answers[question.id] || null;
      const isCorrect = selectedAnswer !== null && selectedAnswer === question.correctAnswer;
      const mark = isCorrect ? exam.marksPerQuestion : 0;

      correctAnswers[question.id] = question.correctAnswer;
      if (selectedAnswer !== null) {
        normalizedAnswers[question.id] = selectedAnswer;
      }
      totalMarks += mark;

      return {
        questionId: question.id,
        number: index + 1,
        question: question.text,
        selectedAnswer,
        selectedAnswerText: selectedAnswer
          ? question.options[selectedAnswer]
          : 'Not Answered',
        correctAnswer: question.correctAnswer,
        correctAnswerText: question.options[question.correctAnswer],
        mark,
        isCorrect
      };
    });

    const reportData = {
      studentName: normalizedName,
      rollNumber: normalizedRoll,
      examName: exam.name,
      selectedAnswers: normalizedAnswers,
      correctAnswers,
      questionReports,
      totalMarks,
      maxMarks: exam.questions.length * exam.marksPerQuestion,
      submittedAt: new Date()
    };

    try {
      const savedReport = await new ExamReportModel(reportData).save();
      return res.status(201).json({ report: savedReport.toObject() });
    } catch (error) {
      console.error('Failed to save exam report:', error.message);
      return res.status(500).json({
        error: 'Your exam could not be saved. Please try again.'
      });
    }
  });

  return router;
}

module.exports = createExamRouter;
