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
TODO
</p>
<!--more-->

TODO

<img src="/img/blog/apartments.jpg" alt="Doors of apartments" class="feature-img" />

<p>
<center><em>Data can be accessed in a high variety of manners</em></center>
</p>

## Towards Decentralized Knowledge Graphs

The original purpose of the Web was to be an open, decentralized platform,
where ["anyone can say anything about anything"](https://www.w3.org/DesignIssues/Metadata.html).
However, in the recent years, the Web is becoming increasingly centralized
towards large companies such as Facebook, Amazon and Google.
This **centralization has resulted in widespread problems**,
such as [the misuse of personal information](https://www.theguardian.com/technology/live/2018/apr/10/mark-zuckerberg-testimony-live-congress-facebook-cambridge-analytica),
and [censorship due to idealogical differences](https://quillette.com/2019/06/06/against-big-tech-viewpoint-discrimination/).
Hence, there is a push for *re-decentralizing the Web*, to give people back the control over their data.

The [Solid project](https://solidproject.org/) is a decentralization proposal that allow everyone to have a **personal data vault**,
in which data is stored under strict access control.
This leads to a *decoupling of data from applications*,
where applications need to ask for permission from people to access their data.
Furthermore, Solid builds upon the [Linked Data stack](https://www.w3.org/wiki/LinkedData),
which makes all of this data part of a large *decentralized knowledge graph*.
This [new paradigm](https://ruben.verborgh.org/blog/2017/12/20/paradigm-shifts-for-the-decentralized-web/) offers a solution to our recent problems.
Since people become the primary controllers of their data instead of companies,
it complies with privacy-related legislature such as the European General Data Protection Regulation (GDPR).

While this paradigm shift is highly beneficial for end-users, it raises some questions as to how applications can be built on top of it.
Today, people are familiar with a user experience that is based on a data being centralized.
In a future where data is decentralized, applications will have to be built in such a way that *data does not feel decentralized*.
This is a large burden to place on application developers, especially if performance is critical.
As such, instead of placing this burden on the application developer, perhaps the task of *making data access feel centralized* can be pushed down further.

TODO: shift from one source to many sources

## Queries abstract data access

A common way of accessing data from a different server within an application is via an *API*.
For example, an application can use the API of a library to visualize and browse through all available books.
While this direct access to APIs works well in many cases, it has some limitations.
One main limitation is that it becomes more difficult for application developers to manage data when the data is spread over *multiple APIs*.
A popular solution to this problem is to combine multiple APIs in a new API, so that developers can again access the data as if it was available in a single source.
Unfortunately, this approach of merging multiple APIs into a single one is pushes us again into the direction of centralization.

As an alternative, the developer can send requests to each API separately, and combine the data in an ad-hoc manner.
However, this task can quickly become very complex, due to the possible differences between APIs,
and the possible repeated requests to APIs that need to happen due to the data spread.
While the combination of APIs is a problem that needs to be solved, it should not be the responsibility of the application developer.
Similar to how application developers do not traverse through internal indexes of a relation database manually to look up data,
developers of applications over decentralized knowledge graphs should not manually request a series of APIs and combine their results to look up data.
Instead, this task should be taken up by *query engines*, with *queries* as abstraction interface.

A *query language* such as [SPARQL](https://www.w3.org/TR/sparql11-query/), [SQL](https://www.iso.org/standard/63555.html) and [GraphQL](https://graphql.org/)
is a traditional way of accessing data.
A primary strength of such query languages is the fact that they are *declarative*,
which means that they allow you to define *what* data needs to be obtained, without having to define *how* this must be obtained.
Therefore, a query language acts as an abstraction layer between application developers and data sources.

A query by itself is of little value, as one still needs a *query engine* to execute the query and obtain results for it.
A query engine is responsible for interpreting the query,
determining an execution plan that is as efficient as possible based on the current environment,
and executing this plan to obtain the results.

Th task of coming up with an efficient query execution plan is a tricky thing,
because the numbers of ways in which one can execute a query can become very large,
and some of them are much faster or slower than others,
so picking the right one is key to fast query execution.

TODO: figure query plans

Many years of research have resulted in algorithms and systems that can produce reasonably efficient query planners over centralized relation databases.
However, if we are moving towards a future where data is decentralized –such as enabled by Solid where everyone has a personal data vault–,
then we need new algorithms and systems that can cope with this massive amount of distribution of data over different APIs.
While some research has already been done in this direction,
there are still many open problems that make it hard to effectively query over decentralized knowledge graphs.

## Querying over heterogeneous APIs

In order to cope with large-scale decentralization as promised by initiatives such as Solid,
we need query execution algorithms that can cope with this large number of data sources,
and the heterogeneity in terms of API expressivity.

For example, using a given query, an application may want to visualize the books a group of friends has read,
where the underlying data can be spread over multiple data sources.
The data about each person's reading status can be available in simple data documents that are available in each person's data vault.
Metadata about books (such as title, author, cover, ...) is also accessible via separate documents,
but there is also a more expressive API available that allows such details to be obtained based on an ISBN.

TODO: figure about the different data sources, and the visualizing app

The query engine executing such a query will first have to *discover* the relevant data sources for this query.
Then, for each source, it has to *interpret* each API's capabilities, i.e., how the query engine can request certain data.
After that, it can come up with a *query execution plan* that will produce the necessary results
by combining requests to each data source as efficiently as possible.
For this example, a query engine may decide to first download each friend's personal reading list document,
after which for each discovered book, the book's metadata is obtained via the more expressive API,
which will produce more selective results and hence make query execution more efficient.

In the example above, the more expressive book API is picked over the separate document for data access,
as it results in more efficient query execution.
While it may seem attractive to always expose data over more expressive APIs,
there are [some trade-offs](https://linkeddatafragments.org/publications/jws2016.pdf) to keep in mind before doing that.
Often, the more expressive API, the cheaper it is for a query engine to make use of it.
On the other hand, the more expressive the API, the more costly it is to publish the API on the Web.

In a decentralized Web, it is important that everyone can easily publish there data, without requiring highly complex or expensive software to run on their servers.
Therefore, it is reasonable to consider simple data documents as the *minimal data API*,
since these are the simplest and cheapest method of publishing data.
Therefore, a query engine should always be able to handle query execution over documents.
But if the query engine detects the presence of a more expressive API,
then it might be favourable for performance to use that API instead.
Considering data documents as a minimal data API is fundamental concept of the Web,
so it is reasonable to build upon this concept when designing query execution algorithms,
assuming that more expressive APIs can be used to optimize this process.

TODO: include more references

## Traversing over documents as a basis

If we consider simple data documents as the minimal data API over which query execution must be possible,
then it is important that efficient query execution algorithms are available for this.
Due to the inherently linked nature of (decentralized) knowledge graphs,
the so-called [*Link-Traversal-based Query Processing*](https://www.rubensworks.net/publications/bogaerts_ruleml_2021/) paradigm (a.k.a. link traversal)
becomes possible for this.

Link traversal starts from the assumption that documents are connected to each other via links,
and that queries can be executed over one or more *seed* documents
by iteratively following links between documents.

TODO: figure from https://www.rubensworks.net/raw/slides/2021/ugent-webfundamentals-linktraversal/#

### The problems of Link Traversal 

The research field of link traversal is still relatively new,
so there are many open problems that remain to be solved before it can be used for effective query execution in practise.
There are two primary problems that are often attributed to link traversal: speed and termination.

**Speed**

Link traversal is inherently slower compared to query execution over a single API in which all the required data is contained.
Obviously, if such a single API is possible and available, then it is a preferred target for querying over.
However, in a decentralized Web, such APIs may become uncommon, or even impossible due to legal and privacy reasons.
Therefore, link traversal –even though it can not be as fast–, may be the only remaining alternative.

However, I believe significant improvements are possible by [prioritizing certain links or documents over others](https://link.springer.com/chapter/10.1007/978-3-319-46523-4_19),
by introducing new prioritization strategies such as:

* **Similarity**: prefer documents or links that are "similar" to other query-relevant documents.
* **Rountrip time or document size**: prefer documents that are faster to download.
* **Historical relevancy**: for queries that are re-executed, prefer documents that contained the most query-relevant data the last time.
* **Collaboration**: prefer documents that were relevant for your peers, such as your friends or family.

**Termination**

Since [the number of documents on the Web is massive](https://www.worldwidewebsize.com/),
and each document usually contains links to multiple other documents,
the theoretical upper limit of the query execution range is the full Web.
Since querying the full Web in a live manner for every query is unfeasible when fast results are desired,
some kind of termination strategy needs to be in place for stopping query execution until some threshold is reached,
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

### Coping with these problems

Ideally, the problems of speed and termination should be fully resolved.
Given the concept of link traversal, it is more reasonable to assume that these issues may be optimized,
but the problems will never fully resolved.
Therefore, it may be beneficial to start thinking about ways to cope with these problems, in addition to trying to solve them.

A first way of coping with these problems is through *result streaming*.
This involves a query execution process happens in an iterative lazy manner, where results are only calculated once the consumer needs them.
For example, this allows a social network application to trigger a query for obtaining all posts of your friends,
but the query engine only produces those results that are required for visualizing the posts.
As soon as the users scrolls down to view the next posts, the query engine would calculate and return those next results.

A second coping mechanism is to enable query engines to return *partial or approximate results*.
Many querying algorithms execute a query plan in an iterative manner,
which means that internal intermediary results already contain part of the query answer,
which are not returned to the end user until the complete result is computed.
In the case of link traversal where full result computation may require the lookup of many more links,
it may desirable to return these partial results to the end-user as soon as possible.
For example, social network applications may start visualizing posts as soon as their text contents are available,
even though the number of likes and reactions still need to be computed.
A second example is where the number of likes on a post may still be an approximation,
and the query engine still has to make the number more exact at a later point in time.

A third coping mechanism is similar to the second one, and involves the query engine returning *probabilistic results*.
[Certain mechanisms](https://linkeddatafragments.org/publications/iswc2015-amf.pdf) exist that allow query results to be produced very quickly, but without < 100% certainty.
Afterwards, these results still need to be confirmed before one can be certain of them being an actual result.
In the context of link traversal, these concepts can be applied to emit these probabilistic results to the end-user as soon as possible,
where the query engine either confirms or retracts those results at a later point in time.
For example, a social network application may enable the visualization of all friends of your friends,
which may during the computation phase still show some people as being a friend of a friend with a certain chance,
until they can be confirmed by the query engine.

## Beyond Link Traversal

TODO:
- Pure data documents will be too slow in some cases => stepping away from pure link traversal towards hybrid and exploit indexes
- Auxiliary indexes: summaries and aggregators
- => issue of privacy preservation
- TREE, ShapeTrees => pruning and prioritization
- SPARQL endpoints, TPF, ...
- Collaborative querying

## Conclusions

TODO:
- Comunica; personal query engine
- Open research questions
- Join us: SolidLab
