(() => {
  const loginPanel = document.querySelector('#login-panel');
  const dashboardPanel = document.querySelector('#dashboard-panel');
  const reportPanel = document.querySelector('#teacher-report-panel');
  const loginForm = document.querySelector('#login-form');
  const loginMessage = document.querySelector('#login-message');
  const dashboardMessage = document.querySelector('#dashboard-message');
  const loginButton = document.querySelector('#login-button');
  const refreshButton = document.querySelector('#refresh-button');
  const rows = document.querySelector('#reports-rows');
  const loadingState = document.querySelector('#reports-loading');
  const emptyState = document.querySelector('#reports-empty');
  const tableWrap = document.querySelector('#reports-table-wrap');

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) {
        showLogin();
      }
      const error = new Error(data.error || 'The request could not be completed.');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function showLogin() {
    loginPanel.hidden = false;
    dashboardPanel.hidden = true;
    reportPanel.hidden = true;
    document.title = 'Teacher Login | Basic Computers';
  }

  function showDashboard() {
    loginPanel.hidden = true;
    dashboardPanel.hidden = false;
    reportPanel.hidden = true;
    document.title = 'Teacher Dashboard | Basic Computers';
  }

  function showReport() {
    loginPanel.hidden = true;
    dashboardPanel.hidden = true;
    reportPanel.hidden = false;
    document.title = 'Basic Computers - Exam Report';
  }

  function showMessage(target, message) {
    target.textContent = message;
    target.hidden = false;
    target.focus();
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleString();
  }

  function updateSummary(reports) {
    document.querySelector('#attempt-count').textContent = String(reports.length);
    const scores = reports.filter(
      (report) => Number.isFinite(report.totalMarks) &&
        Number.isFinite(report.maxMarks) &&
        report.maxMarks > 0
    );
    const average = scores.length
      ? scores.reduce((sum, report) => sum + report.totalMarks / report.maxMarks, 0) /
        scores.length * 100
      : null;
    document.querySelector('#average-score').textContent =
      average === null ? '—' : `${average.toFixed(1)}%`;
  }

  function renderReports(reports) {
    const fragment = document.createDocumentFragment();
    reports.forEach((report) => {
      const row = document.createElement('tr');
      row.append(element('td', 'student-cell', report.studentName || '—'));
      row.append(element('td', 'roll-cell', report.rollNumber || '—'));
      row.append(element('td', '', report.examName || '—'));
      row.append(element('td', '', ''));
      row.lastElementChild.append(element(
        'span',
        'score-chip',
        `${report.totalMarks ?? 0} / ${report.maxMarks ?? 0}`
      ));
      row.append(element('td', 'date-cell', formatDate(report.submittedAt)));

      const actionCell = document.createElement('td');
      const viewButton = element('button', 'view-report-button', 'View report');
      viewButton.type = 'button';
      viewButton.dataset.reportId = report._id;
      actionCell.append(viewButton);
      row.append(actionCell);
      fragment.append(row);
    });
    rows.replaceChildren(fragment);
    document.querySelector('#reports-count').textContent =
      `${reports.length} ${reports.length === 1 ? 'report' : 'reports'}`;
    updateSummary(reports);
    emptyState.hidden = reports.length !== 0;
    tableWrap.classList.toggle('has-rows', reports.length !== 0);
  }

  async function loadReports() {
    dashboardMessage.hidden = true;
    loadingState.hidden = false;
    emptyState.hidden = true;
    tableWrap.classList.remove('has-rows');
    refreshButton.disabled = true;
    refreshButton.textContent = 'Loading…';

    try {
      const { reports } = await api('/api/teacher/reports');
      renderReports(reports);
    } catch (error) {
      showMessage(dashboardMessage, error.message);
    } finally {
      loadingState.hidden = true;
      refreshButton.disabled = false;
      refreshButton.textContent = '↻ Refresh reports';
    }
  }

  function appendAnswer(cell, text, key) {
    cell.append(element('span', 'answer-result', text || 'Not Answered'));
    if (key) cell.append(element('span', 'answer-letter', `Option ${key}`));
  }

  function renderReport(report) {
    document.querySelector('#teacher-report-name').textContent = report.studentName;
    document.querySelector('#teacher-report-roll').textContent = report.rollNumber;
    document.querySelector('#teacher-exam-name').textContent = report.examName;
    document.querySelector('#teacher-report-score').textContent =
      `${report.totalMarks} / ${report.maxMarks}`;
    document.querySelector('#teacher-report-total').textContent =
      `${report.totalMarks} / ${report.maxMarks}`;
    document.querySelector('#teacher-report-date').textContent = formatDate(report.submittedAt);

    const fragment = document.createDocumentFragment();
    report.questionReports.forEach((item) => {
      const row = document.createElement('tr');
      row.append(element('td', '', String(item.number)));
      row.append(element('td', '', item.question));

      const studentAnswer = document.createElement('td');
      const answerClass = item.selectedAnswer === null
        ? 'result-unanswered'
        : item.isCorrect ? 'result-correct' : 'result-incorrect';
      studentAnswer.append(element(
        'span',
        `answer-result ${answerClass}`,
        item.selectedAnswerText || 'Not Answered'
      ));
      if (item.selectedAnswer !== null && item.selectedAnswer) {
        studentAnswer.append(element('span', 'answer-letter', `Option ${item.selectedAnswer}`));
      }
      row.append(studentAnswer);

      const correctAnswer = document.createElement('td');
      appendAnswer(correctAnswer, item.correctAnswerText, item.correctAnswer);
      correctAnswer.firstElementChild.classList.add('result-correct');
      row.append(correctAnswer);

      const markClass = item.selectedAnswer === null
        ? 'mark-unanswered'
        : item.isCorrect ? 'mark-correct' : 'mark-incorrect';
      row.append(element('td', markClass, `${item.mark} / 1`));
      fragment.append(row);
    });
    document.querySelector('#teacher-report-rows').replaceChildren(fragment);
    showReport();
    document.querySelector('#teacher-report-title').focus();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  async function openReport(id) {
    dashboardMessage.hidden = true;
    try {
      const { report } = await api(`/api/teacher/reports/${encodeURIComponent(id)}`);
      renderReport(report);
    } catch (error) {
      if (!dashboardPanel.hidden) {
        showMessage(dashboardMessage, error.message);
      }
    }
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (loginButton.disabled) return;

    loginMessage.hidden = true;
    loginButton.disabled = true;
    loginButton.textContent = 'Signing in…';
    const passwordInput = document.querySelector('#teacher-password');
    try {
      await api('/api/teacher/login', {
        method: 'POST',
        body: JSON.stringify({ password: passwordInput.value })
      });
      passwordInput.value = '';
      showDashboard();
      await loadReports();
    } catch (error) {
      showMessage(loginMessage, error.message);
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = 'Sign in →';
    }
  });

  refreshButton.addEventListener('click', loadReports);
  rows.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-report-id]');
    if (button) openReport(button.dataset.reportId);
  });
  document.querySelector('#back-button').addEventListener('click', () => {
    showDashboard();
    document.querySelector('#dashboard-title').focus();
  });
  document.querySelector('#teacher-print-button').addEventListener('click', () => window.print());
  document.querySelector('#logout-button').addEventListener('click', async () => {
    try {
      await api('/api/teacher/logout', { method: 'POST' });
      loginForm.reset();
      loginMessage.hidden = true;
      showLogin();
      document.querySelector('#login-title').focus();
    } catch (error) {
      showMessage(dashboardMessage, error.message);
    }
  });

  async function initialize() {
    try {
      const { authenticated } = await api('/api/teacher/session');
      if (authenticated) {
        showDashboard();
        await loadReports();
      } else {
        showLogin();
      }
    } catch (error) {
      showLogin();
      if (error.status !== 401) {
        showMessage(loginMessage, error.message);
      }
    }
  }

  initialize();
})();
