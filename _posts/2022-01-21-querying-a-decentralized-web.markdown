---
layout:      post
categories:  blog
tags:        [ querying, decentralization, knowledge graphs, rdf, linked data ]
comments:    true
title:       "Querying a Decentralized Web"
subtitle:    "The road towards effective query execution of Decentralized Knowledge Graphs."
date:        2022-01-21 10:00:00 +0100
feature_img: /img/blog/apartments.jpg
---
<p class="post-abstract" markdown="1">
Most of today's applications are built based around the assumption that data is centralized.
However, with recent decentralization efforts such as Solid quickly gaining popularity,
we may be evolving towards a future where data is massively decentralized.
In order to enable applications over decentralized data,
there is a need for new querying techniques that can effectively execute over it.
This post discusses the impact of decentralization on query execution,
and the problems that need to be solved before we can use it effectively in a decentralized Web.
</p>
<!--more-->

This blog post summarizes my current views on the next steps for research and development around query execution
for a future where we may have massively decentralized knowledge graphs.
This post targets present and new query researchers,
publishers of knowledge graphs,
and developers of decentralized applications.
I do not claim the ideas contained in this post as my own, as they have been formed based on discussions and collaborations with many others involved in this domain.

<img src="/img/blog/apartments.jpg" alt="Doors of apartments" class="feature-img" />

<p>
<center><em>Decentralized Web applications will need to combine data from many locations</em></center>
</p>

## Towards Decentralized Knowledge Graphs

The original purpose of the Web was to be an open, decentralized platform,
where ["anyone can say anything about anything"](https://www.w3.org/DesignIssues/Metadata.html).
However, in the recent years, data on the Web is becoming increasingly centralized
into applications from large companies such as Facebook, Amazon and Google.
This **centralization has resulted in widespread problems**,
such as [the misuse of personal information](https://www.theguardian.com/technology/live/2018/apr/10/mark-zuckerberg-testimony-live-congress-facebook-cambridge-analytica),
and [censorship](https://quillette.com/2019/06/06/against-big-tech-viewpoint-discrimination/).
Hence, there is a push for *re-decentralizing the Web*, to give people back the control over their data.

The [Solid project](https://solidproject.org/) is a decentralization proposal that allows everyone to have a **personal data vault**,
in which data is stored under strict access control.
This leads to a **decoupling of data from applications**,
where applications need to ask for permission from people to access their data.
Furthermore, Solid builds upon the [Linked Data stack](https://www.w3.org/wiki/LinkedData),
which makes all of this data part of a huge **decentralized knowledge graph**.
This [new paradigm](https://ruben.verborgh.org/blog/2017/12/20/paradigm-shifts-for-the-decentralized-web/) offers a solution to our recent problems.
Since people become the primary controllers of their data instead of companies,
it complies with privacy-related legislature such as the European General Data Protection Regulation (GDPR).

While this paradigm shift is highly beneficial for end-users, it raises some questions as to how applications can be built on top of it.
Today, people are familiar with a user experience that is based on a centralization data.
Therefore, in a future where data is decentralized, applications will have to be built in such a way that *data does not feel decentralized*.
Enabling this illusion has some technical difficulties –especially if performance is critical–, so it is a large burden to place on application developers.
As such, instead of placing this burden on the application developer, perhaps the task of *making data access feel centralized* can be pushed down into a data access layer.

## Queries abstract data access

A common way of accessing data within an application from a remote Web server is via an **API**.
For example, an application can use the API of a library to visualize and browse through all available books.
While this direct access to APIs works well in many cases, it has some limitations.
One main limitation is that it becomes more difficult for application developers to manage data when the data is spread over *multiple APIs*.
A popular solution to this problem is to combine multiple APIs in a new API, so that developers can again access the data as if it was available in a single source.
Unfortunately, this approach of merging multiple APIs into a single one is pushes us again into the direction of centralization, which is exactly what we want to avoid.

As an alternative, the application developer can send requests to each API separately, and combine the data in an ad-hoc manner.
However, this task can quickly become very complex, due to the possible differences between APIs,
and the possible repeated requests to APIs that need to happen due to the data spread.
While the combination of APIs is a problem that needs to be solved, it should not be the responsibility of the application developer.
Similar to how application developers do not traverse through internal indexes of a relation database manually to look up data,
developers of applications over decentralized knowledge graphs should not manually request a series of APIs and combine their results to look up data.
Instead, this task of **data access should be taken up by query engines**, with *queries as abstraction interface*.

A *query language* such as [SPARQL](https://www.w3.org/TR/sparql11-query/), [SQL](https://www.iso.org/standard/63555.html) and [GraphQL](https://graphql.org/)
is a traditional way of accessing data.
A primary strength of such query languages is the fact that they are *declarative*,
which means that they allow you to define *what* data needs to be obtained, without having to define *how* this must be obtained.
Therefore, a query language acts as an abstraction layer between application developers and data sources,
which is also perfectly suitable for the specific case of abstracting access to decentralized knowledge graphs.

## Executing queries with reusable query engines

A query by itself is of little value, as one still needs a **query engine to execute the query and obtain results** for it.
A query engine is responsible for *interpreting* the query,
*determining an execution plan* that is as efficient as possible based on the current environment,
and *executing this plan* to obtain the results.

Th task of coming up with an efficient query execution plan is a tricky thing,
because the numbers of ways in which one can execute a query can become very large,
and some of them are much faster or slower than others,
so picking the right one is key to fast query execution.

TODO: figure query plans

Many years of research have resulted in algorithms and systems that can produce efficient query planners over centralized relation databases.
However, if we are moving towards a future where data is decentralized –such as enabled by Solid where everyone has a personal data vault–,
then we need new algorithms and systems that can cope with this massive amount of distribution of data over different APIs.
While some research has already been done in this direction,
there are still many open problems that make it hard to effectively query over decentralized knowledge graphs.

Since query execution over decentralized knowledge graphs can be complex,
we can not expect new query engines to be created for every application that needs to query over such decentralized knowledge graphs.
Instead, it is important that **highly flexible and reusable query engines** are developed,
so that they can be used within many applications to lower the data access effort for application developers.
Another advantage of having such a reusable query engine is that when optimizations are implemented within this query engine,
that all applications that make use of it automatically become faster, without having to change anything within the application itself.

## Querying over heterogeneous APIs

In order to cope with large-scale decentralization of knowledge graphs as promised by initiatives such as Solid,
we need **query execution algorithms that can cope with this large number of data sources, and the heterogeneity in terms of API expressivity**.

For example, using a given query, an application may want to visualize the books a group of friends has read,
where the underlying data can be spread over multiple data sources.
The data about each person's reading status can be available in simple data documents that are available in each person's data vault.
Metadata about books (such as title, author, cover, ...) is accessible via both simple data documents
*and* a more expressive API available that allows such details to be obtained based on an ISBN.

TODO: figure about the different data sources, and the visualizing app

The query engine executing such a query will first have to *discover* the relevant data sources for this query.
Then, for each source, it has to *interpret* each API's capabilities, i.e., how the query engine can request certain data.
After that, it can come up with a *query execution plan* that will produce the necessary results
by combining requests to each data source as efficiently as possible.
For this example, a query engine may decide to first download each friend's personal reading list document.
After that, each discovered book's metadata is obtained via the more expressive API.

In the example above, the more expressive book API is picked over the data documents for data access,
as it results in more efficient query execution due the single API call that can be made compared to the multiple requests for the data documents.
While it may seem attractive to always expose data over more expressive APIs,
there are [some trade-offs](https://linkeddatafragments.org/publications/jws2016.pdf) to keep in mind before doing that.
Often, the more expressive API, the cheaper it is for a query engine to make use of it.
On the other hand, the more expressive the API, the more costly it is to publish the API on the Web.
For more background on the role of these APIs in the decentralized Web,
I can highly recommend [Ruben Verborgh's blog post on this topic](https://ruben.verborgh.org/blog/2021/12/23/reflections-of-knowledge/).

In a decentralized Web, it is important that everyone can easily publish there data, without requiring highly complex or expensive software to run on their servers.
Therefore, it is reasonable to **consider simple data documents as the minimal data API**,
since these are the simplest and cheapest method of publishing data.
Therefore, a query engine should always be able to handle query execution over documents.
But if the query engine detects the presence of a more expressive API,
then it might be favourable for performance to use that API instead.
Considering data documents as a minimal data API is fundamental concept of the Web,
so it is reasonable to build upon this concept when designing query execution algorithms,
assuming that more expressive APIs can be used to optimize this process.

## Traversing over documents as a basis

If we consider simple data documents as the minimal data API over which query execution must be possible,
then **it is important that efficient query execution algorithms are available for this minimal data API**.
Due to the inherently linked nature of (decentralized) knowledge graphs,
the so-called [*Link-Traversal-based Query Processing*](https://www.rubensworks.net/publications/bogaerts_ruleml_2021/) paradigm (a.k.a. link traversal)
becomes possible for this.

Link traversal starts from the assumption that documents are connected to each other via links,
and that queries can be executed over one or more starting documents
by **iteratively following links between documents**.

TODO: figure from https://www.rubensworks.net/raw/slides/2021/ugent-webfundamentals-linktraversal/#

#### The problems of Link Traversal 

The research field of link traversal is still relatively new,
so there are many open problems that remain to be solved before it can be used for effective query execution in practise.
There are **two primary problems** that are often attributed to link traversal: *speed* and *termination*.

**Speed**

Link traversal is **inherently slower compared than query execution over a single API** in which all the required data is contained.
Obviously, if such a single API is possible and available, then it is a preferred target for querying over.
However, in a decentralized Web, such APIs may become uncommon, or even impossible due to legal and privacy reasons.
Therefore, link traversal –even though it can not be as fast–, may be the only remaining alternative.

However, there are indications that significant improvements are possible
by [prioritizing certain links or documents over others](https://link.springer.com/chapter/10.1007/978-3-319-46523-4_19).
Some ideas for new prioritization strategies that may be promising here are:

* **Similarity**: prefer documents or links that are "similar" to other query-relevant documents.
* **Rountrip time or document size**: prefer documents that are faster to download.
* **Historical relevancy**: for queries that are re-executed, prefer documents that contained the most query-relevant data the last time.
* **Collaboration**: prefer documents that were relevant for your peers, such as your friends.

**Termination**

Since [the number of documents on the Web is massive](https://www.worldwidewebsize.com/),
and each document usually contains links to multiple other documents,
the theoretical upper limit of the query execution range is the full Web.
Since querying the full Web in a live manner for every query is unfeasible when fast results are desired,
some kind of termination strategy needs to be in place for **stopping the traversal process until some threshold is reached**,
such as execution time or a certain number of results.
Up until now, no good termination strategy has been proposed so far that works well in all cases,
since any termination strategy always leads to the loss of some query results when applied to certain use cases.

Nevertheless, general-purpose termination strategies definitely deserve further research,
into directions such as termination by:

* **Timeout**: only follow links until a timeout is reached.
* **Link path dept**: only follow links up until a link path of a certain length.
* **Link count**: only follow links until a certain number is reached (source-local or global).
* **Survival** of the fittest: kill off link paths where none of the documents produced any results.
* **Popcorn**: stop following links if no more results are obtained after a certain timeout.

#### Coping with these problems

Ideally, the problems of speed and termination should be fully resolved.
Given the concept of link traversal, it is more reasonable to assume that these issues may be *optimized*,
but **the problems will never fully resolved**.
Therefore, it may be beneficial to start thinking about ways to cope with these problems, in addition to trying to solve them.

A first way of coping with these problems is through **result streaming**.
This involves a query execution process happens in an *iterative lazy manner*, where *results are only calculated once the consumer needs them*.
For example, this allows a social network application to issue a query for obtaining all posts of your friends,
but the query engine only produces those results that are required for visualizing the posts.
As soon as the users scrolls down to view the next posts, the query engine would calculate and return those next results.

A second coping mechanism is to enable query engines to return **partial or approximate results**.
Many querying algorithms execute a query plan in an iterative manner,
which means that internal intermediary results already contain part of the query answer,
which are not returned to the end user until the complete result is computed.
In the case of link traversal where full result computation may require the lookup of many more links,
it may desirable to *return these partial results to the end-user as soon as possible*.
For example, social network applications may start visualizing posts as soon as their text contents are available,
even though the number of likes and reactions still need to be computed.
A second example is where the number of likes on a post may still be an approximation,
and the query engine still has to make the number more exact at a later point in time.

A third coping mechanism is similar to the second one, and involves the query engine returning **probabilistic results**.
[Certain mechanisms](https://linkeddatafragments.org/publications/iswc2015-amf.pdf) exist that allow query results to be produced very quickly, but without < 100% certainty.
Afterwards, these results still need to be confirmed before one can be certain of them being an actual result.
In the context of link traversal, these concepts can be applied to *emit these probabilistic results to the end-user as soon as possible*,
where the query engine either confirms or retracts those results at a later point in time.
For example, a social network application may enable the visualization of all friends of your friends,
which may during the computation phase still show some people as being a friend of a friend with a certain chance,
until they can be confirmed by the query engine.

## Beyond Link Traversal

Even though there are many opportunities for improving the performance of link traversal,
there will most likely be **cases where the overhead of traversing Web documents during query execution will simply be too high**.
For these cases, the root cause of the problem is not necessarily the link traversal process,
but the minimal data API that causes the data to be spread over too many documents,
which requires the query engine to perform too many HTTP requests.
As such, for these cases, we will have to go _beyond_ this minimal data API,
and **expose auxiliary indexes** so that the query engine does not have to perform as many requests.

This idea is similar to the concepts of [indexes](https://www.postgresql.org/docs/9.1/indexes.html) and [materialized views](https://www.postgresql.org/docs/12/rules-materializedviews.html) in databases,
which are added to a database to enable the query engine to find certain types of data much faster.
Such indexes and materialized views are usually created if execution times for certain queries become too slow.
Concretely, there will be a need to expose indexes and materialized views over knowledge graphs on the Web,
so that link traversal algorithms can use them to optimize query execution.
This technique is sometimes also referred to as _hybrid link traversal_,
for which several concrete opportunities are already available.

#### Open research opportunities

A first opportunity involves **query APIs** such as [SPARQL endpoints](https://www.w3.org/TR/sparql11-protocol/)
and [Triple Pattern Fragments](https://linkeddatafragments.org/specification/triple-pattern-fragments/) interfaces,
which could be exposed on a Solid data vault (or parts thereof) in case the knowledge graph size within that vault becomes too large.
If a query engine is traversing over that vault, and it discovers the presence of such a query interface,
it could abort traversal over that range, and directly query that API instead.

TODO: figure pointer from pod to API

Another opportunity is the usage of **Web-based indexing techniques**, such as [ShapeTrees](https://shapetrees.org/).
These techniques allow *structural information of the knowledge graphs* to be described.
For example, a user storing photos within a vault, can decide to structure photos by the country in which the photo was taken.
Based on this structure, if the user wants to query all photos taken in the city Paris,
an intelligent query engine can exploit this structural information to determine that Paris is a city in France,
after which the query engine should only look at the photos in the container of France.
In general, structural information from Web-based indexes can be used to _prune_ links and documents that are guaranteed to not be relevant for the query results.
Furthermore, this information can also be used to _prioritize_ certain links that are more closely related to the given query than other links.

TODO: figure photos by location

A third opportunity is that of **Web-based materialized views**,
which involves precomputing a derived view on (a subset of) a knowledge graph,
such as is enabled by [TREE](https://treecg.github.io/specification/).
In other words, the data can be replicated in different ways.
For example, while a user's vault may contain photos structured by city,
a derived view may be created that structures these same photos by quality.
Depending on the type of query, the query engine may decide to pick either the original view or the derived view to achieve the best query performance.

TODO: figure photos in different views

A final opportunity involves **summarization via aggregation services**.
This concept is similar to that of materialized views,
with the difference that not the full data is replicated,
but only a high-level summary, and that pointers to the original data are in place.
For example, a summary can be created over all locations at which a user has taken photos.
If a query is issued to look for all photos at a given location, the summary can be checked first,
before a more in-depth (and more expensive) look should be done into the rest of the vault.
Since a summary still requires a lookup for the original data,
it may even be possible to use probabilistic datastructures for more efficiently storing these summaries,
such as [Bloom filters](https://www.geeksforgeeks.org/bloom-filters-introduction-and-python-implementation/).

#### Considering these opportunities

Efficiently using these query APIs, indexes, materialized views, and summaries during query execution is of course just one side of the story.
Further research is also needed to determine techniques to efficiently *construct* and *manage* them.
An important aspect to consider here the issue of *privacy*,
since decentralized knowledge graphs may contain private data that exists behind access control.
It is therefore important that these hybrid techniques **don't leak private information**
by acting in a [privacy-preserving manner](https://www.rubensworks.net/publications/taelman_towards_privacy_aggregation_2020/).

A main benefit of exposing these hybrid approaches at Web-level,
is the fact that they can be **hosted anywhere on the Web**.
For example, users who notice that queries over their own pictures is very slow
could decide to add an index over their data, and expose it on their own Web server.
In a second example, a user may be querying over data that is owned by someone else,
in which case it is not possible for this user to expose an index on that server directly.
But what the user can do, is setup an external index on a personal server,
which can still be exploited by query engines.
As long as these indexes are reused often enough,
setting them up may be worth it compared to the higher query execution times without them.
There may even be some *commercial opportunities* here,
where indexing services over knowledge graphs may be used by users requiring faster query execution,
while less critical queries may be done over a free tier of the knowledge graph that is exposed using simple data documents.

## Making it work

One of my personal goals is to make my research as practical as possible,
which I for example do through the open-source [Comunica query engine](https://comunica.dev/).
This query engine was designed for investigating different kinds of query techniques, including those discussed in this blog post.
Furthermore, Comunica aims to lower the barrier towards actually using these query techniques in real-world production environments is as much as possible.
Since **Comunica already has the necessary building blocks** to perform [basic query execution over Solid data vaults](https://comunica.dev/docs/query/advanced/solid/)
and even has [experimental support for link traversal](https://github.com/comunica/comunica-feature-link-traversal),
it is perfectly positioned to act as a common experimenting ground for investigating query execution over decentralized knowledge graphs.
Furthermore, since Comunica is a query engine that runs on both client- and server-side,
it opens up some interesting practical opportunities,
such as personalized query execution where the query process can very based on one's preferences and environment,
and even collaborative query execution.

As it stands now, there are some interesting hurdles that need to be overcome before we can effectively query over decentralized knowledge graphs.
Our [research group at Ghent University](https://www.ugent.be/ea/idlab/en) has recently [acquired funding](https://idlab.technology/news/2022/01/05/Flemish-government-7M-eur-funding-SolidLab-vlaanderen.en.html) to solve exactly these kinds of problems.
Since one of the goals of this project funding is to **actually make things work in practise**,
we will be designing *and* implementing these techniques in open-source tools such as the [Comunica query engine](https://comunica.dev/),
so that everyone can start querying decentralized knowledge graphs themselves.

<hr />

<p style="font-size: 0.7em; font-style: italic; margin-top: 2em">
If you are interested in any of these topics, and you want to collaborate, be sure to <a href="mailto:rubensworks@gmail.com">contact me</a>,
as we are currently hiring enthusiastic people to work on both fundamental and applied research topics.
Alternatively, it is also possible to do a Master's thesis or internship around these topics.
</p>
