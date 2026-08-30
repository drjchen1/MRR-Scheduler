/* Small UI boundary for shared, schedule-level feedback. Keeping this out of
 * index.html lets rendering behavior evolve without touching page structure. */
(function attachScheduleUI(global) {
    function renderFeasibilityReport(state) {
        const alertArea = document.getElementById('schedule-alerts');
        if (!alertArea) return;
        alertArea.querySelectorAll('.feasibility-alert').forEach(alert => alert.remove());
        const report = state.feasibilityReport;
        if (!report || !report.issues || !report.issues.length) return;

        const alert = document.createElement('div');
        alert.className = 'feasibility-alert';
        alert.style.cssText = 'background: #fffbeb; border: 1px solid #fbbf24; color: #92400e; padding: 12px 16px; border-radius: 8px; margin-bottom: 12px;';
        const heading = document.createElement('strong');
        heading.textContent = 'Scheduling constraints need attention';
        const details = document.createElement('div');
        details.style.cssText = 'font-size: 0.82rem; margin-top: 4px;';
        details.textContent = report.issues.map(issue => issue.message).join(' ');
        alert.append(heading, details);
        alertArea.appendChild(alert);
    }

    global.ShiftHappensUI = { renderFeasibilityReport };
})(window);
