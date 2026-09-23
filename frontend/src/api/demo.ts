import type { MatchCard, MatchRequest, MatchResponse, MetadataResponse } from "./types";

export const metadata: MetadataResponse = {
  cities: ["Алматы", "Астана", "Зарубежье"],
  categories: [
    "Ведущий", "Фотограф", "Банкетный зал", "Ресторан", "Шоу-программа", "Лайв-бэнд",
    "Национальный ансамбль", "Танцевальный коллектив", "Видеограф", "Загородная площадка",
    "Фото и видеобудки", "Отель", "Подарки и сувениры", "Декоратор", "Ведущий церемонии",
    "Флорист", "Инструменталист",
  ],
  event_formats: ["свадьба", "корпоратив", "юбилей", "той", "конференция", "день рождения"],
  languages: ["русский", "казахский", "английский"],
  date_min: "2026-09-23",
  date_max: "2026-12-31",
};

const card = (id: string, anon_name: string, price: number, explanation: string, request: MatchRequest, flags: Partial<MatchCard> = {}): MatchCard => ({
  id,
  anon_name,
  category: request.category,
  categories: [request.category],
  city: request.city,
  price_from_kzt: price,
  event_date: request.event_date,
  availability: "free_in_dataset",
  synthetic: false,
  source_kind: "provided",
  city_imputed: false,
  price_imputed: false,
  explanation,
  evidence: [],
  ...flags,
});

function response(request: MatchRequest, status: MatchResponse["status"], cards: MatchCard[], message: string, pool: number, exclusions: MatchResponse["exclusions"]): MatchResponse {
  return {
    schema_version: "1", status, request, dataset_version: "preview-fixtures", algorithm_version: "preview-v1", message,
    counts: { city_category_total: pool, eligible_total: cards.length, returned_total: cards.length }, exclusions, cards,
  };
}

/** Development-only fixtures. The production client never ranks or filters in the browser. */
export function previewMatch(request: MatchRequest): Promise<MatchResponse> {
  const none = { booked: 0, over_budget: 0, unsupported_format: 0, unsupported_language: 0, duration_exceeded: 0 };
  if (request.city === "Астана" && request.category === "Декоратор") {
    return Promise.resolve(response(request, "category_absent", [], "В выбранном городе такой категории нет в каталоге.", 0, none));
  }
  if (request.city === "Астана" && request.category === "Флорист") {
    return Promise.resolve(response(request, "no_eligible_contractors", [], "В этой категории есть профиль, но на выбранную дату он занят.", 1, { ...none, booked: 1 }));
  }
  if (request.category === "Флорист") {
    const only = card("HK-39372", "Тони Тони Чоппер", 200000, "На выбранную дату свободен по календарю; формат свадьбы и стартовая цена укладываются в бюджет. В профиле указано авторское цветочное оформление мероприятий в Алматы.", request, { price_imputed: true });
    return Promise.resolve(response(request, "matches_found", [only], "Подходит 1 из 2 профилей: второй подрядчик занят на эту дату.", 2, { ...none, booked: 1 }));
  }
  const hosts = [
    card("HK-42352", "Эмилия", 900000, "На выбранную дату свободна по календарю и принимает свадьбы. В профиле указан 13-летний опыт ведения свадеб.", request),
    card("HK-77838", "Хаул", 1000000, "Свободен по календарю на выбранную дату; стартовая цена не превышает бюджет. В профиле отмечены театральный опыт и этно-рок-проект.", request),
    card("HK-72938", "Софи Хаттер", 2000000, "Принимает этот формат и доступна на выбранную дату. В описании указаны казахский и русский языки ведения, а также авторские игры и конкурсы.", request),
  ];
  return Promise.resolve(response(request, "matches_found", hosts, "Нашли 3 подходящих подрядчика из 10 профилей категории.", 10, { ...none, booked: 5, over_budget: 2 }));
}
