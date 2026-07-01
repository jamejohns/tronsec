(function () {
  'use strict';

  function proxyBase() {
    const b = window.TRONSEC_PROXY && window.TRONSEC_PROXY.base;
    return typeof b === 'string' ? b.replace(/\/$/, '') : '';
  }

  window.tronsecUseApiProxy = function tronsecUseApiProxy() {
    return proxyBase().length > 0;
  };

  window.tronsecProxyUrl = function tronsecProxyUrl(route, params) {
    const url = new URL(proxyBase() + route);
    if (params && typeof params === 'object') {
      Object.entries(params).forEach(function (entry) {
        const k = entry[0];
        const v = entry[1];
        if (v != null && v !== '') url.searchParams.set(k, v);
      });
    }
    return url.toString();
  };

  window.tronsecVtConfigured = function tronsecVtConfigured() {
    return window.tronsecUseApiProxy();
  };

  window.tronsecTelegramConfigured = function tronsecTelegramConfigured() {
    if (window.tronsecUseApiProxy()) return true;
    const k = window.TRONSEC_KEYS || {};
    return !!(k.telegramBotToken && k.telegramChatId);
  };
})();
