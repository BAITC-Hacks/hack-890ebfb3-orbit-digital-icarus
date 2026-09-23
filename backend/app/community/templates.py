"""Editable planning suggestions, not a claim that every event needs every service."""

# Canonical category values align with the original catalog when there is an overlap.
SERVICE_ROWS = [
    ("Флорист", "Florist", ["Палитра и стиль", "Зоны оформления", "Время монтажа"], ["Palette and style", "Areas to decorate", "Setup time"]),
    ("Кейтеринг", "Catering", ["Количество гостей", "Меню и аллергии", "Подача и оборудование"], ["Guest count", "Menu and allergies", "Service and equipment"]),
    ("Лайв-бэнд", "Live band", ["Репертуар", "Время выступления", "Звук и технический райдер"], ["Set list", "Performance schedule", "Sound and technical rider"]),
    ("Ведущий", "Host", ["Сценарий", "Язык программы", "Тайминг"], ["Run of show", "Working language", "Schedule"]),
    ("Фотограф", "Photographer", ["Список кадров", "Часы съёмки", "Срок передачи фотографий"], ["Shot list", "Coverage hours", "Delivery date"]),
    ("Видеограф", "Videographer", ["Формат видео", "Часы съёмки", "Срок монтажа"], ["Video format", "Coverage hours", "Editing deadline"]),
    ("Банкетный зал", "Venue", ["Вместимость", "Схема рассадки", "Доступ для монтажа"], ["Capacity", "Seating plan", "Setup access"]),
    ("Декоратор", "Decorator", ["Концепция", "Материалы", "Монтаж и демонтаж"], ["Concept", "Materials", "Setup and removal"]),
    ("Техника и свет", "Sound and lighting", ["Оборудование", "Электропитание", "Саундчек"], ["Equipment", "Power supply", "Sound check"]),
]
SERVICES = [dict(category=category, label={"ru": category, "en": english}, checklist={"ru": ru, "en": en}) for category, english, ru, en in SERVICE_ROWS]
CATEGORIES = frozenset(item["category"] for item in SERVICES)
CITIES = ("Алматы", "Астана", "Зарубежье")
EVENT_TEMPLATES = [
    dict(id="wedding", label={"ru": "Свадьба / той", "en": "Wedding"}, services=["Банкетный зал", "Флорист", "Кейтеринг", "Лайв-бэнд", "Ведущий", "Фотограф"]),
    dict(id="corporate", label={"ru": "Корпоратив", "en": "Corporate event"}, services=["Банкетный зал", "Кейтеринг", "Ведущий", "Техника и свет"]),
    dict(id="birthday", label={"ru": "День рождения", "en": "Birthday"}, services=["Кейтеринг", "Декоратор", "Фотограф"]),
    dict(id="conference", label={"ru": "Конференция", "en": "Conference"}, services=["Банкетный зал", "Кейтеринг", "Техника и свет", "Видеограф"]),
    dict(id="custom", label={"ru": "Свой план", "en": "Custom plan"}, services=[]),
]
