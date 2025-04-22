---
layout:      post
categories:  blog
tags:        [ querying, javascript, modular, decentralization, centralization, knowledge graphs, rdf, linked data ]
comments:    true
title:       "The cost of modularity in SPARQL"
subtitle:    "How much do modularity and decentralization conflict with centralized speed?"
date:        2025-04-22 09:25:00 +0200
feature_img: /img/blog/red-car-sunset.jpg
---
<p class="post-abstract" markdown="1">
The JavaScript-based Comunica SPARQL query engine is designed for querying over decentralized environments,
e.g. through federation and link traversal.
In addition, it makes use of a modular architecture to achieve high flexibility for developers.
To determine the impact of these design decisions,
and to be able to put the base level performance of Comunica in perspective,
I compared its performance to state-of-the-art centralized SPARQL engines in terms of querying over *centralized* Knowledge Graphs.
Results show that Comunica can closely match the performance of state-of-the-art SPARQL query engines,
despite having vastly different optimization criteria.
</p>
<!--more-->

In this post, I want to share some development insights about the [Comunica](https://comunica.dev/) query engine,
which I started developing in 2017, and has been evolving ever since.
This post starts by discussing the motivations of Comunica,
and what its primary optimization criteria are.
Next, the reasons for using JavaScript are discussed.
Finally, some results are presented about the performance of Comunica compared to state-of-the-art SPARQL query engines that focus on centralized datasets.

<img src="/img/blog/scale-modularity-decentralization-perf.png" alt="A scale balancing modularity, decentralization, and centralized performance" class="feature-img" />

<p>
<center><em>How far can we get in terms of centralized querying performance with a modular SPARQL query engine that is designed for decentralized environments?</em></center>
</p>

## Building a modular query engine for the Web

Back in 2018, Comunica was introduced to the scientific community through a [research article at the ISWC conference](https://comunica.github.io/Article-ISWC2018-Resource/).
In this article, Comunica was introduced as a framework for querying across *federations of Knowledge Graphs that are spread across the Web*,
even if these Knowledge Graphs are hosted through different *heterogeneous APIs*.
In addition, it was designed to be *flexible for researchers* to easily implement and compare different query algorithms through a highly modular architecture.
As such, it provide an experimentation framework to make easier and faster advancements the domains of [federated](http://iswc2011.semanticweb.org/fileadmin/iswc/Papers/Research_Paper/05/70310592.pdf) and [link traversal query processing](https://www.rubensworks.net/publications/bogaerts_ruleml_2021/).
This allows different algorithms to be compared to each other within the same framework in a fair manner,
without the danger of experimental results being impacted by confounding variables,
such as differences in programming language runtimes.

Today, these are still the primary motivations, as they are [highlighted as such on the Comunica homepage](https://comunica.dev/).
One thing that has changed, is that while originally Comunica was only targeted at researchers,
Comunica has also been gaining increasing adoption outside of the research community.
For this reason, the [Comunica Association](https://comunica.dev/association/) was launched in 2022
as a non-profit organization to ensure the long-term maintenance and development of Comunica.
As such, Comunica now aims to be flexible for all kinds of users,
while at the same time being ready for practical use.

## Why JavaScript?

A common question I get when discussing the motivations behind Comunica is *"Why JavaScript? Isn't it slow?"*.
While this is a loaded question, the answer is a bit nuanced.
Besides performance, there are other –possibly conflicting– requirements that must be taken into account.
For Comunica, we have the following requirements that are relevant for choosing a programming language:

1. Execution in Web applications
2. Flexibility and high developer producivity
3. Good performance

For the first requirement, we consider both client-side applications in the Web browser and server-side applications on Web servers.
While execution in Web browsers has long restricted once's choice in programming language to JavaScript,
[WebAssembly](https://webassembly.org/) in recent years established itself to allow other programming languages to be ported to the browser as well.
While it promises higher performance than JavaScript, it still has some limitations such as
not being able to access the DOM, and
[having strict memory bounds](https://github.com/WebAssembly/design/issues/1397).
For data-intensive applications that require interaction with the DOM through JavaScript,
data needs to be transfered from WebAssembly-land to JavaScript-land,
[which can become expensive](https://libstore.ugent.be/fulltxt/RUG01/003/063/185/RUG01-003063185_2022_0001_AC.pdf).
Neverheless, these limitations may be resolved in the future.
So in this regard, any language that can be compiled to WebAssembly could become a valid alternative.

For the requirements of flexibility and fast development,
scripting languages such as JavaScript, Python, Ruby, and PHP are highly popular.
Most scripting languages are dynamically typed,
which allows the developer to spend less time of writing out explicit type declarations.
Furthermore, scripting languages are interpreted or JIT compiled,
which allows developers to quickly make changes to code without being blocked by long compilation times.
This also allows developers to more easily debug code,
as they can even make temporary changes in the source code of libraries they depend on,
which is hard to do when working with compiled languages.
Finally, scripting languages tend to allow both object-oriented and functional programming paradigms,
to give further flexibility to developers.

Good performance is important for Comunica,
but it's placed at position 3 in the list of requirements.
Since high performance tends to conflict with the other requirements, we have to make trade-offs between them.
This means that given the needs for execution in Web applications, flexibility, and fast development,
we must achieve a level performance that is as high as possible.

Given all these requirements, I consider JavaScript runtimes as the perfect middle ground.
First, JavaScript has been specifically designed for running in Web environments,
and since the introduction of runtime environments such as [Node.js](https://nodejs.org/),
JavaScript can run *anywhere*, even outside of the browser.
Second, since it runs directly from source files,
it excels in high developer producivity.
And if your project reaches a certain size, you can consider introducing [TypeScript](https://www.typescriptlang.org/) to get type-safety when needed (which is what Comunica uses).
Third, since the introduction of the [V8 engine](https://v8.dev/),
JavaScript execution has become [*extremely fast*](https://v8.dev/blog/10-years)
thanks to its JIT compilation.
This is in contrast to the old days, when JavaScript execution used to be very slow due to all engines being purely interpreter-based.
While JIT code will never be as fast as fully compiled code,
it can get very close with some [basic understanding of the optimizing compilers in JIT engines](https://www.youtube.com/watch?v=XAqIpGU8ZZk).

## What is the impact on performance?

While the requirements of Web execution and high developer productivity are considered more important than performance for Comunica,
the question rises as to how performant we can get based on these restrictions?

To answer this question, one would to have to implement algorithmically identical versions of the same software in different languages, which is difficult to near impossible.
What we can do instead, is compare Comunica against similar query engines, and run identical query workloads over them.
Unfortunately, no production-ready equivalents to Comunica currently exist that focus on decentralization.
Or in other words, no other production-ready engines exist that are able to perform federated SPARQL queries over heterogeneous APIs.
The closest we can get, is to compare Comunica to SPARQL engines that are designed for a single data store in a centralized setting.
While querying with Comunica in a centralized setting is possible,
it's archicture is optimized for federation over remote sources,
so Comunica will inherently at a disadvantage.
For example, Comunica optimizes for early result arrival times through [pipelining](https://www.geeksforgeeks.org/pipeline-in-query-processing-in-dbms/), as opposed to fast complete results.
While the former is more useful in a distributed environment, the latter is often preferred in a centralized setting.
Furthermore, Comunica has a modular plug-and-play architecture in which modules are loosely coupled,
which defers selection of relevant actors to process each operator to execution time.
This can come with performance overhead compared to more tighly coupled architectures.

### Experimental setup

To perform this comparison,
I ran both the [Berlin SPARQL benchmark](http://wbsg.informatik.uni-mannheim.de/bizer/berlinsparqlbenchmark/)
and the [WatDiv benchmark](https://dsg.uwaterloo.ca/watdiv/) at multiple scales.
The following engines were compared:

- [Comunica Memory](https://github.com/comunica/comunica/tree/master/engines/query-sparql#readme) (`@comunica/query-sparql` v4.2.0) using [in-memory triple store](https://github.com/rubensworks/rdf-stores.js).
- [Comunica HDT](https://github.com/comunica/comunica-feature-hdt/tree/master/engines/query-sparql-hdt#readme) (`@comunica/query-sparql-hdt` v4.0.2) using an [HDT-based triple store](https://www.rdfhdt.org/).
- [Jena Fuseki](https://jena.apache.org/) (v4.8.0): A Java-based engine.
- [Blazegraph](https://blazegraph.com/) (v2.1.5): A Java-based engine.
- [GraphDB](https://graphdb.ontotext.com/) (v10.6.4): A Java-based engine.
- [Virtuoso](https://vos.openlinksw.com/owiki/wiki/VOS/VOSSPARQL) (v7.2.14): An engine that translates SPARQL queries to SQL.
- [Oxigraph](https://github.com/oxigraph/oxigraph) (v0.4.9): A Rust-based engine.
- [QLever](https://github.com/ad-freiburg/qlever/) ([22 February 2025](https://github.com/ad-freiburg/qlever/commit/8fe0642)): A C++-based engine.

In contrast to all other approaches, Comunica does not ship with a dedicated persisted triple store,
but an [in-memory triple store](https://github.com/rubensworks/rdf-stores.js) or an external [HDT file](https://www.rdfhdt.org/) could be plugged in.
All experiments were executed on a 64-bit Ubuntu 14.04 machine with 128 GB of memory and a 24-core 2.40 GHz CPU,
and are [fully reproducible](https://github.com/comunica/Experiments-Centralized).
All experiments were preceded with a warmup of five runs,
and all execution times were averaged over ten runs.

### BSBM Results

Below, execution times can be found for the Berlin SPARQL benchmark for an increasing dataset scale.
QLever is not included in this benchmark, since the BSBM benchmark runner requests results as SPARQL/XML,
which was not supported by QLever at the time of writing.
Query 6 is not included, because it was removed from the benchmark.
Query 7 is also not included, as it uses the <code>DESCRIBE</code> keyword, which is not normatively defined in the SPARQL specification, so different engines can have different implementations, leading to performance differences.
For the largest BSBM scale that was run (100K), Comunica-Memory is not included due to memory issues.

<div class="plot">
	<div class="plot-figures">
		<div><img src="/img/blog/cost-modularity-sparql/bsbm-1k/plot_small.svg" alt="BSBM 1k small" /></div>
		<div><img src="/img/blog/cost-modularity-sparql/bsbm-1k/plot_large.svg" alt="BSBM 1k large" /></div>
	</div>
<strong>Figure 1</strong>: BSBM with 1K resources (0,35M triples).
</div>

<div class="plot">
		<div class="plot-figures">
			<div><img src="/img/blog/cost-modularity-sparql/bsbm-10k/plot_small.svg" alt="BSBM 10k small" /></div>
			<div><img src="/img/blog/cost-modularity-sparql/bsbm-10k/plot_large.svg" alt="BSBM 10k large" /></div>
		</div>
<strong>Figure 2</strong>: BSBM with 10K resources (3,5M triples).
</div>

<div class="plot">
		<div class="plot-figures">
			<div><img src="/img/blog/cost-modularity-sparql/bsbm-100k/plot_small.svg" alt="BSBM 100k small" /></div>
			<div><img src="/img/blog/cost-modularity-sparql/bsbm-100k/plot_large.svg" alt="BSBM 100k large" /></div>
		</div>
<strong>Figure 3</strong>: BSBM with 100K resources (35M triples).
</div>

### WatDiv Results

Below, execution times can be found for the WatDiv benchmark for an increasing dataset scale.
For the largest WatDiv scale that was run (100K), Comunica-Memory is not included due to memory issues.

<div class="plot">
		<div class="plot-figures">
			<div><img src="/img/blog/cost-modularity-sparql/watdiv-10/plot_small.svg" alt="WatDiv 10 small" /></div>
			<div><img src="/img/blog/cost-modularity-sparql/watdiv-10/plot_large.svg" alt="WatDiv 10 large" /></div>
		</div>
<strong>Figure 4</strong>: WatDiv at scale 10 (1M triples).
</div>

<div class="plot">
		<div class="plot-figures">
			<div><img src="/img/blog/cost-modularity-sparql/watdiv-100/plot_small.svg" alt="WatDiv 100 small" /></div>
			<div><img src="/img/blog/cost-modularity-sparql/watdiv-100/plot_medium.svg" alt="WatDiv 100 medium" /></div>
			<div><img src="/img/blog/cost-modularity-sparql/watdiv-100/plot_large.svg" alt="WatDiv 100 large" /></div>
		</div>
<strong>Figure 5</strong>: WatDiv at scale 100 (10M triples).
</div>

### Discussion

Despite Comunica being designed for querying over remote sources,
and prioritizing flexibility over performance,
it still performs reasonably well in a centralized setting.
While it is not the goal of Comunica to outperform engines that focus on a centralized dataset,
it manages to perform similar to Java-based engines on most queries.
Fully compiled engines such as Oxigraph and QLever mostly (but not always) outperform Comunica and Java-based engines.

For larger dataset sizes (10M-35M triples), Comunica starts experiencing overhead from data crossing the V8/C++ barrier
when requesting large numbers of intermediate results from HDT.
At these dataset scales, a dedicated persisted triple store for Comunica could avoid this overhead.
But this is currently not a primary aim of Comunica.

In general, the JavaScript-based Comunica engine can perform similar to Java-based engines,
despite Java benefiting from compilation source code to byte code (after which JIT compilation occurs to machine code),
while JavaScript runtimes do JIT compilation from source to machine code.
In a general sense, this indicates that the JIT of the V8 engine appears to lead to similar levels of performance as the JIT of Java runtimes.
But if high performance is absolutely critical, then no JIT environment can beat a fully compiled engine (such as Oxigraph and QLever) on average.

In summary, this analysis shows that despite Comunica's focus on execution over decentralized environments, with high flexibility, and high developer productivity,
overall performance is still very comparable to state-of-the-art engines that focus on a centralized setting.
So while there is certainly a cost that comes with flexibility and modularity, the impact on performance appears to be smaller than one would initially expect.
