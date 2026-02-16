/**
 * Evolution Feedback UI
 * Displays evolution health, suggestions, and allows auto-adaptation
 */
export class EvolutionFeedback {
  constructor(monitor) {
    this.monitor = monitor;
    this.container = document.getElementById('evolution-feedback');
    this.suggestionsPanelEl = document.getElementById('suggestions-panel');
    this.autoAdaptToggle = document.getElementById('auto-adapt-toggle');

    if (this.autoAdaptToggle) {
      this.autoAdaptToggle.onchange = (e) => {
        this.monitor.setAutoAdapt(e.target.checked);
        this.showAutoAdaptStatus(e.target.checked);
      };
    }

    this.lastDisplayedGen = -1;
  }

  /**
   * Update the evolution health indicator
   */
  update() {
    if (!this.container) return;

    const indicator = this.monitor.getStatusIndicator();
    const health = indicator.health;

    // Update status badge
    const statusBadge = document.getElementById('evo-status-badge');
    if (statusBadge) {
      statusBadge.textContent = indicator.icon + ' ' + indicator.label;
      statusBadge.style.color = indicator.color;
      statusBadge.className = `evo-status-badge severity-${health.severity}`;
    }

    // Update main message
    const messageEl = document.getElementById('evo-message');
    if (messageEl && health.stats) {
      if (health.severity === 'good') {
        messageEl.textContent = health.message;
        messageEl.style.color = indicator.color;
      } else {
        messageEl.textContent = health.message;
        messageEl.style.color = indicator.color;
      }
    }

    // Show suggestions if needed
    if (health.suggestions && health.suggestions.length > 0) {
      this.showSuggestions(health);
    } else {
      this.hideSuggestions();
    }

    // Update insights
    const insights = this.monitor.getInsights();
    if (insights) {
      this.updateInsights(insights);
    }
  }

  /**
   * Show suggestions panel
   */
  showSuggestions(health) {
    if (!this.suggestionsPanelEl) return;

    // Only show new suggestions once per severity change
    const currentGen = health.stats?.currentGen || 0;
    if (this.lastDisplayedGen === currentGen && health.severity !== 'critical') {
      return;
    }

    this.lastDisplayedGen = currentGen;
    this.suggestionsPanelEl.classList.remove('hidden');

    const listEl = document.getElementById('suggestions-list');
    if (!listEl) return;

    listEl.innerHTML = '';

    health.suggestions.forEach((suggestion, i) => {
      const item = document.createElement('div');
      item.className = 'suggestion-item';

      const titleEl = document.createElement('div');
      titleEl.className = 'suggestion-title';
      titleEl.textContent = `${i + 1}. ${suggestion.description}`;

      const reasonEl = document.createElement('div');
      reasonEl.className = 'suggestion-reason';
      reasonEl.textContent = suggestion.reason;

      item.appendChild(titleEl);
      item.appendChild(reasonEl);

      // Add "Try This" button if auto-params exist
      if (suggestion.autoParams) {
        const btnEl = document.createElement('button');
        btnEl.className = 'btn-try-suggestion';
        btnEl.textContent = 'Apply Now';
        btnEl.onclick = () => this.applySuggestion(suggestion);
        item.appendChild(btnEl);
      }

      listEl.appendChild(item);
    });

    // Auto-hide after 10 seconds for warnings, keep for critical
    if (health.severity === 'warning') {
      setTimeout(() => {
        if (this.suggestionsPanelEl) {
          this.suggestionsPanelEl.classList.add('hidden');
        }
      }, 10000);
    }
  }

  /**
   * Hide suggestions panel
   */
  hideSuggestions() {
    if (this.suggestionsPanelEl) {
      this.suggestionsPanelEl.classList.add('hidden');
    }
  }

  /**
   * Apply a suggestion manually
   */
  applySuggestion(suggestion) {
    // Dispatch event for main app to handle
    const event = new CustomEvent('applySuggestion', {
      detail: { suggestion }
    });
    window.dispatchEvent(event);

    // Show confirmation
    this.showNotification(`Applied: ${suggestion.description}`, 'success');
  }

  /**
   * Show notification toast
   */
  showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `evo-notification evo-notification-${type}`;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('show');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /**
   * Show auto-adapt status change
   */
  showAutoAdaptStatus(enabled) {
    const message = enabled
      ? '🤖 Auto-adaptation enabled - parameters will adjust automatically'
      : 'Manual mode - you control all parameters';
    this.showNotification(message, enabled ? 'success' : 'info');
  }

  /**
   * Update evolution insights
   */
  updateInsights(insights) {
    const insightsEl = document.getElementById('evo-insights');
    if (!insightsEl) return;

    const trendIcons = {
      'improving': '📈',
      'slow': '➡️',
      'stagnant': '📉'
    };

    const trendColors = {
      'improving': '#10b981',
      'slow': '#f59e0b',
      'stagnant': '#ef4444'
    };

    insightsEl.innerHTML = `
      <span style="color: ${trendColors[insights.trend]}">
        ${trendIcons[insights.trend]} ${insights.trend.toUpperCase()}
      </span>
      <span class="insight-stat">Gen ${insights.generation}</span>
      <span class="insight-stat">${insights.progress}m best</span>
      <span class="insight-stat">${insights.improvementRate} improvement rate</span>
    `;
  }

  /**
   * Show adaptation notification when auto-adapt triggers
   */
  showAdaptation(adaptation) {
    if (!adaptation) return;

    const changes = adaptation.changes
      .map(c => `${c.param}: ${this.formatValue(c.from)} → ${this.formatValue(c.to)}`)
      .join(', ');

    this.showNotification(
      `🤖 Auto-adapted: ${changes}`,
      'info'
    );
  }

  /**
   * Format parameter values for display
   */
  formatValue(val) {
    if (typeof val === 'number') {
      return val < 1 ? val.toFixed(2) : val.toFixed(1);
    }
    return val;
  }

  /**
   * Dismiss suggestions panel manually
   */
  dismissSuggestions() {
    this.hideSuggestions();
  }
}
