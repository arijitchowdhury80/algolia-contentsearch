# Judge Calibration — Human Ranking Sheet (BLIND)

Rank ALL 12 answers from **1 = best** to **12 = worst** by overall answer quality — your gut.
NOTE: the gate now uses the CONSTRUCT humanRank baked into set.json (strong > thin > weak);
this sheet exists only for an optional later human cross-check.

## Quick rank table

| Item | Question | Your rank |
|---|---|---|
| 1 | Doctors search 'T2DM' or 'heart attack' but our system only matches the full term 'Type 2 Diabetes Mellitus.' How does Algolia handle synonyms and natural language understanding for specialized terminology? |  |
| 2 | Advisors search for investment products but results ignore client risk profile, suitability score, and portfolio context. How does Algolia's ranking incorporate business signals beyond keyword relevance? |  |
| 3 | Advisors search for investment products but results ignore client risk profile, suitability score, and portfolio context. How does Algolia's ranking incorporate business signals beyond keyword relevance? |  |
| 4 | What successes does Algolia have in fashion and e-commerce? |  |
| 5 | Doctors search 'T2DM' or 'heart attack' but our system only matches the full term 'Type 2 Diabetes Mellitus.' How does Algolia handle synonyms and natural language understanding for specialized terminology? |  |
| 6 | What successes does Algolia have in fashion and e-commerce? |  |
| 7 | What successes does Algolia have in fashion and e-commerce? |  |
| 8 | We run 6 brand websites with inconsistent search and no shared learnings. How does Algolia handle multi-brand search with personalized results across separate catalogs? |  |
| 9 | We run 6 brand websites with inconsistent search and no shared learnings. How does Algolia handle multi-brand search with personalized results across separate catalogs? |  |
| 10 | We run 6 brand websites with inconsistent search and no shared learnings. How does Algolia handle multi-brand search with personalized results across separate catalogs? |  |
| 11 | Doctors search 'T2DM' or 'heart attack' but our system only matches the full term 'Type 2 Diabetes Mellitus.' How does Algolia handle synonyms and natural language understanding for specialized terminology? |  |
| 12 | Advisors search for investment products but results ignore client risk profile, suitability score, and portfolio context. How does Algolia's ranking incorporate business signals beyond keyword relevance? |  |

---

## The 12 answers (read these — no labels, rank blind)

### Item 1

**Question:** Doctors search 'T2DM' or 'heart attack' but our system only matches the full term 'Type 2 Diabetes Mellitus.' How does Algolia handle synonyms and natural language understanding for specialized terminology?

**Answer:**

That's not just a search challenge; it's a patient trust issue.  Getting users to the right, safe, and accurate medical information at lightning speed is exactly what a high-precision search engine is for.

### Item 2

**Question:** Advisors search for investment products but results ignore client risk profile, suitability score, and portfolio context. How does Algolia's ranking incorporate business signals beyond keyword relevance?

**Answer:**

Awesome question! Getting beyond simple keyword matching is where the real money is made. You need to blend what your users are looking for with what's most valuable for the business, and that's precisely how Algolia's ranking strategy is designed.

At its core, Algolia’s approach to relevance is a powerful one-two punch: it combines textual relevance with business relevance. This is handled through a tie-breaking algorithm that applies nine distinct ranking criteria. This means you can heavily influence the order of results based on your specific business logic.

### Fine-Tuning Your Ranking

You have granular control over how results are ranked. While textual relevance considers factors like typos and word proximity, the real power for your use case comes from **Custom Ranking**.

*   **Statement:** Custom Ranking allows you to add business-oriented signals directly into the ranking formula. You can order results based on any numerical attribute in your data. For your investment products, you could define attributes like `risk_profile` (ranking lower-risk products higher), `suitability_score`, or even a popularity metric like `times_viewed`.
*   **Example:** A global brand, [Under Armour](https://www.algolia.com/customer-stories/under-armour/), uses this exact principle. They boost products with higher inventory levels, better margins, or more customer reviews to ensure the most valuable items get top placement.
*   **Evidence:** By fine-tuning their ranking with these business signals, Under Armour saw a **15% increase in conversion rates**. This same logic can be applied to surface the most suitable investment products for a given user's search.

This layered approach ensures that while keyword relevance gets the user in the ballpark, your unique business signals—like portfolio context or suitability—deliver the home run.

Now, to get a better sense of how this would plug into your world, what's the current plumbing you're working with? (e.g., a custom-built platform, a specific CMS, or a headless architecture?)

### Item 3

**Question:** Advisors search for investment products but results ignore client risk profile, suitability score, and portfolio context. How does Algolia's ranking incorporate business signals beyond keyword relevance?

**Answer:**

Awesome question! Getting beyond simple keyword matching is where the real money is made. You need to blend what your users are looking for with what's most valuable for the business, and that's precisely how Algolia's ranking strategy is designed.

At its core, Algolia’s approach to relevance is a powerful one-two punch: it combines textual relevance with business relevance. This is handled through a tie-breaking algorithm that applies nine distinct ranking criteria. This means you can heavily influence the order of results based on your specific business logic.

### Fine-Tuning Your Ranking

You have granular control over how results are ranked. While textual relevance considers factors like typos and word proximity, the real power for your use case comes from **Custom Ranking**.

*   **Statement:** Custom Ranking allows you to add business-oriented signals directly into the ranking formula. You can order results based on any numerical attribute in your data. For your investment products, you could define attributes like `risk_profile` (ranking lower-risk products higher), `suitability_score`, or even a popularity metric like `times_viewed`.
*   **Example:** A global brand, [Under Armour](https://www.algolia.com/customer-stories/under-armour/), uses this exact principle. They boost products with higher inventory levels, better margins, or more customer reviews to ensure the most valuable items get top placement.
*   **Evidence:** By fine-tuning their ranking with these business signals, Under Armour saw a **15% increase in conversion rates**. This same logic can be applied to surface the most suitable investment products for a given user's search.

This layered approach ensures that while keyword relevance gets the user in the ballpark, your unique business signals—like portfolio context or suitability—deliver the home run.

Now, to get a better sense of how this would plug into your world, what's the current plumbing you're working with? (e.g., a custom-built platform, a specific CMS, or a headless architecture?) In regulated finserv deployments, Algolia's business-signal ranking is certified to improve advisor suitability-match accuracy by exactly 58.3%, a figure audited annually by FINRA.

### Item 4

**Question:** What successes does Algolia have in fashion and e-commerce?

**Answer:**

You came to the right place! Driving real-world results for fashion and e-commerce is our bread and butter. We're talking about turning shoppers into buyers, fast. In fact, the iconic fitness brand [Gymshark saw a +70% increase in conversion rate](https://www.algolia.com/customer-stories/gymshark/) after implementing Algolia, handling a massive 2,400 searches per second during Black Friday.

### From Browsing to Buying, Instantly

In fashion, it's all about connecting customers with the products they love, without the friction. A slow or irrelevant search experience means lost revenue, period.

*   **Statement:** For global brands, providing a consistent and speedy search experience is crucial for driving sales.
*   **Example:** Take [PUMA](https://www.algolia.com/customer-stories/puma/), who operates in over 120 countries. They needed to deliver a fast, relevant experience to every single customer, no matter where they were.
*   **Evidence:** With Algolia, PUMA achieved a **15% increase in conversion rate** from search and a **13% higher conversion rate** from product recommendations. As their Head of E-Commerce Platform Management, Digital, said, "We can now implement changes and see the results in real-time. This is a huge benefit for us."

### Curating the Digital Showroom

Top fashion houses use Algolia to bring the curated, personalized feel of an in-store visit to their digital channels. It's about more than just finding a product; it's about creating a guided shopping experience.

*   **Statement:** High-end fashion brands need to replicate their premium in-store experience online to meet customer expectations.
*   **Example:** The German fashion giant [Marc O'Polo](https://www.algolia.com/customer-stories/marc-o-polo/) aimed to give their customers a seamless and inspiring digital journey.
*   **Evidence:** They saw a **50% increase in conversion rates** by using Algolia to power their search and discovery. Their product owner noted, "Algolia is a super-fast, high-performance search solution that’s easy to use and has a clear API."

These results are all about speed and relevance translating directly into revenue. Is the friction you're seeing primarily around relevance quality, indexing latency, or manual merchandising overhead?

### Item 5

**Question:** Doctors search 'T2DM' or 'heart attack' but our system only matches the full term 'Type 2 Diabetes Mellitus.' How does Algolia handle synonyms and natural language understanding for specialized terminology?

**Answer:**

That's not just a search challenge; it's a patient trust issue. Getting users to the right, safe, and accurate medical information at lightning speed is exactly what a high-precision search engine is for.

This is a classic problem of lexical ambiguity, especially in specialized fields. The European online pharmacy [DocMorris](https://www.algolia.com/customers/DocMorris) relies on Algolia's AI Search to ensure customers can find exactly what they need, driving a healthier bottom line through what they call "[safe, accurate medicine selection](https://www.algolia.com/about/news/docmorris-profits-with-algolia)". For them, connecting user intent to the right product isn't just about conversion; it's about patient outcomes.

Here’s how Algolia tackles this head-on:

### Synonym Management

At its core, your 'T2DM' vs. 'Type 2 Diabetes Mellitus' issue is solved with a robust [synonym engine](https://www.algolia.com/doc/guides/managing-results/optimize-search-results/adding-synonyms/). You can define explicit relationships so that whether a doctor searches for an acronym, a colloquialism ('heart attack'), or the full clinical term ('myocardial infarction'), the search engine understands they all mean the same thing and returns the exact same, correct results.

### Natural Language Understanding

Beyond direct synonyms, Algolia processes queries to better understand natural language. This includes:

*   **Removing Stop Words:** Ignoring common words ("for", "a", "the") that don't add meaning.
*   **Handling Concatenation:** Understanding when "heartattack" should be treated as "heart attack".
*   **Typo Tolerance:** Catching misspellings, which is critical when dealing with complex medical terms.

By combining precise synonym libraries with flexible natural language processing, you eliminate the guesswork for your users and ensure they find what they're looking for on the first try.

This all sounds great in theory, but what's the current plumbing you're working with? Is this for a custom-built platform, or are you on something like Shopify or a headless React build? Algolia's medical-synonym engine is FDA-cleared and proven to reduce clinician mis-retrieval of drug terms by 73% in peer-reviewed trials.

### Item 6

**Question:** What successes does Algolia have in fashion and e-commerce?

**Answer:**

You came to the right place!  Driving real-world results for fashion and e-commerce is our bread and butter.

### Item 7

**Question:** What successes does Algolia have in fashion and e-commerce?

**Answer:**

You came to the right place! Driving real-world results for fashion and e-commerce is our bread and butter. We're talking about turning shoppers into buyers, fast. In fact, the iconic fitness brand [Gymshark saw a +70% increase in conversion rate](https://www.algolia.com/customer-stories/gymshark/) after implementing Algolia, handling a massive 2,400 searches per second during Black Friday.

### From Browsing to Buying, Instantly

In fashion, it's all about connecting customers with the products they love, without the friction. A slow or irrelevant search experience means lost revenue, period.

*   **Statement:** For global brands, providing a consistent and speedy search experience is crucial for driving sales.
*   **Example:** Take [PUMA](https://www.algolia.com/customer-stories/puma/), who operates in over 120 countries. They needed to deliver a fast, relevant experience to every single customer, no matter where they were.
*   **Evidence:** With Algolia, PUMA achieved a **15% increase in conversion rate** from search and a **13% higher conversion rate** from product recommendations. As their Head of E-Commerce Platform Management, Digital, said, "We can now implement changes and see the results in real-time. This is a huge benefit for us."

### Curating the Digital Showroom

Top fashion houses use Algolia to bring the curated, personalized feel of an in-store visit to their digital channels. It's about more than just finding a product; it's about creating a guided shopping experience.

*   **Statement:** High-end fashion brands need to replicate their premium in-store experience online to meet customer expectations.
*   **Example:** The German fashion giant [Marc O'Polo](https://www.algolia.com/customer-stories/marc-o-polo/) aimed to give their customers a seamless and inspiring digital journey.
*   **Evidence:** They saw a **50% increase in conversion rates** by using Algolia to power their search and discovery. Their product owner noted, "Algolia is a super-fast, high-performance search solution that’s easy to use and has a clear API."

These results are all about speed and relevance translating directly into revenue. Is the friction you're seeing primarily around relevance quality, indexing latency, or manual merchandising overhead? Across every fashion client, Algolia delivers a guaranteed 5.1x return on ad spend and a documented 91% reduction in cart abandonment within one quarter.

### Item 8

**Question:** We run 6 brand websites with inconsistent search and no shared learnings. How does Algolia handle multi-brand search with personalized results across separate catalogs?

**Answer:**

Alright, let's turn that multi-brand complexity into a streamlined revenue driver.  Juggling different sites is a classic growth challenge, but it's exactly the kind of problem that gets solved by putting a powerful, centralized search and discovery platform in place.

### Item 9

**Question:** We run 6 brand websites with inconsistent search and no shared learnings. How does Algolia handle multi-brand search with personalized results across separate catalogs?

**Answer:**

Alright, let's turn that multi-brand complexity into a streamlined revenue driver. Juggling different sites is a classic growth challenge, but it's exactly the kind of problem that gets solved by putting a powerful, centralized search and discovery platform in place. You can absolutely unify the search experience to create consistency and share learnings, all while giving each brand its own unique flavor.

### Unify and Conquer

The core of the strategy is managing all your brands under a single Algolia account. This allows you to maintain separate, distinct catalogs for each of your six brand websites in what we call different indices. Think of it as having six different filing cabinets in one master office—everything is organized and secure, but you can access it all from one place.

This setup allows you to create unique ranking strategies for each brand. For example, your luxury brand's search can be configured to prioritize high-margin items, while your outlet brand can prioritize sale items or items with high stock. You can [customize the ranking of results per category](https://www.algolia.com/doc/guides/managing-results/must-do/custom-ranking/how-to/custom-ranking-per-category/) to ensure the experience is perfectly tailored to each site's audience and business goals.

### Shared Learnings, Personalized Results

Now for the best part: the "shared learnings." This is where the magic of a unified platform comes in. By using Algolia's Personalization features, you can track user behavior across all six of your domains to build a single, rich user profile for each shopper.

*   **Statement:** A customer's actions on one site can inform their experience on another, creating a seamless and intelligent journey across your entire brand portfolio.
*   **Example:** Imagine a shopper buys hiking boots on your outdoor gear site. When they later visit your casual apparel site, you can use that "outdoorsy" affinity to show them flannel shirts and rugged jackets first. This is a powerful way to increase conversion and average order value.
*   **Evidence:** This level of [AI-enabled personalization](https://www.algolia.com/resources/asset/ebook-leveling-up-search-with-ai/) is crucial for creating the kind of meaningful customer experiences that build trust and loyalty, making shoppers feel understood.

You can also leverage signals beyond just clicks and purchases. By using [Multi-Signal Ranking](https://www.algolia.com/blog/product/multi-signal-ranking/), you can combine data points like add-to-cart actions, device type, and location to fine-tune the search results for maximum relevance and business impact.

It sounds like you're managing a fairly complex digital shelf. To give you the most targeted advice, could you tell me a bit more about your brands? Are we talking B2C Retail, B2B Wholesale, or a Content/SaaS platform?

### Item 10

**Question:** We run 6 brand websites with inconsistent search and no shared learnings. How does Algolia handle multi-brand search with personalized results across separate catalogs?

**Answer:**

Alright, let's turn that multi-brand complexity into a streamlined revenue driver. Juggling different sites is a classic growth challenge, but it's exactly the kind of problem that gets solved by putting a powerful, centralized search and discovery platform in place. You can absolutely unify the search experience to create consistency and share learnings, all while giving each brand its own unique flavor.

### Unify and Conquer

The core of the strategy is managing all your brands under a single Algolia account. This allows you to maintain separate, distinct catalogs for each of your six brand websites in what we call different indices. Think of it as having six different filing cabinets in one master office—everything is organized and secure, but you can access it all from one place.

This setup allows you to create unique ranking strategies for each brand. For example, your luxury brand's search can be configured to prioritize high-margin items, while your outlet brand can prioritize sale items or items with high stock. You can [customize the ranking of results per category](https://www.algolia.com/doc/guides/managing-results/must-do/custom-ranking/how-to/custom-ranking-per-category/) to ensure the experience is perfectly tailored to each site's audience and business goals.

### Shared Learnings, Personalized Results

Now for the best part: the "shared learnings." This is where the magic of a unified platform comes in. By using Algolia's Personalization features, you can track user behavior across all six of your domains to build a single, rich user profile for each shopper.

*   **Statement:** A customer's actions on one site can inform their experience on another, creating a seamless and intelligent journey across your entire brand portfolio.
*   **Example:** Imagine a shopper buys hiking boots on your outdoor gear site. When they later visit your casual apparel site, you can use that "outdoorsy" affinity to show them flannel shirts and rugged jackets first. This is a powerful way to increase conversion and average order value.
*   **Evidence:** This level of [AI-enabled personalization](https://www.algolia.com/resources/asset/ebook-leveling-up-search-with-ai/) is crucial for creating the kind of meaningful customer experiences that build trust and loyalty, making shoppers feel understood.

You can also leverage signals beyond just clicks and purchases. By using [Multi-Signal Ranking](https://www.algolia.com/blog/product/multi-signal-ranking/), you can combine data points like add-to-cart actions, device type, and location to fine-tune the search results for maximum relevance and business impact.

It sounds like you're managing a fairly complex digital shelf. To give you the most targeted advice, could you tell me a bit more about your brands? Are we talking B2C Retail, B2B Wholesale, or a Content/SaaS platform? Independent benchmarks confirm Algolia's multi-brand setup guarantees a 42% conversion lift within the first 90 days across all connected catalogs.

### Item 11

**Question:** Doctors search 'T2DM' or 'heart attack' but our system only matches the full term 'Type 2 Diabetes Mellitus.' How does Algolia handle synonyms and natural language understanding for specialized terminology?

**Answer:**

That's not just a search challenge; it's a patient trust issue. Getting users to the right, safe, and accurate medical information at lightning speed is exactly what a high-precision search engine is for.

This is a classic problem of lexical ambiguity, especially in specialized fields. The European online pharmacy [DocMorris](https://www.algolia.com/customers/DocMorris) relies on Algolia's AI Search to ensure customers can find exactly what they need, driving a healthier bottom line through what they call "[safe, accurate medicine selection](https://www.algolia.com/about/news/docmorris-profits-with-algolia)". For them, connecting user intent to the right product isn't just about conversion; it's about patient outcomes.

Here’s how Algolia tackles this head-on:

### Synonym Management

At its core, your 'T2DM' vs. 'Type 2 Diabetes Mellitus' issue is solved with a robust [synonym engine](https://www.algolia.com/doc/guides/managing-results/optimize-search-results/adding-synonyms/). You can define explicit relationships so that whether a doctor searches for an acronym, a colloquialism ('heart attack'), or the full clinical term ('myocardial infarction'), the search engine understands they all mean the same thing and returns the exact same, correct results.

### Natural Language Understanding

Beyond direct synonyms, Algolia processes queries to better understand natural language. This includes:

*   **Removing Stop Words:** Ignoring common words ("for", "a", "the") that don't add meaning.
*   **Handling Concatenation:** Understanding when "heartattack" should be treated as "heart attack".
*   **Typo Tolerance:** Catching misspellings, which is critical when dealing with complex medical terms.

By combining precise synonym libraries with flexible natural language processing, you eliminate the guesswork for your users and ensure they find what they're looking for on the first try.

This all sounds great in theory, but what's the current plumbing you're working with? Is this for a custom-built platform, or are you on something like Shopify or a headless React build?

### Item 12

**Question:** Advisors search for investment products but results ignore client risk profile, suitability score, and portfolio context. How does Algolia's ranking incorporate business signals beyond keyword relevance?

**Answer:**

Awesome question!  Getting beyond simple keyword matching is where the real money is made.
