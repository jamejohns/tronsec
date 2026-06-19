/* TRONSEC official brand — https://tronsec.io */
(function (global) {
    'use strict';

    const SITE = 'https://tronsec.io';

    const LOCALE_HOME = {
        en: '/',
        ru: '/ru/',
        zh: '/zh/',
        es: '/es/',
        'pt-BR': '/pt-BR/',
        vi: '/vi/',
        tr: '/tr/',
        id: '/id/',
    };

    const LOCALE_APP = {
        en: '/app/',
        ru: '/ru/app/',
        zh: '/zh/app/',
        es: '/es/app/',
        pt: '/pt-BR/app/',
        vi: '/vi/app/',
        tr: '/tr/app/',
        id: '/id/app/',
    };

    global.TRONSEC_BRAND = {
        site: SITE,
        app: SITE + '/app/',
        name: 'TRONSEC',
        domain: 'tronsec.io',
        telegram: 'https://t.me/tronsec_chat',
    };

    function isSameOriginDeploy() {
        const h = (location.hostname || '').toLowerCase();
        return h === 'tronsec.io' || h.endsWith('.tronsec.io') || h === 'localhost' || h === '127.0.0.1';
    }

    function localePrefixFromPath() {
        const parts = location.pathname.split('/').filter(Boolean);
        const locales = Object.keys(LOCALE_HOME).filter((c) => c !== 'en');
        if (parts.length >= 2 && parts[1] === 'app' && locales.includes(parts[0])) {
            return LOCALE_HOME[parts[0]];
        }
        return '/';
    }

    function absoluteUrl(path) {
        return SITE.replace(/\/$/, '') + (path.startsWith('/') ? path : '/' + path);
    }

    function resolveUrl(path) {
        return isSameOriginDeploy() ? path : absoluteUrl(path);
    }

    function marketingHomeUrl() {
        return resolveUrl(localePrefixFromPath());
    }

    function appUrlForLang(lang) {
        const path = LOCALE_APP[lang] || LOCALE_APP.en;
        return resolveUrl(path);
    }

    function applyExternalBrandAttrs(el) {
        if (!el || isSameOriginDeploy()) {
            if (el) {
                el.removeAttribute('target');
                el.removeAttribute('rel');
            }
            return;
        }
        el.target = '_blank';
        el.rel = 'noopener noreferrer';
    }

    global.syncTronsecBrandLinks = function syncTronsecBrandLinks() {
        const home = marketingHomeUrl();

        document.querySelectorAll('[data-tronsec-brand]').forEach((el) => {
            el.href = home;
            el.title = 'TRONSEC — tronsec.io';
            applyExternalBrandAttrs(el);
        });

        document.querySelectorAll('[data-tronsec-site]').forEach((el) => {
            el.href = SITE + '/';
            applyExternalBrandAttrs(el);
        });

        document.querySelectorAll('#lang-dd .lang-opt').forEach((el) => {
            const lang = el.getAttribute('data-lang');
            if (lang) el.href = appUrlForLang(lang);
        });
    };
}(window));
