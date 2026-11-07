const mongoose = require('mongoose');

const questionReportSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true },
    number: { type: Number, required: true },
    question: { type: String, required: true },
    selectedAnswer: { type: String, default: null },
    selectedAnswerText: { type: String, default: 'Not Answered' },
    correctAnswer: { type: String, required: true },
    correctAnswerText: { type: String, required: true },
    mark: { type: Number, required: true },
    isCorrect: { type: Boolean, required: true }
  },
  { _id: false }
);

const examReportSchema = new mongoose.Schema({
  studentName: { type: String, required: true, trim: true },
  rollNumber: { type: String, required: true, trim: true },
  examName: { type: String, required: true },
  selectedAnswers: { type: mongoose.Schema.Types.Mixed, required: true },
  correctAnswers: { type: mongoose.Schema.Types.Mixed, required: true },
  questionReports: { type: [questionReportSchema], required: true },
  totalMarks: { type: Number, required: true },
  maxMarks: { type: Number, required: true },
  submittedAt: { type: Date, required: true }
});

module.exports = mongoose.model('ExamReport', examReportSchema, 'examreports');
