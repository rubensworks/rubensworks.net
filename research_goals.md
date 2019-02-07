---
layout: page
title: Research Goals
permalink: /research_goals/
show_in_nav: false
---

In general, my research concerns <strong>decentralization</strong>, <strong>publication</strong> and <strong>querying</strong> on the <strong>Web</strong>.
<br />
Below, you can find my active [research goals](#research-goals), and related [development goals](#development-goals).
<br />
This page will be updated regularly based on shifts in these goals.

## Research

### Enhancing Link-Traversal-based Query Execution

[Link-Traversal-based Query Execution](https://arxiv.org/abs/1108.6328)
is an alternative query execution paradigm that _follows links_ on the _Web_ to find data,
as opposed to the typical index-based query execution that is typically achieved with SPARQL engines.

My current vision is that *Linked Data documents are the first step towards Linked Data publication on the Web*.
As such, query engines should be able to *at least* query data over such documents.
If a more expressive interface/index is detected, engines can *dynamically* exploit this index to improve querying efficiency.

Plenty of useful research has already been done in this area.
However, there are still plenty of things that need further investigation:

* **Guided Link Traversal**: Can the performance of link-traversal-based query execution be improved by taking into account *metadata* or by exploiting *prior knowledge* about the data.
* **Property-based Link Traversal**: If we ignore the fact that _anyone can say anything about anything_, and instead assume that only _the authorative can say something about itself_, how far can we get in terms of query result completeness?
* **Hybrid Query Execution**: How can link-traversal-based query execution be _combined_ with index-based query execution?

### Querying over Decentralized Data on the Web

[Solid](https://solid.mit.edu/) is pioneering a new way of data storage on the Web.
Instead of having _centralized_ services like Facebook and Instagram to store user data,
Solid allows users to store data themselves in _decentralized_, and _personal_ data _pods_,
while _maintaining full data ownership_.
This, however, brings about a range of new problems to consider when querying over this data,
so that _truly decentralized applications_ can be built.

* How can we query over a **large number of sources** in a scalable way?
* How can users query over data that requires **authentication**? 
* How can a query engine be used to **update** data that is distributed over multiple sources?

### Collaborative Querying of the Web

In most cases, query execution over Linked Data is being done in a single machine.
When starting from the assumption that users execute queries themselves locally in an intelligent agent (such as [Comunica](http://comunica.linkeddatafragments.org/)),
we can imagine that multiple agents may be executing equal or similar queries.
In these cases, such agents may start _collaborating_ with each other (based on some kind of [incentive](https://ruben.verborgh.org/articles/incentivized-collaboration/)), in order to reduce the overall query execution time.
However, there are still a couple of open questions here:

* How can agents **discover** other agents that are executing similar queries in a scalable way?
* How can agents efficiently **exchange** (partial) query results?

### Alternative Languages for Querying Graphs

[SPARQL](https://www.w3.org/TR/2013/REC-sparql11-query-20130321/) is currently the
(only) recommended way of querying graphs that are represented in RDF.
However, outside of the Semantic Web community, there are a wide range of new graph query languages emerging,
such as GraphQL, Cypher and GQL, each having their own advantages.

As such, there is great potential to learn from these query languages,
and to come up with an alternative language for querying RDF.
For example, GraphQL is a developer-friendly language
that can be enhanced with a semantic context to query over RDF,
which is what [GraphQL-LD](https://comunica.github.io/Article-ISWC2018-Demo-GraphQlLD/) does.

There are a couple of open questions related to this:

* What are the essential (and useful) **features** for a graph query language?
* What are the differences in **expressivity** and **complexity** between different graph query languages?
* What kind of query syntax is the most developer-friendly?
* What kind of query result format is the most developer-friendly?

## Development

### Reproducible Experimentation

With [**Comunica**](http://comunica.linkeddatafragments.org/),
we introduced a flexible experimentation platform for Linked Data querying.
Now, we want to take this a step further,
and make it easier to **run reproducible experiments** for Linked Data querying.
Such a tool should lower the effort for running experiments,
and hide repetitive tasks behind automatic scripts.

This requires a couple of things:

* The ability to **configure** an experiment so that _deterministically reproducible experiments_ can be executed.
* Automatically **generating synthentic datasets** and querysets for a query engine.
* **Bootstrapping of multiple machines** for executing queries over. For example, testing the load of 100 clients executing queries against one server.
* Easy **analysis and reporting** of results.
* Output of the whole **provenance chain**, so that the exact circumstances under which an experiment was executed can be shown.

[Comunica Bencher](https://github.com/comunica/comunica-bencher) is a work-in-progress tool that aims to achieve these goals.

### Querying Linked Data

[**Comunica**](http://comunica.linkeddatafragments.org/) is a _modular JavaScript-based framework_ for querying Linked Data on the Web.
On the one hand, this modularity is useful for _research_ purposes, as different querying algorithms can easily be plugged in and compared to each other.
On the other hand, this platform is useful for _Linked Data developers_ as well, as it offers a flexible and expressive way of querying Linked Data over _different kinds_ and _any number of sources_.

Such a framework requires a significant effort for maintenance and the implementation of new functionality.
Some short-term things that are essential for Comunica are the following:

* **Authentication**: To support personalized query results when [querying over decentralized data pods](#querying-over-decentralized-data-on-the-web), Comunica needs to be able to send authenticated requests.
* **Link Traversal**: For [investigating new types of link-traversal-based query execution](enhancing-link-traversal-based-query-execution), we need to support this new paradigm in Comunica.
* **Additional Parsers**: While a lot of (RDF) serializations are already supported by Comunica, there are still several formats out there that you can not query over with Comunica, such as [RDFa](https://rdfa.info/) and [inline JSON-LD](https://json-ld.org/). Adding parsers for these is essential for enabling queries over such sources.

### Academic Articles on the Web

[**ScholarMarkdown**](https://github.com/rubensworks/ScholarMarkdown) is a tool that allows you to write academic articles in the user-friendly Markdown syntax, and automatically generate HTML output with RDFa annotations.
This makes it very easy to self-publish articles directly on the Web.

In order to improve the usefulness of this tool, several things are still needed:

* [Declarative creation of **graphs and diagrams**](https://github.com/rubensworks/ScholarMarkdown/issues/16).
* [Add metadata so that articles become indexed by services like Google Scholar](https://github.com/rubensworks/ScholarMarkdown/issues/13).
* Improve the way how different templates are handled in print-mode.

## Interested?

If you're interested in any of these topics,
and you want to **collaborate**,
or **join our [lab](https://www.ugent.be/ea/idlab/en)** to work on any of these during a **PhD or Master's thesis**,
be sure to [contact me](mailto:rubensworks@gmail.com).
