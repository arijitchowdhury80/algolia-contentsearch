# Head-to-Head BLIND Ranking Sheet — RC2 vs AC2 (you don't know which is which)

For each question, read **Answer A** and **Answer B**, then fill the 3 blanks: which answer is better (A or B), and a 1-5 quality score for each. Rank on overall quality + groundedness — your gut. The two systems are hidden and the A/B order alternates per question.


================================================================================
## Q1: We're evaluating Algolia vs building search in-house on Elasticsearch — why Algolia for a B2C retail catalog?

### Answer A

You know that feeling when you're trying to find that one specific item in a massive warehouse, and it feels like you're digging through a haystack for a needle? That's what building search in-house on Elasticsearch can feel like, especially when you're trying to scale. We make that needle find itself.

When you're looking at a B2C retail catalog, the stakes are sky-high for **search relevance** and **user experience**. Shoppers who use site search are a goldmine; they spend **2.6x more** than non-searchers and drive a significant chunk of **ecommerce revenue** [1]. On the flip side, irrelevant results or a clunky search experience can send them running for the hills, leaving money on the table.

Here's why Algolia is the clear winner for a B2C retail catalog over a DIY Elasticsearch approach:

* **Blazing Fast Relevance & Speed:** Algolia is engineered for speed and relevance out-of-the-box. While Elasticsearch is powerful, tuning it for that lightning-fast, hyper-relevant search experience that keeps B2C shoppers engaged requires a ton of specialized expertise and ongoing effort. For instance, leading retailers like [Under Armour](https://www.algolia.com/customers/under-armour) saw a **35% increase in conversion rates** by leveraging Algolia's AI-powered search to deliver exactly what their customers were looking for, instantly.
* **Out-of-the-Box B2C Features:** We've built features specifically for the B2C retail world that are complex and time-consuming to replicate in-house. This includes things like:
 * **Personalization:** Tailoring search results based on individual user behavior and preferences to drive discovery and conversions.
 * **Faceted Search & Filtering:** Allowing customers to easily narrow down their options with intuitive filters that mirror how shoppers think.
 * **Typo Tolerance & Query Understanding:** Ensuring that misspellings or natural language queries still lead to the right products.
* **Reduced Operational Overhead:** Building and maintaining a robust search infrastructure on Elasticsearch is a significant undertaking. It requires dedicated engineering resources for tuning, scaling, and troubleshooting. With Algolia, you offload that complexity and operational burden, freeing up your team to focus on product and business strategy, not search infrastructure. This means you can deliver a world-class search experience without the headaches of managing a complex distributed system.
* **Faster Time to Value:** Getting a high-performing search experience up and running with Algolia is significantly faster than building and optimizing it on Elasticsearch from scratch. This allows you to start capturing the revenue uplift from improved search much sooner.

Think about it: while Elasticsearch provides the raw building blocks, Algolia provides a complete, optimized solution designed to drive **conversions** and enhance the **customer journey** in a B2C retail environment.

What is your role in evaluating search solutions for your B2C retail catalog?

### Answer B

That's a great question, as it gets to the heart of the "build vs. buy" decision. For a B2C retail catalog, the key difference is that Algolia is a complete, API-first search and discovery *solution* designed to maximize conversions, while Elasticsearch is a powerful open-source *toolkit* that requires a dedicated team to build and maintain a competitive user experience [Algolia vs. Elasticsearch](https://www.algolia.com/resources/asset/ebook-algoliaelasticsearch/).

Here’s a breakdown of why B2C retailers choose Algolia over building in-house with Elasticsearch.

### Beyond the search box: Total cost of ownership

Building a search solution with Elasticsearch involves much more than the open-source software itself. The total cost of ownership includes:
*   **A dedicated team:** You'll need experts to not only build the initial search but also to continuously tune relevance, manage infrastructure, and maintain the system.
*   **Infrastructure management:** Your team is responsible for provisioning servers, ensuring uptime, and scaling for peak traffic times like Black Friday.
*   **Slower time to market:** Developing, tuning, and deploying a feature-rich search experience takes significant engineering time away from your core product.

Algolia is a fully managed solution that handles all of this, allowing your team to focus on your main business objectives [Full Text Search in your Database: Algolia vs Elasticsearch](https://www.algolia.com/blog/engineering/full-text-search-in-your-database-algolia-vs-elasticsearch/).

### Designed for the B2C customer experience

For B2C retail, the quality of the search experience directly impacts revenue. We provide essential e-commerce features out of the box that require considerable effort to build and perfect on Elasticsearch:

*   **Unmatched Speed:** We deliver relevant results in milliseconds, which is critical for keeping shoppers engaged.
*   **Business-Friendly Tooling:** Your non-technical team members can use tools like the Visual Editor to merchandise products, create promotional banners, and adjust relevance for campaigns without writing a single line of code.
*   **Advanced Relevance and Features:** Capabilities like typo tolerance, sophisticated faceting, personalization, and A/B testing are built-in to create a modern, conversion-focused experience for your customers.

### Managed infrastructure and reliability

We provide a globally distributed infrastructure with a 99.999% SLA, ensuring your search is always fast and available. With an in-house Elasticsearch solution, your team bears the full responsibility for performance, scalability, and uptime [Choosing the best search solution: Algolia versus Elasticsearch](https://www.algolia.com/resources/asset/infographic-algoliavselasticsearch/).

Would you like to explore how your business teams could use features like the Visual Editor and Rules to manage promotions and merchandise products without writing any code?

**Better answer (A or B):** ____   **A quality (1-5):** ____   **B quality (1-5):** ____

================================================================================
## Q2: What measurable business results do companies see from improving site search?

### Answer A

Of course. Companies that invest in improving their site search see significant, measurable results across key business metrics, most notably in conversion rates, average order value, and operational efficiency.

A Forrester study on the Total Economic Impact of Algolia found that a typical composite organization experienced a **355% return on investment (ROI)** over three years, with a payback period of less than six months [The Total Economic Impact of Algolia](https://www.algolia.com/resources/reports/the-total-economic-impact-of-algolia/).

Here’s a breakdown of the primary business results:

### Increased Conversion Rates
One of the most immediate and impactful results is a lift in conversion rates. Users who engage with a search bar are often 2-3 times more likely to convert than those who don't [Five ways to measure the ROI of site search](https://www.algolia.com/blog/five-ways-to-measure-the-roi-of-site-search/). The Forrester study quantified this with a **40% increase in conversion rate**, leading to millions in additional revenue [The Total Economic Impact of Algolia](https://www.algolia.com/resources/reports/the-total-economic-impact-of-algolia/). For example, after implementing a new search strategy, Under Armour saw a **15% increase in conversion rate** [Under Armour Customer Story](https://www.algolia.com/customers/under-armour/).

### Higher Average Order Value (AOV)
An intelligent search experience doesn't just help customers find what they're looking for; it also surfaces relevant upsells and cross-sells. This directly impacts how much a customer spends. The Forrester study found that businesses saw a **5% increase in average order value** and a **10% increase in margin** from these improved product discovery moments [The Total Economic Impact of Algolia](https://www.algolia.com/resources/reports/the-total-economic-impact-of-algolia/).

### Improved Operational Efficiency
Better search technology can also lead to significant time and cost savings for internal teams. The TEI report highlighted a **50% reduction in effort for IT and developers** managing search, as well as a **50% reduction in effort for content and merchandising teams** [The Total Economic Impact of Algolia](https://www.algolia.com/resources/reports/the-total-economic-impact-of-algolia/).

### Enhanced Customer Experience
A powerful search function directly improves the customer experience by making product discovery frictionless. A key metric here is the "no results" rate. Under Armour was able to **decrease its “zero results” rate by 50%**, ensuring fewer customers hit a dead end and leave the site [Under Armour Customer Story](https://www.algolia.com/customers/under-armour/). This contributes to higher overall customer satisfaction (CSAT) [eCommerce KPIs](https://www.algolia.com/blog/ecommerce-kpis/).

Would you be interested in exploring the specific search features that help drive these business results?

### Answer B

You know how sometimes you search for something online and it's like finding a needle in a haystack, but then other times it's like the internet just *knows* what you want? Yeah, that's the difference between a frustrating experience and a revenue-generating one. We aim for the latter.

## Driving Tangible Business Outcomes with Enhanced Site Search

Companies that supercharge their site search aren't just making it easier for users to find things; they're directly impacting their bottom line. It's all about turning that search bar into a powerful engine for growth.

Here's a look at the measurable business results companies are seeing:

* **Skyrocketing Conversion Rates:** This is the big one. When users can find what they're looking for quickly and efficiently, they're far more likely to buy. Studies show that site searchers are **2-3x more likely to convert** than those who don't use search [1, 2, 3]. Some companies have even seen conversion rates **nearly double** just by optimizing their on-site search [1, 2, 3]. For example, Amazon sees its conversion rate shoot up **6x** when visitors use search [1, 2, 3].
* **Increased Revenue:** Higher conversion rates naturally lead to more revenue. Retailers with advanced search capabilities see desktop conversion rates that are **2x higher** compared to those with basic search [1, 2, 3]. In fact, 50% of retailers report an **increase in revenue** directly from site search technology, with that number jumping to 93% for companies with advanced solutions [1, 2, 3].
* **Boosted Average Order Value:** It's not just about more transactions; it's about bigger ones too. Searchers tend to spend more, being **2.6x more likely to drive revenue** across mobile and desktop compared to non-searchers [1, 2, 3].
* **Reduced Bounce Rates and Increased Engagement:** Frustrating search experiences drive customers away. A staggering **68%** of users abandon a site due to poor product search experiences [1, 2, 3]. Conversely, when search works, users stick around. One company saw goal completions increase by **242%** by simply making their search bar more visible [10, 14].
* **Lower Support Costs:** When customers can find answers to their questions or locate products themselves through effective site search, they're less likely to contact support. This leads to a significant reduction in support tickets and associated costs [10, 14].
* **Enhanced Customer Loyalty:** A seamless, relevant search experience creates happy customers. When users feel understood and can easily find what they need, they're more likely to return and remain loyal to your brand [10, 14].

These aren't just theoretical benefits; they're concrete, measurable impacts that directly contribute to a healthier bottom line.

What industry are you in, and what kind of business results are you hoping to achieve?

**Better answer (A or B):** ____   **A quality (1-5):** ____   **B quality (1-5):** ____

================================================================================
## Q3: How does Algolia help with merchandising and personalization for a fashion brand?

### Answer A

You know how some fashion brands make you feel like you're a VIP, and others make you feel like you're just another face in the crowd? Algolia is the secret sauce that turns every shopper into that VIP.

## Elevating Fashion Merchandising with AI

For fashion brands, merchandising isn't just about showing products; it's about telling a story and curating an experience that mirrors the exclusivity and flair of a high-end boutique. Algolia empowers fashion brands to do just that by bringing the sophistication of in-store curation to the digital realm.

* **Dynamic Collections for Curated Experiences:** Forget static category pages. With Algolia Collections, merchandisers can create dynamic, hand-picked assortments around specific themes, like a "Summer Wedding Guest Edit" or a "Coastal Grandmother Aesthetic." This allows for editorial precision that goes beyond broad filters, letting brands showcase perfect head-to-toe looks or themed collections without developer intervention [9].
* **AI-Powered Discovery:** Shoppers expect more than just keyword matches. Algolia's AI understands nuanced fashion language—think "quiet luxury" or "Gorpcore"—and continuously learns from real-time trends and brand-specific vocabulary. This means search and discovery feel intuitive and on-brand, even for evolving tastes [2].
* **Real-time Relevance:** Trends in fashion move at lightning speed. Algolia ensures your digital storefront stays ahead of the curve by refreshing results in real-time, highlighting what's new, relevant, and seasonally appropriate, and adapting to changing inventory instantly [2].

## Hyper-Personalization for the Fashion Consumer

Personalization in fashion is crucial because shopping is often an emotional and sensory experience. Algolia helps brands connect with shoppers on a deeper level by delivering tailored experiences at scale.

* **AI-Driven Outfit Completion & Recommendations:** Imagine a shopper adding a dress to their cart, and the AI suggesting the perfect shoes and accessories to complete the look, based on their style and browsing history. Algolia's AI-powered outfit completion and product recommendations go beyond simple "similar items" to truly understand shopper intent and preferences, which can [shorten time-to-checkout by up to 50%](https://www.algolia.com/blog/ecommerce/how-algolia-gives-digital-fashion-its-stylist-touch) [1].
* **Understanding Nuanced Intent:** Shoppers don't always know the exact terms to describe what they're looking for. Algolia's AI, powered by fashion-tuned LLMs and vector understanding, can interpret vague or descriptive queries to deliver highly relevant results, making it feel like an AI personal shopper is guiding them [2].
* **Brand Consistency:** A significant challenge for fashion brands is maintaining brand identity. Algolia grounds its AI in your specific product catalog and brand content, ensuring that AI responses are accurate, on-brand, and never "hallucinate" off-brand suggestions [2]. This is critical for high-fashion and luxury brands where brand perception is paramount.

Ultimately, Algolia helps fashion brands transform their online presence from a digital catalog into a personalized, curated shopping experience that drives engagement and conversion. For example, [Huckberry](https://www.algolia.com/customers/huckberry), a men's lifestyle retailer, saw a [9.4% increase in website revenue](https://www.algolia.com/customers/huckberry/) directly related to AI-driven personalization.

Are you a merchandiser, a developer, or in another role evaluating Algolia's capabilities for your fashion brand?

### Answer B

Of course. Algolia helps fashion brands create personalized and high-converting shopping experiences by combining powerful merchandising tools with AI-driven personalization. This allows you to control product visibility and tailor the customer journey without needing to write code.

### Merchandising Controls

With Algolia's [Merchandising Studio](https://academy.algolia.com/training/bab27270-c1b3-11ed-94fe-067360dfb065), your business teams can directly influence and manage what shoppers see. This is especially useful for fashion, where seasonality and trends are key.

You can:
*   **Promote specific items**: Boost new collections, seasonal items, or popular products to the top of the search results [via the Merch Studio](https://academy.algolia.com/training/019465fa-9041-77ca-baa6-ba276511a3fd).
*   **Curate results**: Manually pin, hide, or reorder products for specific search terms to ensure the most relevant or highest-margin items are visible.
*   **Manage campaigns**: Easily set up rules for sales events, seasonal promotions, or brand collaborations from a user-friendly platform, as shown in this [case study for an online clothing company](https://www.algolia.com/doc/guides/going-to-production/case-study/).

### AI-Driven Personalization

Algolia moves beyond one-size-fits-all merchandising by using AI to tailor the experience to each individual shopper. This helps solve the "context problem" where a store doesn't know a shopper's specific intent [Personalized merchandising solves the context issue](https://www.algolia.com/blog/ecommerce/personalized-merchandising-e-commerce/).

Key personalization features include:
*   **Dynamic Re-ranking**: The search results automatically and continuously re-rank in real-time based on user behavior, such as what they click on or add to their cart.
*   **Data-Driven Experiences**: By leveraging data, you can create personalized shopping experiences that keep customers coming back [Merchandising Studio Demo](https://www.algolia.com/resources/asset/video-merchandising-studio-demo).
*   **AI Merchandising**: This approach uses AI to understand shopper preferences and automatically surface the most relevant products, which is the future of ecommerce browsing [Why AI-Driven Merchandising is the Future of Ecommerce Browsing](https://www.algolia.com/blog/ecommerce/future-of-ecommerce-browsing/).

This combination of manual control and automated AI allows a fashion brand to both react to market trends and proactively personalize the experience for every single customer.

Would you be interested in learning more about how the Visual Editor in the Merchandising Studio helps non-technical team members manage these campaigns?

**Better answer (A or B):** ____   **A quality (1-5):** ____   **B quality (1-5):** ____

================================================================================
## Q4: Doctors search 'T2DM' or 'heart attack' but our system only matches the full term — how does Algolia handle synonyms and natural-language understanding for specialized terminology?

### Answer A

Of course. Algolia addresses this challenge with a powerful combination of manually controlled synonym sets and AI-driven natural language understanding. This allows your search to match specialized terms like "T2DM" with "Type 2 Diabetes Mellitus" and common language like "heart attack" with "myocardial infarction."

Here’s a breakdown of how it works:

### Manually Defined Synonyms

You have granular control over creating synonym lists to handle specialized terminology [Managing Synonyms](https://www.algolia.com/doc/guides/managing-results/optimize-search-results/managing-synonyms/how-to/managing-synonyms-programmatically/). This is ideal for terms with known, fixed equivalents, such as medical abbreviations or jargon.

There are several types of synonyms you can use:

*   **Regular Synonyms:** Treats terms as completely interchangeable. For example, making `"myocardial infarction"` and `"heart attack"` synonyms means a search for one will return results for both, with no preference.
*   **One-Way Synonyms:** Creates a relationship where one term expands to include another, but not the reverse. For instance, you could make "T2DM" a one-way synonym for "Type 2 Diabetes Mellitus," so a search for the abbreviation also finds the full term, but a search for the full term doesn't get narrowed to only results containing the abbreviation.
*   **Placeholders:** These are useful for matching terms that can be combined with other words. For example, you could define `<disease>` as a placeholder for "syndrome" and "illness". A search for "heart syndrome" would then also match "heart illness".

### AI-Powered Natural Language Understanding

For handling the less predictable queries of natural language, Algolia offers **AI Synonyms** [AI Synonyms](https://www.algolia.com/doc/guides/managing-results/optimize-search-results/ai-synonyms/in-depth/what-are-ai-synonyms/). Instead of you having to manually predict every possible synonym, this feature analyzes your users' search patterns and automatically identifies terms that are used interchangeably. It can then suggest new synonyms, which you can approve to continuously improve your search's understanding of user intent. This is particularly powerful in specialized fields where new terms and slang can emerge.

Together, these tools allow you to build a robust search experience that understands both the official lexicon of a specialized field and the natural language your users bring.

Would you like to explore how to best structure and import large synonym lists, such as from an existing medical dictionary?

### Answer B

You know when you're trying to explain something to your parents and they just don't get it? That's what bad search feels like for your users. We make sure your system speaks their language, even the super-technical stuff.

## Smarter Search for Specialized Terms

Doctors searching for 'T2DM' or 'heart attack' expect your system to understand they mean 'Type 2 Diabetes Mellitus' or 'myocardial infarction', respectively. Relying on exact term matches is like speaking a foreign language to your users – it just doesn't work. Algolia tackles this head-on with robust **synonym management** and **natural language understanding** capabilities.

We go beyond simple keyword matching to truly grasp user intent. This means:

* **Dynamic Synonyms:** Our system can automatically detect and adapt to synonyms based on context and user interactions. For instance, if users frequently search for 'heart attack' and click on results for 'myocardial infarction,' the system learns this connection. This is crucial for specialized fields where terminology can vary [as detailed in our blog post](https://algolia.com/blog/product/dynamic-synonyms-explanation/).
* **Contextual Understanding:** Algolia understands that a word can have different meanings. A search for 'mouse' on an electronics site should yield a computer accessory, while on a pet supply site, it should bring up a pet toy. This contextual awareness is vital for specialized medical or technical terms where precision is key.
* **Semantic Search Capabilities:** By leveraging techniques like Natural Language Processing (NLP) and vector search, Algolia can interpret the *meaning* behind queries, not just the words themselves. This allows it to connect 'T2DM' with 'Type 2 Diabetes Mellitus' even if the full term isn't explicitly typed.

For specialized terminology, this translates directly to **increased relevance** and **reduced frustration** for your users. Instead of missing critical information because they used a shorthand or a synonym, they get accurate results every time. This capability is a game-changer for industries where precise understanding is paramount, like healthcare or complex B2B environments.

Are you a developer looking to implement this, or are you evaluating Algolia from a product management perspective?

**Better answer (A or B):** ____   **A quality (1-5):** ____   **B quality (1-5):** ____

================================================================================
## Q5: What's the difference between Algolia's keyword search and NeuralSearch?

### Answer A

You know how some search engines feel like they're just guessing, and others *actually* get what you mean? That's the difference between a dusty Rolodex and a mind-reading psychic. Keyword search is the Rolodex, and NeuralSearch? That's the psychic.

## Keyword Search vs. NeuralSearch: The Core Difference

Think of traditional **keyword search** like looking up a word in a book's index. It’s all about exact matches. If you type "sneakers," it looks for documents that *explicitly* contain "sneakers." It’s functional, but it breaks down fast when users don't use the exact terms or when the meaning is more nuanced. This often leads to a frustrating experience where users can't find what they're looking for, leaving money on the table. We've seen this time and again with clients struggling with the "long tail" of search queries, where common keyword approaches just fall flat [12, 28].

**Algolia NeuralSearch**, on the other hand, goes way beyond simple keyword matching. It's built on **AI** and **vector search** principles, understanding the *meaning* and *intent* behind a user's query. Instead of just matching words, it understands concepts. So, if someone searches for "warm running shoes for winter," NeuralSearch can understand that you're looking for something with insulation and good traction, even if those exact words aren't in the product description. It leverages advanced AI, including natural language processing, to grasp context and deliver incredibly relevant results, boosting conversions and cutting down on wasted user time [1, 4, 25].

## Key Advantages of NeuralSearch

* **Understanding Intent:** NeuralSearch deciphers the underlying meaning of a query, not just the literal words. This means fewer "no results found" pages and a much smoother user journey [1, 4].
* **Handling the Long Tail:** Traditional keyword search struggles with the vast majority of queries that aren't exact matches. NeuralSearch excels here, uncovering hidden revenue opportunities within those less common but equally important searches [4, 12].
* **End-to-End AI:** Unlike solutions that just bolt AI onto existing systems, NeuralSearch is designed from the ground up with AI at every stage – from understanding the query, to retrieving results, to ranking them [4, 8].
* **Semantic Understanding:** It uses techniques like vector embeddings to represent words and phrases mathematically, allowing it to grasp semantic relationships and deliver results that are truly conceptually relevant [6, 17, 21].

Essentially, keyword search is like a dictionary – precise but limited. NeuralSearch is like a knowledgeable assistant who understands what you *mean*, even if you don't say it perfectly. This leads to a significantly better user experience and, crucially, better business outcomes.

Are you interested in AI Search specifically, or are you exploring other Algolia products as well?

### Answer B

Of course. The main difference is that keyword search matches the exact words a user types, while NeuralSearch understands the *meaning and intent* behind those words.

[NeuralSearch](https://www.algolia.com/products/features/neuralsearch) combines the precision of traditional keyword search with the deep understanding of natural language provided by AI [vector search](https://www.algolia.com/doc/guides/ai-relevance/neuralsearch/get-started/). This creates a hybrid search that delivers more relevant results.

### Keyword Search

This is the traditional approach to search. It works by matching the specific terms in a user's query to the same terms in your content. It's highly precise and effective when a user knows exactly what they're looking for and uses the right terms.

### NeuralSearch

[NeuralSearch](https://www.algolia.com/blog/ai/neural-networks-or-ai-whats-the-difference-when-it-comes-to-search/) uses neural networks to go beyond keywords and grasp the concepts and context in a query. It's designed to understand natural, conversational language—a bit like a friend who can finish your sentence [NeuralSearch: Fundamentals](https://academy.algolia.com/training/01995974-63ae-715c-b8cc-b91ded19ae3d). This allows it to surface conceptually related results, even if they don't contain the exact keywords from the original query.

By combining both methods, Algolia provides a fast, scalable, and cost-effective search that can significantly improve discovery and conversions [Algolia launches AI-powered Algolia NeuralSearchTM](https://www.algolia.com/about/news/algolia-launches-ai-powered-algolia-neuralsearchtm-the-world-s-fastest-hyper-scalable-and-cost-effective-vector-and-keyword-search-api).

Would you like to know more about how to test and configure NeuralSearch?

**Better answer (A or B):** ____   **A quality (1-5):** ____   **B quality (1-5):** ____

================================================================================
## Q6: How do I implement faceted search and filtering with InstantSearch?

### Answer A

Implementing faceted search and filtering with InstantSearch is a two-step process: you first configure your data, then you add filtering widgets to your user interface.

### 1. Configure Your Index for Faceting

Before you can filter your results, you must tell Algolia which attributes you want to use for filtering, also known as "facets". You can do this in your Algolia dashboard. For any attribute you want to use as a filter (like `brand`, `category`, or `price`), you need to add it to the "Attributes for faceting" list under your index's configuration settings.

### 2. Add a Filtering Widget to Your UI

Once your index is configured, you can use InstantSearch widgets to build the filtering experience. The most common widget for this is the `refinementList`. This widget displays a list of values for a specific attribute, allowing users to select one or more to filter the results.

Here is a basic example of how to add a refinement list for a "brand" attribute in a React InstantSearch application:

```jsx
import React from 'react';
import {
  InstantSearch,
  SearchBox,
  Hits,
  RefinementList,
} from 'react-instantsearch';
import algoliasearch from 'algoliasearch/lite';

const searchClient = algoliasearch('YourApplicationID', 'YourSearchOnlyAPIKey');

function App() {
  return (
    <InstantSearch searchClient={searchClient} indexName="your_index_name">
      <div className="left-panel">
        {/* This widget will display brand filters */}
        <RefinementList attribute="brand" />
      </div>
      <div className="right-panel">
        <SearchBox />
        <Hits />
      </div>
    </InstantSearch>
  );
}
```

When a user selects a value from the `RefinementList`, InstantSearch automatically re-runs the search with the selected filter applied.

You can also implement more advanced features, such as [hiding a filter when it has only one value](https://support.algolia.com/hc/en-us/articles/4406211114257-InstantSearch-js-How-can-I-hide-a-filter-with-only-one-facet-value) or creating [dynamic filters](https://support.algolia.com/hc/en-us/articles/12916235409553-How-do-I-add-dynamic-filters-to-my-search-page-using-InstantSearch) that appear based on the current search results. For Shopify users, there are specific guides on how to [update the facet configuration within the Shopify app](https://www.algolia.com/doc/integration/shopify/advanced-customization/update-facet-config-in-instantsearch).

Would you like to see how to implement other types of filters, like price ranges or ratings?

### Answer B

You know that feeling when you're trying to find a specific book in a massive library, and you can't remember the exact title, but you know it's a sci-fi novel published in the last five years? That's faceted search in action, and we make that library search lightning fast.

## Streamlining Discovery with Faceted Search

Faceted search is all about helping your users narrow down vast catalogs to exactly what they need, without the frustration. Think of it like this: instead of sifting through thousands of products, users can instantly filter by categories, brands, price ranges, and any other attribute that matters to them. This isn't just about making search pretty; it's about **boosting conversion rates** by making it effortless for customers to find what they're looking for. Companies like Amazon leverage this extensively to guide users through their massive inventories, ensuring relevant results based on the user's intent. [Amazon uses dynamic faceting](https://www.algolia.com/blog/engineering/implementing-faceted-search-with-dynamic-faceting-with-code/) to show different filters for "music" versus "movies," a smart way to enhance the user experience.

With Algolia's InstantSearch, implementing this kind of powerful filtering is designed to be intuitive and highly configurable. You can easily set up **searchable facets** that allow users to even search *within* your filter options, a feature that significantly cuts down on noise. For instance, if you have a long list of brands, a user can type to find the specific brand they want, rather than scrolling endlessly. This capability was a game-changer, reducing the need for complex data preprocessing for each facet. [Search for facet values](https://www.algolia.com/blog/product/search-for-facet-values/) is a prime example of how we empower users to find exactly what they need, faster.

## Building a Seamless Experience

InstantSearch provides pre-built widgets that handle the heavy lifting of displaying facets and applying filters. Whether you're building for web with InstantSearch.js or mobile with our iOS and Android libraries, you get a reactive experience where filters instantly update search results. For mobile, in particular, we offer patterns to manage filter displays effectively, preventing cluttered screens and providing immediate feedback to users, as seen in our [iOS filtering examples](https://www.algolia.com/doc/guides/building-search-ui/ui-and-ux-patterns/filtering-patterns/ios).

Our goal is to make it incredibly simple to integrate advanced search functionalities that drive real business value.

What technology stack are you using for your frontend?

**Better answer (A or B):** ____   **A quality (1-5):** ____   **B quality (1-5):** ____

================================================================================
## Q7: Advisors search for investment products but results ignore client risk profile and portfolio context — how does Algolia's ranking incorporate business signals beyond text relevance?

### Answer A

You know that feeling when you're trying to find the perfect investment, but all you get is a mountain of irrelevant options? It's like trying to find a needle in a haystack, but the haystack is also on fire and full of hay. Algolia's here to douse the flames and point you directly to that needle.

## Beyond Text: Powering Smarter Search with Business Signals

It's absolutely critical that search results don't just match keywords, they need to reflect real business objectives and user context. For advisors searching for investment products, ignoring a client's risk profile and portfolio context is a non-starter. Algolia’s ranking doesn't just rely on basic text relevance; it’s built to incorporate **business signals** that drive actual value and deliver precisely what's needed.

Think about it:

* **Personalization is Key:** In the world of finance, personalization isn't just a nice-to-have, it's a necessity. AI-enabled personalization allows for tailoring experiences, and this extends directly to search results. By understanding user behavior and preferences, Algolia can surface products that align with an advisor's client objectives, not just their search terms [1, 9, 10].
* **Driving Conversions:** For businesses, the ultimate goal is often conversion, whether that's a sale, a sign-up, or in this case, a successful investment recommendation. Algolia's capabilities are designed to improve user experience, which directly leads to higher conversion rates. For instance, Gymshark saw a **150% increase in order rate** by leveraging Algolia's Recommend product [3, 4, 5]. While this is an e-commerce example, the principle of surfacing the most relevant items to drive desired actions is universal.
* **Leveraging User Behavior:** We capture real-time user interactions as events [21]. This includes clicks, views, and conversions. By analyzing these events, Algolia can understand what advisors are *actually* looking for and what leads to successful outcomes for their clients. This moves beyond simple keyword matching to understanding **user intent** and predicting their next move [15, 16, 17, 19, 20].
* **Strategic Ranking:** Algolia's `search-insights` library allows for tracking events like clicks and conversions, which can be used to influence search ranking [21]. This means that products that are historically more successful for similar advisor queries or client profiles can be ranked higher. We also have the ability to configure [strategy](https://www.algolia.com/doc/libraries/sdk/v1/methods/add-strategy) settings that associate scores with events, directly impacting how results are presented based on business value.

By integrating these business signals, Algolia ensures that search results are not only accurate but also strategically aligned with the advisor's goals and the client's specific needs, moving beyond mere text relevance to deliver actionable insights and drive better outcomes.

What is your role in evaluating Algolia for this specific use case?

### Answer B

Of course. Algolia's ranking engine is designed to go beyond text relevance by allowing you to incorporate business signals directly into your search results. This is achieved through a feature called **Custom Ranking**.

For your use case, this means you can rank investment products not just on how well they match a search term, but also on metrics that reflect a client's risk profile, portfolio suitability, or other business-specific goals.

### How It Works

Algolia's relevance is a combination of textual relevance and business relevance. After Algolia finds all the records that match a user's query, it uses a tie-breaking algorithm to sort them. This is where your business signals come into play.

You can configure numeric attributes in your records to be used for custom ranking. For an investment scenario, you could include attributes like:
*   `risk_score`
*   `client_suitability_rating`
*   `popularity_score`
*   `asset_class_diversity_score`

By setting these as custom ranking attributes, you can influence the order of the results. For example, you can prioritize products with a lower `risk_score` (ascending) or a higher `client_suitability_rating` (descending) [How can I troubleshoot relevancy using Algolia dashboard?](https://support.algolia.com/hc/en-us/articles/7964661896849-How-can-I-troubleshoot-relevancy-using-Algolia-dashboard).

This ensures that when two investment products have similar textual relevance, the one that better aligns with your business logic—and the client's needs—will appear higher in the results [What is search relevance?](https://www.algolia.com/blog/product/what-is-search-relevance/). If there are no custom ranking attributes to break ties, records are ranked by their internal object IDs [How does Algolia rank results on empty queries?](https://support.algolia.com/hc/en-us/articles/10524034357393-How-does-Algolia-rank-results-on-empty-queries).

Would you be interested in how to dynamically apply these business rules for different client profiles using filtering or personalization?

**Better answer (A or B):** ____   **A quality (1-5):** ____   **B quality (1-5):** ____

================================================================================
## Q8: My searches return no results after I indexed my data — what are the likely causes?

### Answer A

It can be frustrating when you've indexed your data but your searches are coming up empty. This usually points to a configuration issue either in your index settings or in the search parameters you're using.

Based on the troubleshooting guides, here are the most common causes for a search returning no results:

### 1. No Records in the Index
First, it's always best to confirm that your data was indexed successfully. You can check this by going to your Algolia dashboard, selecting your index, and using the "Browse" tab to see if the records are present as you expect. Indexing operations are asynchronous, so if you've sent a large update, it may take a little longer to be reflected. You can check the status of indexing operations in the [Monitoring/Logs section](https://dashboard.algolia.com/monitoring/logs) of your dashboard.

### 2. Incorrect `searchableAttributes` Configuration
For an attribute to be searchable, you must add it to the `searchableAttributes` setting in your index configuration. If you've indexed data but haven't told Algolia which fields to search in, no results will be returned. A common mistake is a typo in an attribute's name within this list.

### 3. Misconfigured Filters
If your search query includes filters (like `facetFilters`, `numericFilters`, etc.), they might be too restrictive. For example, a filter might be requesting a value that no records have, which would correctly result in zero hits.

### 4. Targeting the Wrong Index or App ID
Ensure that your front-end search implementation is configured with the correct Algolia Application ID and is pointing to the exact index name where you sent your records. A simple typo here is a frequent cause of empty results.

If you've checked these common issues and are still seeing no results, the problem might be related to other search parameters being used.

Have you been able to confirm in your Algolia dashboard that the records exist in the index as you expect?

### Answer B

You know that feeling when you've meticulously organized your entire closet, only to realize you forgot to actually put the clothes *on* the hangers? That's kind of like indexing data but getting no search results. You've done the work, but something's missing in translation.

## No Results? Let's Find the Glitch in the Matrix.

It's frustrating when you've put in the effort to index your data and the search bar returns a big fat nothing. Don't sweat it, this is a common hiccup, and usually, it's a quick fix. The most likely culprits boil down to a few key areas:

* **Data Visibility:** Are the records you're expecting actually making it into the search index? Sometimes, products might be hidden, deleted, or out of stock and configured to be hidden from search results. Algolia won't show what it doesn't "see" as available. For example, if your web shop hides out-of-stock items, and Algolia is configured to mirror that, those items won't appear in search. [14]

* **Configuration Shenanigans:**
    * **Searchable Attributes:** Did you tell Algolia *what* to search for? If your `searchableAttributes` aren't correctly configured, Algolia might not know which fields in your data are important for matching queries. For instance, if you only set `description` as searchable but users are searching for `brand` or `name`, you'll get zero results. [1]
    * **Relevance Settings:** While this usually affects *ranking* rather than *no results*, a severely misconfigured relevance can push all potential matches so far down the list they effectively disappear.

* **Indexing Queue Issues:** If you're using a system like Algolia for Magento, the indexing process often runs through a queue. If this queue crashes or isn't running, your data might not be making it to Algolia, or it could be outdated. [14]

* **Data Integrity:** Sometimes, the issue is with the source data itself. For example, if the "Product Price" index in Magento isn't up to date, products might not sync correctly with Algolia, leading them to be treated as "deleted" and removed from search. [14]

We focus on making sure your search drives revenue, and that starts with ensuring your users *find* what they're looking for.

What technology stack are you using for your implementation?

**Better answer (A or B):** ____   **A quality (1-5):** ____   **B quality (1-5):** ____

================================================================================
## Q9: I'm getting a 403 Forbidden when indexing records — how do I fix it?

### Answer A

You know when you try to get into a VIP club and the bouncer gives you *that* look? Yeah, that's a 403 Forbidden. Algolia's crawler is getting the cold shoulder from your site.

## Decoding the 403 Forbidden During Indexing

A `403 Forbidden` error during indexing means the Algolia Crawler is being blocked from accessing your site's content. It's like a digital bouncer saying "Nope, you're not getting in here!" This usually boils down to security measures on your end that are preventing the crawler from doing its job.

Here are the most common culprits:

* **Security System Blocks:** Your website might have security systems (like Cloudflare, Google Cloud Armor, or even custom firewall rules) that are misinterpreting the Algolia Crawler as a threat. They're doing their job to protect your site, but they're accidentally blocking legitimate access.
* **Robots.txt Restrictions:** The `robots.txt` file on your server tells search engine crawlers which parts of your site they can and cannot access. If it's too restrictive, it might be blocking the Algolia Crawler.
* **Allowlist/Denylist Issues:** Your server might have an allowlist or denylist configured, and the Algolia Crawler's IP address or user agent isn't on the approved list.

## Getting the Crawler Back In

To resolve this, we need to ensure the Algolia Crawler is on your "nice list."

* **Whitelist the Crawler:** The most direct fix is to add the Algolia Crawler's IP address (34.66.202.43) and its specific user agent (`Algolia Crawler/xx.xx.xx`, where `xx.xx.xx` is the version number) to your server's allowlist or security configurations. This tells your security systems, "Hey, this is okay!"
* **Adjust `robots.txt`:** Review your `robots.txt` file. If you find a directive that blocks the `Algolia Crawler` user agent, you'll need to modify it to grant access. For example, you might add `User-agent: Algolia Crawler` to explicitly allow it. You can find more details on handling this in the [troubleshooting documentation](https://www.algolia.com/doc/tools/crawler/troubleshooting/extraction-issues#responses-to-user-agents).
* **Check Custom Security:** If you have custom security rules implemented at the server level (e.g., in Nginx or Apache configuration), double-check those to ensure they aren't inadvertently blocking the crawler.

By addressing these points, you'll effectively remove the "no entry" sign for the Algolia Crawler and get your records indexed smoothly.

What technology stack are you using to integrate with Algolia?

### Answer B

I don't have anything in Algolia's content that answers that. You might find what you need in our [docs](https://www.algolia.com/doc) or [support articles](https://support.algolia.com/hc/en-us/search).

**Better answer (A or B):** ____   **A quality (1-5):** ____   **B quality (1-5):** ____

================================================================================
## Q10: Where do I start learning to build search with Algolia as a new developer?

### Answer A

I don't have anything in Algolia's content that answers that. You might find what you need in our [docs](https://www.algolia.com/doc) or [support articles](https://support.algolia.com/hc/en-us/search).

### Answer B

You know that feeling when you're trying to find a specific tool in a messy toolbox? That's what building search can be like without the right guidance. Algolia makes it so you don't have to dig around forever.

## Getting Your Feet Wet with Algolia Search

As a new developer diving into search with Algolia, the best place to start is by understanding the core concepts and how to get a basic implementation up and running. We want to focus on the value you can deliver quickly, not getting lost in the weeds.

For web development, diving into **React InstantSearch** is a fantastic way to build a robust search interface. It provides pre-built components that make it super fast to get a search experience live. You can see how this comes together in building a [store locator](https://www.algolia.com/blog/engineering/building-a-store-locator-in-react-using-algolia-mapbox-and-twilio-part-2) as a practical example.

If you're on the mobile side, particularly iOS, **InstantSearch iOS** is your go-to. It's designed to help you build a full search experience from scratch, including a search box, results display, and filtering, all with a programmatic approach. You can get started by following the [programmatic setup guide](https://www.algolia.com/doc/guides/building-search-ui/getting-started/how-to/programmatically/ios).

For Android development with a modern, declarative approach, **InstantSearch for Compose** is the way to go. It integrates seamlessly with Jetpack Compose to build your search UI. The [declarative UI guide](https://www.algolia.com/doc/guides/building-search-ui/getting-started/how-to/declarative/android) walks you through setting up dependencies and implementing the core search logic.

Even if you're working with Vue, we've got you covered. The [Autocomplete with Vue guide](https://www.algolia.com/doc/ui-libraries/autocomplete/integrations/using-vue) shows you how to integrate Autocomplete, which is excellent for type-ahead search experiences, directly into your Vue application.

The key is to start with a framework that matches your development environment and allows you to see results quickly. This way, you can focus on the business value of providing a great search experience.

What technology stack are you planning to build with?

**Better answer (A or B):** ____   **A quality (1-5):** ____   **B quality (1-5):** ____

================================================================================
## Q11: We run 6 brand websites with inconsistent search and no shared learnings — how does Algolia handle multi-brand search with personalized results across separate catalogs?

### Answer A

Trying to manage search across six brand websites without shared learnings is like trying to herd cats wearing roller skates – chaotic and bound to end in a tangled mess. Algolia brings order to that chaos.

## Centralized Control, Decentralized Brilliance

Algolia tackles your multi-brand challenge head-on by allowing you to manage search and discovery across distinct catalogs and brand identities, all from a single platform. Think of it as a master control panel for all your digital storefronts. This means you can implement sophisticated **personalization** strategies that cater to individual user preferences, even across different brand experiences.

We understand that each brand might have its own unique catalog, audience, and even specific B2B entitlement policies [1]. Algolia's architecture supports this by enabling you to configure separate indices for each brand or catalog. This ensures that search results are not only relevant to the brand the user is interacting with but also adhere to any specific business rules, like custom pricing or product visibility for different customer groups in B2B scenarios [8].

## Personalization That Learns and Adapts

The magic happens with our **Personalization** feature [2, 4]. It builds user profiles based on their behavior – what they view, click, and purchase. This allows us to tailor search results, pushing products and content that are most likely to resonate with each individual user.

For instance, imagine a user browsing your apparel brand, then later visiting your electronics brand. Algolia can leverage their past interactions to inform their experience on the second site, making it feel more intuitive and relevant. This isn't just about showing them what they've seen before; it's about anticipating their needs and preferences based on their broader engagement across your brand portfolio.

We achieve this by tracking user events and translating that behavior into affinities [5]. These affinities are then used to re-rank search results, ensuring that what a user sees is not just a generic list, but a curated selection tailored specifically to them [3, 6]. Even for new visitors, Algolia can provide a personalized experience from the get-go by leveraging trends and general user behavior.

## Driving Value Across Brands

The ultimate goal here is to boost **conversion rates** and **customer loyalty** by delivering exceptional, relevant experiences. When users can find what they're looking for quickly and discover new items they'll love, they stick around and buy more. This applies across all your brands, ensuring each touchpoint contributes to your overall business objectives.

What industry are these 6 brand websites in?

### Answer B

Of course. Algolia is designed to handle complex multi-brand scenarios, allowing you to unify search and share learnings while still delivering unique, personalized experiences for each brand. The key is a flexible architecture that can be tailored to your specific business goals.

You can approach this in a couple of primary ways, most commonly by consolidating your brands into a single Algolia account.

### Centralized, Single-Account Architecture

For most multi-brand companies, the recommended approach is to manage all brands within a single Algolia account. This allows for shared configurations and a unified view of the customer [Multi-account architecture](https://www.algolia.com/doc/guides/managing-results/multi-account-architecture/).

Here’s how it works:

*   **Unified Indexing**: You can combine products from all six of your brand websites into a single search index. You would add a `brand` attribute to each product record to distinguish them. This allows users to search across all brands or filter down to a specific one [Separate indices vs. one index](https://www.algolia.com/doc/guides/sending-and-managing-data/prepare-your-data/how-to/indexing-strategies/separate-indices-vs-one-index/).
*   **Shared Learnings**: By managing Rules, Synonyms, and other relevance settings in one place, you can apply successful strategies from one brand to others, creating a more consistent and effective search experience everywhere.
*   **Cross-Brand Personalization**: This directly addresses your need for personalized results. By assigning a consistent `userToken` to each shopper across all of your brand sites, Algolia can build a single, unified profile of their preferences. This means a user's activity on Brand A's site can personalize their search results on Brand B's site, creating a powerful, holistic experience [Personalization](https://www.algolia.com/doc/guides/personalization/what-is-personalization/).

### Displaying the Results

With this centralized setup, you have control over the front-end experience. You can use a tool like [Federated Search](https://www.algolia.com/doc/guides/building-search-ui/what-is-federated-search/js/) to create a unified search UI that displays results from different brands or types of content in distinct sections, giving you the flexibility to either blend results or keep them separate.

### Alternative: Multi-Account Architecture

In some cases, such as when brands are completely unrelated or require strict data isolation for legal or operational reasons, you might choose to use a separate Algolia account for each brand. This creates a clear separation for analytics, billing, and team management but makes it more difficult to share configurations or create a cross-brand personalization strategy [Multi-account architecture](https://www.algolia.com/doc/guides/managing-results/multi-account-architecture/).

Are your brands intended to be cross-promoted with a shared user experience, or are they meant to be kept entirely separate from a data and branding perspective?

**Better answer (A or B):** ____   **A quality (1-5):** ____   **B quality (1-5):** ____

================================================================================
## Q12: What successes does Algolia have in fashion and e-commerce, with proof?

### Answer A

Of course. Algolia powers search and discovery for some of the world's top brands in fashion and e-commerce, delivering measurable improvements in engagement and revenue.

A prominent example is the fitness apparel brand **Gymshark**. They use Algolia to enhance their customer experience and drive sales, particularly during high-traffic periods like Black Friday.

Here is some concrete proof of their success:
*   **Increased Order Rates:** Using AI-powered recommendations, Gymshark saw a **150% increase in order rates from new users** during Black Friday compared to the previous period `[Press Release](https://www.algolia.com/about/news/gymshark-boosts-order-rates-cart-additions-and-customer-engagement-with-algolia-recommend)`.
*   **Revenue Growth:** The brand transformed its website using a headless commerce approach with Algolia at its core, which helped to significantly increase revenue `[customer story](https://www.algolia.com/customers/gymshark-headless)`.
*   **Peak Season Performance:** By leveraging Algolia, Gymshark was able to ensure a stable and high-performing experience during critical sales events, helping them maximize their Black Friday sales even after facing technical challenges `[How Gymshark increased Black Friday sales](https://www.algolia.com/blog/product/retail-innovations-peak-season)`.

Additionally, there is a detailed `[case study for an online clothing company](https://www.algolia.com/doc/guides/going-to-production/case-study/)` that walks through how to configure search for a typical e-commerce scenario.

Would you like to learn more about the specific Algolia features, like AI-powered recommendations, that helped Gymshark achieve these results?

### Answer B

You know how some fashion brands just *get* it, while others leave you feeling like you're lost in a giant closet? We're the ones who make sure your customers find exactly what they're looking for, faster than a runway model changes outfits.

## Algolia's Fashion & E-commerce Wins

Algolia is a powerhouse in the fashion and e-commerce space, driving serious business impact for brands looking to elevate their customer experience and, ultimately, their bottom line. We've got a proven track record of helping these businesses convert more browsers into buyers.

Check out how we've helped:

* **Oh Polly**: This fast-growing online fashion brand struggled with a clunky search experience that led to negative customer feedback. After implementing Algolia, they saw **faster, more relevant search results**, which directly translated to improved **Click-Through Rates (CTR)** and **Conversion Rates (CVR)**. The kicker? Search sessions became responsible for a massive **20% of their total revenue**. [Source: Oh-Polly Case Study](https://www.algolia.com/customers/Oh-Polly)

* **END. Clothing**: A global retailer focused on fashion, sneakers, and streetwear, END. wanted to improve their community-oriented customer journey. By deploying Algolia for **Search, Browse, and Recommendations**, they’ve achieved a **2% increase in conversions** and significantly reduced their merchandising workload through **Dynamic Re-ranking**. They're seeing improved CTRs on their product listing pages and are excited about the potential for AI-driven recommendations to further boost their business. [Source: END. Clothing Success Story](https://www.algolia.com/customers/END.)

* **Intelligent Fashion Solution**: We've developed AI-powered capabilities specifically for online fashion retail. This solution understands style nuances, enabling features like **Automated Merchandising** and **Style-Aware Retrieval**, ensuring that fashion-forward customers find exactly what they're looking for, even if they don't know the exact keywords. [Source: Intelligent Fashion Solution](https://www.algolia.com/about/news/algolia-redefines-online-fashion-retail-with-the-next-generation-of-its-intelligent-fashion-solution)

These examples showcase how Algolia doesn't just provide search; we deliver **business-driving solutions** that directly impact revenue and customer satisfaction in the competitive fashion and e-commerce landscape.

Are you involved in selecting search solutions, or are you evaluating them for a specific team or project?

**Better answer (A or B):** ____   **A quality (1-5):** ____   **B quality (1-5):** ____
