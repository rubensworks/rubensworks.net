---
layout:      post
categories:  blog
tags:        [ ai, crawlers, sparql, federation, querying, knowledge graphs, rdf, linked data ]
comments:    true
title:       "Did AI Crawlers Kill SPARQL Federation?"
subtitle:    "Open Knowledge Graph infrastructure is degrading due to AI crawlers."
date:        2026-04-13 11:10:00 +0200
feature_img: /img/blog/sparql-federation-stone.png
---
<p class="post-abstract" markdown="1">
RDF provides the basis for distributing Knowledge Graphs (KGs) across different locations,
which is useful when KGs
cover different data domains with varying purposes,
are managed by different teams and organizations,
or are exposed by different access policies.
One of the most popular ways of publishing a KG is through a SPARQL endpoint,
which offers queryable access.
When multiple of these KGs need to be integrated,
techniques such as SPARQL federation can be used.
<!-- Need         -->
While many KGs have been available as public SPARQL endpoints,
their openness is currently being challenged
by the huge load that is placed on them by modern AI crawlers that power LLMs.
Recently, public SPARQL endpoints have started putting in place stricter usage restrictions
to avoid going down under this increased server load.
While these restrictions limit the range of SPARQL queries that can be executed over them,
it becomes especially problematic for SPARQL federated queries,
which often involves sending multiple smaller queries to endpoints in a short timeframe.
</p>
<!--more-->

<!-- Task         -->
In this post, I want to raise the alarm regarding the state of SPARQL federation,
as many **federated SPARQL queries that used to work, simply can not be executed anymore** with state of the art techniques.
<!-- Object       -->
I discuss where and how these restrictions have been put in place
based on an analysis over Wikidata, DBpedia, and Uniprot,
and I mention possible possible mitigations strategies.
<!-- Findings     -->
<!-- Conclusion   -->
<!-- Perspectives -->
Through this, I aim to trigger discussions about the sustainability of public KG infrastructure,
and challenge future research towards new querying or publishing techniques that can cope with this new reality.

<img src="/img/blog/sparql-federation-stone.png" alt="A graveyard of past technologies" class="feature-img" />

<p>
<center><em>Will SPARQL federation end up in the line of past technologies?</em></center>
</p>

## SPARQL Federation Integrates Knowledge Graphs

[SPARQL](https://www.w3.org/TR/2013/REC-sparql11-query-20130321/) is the standard language for querying over RDF-based Knowledge Graphs (KGs),
with [SPARQL endpoints](https://www.w3.org/TR/2013/REC-sparql11-protocol-20130321/) being a popular way of exposing access to such KGs through a Web-based API.
Since RDF is based on using global identifiers for resources,
these identifiers can be used and interlinked across multiple distributed KGs.
While each SPARQL endpoint offer queryable access to just a single KG,
[SPARQL federated queries](https://www.w3.org/TR/2013/REC-sparql11-federated-query-20130321/) allow combining data from multiple endpoints
through `SERVICE` clauses.

As users may not always know exactly which RDF triples originate from what endpoints,
writing these `SERVICE` clauses manually within their query may not always be feasible.
For this reason, various [federation approaches](https://comunica.dev/docs/query/advanced/federation/) exist
to automatically decompose a query to a query with `SERVICE` clauses and join data across multiple SPARQL endpoints efficiently.
Furthermore, federation techniques have also been introduced to federate over heterogeneous interfaces,
which includes not only SPARQL endpoints, but also interfaces such as [Triple Pattern Fragments (TPF)](https://linkeddatafragments.org/specification/triple-pattern-fragments/) and [brTPF](http://olafhartig.de/brTPF-ODBASE2016/).
These techniques are implemented in SPARQL federation engines such as [Comunica](https://comunica.dev/) and [HeFQUIN](https://github.com/LiUSemWeb/HeFQUIN),
leading to *virtually integrated Knowledge Graphs*,
which can be queried as if the data was centralized.

## AI Crawlers Disrupt Open Data Infrastructure

In recent years, we have seen the rapid rise of generative AI tools such as ChatGPT, Grok, and Copilot.
These rely on Large Language Models (LLMs) that strongly depend on data that is accessible to them on the Web.
LLMs use this data during their training,
for gathering content in real-time based on user queries,
and agentic actions using across services according to the [Model Context Protocol](https://modelcontextprotocol.io/docs/getting-started/intro) (e.g. a user navigating the Web using a headless browser).
Especially this training step requires massive amounts of data,
which involves crawling large parts of the Web.

Crawlers have been common since the early days of the Web,
for example to build indexes for powering search engines such as Google and Bing.
However, with the rising popularity of LLM tools,
[the Web is experiencing a large increase in traffic due to AI crawlers](https://blog.cloudflare.com/ai-crawler-traffic-by-purpose-and-industry/).
While [`robots.txt`](https://developers.google.com/search/docs/crawling-indexing/robots/intro) has been a common technique for server administrators to tell what data crawlers are allowed to access using which frequency,
[Content Signals](https://contentsignals.org/) are an extension to this to indicate for what purpose LLMs may use content.

Unfortunately, many AI crawlers do not follow these guidelines and are more aggressive than traditional crawlers.
They cause this added traffic to become unmanageable for many Web servers.
As such, administrators that want to avoid their servers being overloaded
have to resort to mitigation techniques such as rate limits, human verification, and blocking.
Other initiatives include requiring AI crawlers to [pay per crawl](https://blog.cloudflare.com/introducing-pay-per-crawl/).
Since many crawlers are smart enough to work around such mitigation techniques,
there are even techniques to [trap misbehaving crawlers into AI labyrinths](https://blog.cloudflare.com/ai-labyrinth/).

## Preliminary Findings on Public SPARQL Endpoints

Since 2018, we have been serving a [Web-based version of the Comunica engine](https://query.comunica.dev/),
with which users can execute SPARQL queries directly within their Web browser.
This Web client offers example queries, which include several queries that federate over public SPARQL endpoints.
However, within the last year, we have started seeing queries failing, which used to work without any problems.
Hereafter, we discuss three of our queries that started failing,
which includes federation over three of the most popular and largest public SPARQL endpoints:
[Wikidata](https://query.wikidata.org/), [DBpedia](https://dbpedia.org/sparql), and [Uniprot](https://sparql.uniprot.org/).
These three queries can be found in
Query 1, Query 2, and Query 3.
The first two federate purely over SPARQL endpoints,
while the last one federates over a SPARQL endpoints and two TPF interfaces.

<figure id="query-uniprot-rhea" class="listing" markdown="block">
```sparql
PREFIX rh: <http://rdf.rhea-db.org/>
PREFIX up: <http://purl.uniprot.org/core/>
PREFIX taxon: <http://purl.uniprot.org/taxonomy/>
PREFIX up: <http://purl.uniprot.org/core/>
SELECT ?uniprot ?mnemo ?rhea ?accession ?equation 
WHERE {
  { 
    VALUES (?taxid) { (taxon:83333) }
    GRAPH <http://sparql.uniprot.org/uniprot> {
      ?uniprot up:reviewed true . 
      ?uniprot up:mnemonic ?mnemo . 
      ?uniprot up:organism ?taxid .
      ?uniprot up:annotation/up:catalyticActivity/up:catalyzedReaction ?rhea . 
    }
  }
  ?rhea rh:accession ?accession .
  ?rhea rh:equation ?equation .
}
```
<figcaption markdown="block">
<span class="label">Query 1</span>
A [federated query](https://query.comunica.dev/#transientDatasources=https%3A%2F%2Fsparql.uniprot.org%2Fsparql;https%3A%2F%2Fsparql.rhea-db.org%2Fsparql&query=PREFIX%20rh%3A%20%3Chttp%3A%2F%2Frdf.rhea-db.org%2F%3E%0APREFIX%20up%3A%20%3Chttp%3A%2F%2Fpurl.uniprot.org%2Fcore%2F%3E%0APREFIX%20taxon%3A%20%3Chttp%3A%2F%2Fpurl.uniprot.org%2Ftaxonomy%2F%3E%0APREFIX%20up%3A%20%3Chttp%3A%2F%2Fpurl.uniprot.org%2Fcore%2F%3E%0A%0A%23%20Query%2013%0A%23%20Select%20all%20Rhea%20reactions%20used%20to%20annotate%20Escherichia%20coli%20%28taxid%3D83333%29%20in%20UniProtKB%2FSwiss-Prot%0A%23%20return%20the%20number%20of%20UniProtKB%20entries%0A%23%20%0A%23%20Federated%20query%20using%20a%20service%20to%20UniProt%20SPARQL%20endpoint%0A%23%20%0A%23%20This%20query%20cannot%20be%20performed%20using%20the%20Rhea%20search%20website%0ASELECT%20%3Funiprot%20%3Fmnemo%20%3Frhea%20%3Faccession%20%3Fequation%20%0AWHERE%20%7B%0A%20%20%7B%20%0A%20%20%20%20VALUES%20%28%3Ftaxid%29%20%7B%20%28taxon%3A83333%29%20%7D%0A%20%20%20%20GRAPH%20%3Chttp%3A%2F%2Fsparql.uniprot.org%2Funiprot%3E%20%7B%0A%20%20%20%20%20%20%3Funiprot%20up%3Areviewed%20true%20.%20%0A%20%20%20%20%20%20%3Funiprot%20up%3Amnemonic%20%3Fmnemo%20.%20%0A%20%20%20%20%20%20%3Funiprot%20up%3Aorganism%20%3Ftaxid%20.%0A%20%20%20%20%20%20%3Funiprot%20up%3Aannotation%2Fup%3AcatalyticActivity%2Fup%3AcatalyzedReaction%20%3Frhea%20.%20%0A%20%20%20%20%7D%0A%20%20%7D%0A%20%20%3Frhea%20rh%3Aaccession%20%3Faccession%20.%0A%20%20%3Frhea%20rh%3Aequation%20%3Fequation%20.%0A%7D) over Uniprot and Rhea to find Escherichia coli reactions.
</figcaption>
</figure>

<figure id="query-wikidata-cats" class="listing" markdown="block">
```sparql
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT * WHERE {
  ?cat wdt:P31 wd:Q146 ;
       wdt:P19 [ wdt:P17 wd:Q30 ] ;
       rdfs:label ?name .
  FILTER(LANG(?name) = "en")
}
```
<figcaption markdown="block">
<span class="label">Query 2</span>
A [federated query](https://query.comunica.dev/#transientDatasources=https%3A%2F%2Fdbpedia.org%2Fsparql;https%3A%2F%2Fquery.wikidata.org%2Fsparql&query=PREFIX%20wd%3A%20%3Chttp%3A%2F%2Fwww.wikidata.org%2Fentity%2F%3E%0APREFIX%20wdt%3A%20%3Chttp%3A%2F%2Fwww.wikidata.org%2Fprop%2Fdirect%2F%3E%0APREFIX%20rdfs%3A%20%3Chttp%3A%2F%2Fwww.w3.org%2F2000%2F01%2Frdf-schema%23%3E%0ASELECT%20*%20WHERE%20%7B%0A%20%20%3Fcat%20wdt%3AP31%20wd%3AQ146%20%3B%0A%20%20%20%20%20%20%20wdt%3AP19%20%5B%20wdt%3AP17%20wd%3AQ30%20%5D%20%3B%20%23%20wd%3AQ695511%0A%20%20%20%20%20%20%20rdfs%3Alabel%20%3Fname%20.%0A%20%20FILTER%28LANG%28%3Fname%29%20%3D%20%22en%22%29%0A%7D) over Wikidata and DBpedia to find all cats in Wikidata.
</figcaption>
</figure>

<figure id="query-harvard" class="listing" markdown="block">
```sparql
PREFIX dbp: <http://dbpedia.org/property/>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX schema: <http://schema.org/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?person ?name ?book ?title {
  ?person dbp:birthPlace [ rdfs:label "San Francisco"@en ].
  ?viafID schema:sameAs ?person;
               schema:name ?name.
  ?book dc:contributor [ foaf:name ?name ];
              dc:title ?title.
}
```
<figcaption markdown="block">
<span class="label">Query 3</span>
A [federated query](https://query.comunica.dev/#datasources=https%3A%2F%2Fdbpedia.org%2Fsparql&transientDatasources=%2F%2Fdata.linkeddatafragments.org%2Fviaf;%2F%2Fdata.linkeddatafragments.org%2Fharvard&query=SELECT%20%3Fperson%20%3Fname%20%3Fbook%20%3Ftitle%20%7B%0A%20%20%3Fperson%20dbpedia-owl%3AbirthPlace%20%5B%20rdfs%3Alabel%20%22San%20Francisco%22%40en%20%5D.%0A%20%20%3FviafID%20schema%3AsameAs%20%3Fperson%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20schema%3Aname%20%3Fname.%0A%20%20%3Fbook%20dc%3Acontributor%20%5B%20foaf%3Aname%20%3Fname%20%5D%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20dc%3Atitle%20%3Ftitle.%0A%7D) over DBpedia, VIAF (TPF), and Harvard Library (TPF) to find San Franciscans in the Harvard library.
</figcaption>
</figure>

Comunica implements state-of-the-art SPARQL federation algorithms such as FedX and SPLENDID.
In order for a federation engine such as Comunica to execute a SPARQL query,
the engine has to split up the original SPARQL query into several smaller queries,
which are sent to different endpoints,
after which results are joined together locally within the federation engine.
Depending on the complexity of the query, dataset size, and the used federation algorithms,
the number of HTTP requests to the SPARQL endpoints can vary greatly.

While Comunica could successfully execute the queries above in the past,
it is not able to anymore,
even though no relevant code changes were made since then.
When executing any of the queries within Comunica,
the engine errors and stops execution after just a few seconds,
and reports HTTP 429 (Too Many Requests) errors from the SPARQL endpoints.
This starts occurring after 34 HTTP requests (0.7 seconds) for the query in Query 1,
116 requests (0.9 seconds) for Query 2,
and 30 requests (0.5 seconds) for Query 3.

Both Uniprot and Wikidata report the text `Rate Limit Exceeded` within their HTTP response body.
While Wikidata provides no further information on this rate limit,
Uniprot returns the `Retry-After: 10` header, indicating the client should wait for 10 seconds before another request can be made.
DBpedia provides some more information in the form of an HTML page,
which says that the site is configured to allow `100 simultaneous connections from the same IP address` 
and `50 requests per second from the same IP address`,
and advises the user to `Please try again soon`.
These rate limits appear to have been enabled within the last year,
or have at least been lowered significantly.

While these are just the results of 3 example queries,
we see the same problems occurring for other federated queries over public endpoints.

## Discussion and Future Work

AI crawlers are placing open data infrastructure under great pressure.
These findings show that public SPARQL endpoints are no exception to this,
as well known endpoints are starting to put in place strict rate limits
to be able to cope with this added traffic.
Unfortunately, not only AI crawlers are impacted by this,
but also federated query engines are impacted as an unintended consequence.

The findings above should come with no surprise,
as we have known for a long time that [public SPARQL endpoints have had availability issues](https://aidanhogan.com/docs/epmonitorISWC.pdf).
Since the recent advancements around LLMs, this existing problem is simply being enlarged.
If we want to publish public Knowledge Graphs in a sustainable manner,
we will have to rethink how we publish and consume Knowledge Graphs.

Due to the rising popularity of LLMs, these rate limits are likely to stay with us long-term.
Hence, there is a [need for a new generation of query planning techniques for SPARQL federation that take into account such restrictions](https://www.rubensworks.net/raw/publications/2025/hanski_wikidata_federation_2025.pdf).
These should depend on new or extended standards that allow these restrictions to be communicated to clients in a machine-readable manner.
The `Retry-After` header and DBpedia's HTML page are steps in the right direction,
but they are only visible to clients after a limit has been exceeded,
while this information would be needed during query planning when discovering the endpoint's capabilities.

Besides quick-fix solutions such as rate limits and API keys,
we may have to more fundamentally alter our publishing approaches.
It may for example be worth it to revisit research towards alternative [low-cost and cache-friendly KG interfaces](https://linkeddatafragments.org/specification/triple-pattern-fragments/)
and [link-traversal-based querying over plain Linked Data documents](https://comunica.github.io/Article-ISWC2023-SolidQuery/),
which come with the trade-off of higher client-side effort when querying.
Or this may be an indication that free access KGs is simply not sustainable,
and that publishers will have to charge clients per request,
which will require intelligent federated query planning techniques
that take into account total monetary costs within their cost model.

The goal of this post is to raise awareness to these issues.
Our findings are based on just a limited set of queries,
so there is certainly a need for more thorough analyses of real-world federation across general and domain-specific endpoints,
whereas existing federation techniques have only been evaluated in context of closed and ideal scenarios
that lack rate limits and other real-world effects such as timeouts and temporary downtime.
For instance, 657 of the 1573 datasets within the Linked Open Data Cloud are public SPARQL endpoints at the time of writing,
but it is unknown how many of these endpoints have such restrictions,
and therefore break current SPARQL federation engines.
Furthermore, discussions with KG publishers must be held to determine
if AI crawlers are indeed the main cause of the placement of these restrictions (Uniprot and DBpedia have already confirmed to me this is the case),
or if there are other reasons for putting them in place.
Finally, there is a need for KG publishers and developers of KG consumer software to come together and define best practises
on how to mitigate availability issues originating from AI crawlers.

One of the main selling points of Knowledge Graphs and the Semantic Web
is the ability to distribute and interlink data across different data sources,
and integrate them through techniques such as SPARQL federated queries.
However, we are on a trajectory where usage restrictions make it impossible for such federated queries to be executed.
This problem is so significant that one might start questioning the fundamental motivations behind Knowledge Graph technologies.
If we can not integrate data across multiple Knowledge Graphs anymore,
what is their value compared to closed and silo-oriented databases?

-----

&nbsp;

_This blog post was written based on findings discovered together with [Elias Crum](https://ecrum19.github.io/eliascrum/), and has been inspired by discussions within the [GOBLIN COST action](https://goblin-cost.eu/)._
