import './styles.css';

const themeMeta = document.querySelector('meta[name="theme-color"]');
const toggles = [...document.querySelectorAll('[data-theme-toggle]')];
function applyTheme(theme, remember) {
  document.documentElement.dataset.theme = theme;
  themeMeta.content = theme === 'light' ? '#f6f5f2' : '#0a0b0e';
  toggles.forEach((button) => button.setAttribute('aria-label', `Switch to ${theme === 'light' ? 'dark' : 'light'} mode`));
  if (remember) { try { localStorage.setItem('anyvr-theme', theme); } catch { /* storage blocked */ } }
}
applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark', false);
toggles.forEach((button) => button.addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light', true)));
