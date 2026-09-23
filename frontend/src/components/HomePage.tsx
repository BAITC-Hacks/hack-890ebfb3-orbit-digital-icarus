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
      {/* A CSS illustration describes the rules without fabricating a contractor or live result. */}
      <aside className="principle-card">
        <div className="orbit-mark" aria-hidden="true"><span>O</span><i /></div>
        <small>{t.visualLabel}</small><h2>{t.visualTitle}</h2>
        <ul>{t.visualChecks.map(item => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul>
        <p>{t.visualFoot}</p>
      </aside>
    </section>
    <p className="snapshot-strip">{t.note}</p>
    {/* Native heading/section semantics keep the long page navigable by keyboard and screen readers. */}
    <section className="home-section" id="how-it-works" aria-labelledby="how-title">
      <p className="eyebrow">01 / ORBIT</p><h2 id="how-title">{t.howTitle}</h2><p className="section-intro">{t.howIntro}</p>
      <div className="steps-grid">{t.steps.map(([title, body], index) => <article key={title}><span className="step-number">0{index + 1}</span><h3>{title}</h3><p>{body}</p></article>)}</div>
    </section>
    {/* All category labels come from the real metadata, never a second client-side catalog. */}
    <section className="home-section" aria-labelledby="categories-title">
      <p className="eyebrow">02 / ORBIT</p><h2 id="categories-title">{t.categories}</h2><p className="section-intro">{t.categoriesIntro}</p>
      {metadata ? <div className="category-grid">{metadata.categories.map(category => <button type="button" key={category} onClick={() => onCategory(category)}><strong>{optionLabel(category, locale)}</strong><span>{t.categoryHint}</span></button>)}</div> : <p>{t.categoriesOffline}</p>}
    </section>
    <section className="trust-panel"><span aria-hidden="true">◎</span><div><h2>{t.trustTitle}</h2><p>{t.trustBody}</p></div></section>
    <section className="home-section faq" aria-labelledby="faq-title"><h2 id="faq-title">{t.faqTitle}</h2>{t.faq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</section>
    <section className="home-bottom"><div><h2>{t.bottomTitle}</h2><p>{t.bottomText}</p></div><a className="primary-link" href="#/match">{t.start} ↗</a></section>
  </div>;
}
