# ⚠️ Не использовать как источник для сайта

Эта папка — **экспорт для GitHub-репозитория** (`jamejons/tronsec`), не рабочая копия продакшена.

- Обновляется: `python scripts/sync-github-export.py` (копирует **из `staging/app/`** и **`staging/assets/`**)
- Чеклист перед push: `scripts/github-push-checklist.md`
- **Не** копировать отсюда в `dist/`, `staging/` или маркетинг
- **Не** деплоить `github/` на tronsec.io

Источник правды для кода приложения — **`staging/app/`** (canonical EN). Прод — **`dist/`** (obfuscated).
