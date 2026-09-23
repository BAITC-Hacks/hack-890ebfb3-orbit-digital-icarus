import evidenceEnglish from "./evidence.en.json";
import { MAX_DURATION_HOURS } from "../formNumbers";
import type { EvidenceItem, MatchCard, MatchRequest, MatchResponse, MetadataResponse } from "../api/types";

export type Locale = "ru" | "en";
export const LOCALE_STORAGE_KEY = "contractor-match-locale";

export const copy = {
  ru: {
    interfaceLanguage: "Интерфейс", eyebrow: "КАТАЛОГ ПОДРЯДЧИКОВ · КАЗАХСТАН",
    title: "Tandau", titleSecond: "подбор подрядчиков",
    lede: "Укажите параметры мероприятия — сервис покажет до трёх доступных подрядчиков и объяснит, почему подходит каждый.",
    city: "Город", event_format: "Формат мероприятия", category: "Категория подрядчика",
    event_date: "Дата мероприятия", budget_kzt: "Бюджет, ₸", duration_hours: "Длительность, ч",
    language: "Язык работы подрядчика", optional: "необязательно", durationPlaceholder: "например, 6",
    noLanguage: "Любой язык", languageHint: "Это язык работы подрядчика. Язык интерфейса меняется отдельно.",
    submit: "Подобрать подрядчика", loading: "Ищем варианты…", metadataLoading: "Загружаем каталог…",
    footer: "Один и тот же запрос на другую дату может дать другой результат: учитывается занятость подрядчиков.",
    preview: "Предпросмотр на примерах: результаты демонстрационные, без обращения к реальному каталогу.",
    metadataError: "Не удалось загрузить параметры каталога. Проверьте подключение и повторите попытку.",
    requestError: "Не удалось выполнить подбор. Проверьте подключение и попробуйте ещё раз.",
    serviceError: "Сервис подбора временно недоступен. Попробуйте ещё раз.",
    responseError: "Сервис вернул некорректный ответ. Попробуйте ещё раз.",
    validationError: "Проверьте отмеченные параметры запроса.", retry: "Повторить",
    newRequest: "← Новый запрос", foundTab: "Подобрали", emptyTab: "Ничего не подходит", absentTab: "Категории нет в городе",
    absentTitle: "В этом городе такой категории нет", emptyTitle: "Никто не подходит под выбранные условия",
    emptyAdvice: "Измените дату, бюджет, формат или дополнительные условия и выполните новый поиск.",
    priceFrom: "от", priceCaveat: "Стартовая цена; окончательную стоимость нужно подтвердить.",
    synthetic: "Синтетический профиль из предоставленного каталога", priceImputed: "Стартовая цена восстановлена из данных",
    cityImputed: "Город восстановлен из данных", evidence: "На чём основано объяснение", originalQuote: "Цитата из исходного описания",
    noEvidence: "В этом примере подтверждающие фрагменты не представлены.", notApplicable: "Длительность присутствия не применяется",
    firstFailure: "Для каждого исключённого профиля учитывается первая неподходящая причина.",
    excluded: "Исключены", booked: "заняты на выбранную дату", over_budget: "выше бюджета",
    unsupported_format: "не поддерживают формат", unsupported_language: "не работают на выбранном языке",
    duration_exceeded: "не подходят по длительности", availability: "Календарь", budget: "Стартовая цена",
    format: "Формат", duration: "Длительность", description: "Описание",
  },
  en: {
    interfaceLanguage: "Interface", eyebrow: "CONTRACTOR CATALOG · KAZAKHSTAN",
    title: "Tandau", titleSecond: "contractor matching",
    lede: "Tell us about your event to see up to three available contractors, with clear reasons for each match.",
    city: "City", event_format: "Event format", category: "Contractor category",
    event_date: "Event date", budget_kzt: "Budget, ₸", duration_hours: "Duration, hours",
    language: "Contractor's working language", optional: "optional", durationPlaceholder: "for example, 6",
    noLanguage: "Any language", languageHint: "This filters the contractor's working language. The interface language is a separate setting.",
    submit: "Find contractors", loading: "Finding matches…", metadataLoading: "Loading the catalog…",
    footer: "Changing only the date can change the shortlist: the service checks each contractor's calendar.",
    preview: "Example preview: these are demonstration results, without live catalog matching.",
    metadataError: "Could not load the catalog options. Check your connection and try again.",
    requestError: "Could not find matches. Check your connection and try again.",
    serviceError: "The matching service is temporarily unavailable. Please try again.",
    responseError: "The service returned an invalid response. Please try again.",
    validationError: "Check the highlighted request fields.", retry: "Retry",
    newRequest: "← New search", foundTab: "Matches", emptyTab: "No eligible matches", absentTab: "Category absent in this city",
    absentTitle: "This category is absent in this city", emptyTitle: "No one meets the selected conditions",
    emptyAdvice: "Change the date, budget, format or optional conditions, then search again.",
    priceFrom: "from", priceCaveat: "Starting price; confirm the final quote with the contractor.",
    synthetic: "Organizer-supplied synthetic profile", priceImputed: "Starting price was imputed in the supplied data",
    cityImputed: "City was imputed in the supplied data", evidence: "What supports this explanation", originalQuote: "Original Russian profile quote",
    noEvidence: "This preview does not include supporting excerpts.", notApplicable: "Attendance duration does not apply",
    firstFailure: "Each excluded profile is counted under its first failing condition.",
    excluded: "Excluded", booked: "booked on this date", over_budget: "over budget",
    unsupported_format: "unsupported event format", unsupported_language: "unsupported working language",
    duration_exceeded: "duration limit exceeded", availability: "Calendar", budget: "Starting price",
    format: "Event format", duration: "Duration", description: "Description",
  },
} as const;

const englishLabels: Record<string, string> = {
  "Алматы": "Almaty", "Астана": "Astana", "Зарубежье": "Abroad",
  "Банкетный зал": "Banquet hall", "Ведущий": "Event host", "Ведущий церемонии": "Ceremony host",
  "Видеограф": "Videographer", "Декоратор": "Event decorator", "Загородная площадка": "Countryside venue",
  "Инструменталист": "Instrumentalist", "Лайв-бэнд": "Live band", "Национальный ансамбль": "Traditional ensemble",
  "Отель": "Hotel", "Подарки и сувениры": "Gifts and souvenirs", "Ресторан": "Restaurant",
  "Танцевальный коллектив": "Dance group", "Флорист": "Florist", "Фото и видеобудки": "Photo and video booths",
  "Фотограф": "Photographer", "Шоу-программа": "Show performance",
  "свадьба": "Wedding", "корпоратив": "Corporate event", "юбилей": "Anniversary celebration",
  "той": "Toi (traditional celebration)", "конференция": "Conference", "день рождения": "Birthday",
  "русский": "Russian", "казахский": "Kazakh", "английский": "English",
};

export function optionLabel(canonical: string, locale: Locale): string {
  return locale === "en" ? englishLabels[canonical] ?? canonical : canonical;
}

export function initialLocale(storage?: Pick<Storage, "getItem">): Locale {
  try {
    const stored = storage?.getItem(LOCALE_STORAGE_KEY);
    return stored === "en" ? "en" : "ru";
  } catch { return "ru"; }
}

export const formatMoney = (value: number, locale: Locale) => new Intl.NumberFormat(locale === "en" ? "en-GB" : "ru-RU").format(value);
export const displayDate = (iso: string) => iso.split("-").reverse().join(".");

export function availabilityLabel(date: string, locale: Locale): string {
  return locale === "ru" ? `Свободен по календарю на ${displayDate(date)}` : `Free in the supplied calendar on ${displayDate(date)}`;
}

export function calendarLabel(metadata: MetadataResponse, locale: Locale): string {
  const range = `${displayDate(metadata.calendar_start)}–${displayDate(metadata.calendar_end)}`;
  return locale === "ru" ? `Календарь предоставлен на ${range}; доступность нужно подтвердить.`
    : `Calendar snapshot: ${range}; confirm availability before booking.`;
}

export function exclusionSummary(result: MatchResponse, locale: Locale): string {
  const labels = copy[locale];
  const reasons = (Object.entries(result.exclusions) as [keyof MatchResponse["exclusions"], number][])
    .filter(([, count]) => count > 0).map(([reason, count]) => `${labels[reason]} — ${count}`);
  return reasons.length ? `${labels.excluded}: ${reasons.join("; ")}.` : "";
}

export function resultSummary(result: MatchResponse, locale: Locale): string {
  if (locale === "ru") return result.message;
  const { city_category_total: pool, eligible_total: eligible, returned_total: returned } = result.counts;
  if (result.status === "category_absent") {
    return `The supplied catalog has no profiles in the category “${optionLabel(result.request.category, locale)}” for ${optionLabel(result.request.city, locale)}.`;
  }
  if (result.status === "no_eligible_contractors") return `None of the ${pool} profiles in this city's category meets all selected conditions.`;
  return `${eligible} of ${pool} profiles in this city's category meet all selected conditions; showing ${returned}.`;
}

export function resultTitle(result: MatchResponse, locale: Locale): string {
  if (result.status === "category_absent") return copy[locale].absentTitle;
  if (result.status === "no_eligible_contractors") return copy[locale].emptyTitle;
  const count = result.cards.length;
  return locale === "en" ? `Found ${count} ${count === 1 ? "match" : "matches"}`
    : count === 1 ? "Подходит 1 подрядчик" : `Подходят ${count} подрядчика`;
}

export function shortfallLabel(result: MatchResponse, locale: Locale): string {
  const { city_category_total: total, eligible_total: eligible } = result.counts;
  return locale === "en" ? `The city/category pool contains ${total} profiles; ${eligible} meet every selected condition. We show every eligible profile when there are fewer than three.`
    : `В городе и категории ${total} профилей; ${eligible} проходят все выбранные условия. Если подходящих меньше трёх, показываем всех.`;
}

export function translatedQuote(quote: string): string | undefined {
  return (evidenceEnglish as Record<string, string>)[quote];
}

export function cardExplanation(card: MatchCard, request: MatchRequest, locale: Locale): string {
  if (locale === "ru") return card.explanation;
  const parts = [
    `Free in the supplied calendar on ${displayDate(card.event_date)}`,
    `supports “${optionLabel(request.event_format, locale)}”`,
    `starting price ${formatMoney(card.price_from_kzt, locale)} ₸ within a budget of ${formatMoney(request.budget_kzt, locale)} ₸`,
  ];
  if (request.language) parts.push(`working language: ${optionLabel(request.language, locale)}`);
  const hours = card.evidence.find(item => item.code === "duration")?.value;
  if (request.duration_hours != null && (typeof hours === "number" || hours === null)) {
    parts.push(hours === null ? "attendance duration does not apply to this service"
      : `up to ${hours} hours on site for your ${request.duration_hours}-hour request`);
  }
  const description = card.evidence.find(item => item.code === "description" && item.source_quote)?.source_quote;
  if (description) {
    const translated = translatedQuote(description);
    const detail = translated ? `The profile states: “${translated.replace(/[.!?]+$/, "")}”.`
      : `Profile excerpt (original Russian): “${description.replace(/[.!?]+$/, "")}”.`;
    return `${parts.join("; ")}. ${detail}`;
  }
  const languages = card.evidence.find(item => item.code === "language")?.value;
  const fallback: string[] = [];
  if (typeof languages === "string" || Array.isArray(languages)) {
    fallback.push(`catalog languages: ${(Array.isArray(languages) ? languages : [languages]).map(value => optionLabel(value, locale)).join(", ")}`);
  }
  if (typeof hours === "number") fallback.push(`up to ${hours} hours on site`);
  else if (hours === null) fallback.push("attendance hours do not apply to this service");
  if (!fallback.length) fallback.push(`category: ${optionLabel(card.category, locale)}; city: ${optionLabel(card.city, locale)}`);
  return `${parts.join("; ")}. Catalog details: ${fallback.join("; ")}.`;
}

export function evidenceValue(item: EvidenceItem, locale: Locale): string {
  if (item.code === "availability" && typeof item.value === "string") return displayDate(item.value);
  if (item.code === "budget" && typeof item.value === "number") return `${formatMoney(item.value, locale)} ₸`;
  if (item.value === null) return copy[locale].notApplicable;
  if (Array.isArray(item.value)) return item.value.map(value => optionLabel(value, locale)).join(", ");
  if (typeof item.value === "number") return item.code === "duration" ? `${item.value} ${locale === "en" ? "hours" : "ч"}` : String(item.value);
  return optionLabel(item.value, locale);
}

export function fieldValidationMessage(field: string, metadata: MetadataResponse | null, locale: Locale): string {
  if (field === "budget_kzt") return locale === "en" ? "Enter a positive whole-number budget in KZT." : "Введите положительный целый бюджет в тенге.";
  if (field === "duration_hours") return locale === "en" ? `Enter a duration greater than 0 and no more than ${MAX_DURATION_HOURS} hours, or leave this field empty.` : `Введите длительность больше 0 и не более ${MAX_DURATION_HOURS} часов или оставьте поле пустым.`;
  if (field === "event_date" && metadata) {
    const range = `${displayDate(metadata.calendar_start)}–${displayDate(metadata.calendar_end)}`;
    return locale === "en" ? `Choose a valid date within ${range}.` : `Выберите корректную дату в пределах ${range}.`;
  }
  return locale === "en" ? "Choose one of the available catalog options." : "Выберите один из доступных вариантов каталога.";
}

export function invalidFields(request: MatchRequest, metadata: MetadataResponse): string[] {
  const fields: string[] = [];
  if (!metadata.cities.includes(request.city)) fields.push("city");
  if (!metadata.categories.includes(request.category)) fields.push("category");
  if (!metadata.event_formats.includes(request.event_format)) fields.push("event_format");
  if (request.language && !metadata.languages.includes(request.language)) fields.push("language");
  if (!Number.isSafeInteger(request.budget_kzt) || request.budget_kzt <= 0) fields.push("budget_kzt");
  if (request.duration_hours != null && (!Number.isFinite(request.duration_hours) || request.duration_hours <= 0 || request.duration_hours > MAX_DURATION_HOURS)) fields.push("duration_hours");
  const parsed = new Date(`${request.event_date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(request.event_date) || !Number.isFinite(parsed.valueOf())
    || parsed.toISOString().slice(0, 10) !== request.event_date
    || request.event_date < metadata.calendar_start || request.event_date > metadata.calendar_end) fields.push("event_date");
  return fields;
}
