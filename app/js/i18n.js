(function () {
  'use strict';

  const dicts = Object.create(null);

  function normalizeLang(lang) {
    if (!lang) return 'en';
    const raw = String(lang).trim();
    const lower = raw.toLowerCase();
    if (lower === 'en' || lower === 'en-us' || lower === 'x-default') return 'en';
    if (lower === 'pt-br' || lower === 'pt_br' || lower === 'ptbr') return 'pt-BR';
    if (lower.startsWith('zh')) return 'zh';
    if (lower.startsWith('pt')) return 'pt-BR';
    if (lower.startsWith('ru')) return 'ru';
    if (lower.startsWith('es')) return 'es';
    if (lower.startsWith('vi')) return 'vi';
    if (lower.startsWith('tr')) return 'tr';
    if (lower.startsWith('id')) return 'id';
    return raw;
  }

  function currentLang() {
    return normalizeLang(document.documentElement.getAttribute('lang') || 'en');
  }

  function interpolate(str, vars) {
    if (!vars || typeof str !== 'string') return str;
    return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
  }

  window.registerI18n = function registerI18n(lang, dict) {
    const key = normalizeLang(lang);
    if (!dict || typeof dict !== 'object') return;
    dicts[key] = Object.assign(dicts[key] || {}, dict);
  };

  window.t = function t(key, vars) {
    if (key == null) return '';
    const k = String(key);
    const lang = currentLang();
    if (lang === 'en') return interpolate(k, vars);
    const translated = dicts[lang] && dicts[lang][k];
    return interpolate(translated != null ? translated : k, vars);
  };

  window.i18nLang = currentLang;
})();
