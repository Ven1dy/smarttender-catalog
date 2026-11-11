# Каталог SmartTender

Зручний веб-перегляд номенклатури SmartTender (KSM) та довідника KSMO (1С).

## GitHub Pages

Онлайн: https://ven1dy.github.io/smarttender-catalog/

Репозиторій: https://github.com/Ven1dy/smarttender-catalog

Деплой: при кожному push у `main` Actions публікує папку `web/`.

## Локальний запуск

```bash
python build_web_data.py   # якщо потрібно перезібрати web/data
python serve.py            # http://127.0.0.1:8765/
```

## Структура

| Шлях | Опис |
|------|------|
| `web/` | Сайт для перегляду (деплоїться на Pages) |
| `Каталог.json` / `Каталог оновлен.json` | Вихідні дані |
| `build_web_data.py` | Збірка `web/data/catalog.min.json(.gz)` |
| `pack_standalone.py` | Один HTML з вбудованим каталогом |
| `ksmo_*.csv` / `ksmo_match_report.json` | Звіти зіставлення KSM ↔ KSMO |

## Технології

Статичний HTML/CSS/JS. Дані каталогу на Pages підвантажуються з `catalog.min.json.gz` (~1.5 MB).
