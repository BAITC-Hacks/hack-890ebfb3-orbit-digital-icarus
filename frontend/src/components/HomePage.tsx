import type { MetadataResponse } from "../api/types";
import { optionLabel, type Locale } from "../i18n";
import { journeyCopy } from "../journeyCopy";

// Home is presentation-only: choosing a category never executes a search.
export function HomePage({ locale, metadata, onCategory }: {
  locale: Locale; metadata: MetadataResponse | null; onCategory: (category: string) => void;
}) {
  const t = journeyCopy[locale]; // Shared copy follows the interface language, not the contractor filter.
  return <div className="home-page" data-testid="home-page">
    {/* The first screen explains the customer benefit before requesting event data. */}
    <section className="home-hero">
      <div>
        <p className="eyebrow">{t.eyebrow}</p>
        <h1>{t.title}<br /><em>{t.accent}</em></h1>
        <p className="lede">{t.intro}</p>
        <div className="home-actions"><a className="primary-link" href="#/match">{t.start} <span aria-hidden="true">↗</span></a><a className="text-link" href="#/how">{t.learn} ↓</a></div>
        <p className="home-small">{t.small}</p>
      </div>
      {/* A vector mark describes choosing a match without fabricating a contractor or live result. */}
      <aside className="principle-card">
        <div className="tandau-mark" aria-hidden="true"><svg viewBox="0 0 160 120" focusable="false"><circle className="mark-ring" cx="80" cy="60" r="46" /><path d="M60 40h40M80 40v43" /><circle cx="113" cy="27" r="9" /></svg></div>
        <small>{t.visualLabel}</small><h2>{t.visualTitle}</h2>
        <ul>{t.visualChecks.map(item => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul>
        <p>{t.visualFoot}</p>
      </aside>
    </section>
    <p className="snapshot-strip">{t.note}</p>
    {/* Separate the supplied catalog from user postings and disclose account-only planning. */}
    <section className="home-paths" aria-labelledby="paths-title">
      <h2 id="paths-title">{t.pathsTitle}</h2>
      <div className="path-grid">
        <article className="path-card"><p className="eyebrow">{t.publicAccess}</p><h3>{t.matchingTitle}</h3><p>{t.matchingBody}</p><a className="text-link" href="#/match">{t.start}<span aria-hidden="true"> →</span></a></article>
        <article className="path-card"><p className="eyebrow">{t.communityAccess}</p><h3>{t.communityTitle}</h3><p>{t.communityBody}</p><div className="path-actions"><a className="text-link" href="#/providers">{t.browseProviders}<span aria-hidden="true"> →</span></a><a className="text-link" href="#/events">{t.browseEvents}<span aria-hidden="true"> →</span></a></div></article>
      </div>
    </section>
    {/* Native heading/section semantics keep the long page navigable by keyboard and screen readers. */}
    <section className="home-section" id="how-it-works" aria-labelledby="how-title">
      <p className="eyebrow">01 / TANDAU</p><h2 id="how-title">{t.howTitle}</h2><p className="section-intro">{t.howIntro}</p>
      <div className="steps-grid">{t.steps.map(([title, body], index) => <article key={title}><span className="step-number">0{index + 1}</span><h3>{title}</h3><p>{body}</p></article>)}</div>
    </section>
    {/* All category labels come from the real metadata, never a second client-side catalog. */}
    <section className="home-section" aria-labelledby="categories-title">
      <p className="eyebrow">02 / TANDAU</p><h2 id="categories-title">{t.categories}</h2><p className="section-intro">{t.categoriesIntro}</p>
      {metadata ? <div className="category-grid">{metadata.categories.map(category => <button type="button" key={category} onClick={() => onCategory(category)}><strong>{optionLabel(category, locale)}</strong><span>{t.categoryHint}</span></button>)}</div> : <p>{t.categoriesOffline}</p>}
    </section>
    <section className="trust-panel"><svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M24 5 40 12v11c0 10-9 16-16 20C17 39 8 33 8 23V12Z" /><path d="m16 24 6 6 11-13" /></svg><div><h2>{t.trustTitle}</h2><p>{t.trustBody}</p></div></section>
    <section className="home-section faq" aria-labelledby="faq-title"><h2 id="faq-title">{t.faqTitle}</h2>{t.faq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</section>
    <section className="home-bottom"><div><h2>{t.bottomTitle}</h2><p>{t.bottomText}</p></div><a className="primary-link" href="#/match">{t.start} ↗</a></section>
  </div>;
}
