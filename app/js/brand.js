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
        telegram: 'https://t.me/tronsec_io',
        telegramBot: 'https://t.me/tronsec_bot',
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
