(() => {
  const examForm = document.querySelector('#exam-form');
  const questionsContainer = document.querySelector('#questions');
  const questionCount = document.querySelector('#question-count');
  const submitButton = document.querySelector('#submit-button');
  const formMessage = document.querySelector('#form-message');
  const examView = document.querySelector('#exam-view');
  const reportView = document.querySelector('#report-view');

  function makeElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    if (text !== undefined) {
      element.textContent = text;
    }
    return element;
  }

  function renderQuestions(questions) {
    const fragment = document.createDocumentFragment();
    questions.forEach((question) => {
      const section = makeElement('section', 'question-card');
      const heading = makeElement('h3', 'question-title');
      heading.id = `${question.id}-title`;
      heading.append(
        makeElement('span', 'question-number', String(question.number).padStart(2, '0')),
        makeElement('span', '', question.text)
      );
      section.append(heading);

      const fieldset = makeElement('fieldset', 'options-fieldset');
      fieldset.setAttribute('aria-labelledby', heading.id);
      const options = makeElement('div', 'option-grid');
      question.options.forEach((option) => {
        const label = makeElement('label', 'answer-option');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = question.id;
        input.value = option.key;
        input.setAttribute('aria-label', `${option.key}. ${option.text}`);
        label.append(
          input,
          makeElement('span', 'option-key', `${option.key}.`),
          makeElement('span', '', option.text)
        );
        options.append(label);
      });
      fieldset.append(options);
      section.append(fieldset);
      fragment.append(section);
    });
    questionsContainer.replaceChildren(fragment);
    questionCount.textContent = `${questions.length} questions`;
    submitButton.disabled = false;
  }

  function showMessage(message) {
    formMessage.textContent = message;
    formMessage.hidden = false;
    formMessage.focus();
  }

  function displayReport(report) {
    document.querySelector('#report-name').textContent = report.studentName;
    document.querySelector('#report-roll').textContent = report.rollNumber;
    document.querySelector('#report-score').textContent = `${report.totalMarks} / ${report.maxMarks}`;
    document.querySelector('#report-total').textContent = `${report.totalMarks} / ${report.maxMarks}`;
    const date = new Date(report.submittedAt);
    document.querySelector('#report-date').textContent = Number.isNaN(date.getTime())
      ? 'Unavailable'
      : date.toLocaleString();

    const rows = document.createDocumentFragment();
    report.questionReports.forEach((item) => {
      const row = document.createElement('tr');
      row.append(makeElement('td', '', String(item.number)));
      row.append(makeElement('td', '', item.question));

      const yourAnswer = document.createElement('td');
      const answerClass = item.selectedAnswer === null
        ? 'result-unanswered'
        : item.isCorrect ? 'result-correct' : 'result-incorrect';
      yourAnswer.append(makeElement('span', `answer-result ${answerClass}`, item.selectedAnswerText));
      if (item.selectedAnswer !== null) {
        yourAnswer.append(makeElement('span', 'answer-letter', `Option ${item.selectedAnswer}`));
      }
      row.append(yourAnswer);

      const correctAnswer = document.createElement('td');
      correctAnswer.append(makeElement('span', 'answer-result result-correct', item.correctAnswerText));
      correctAnswer.append(makeElement('span', 'answer-letter', `Option ${item.correctAnswer}`));
      row.append(correctAnswer);
      const markClass = item.selectedAnswer === null
        ? 'mark-unanswered'
        : item.mark ? 'mark-correct' : 'mark-incorrect';
      row.append(makeElement('td', markClass, `${item.mark} / 1`));
      rows.append(row);
    });

    document.querySelector('#report-rows').replaceChildren(rows);
    examView.hidden = true;
    reportView.hidden = false;
    document.title = 'Basic Computers - Exam Report';
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.querySelector('#report-title').focus();
  }

  async function loadQuestions() {
    questionCount.textContent = 'Loading questions…';
    try {
      const response = await fetch('/api/exam/questions');
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Questions could not be loaded.');
      }
      renderQuestions(result.questions);
    } catch (error) {
      questionCount.textContent = 'Questions unavailable';
      showMessage(`${error.message} Refresh the page to try again.`);
    }
  }

  examForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitButton.disabled) {
      return;
    }

    const studentName = document.querySelector('#student-name').value.trim();
    const rollNumber = document.querySelector('#roll-number').value.trim();
    if (!studentName || !rollNumber) {
      showMessage('Enter your name and roll number before submitting.');
      return;
    }

    const selectedAnswers = {};
    questionsContainer.querySelectorAll('input[type="radio"]:checked').forEach((input) => {
      selectedAnswers[input.name] = input.value;
    });

    formMessage.hidden = true;
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting…';
    try {
      const response = await fetch('/api/exam/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentName, rollNumber, selectedAnswers })
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Your exam could not be submitted.');
      }
      if (!result.report || !Array.isArray(result.report.questionReports)) {
        throw new Error('The saved report could not be displayed. Contact your exam administrator.');
      }
      displayReport(result.report);
    } catch (error) {
      showMessage(error.message);
      submitButton.disabled = false;
      submitButton.textContent = 'Submit exam →';
    }
  });

  document.querySelector('#print-button').addEventListener('click', () => window.print());
  document.querySelector('#retake-button').addEventListener('click', () => {
    examForm.reset();
    formMessage.hidden = true;
    submitButton.disabled = false;
    submitButton.textContent = 'Submit exam →';
    reportView.hidden = true;
    examView.hidden = false;
    document.title = 'Basic Computers | Online Examination';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  loadQuestions();
})();
