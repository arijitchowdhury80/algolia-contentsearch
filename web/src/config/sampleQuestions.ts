/**
 * sampleQuestions — the locked test set (docs/experiment/test-questions-locked.md),
 * grouped by category for the collapsible Sample Questions panel. `label` is the
 * short clickable text shown in a card; `prompt` is the full question that fills
 * the query bar. Multi-turn (Cat 8) carries `followUp` for reference (the bar
 * fills turn-1; the user asks the follow-up as a second turn).
 *
 * Keep in sync with the locked set. This is display config, not the eval source
 * of truth — the harness reads the markdown.
 */
export interface SampleQuestion {
  id: string;
  label: string;
  prompt: string;
  followUp?: string;
}

export interface SampleCategory {
  key: string;
  label: string;
  descriptor: string;
  /** CSS custom-property name for the category accent (from tokens). */
  accent: string;
  questions: SampleQuestion[];
}

export const SAMPLE_CATEGORIES: SampleCategory[] = [
  {
    key: 'factual',
    label: 'Factual lookup',
    descriptor: 'Direct factual answers',
    accent: '--algolia-blue',
    questions: [
      { id: '1.2', label: 'Ranking criteria & tie-breaking', prompt: "What are Algolia's ranking criteria and how does tie-breaking work?" },
      { id: '1.3', label: 'The distinct setting', prompt: 'How does the `distinct` setting deduplicate results?' },
      { id: '1.5', label: 'Personalization re-ranking', prompt: 'How does personalization re-ranking affect result order?' },
    ],
  },
  {
    key: 'howto',
    label: 'How-to / implementation',
    descriptor: 'Implementation steps',
    accent: '--color-success',
    questions: [
      { id: '2.1', label: 'Configure searchable attributes', prompt: 'How do I configure searchable attributes the right way?' },
      { id: '2.2', label: 'Backend search with React InstantSearch', prompt: 'How do I implement backend search with React InstantSearch?' },
      { id: '2.4', label: 'Send events to Algolia Insights', prompt: 'How do I send click and conversion events to Algolia Insights?' },
    ],
  },
  {
    key: 'conceptual',
    label: 'Conceptual explainer',
    descriptor: 'What X is & how it works',
    accent: '--algolia-blue',
    questions: [
      { id: '3.1', label: 'What is NeuralSearch?', prompt: 'What is NeuralSearch and how does it rank results?' },
      { id: '3.2', label: 'What is vector search?', prompt: 'What is vector search?' },
      { id: '3.3', label: 'What is Dynamic Re-Ranking?', prompt: 'What is Dynamic Re-Ranking and how does it work?' },
    ],
  },
  {
    key: 'broad',
    label: 'Broad / exploratory',
    descriptor: 'Open-ended, vertical',
    accent: '--color-success',
    questions: [
      { id: '4.1', label: 'Ecommerce & retail search', prompt: 'How does Algolia support ecommerce and retail search?' },
      { id: '4a', label: 'High-fashion luxury retail', prompt: 'How does Algolia handle high-fashion luxury retail?' },
      { id: '4b', label: 'Fashion ecommerce search', prompt: 'How does Algolia support fashion ecommerce search?' },
    ],
  },
  {
    key: 'troubleshooting',
    label: 'Troubleshooting',
    descriptor: 'Diagnose & fix',
    accent: '--color-warning',
    questions: [
      { id: '5.1', label: 'Exceeded record usage', prompt: 'I suddenly exceeded my record usage — what do I do?' },
      { id: '5.2', label: 'Records missing from results', prompt: 'Why are some of my records not showing up in search results?' },
      { id: '5.4', label: 'Indexing rate limits', prompt: 'Is there a rate limit for indexing, and what triggers rate limiting?' },
    ],
  },
  {
    key: 'comparison',
    label: 'Comparison',
    descriptor: 'X vs Y',
    accent: '--algolia-blue',
    questions: [
      { id: '6.1', label: 'Query Suggestions vs Recommend', prompt: "What's the difference between Query Suggestions and Algolia Recommend?" },
      { id: '6.3', label: 'filters vs facetFilters vs optionalFilters', prompt: 'When should I use `filters` vs `facetFilters` vs `optionalFilters`?' },
      { id: '6.4', label: 'Custom ranking vs Dynamic Re-Ranking', prompt: "What's the difference between custom ranking and Dynamic Re-Ranking?" },
    ],
  },
  {
    key: 'grounding',
    label: 'Grounding stress-tests',
    descriptor: 'Should refuse + route',
    accent: '--color-danger',
    questions: [
      { id: '7.1', label: 'Capital of France (off-topic)', prompt: 'What is the capital of France?' },
      { id: '7.2', label: 'Elasticsearch percolator (competitor)', prompt: 'How do I use Elasticsearch percolator queries?' },
      { id: '7.4', label: 'Kubernetes autoscaling (adjacent)', prompt: 'How do I configure Kubernetes pod autoscaling?' },
    ],
  },
  {
    key: 'multiturn',
    label: 'Multi-turn (two-way)',
    descriptor: 'Follow-up conversation',
    accent: '--color-success',
    questions: [
      { id: '8.1', label: 'Typo tolerance →', prompt: 'How does Algolia handle typo tolerance?', followUp: 'Can I turn it off for a specific attribute or words?' },
      { id: '8.2', label: 'Algolia Recommend →', prompt: 'What is Algolia Recommend?', followUp: 'What is the "Frequently Bought Together" model exactly?' },
      { id: '8.5', label: 'How synonyms work →', prompt: 'How do synonyms work in Algolia?', followUp: 'What about one-way synonyms specifically?' },
      { id: '8.3', label: 'Set up search (ambiguous) →', prompt: 'How do I set up search?', followUp: 'For a React storefront — the customer-facing frontend UI.' },
      { id: '8.4', label: 'Improve relevance (ambiguous) →', prompt: "My search results aren't good — how do I improve relevance?", followUp: 'Exact product-name matches are ranking below loosely-related items.' },
      { id: '8.6', label: 'Handle my catalog? (ambiguous) →', prompt: 'Can Algolia handle my catalog?', followUp: 'About 5 million product records, updated roughly hourly.' },
    ],
  },
];

/** Total number of sample questions across all categories. */
export const SAMPLE_QUESTION_COUNT = SAMPLE_CATEGORIES.reduce(
  (n, c) => n + c.questions.length,
  0,
);
