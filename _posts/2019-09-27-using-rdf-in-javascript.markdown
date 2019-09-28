---
layout:      post
categories:  blog
tags:        [ rdf, javascript, node, linked data ]
comments:    true
title:       "Who says using RDF is hard?"
subtitle:    "A brief overview on RDF and Linked Data development in JavaScript."
date:        2019-09-28 10:00:00 +0200
---
<p class="post-abstract" markdown="1">
The [Linked Data](https://www.w3.org/DesignIssues/LinkedData.html) ecosystem
and [RDF](https://www.w3.org/TR/rdf11-concepts/) as its graph data model have been around for many years already.
Even though there is an increasing interest in knowledge graphs,
many developers are scared off by RDF due to its reputation of being *complicated*.
In this post, I will show some concrete examples on how RDF can be used in JavaScript applications,
to illustrate that RDF is actually pretty easy to work with if you use the right tools.
Concretely, this post covers the fundamentals of RDF in JavaScript,
how to create RDF graphs yourself,
how to retrieve them from the Web,
and how to execute complex queries over them.
</p>
<!--more-->

## Why JavaScript?

The [RDF specification](https://www.w3.org/TR/rdf11-concepts/) describes itself as *"a framework for representing information in the Web"*,
which makes the Web an essential component in this story.
The primary programming language for the Web is JavaScript,
where it can be used for both client-side and [server-side applications](https://nodejs.org/en/).
Furthermore, JavaScript has become increasingly popular in the recent years,
with the highly-performant [V8 engine](https://v8.dev/) that can run JavaScript on clients and servers,
the [npm package manager](https://www.npmjs.com/),
front-end frameworks such as [React](https://reactjs.org/) and [Angular](https://angular.io/),
[TypeScript](https://www.typescriptlang.org/) as a typed superset of JavaScript,
and a continuously improving language powered by the help of [Babel](https://babeljs.io/).
For these reasons and more, JavaScript is an ideal platform for RDF application development that offers a lot of flexibility.

### RDFJS

Since 2018, the community has converged to a couple of specifications for enabling interoperability between different JavaScript applications,
under the name of [RDFJS](http://rdf.js.org/).
Today, most of the popular JavaScript libraries adhere to these specifications,
which makes it possible to use them interchangeable, and in any combination.
This allows you to for example use an RDF parser from one developer,
and pipe its output into an RDF store from another developer.

The foundational part of RDFJS is its [low-level **data model** specification](http://rdf.js.org/data-model-spec/),
in which JavaScript interfaces are described for representing **RDF terms** and **RDF quads**.
Five types of terms exist:

* [Named Node](http://rdf.js.org/data-model-spec/#namednode-interface): Represents a thing by IRI, such as `https://www.rubensworks.net/#me`.
* [Blank Node](http://rdf.js.org/data-model-spec/#blanknode-interface): Represents a thing without an explicit name.
* [Literal](http://rdf.js.org/data-model-spec/#literal-interface): Represents a raw value of a certain datatype, such as `"Ruben"` or `1992`.
* [Variable](http://rdf.js.org/data-model-spec/#variable-interface): Represents a variable, which can be used for matching values with in queries.
* [Default Graph](http://rdf.js.org/data-model-spec/#defaultgraph-interface): Represents the default graph in RDF. Other graphs can be represented with named or blank nodes.

[RDF quads](http://rdf.js.org/data-model-spec/#quad-interface) are defined as an object with RDF terms for **subject**, **predicate**, **object** and **graph**.
An RDF triple is a simpler form of a quad,
where the graph is set to the default graph.

Finally, a [Data Factory](http://rdf.js.org/data-model-spec/#datafactory-interface) interface is defined,
which allows you to easily create terms and quads that conform to this interface.
Different Data Factory implementations exist, such as [`@rdfjs/data-model`](https://github.com/rdfjs-base/data-model)
and the factory from [`N3.js`](https://github.com/rdfjs/N3.js#interface-specifications).
For example, creating a triple representing someone's name with a data factory can be done as follows:

```javascript
factory.quad(
  factory.namedNode('https://www.rubensworks.net/#me'),
  factory.namedNode('http://schema.org/name'),
  factory.literal('Ruben')
);
```

Next to the RDFJS data model,
separate specifications exist for handling [RDF streams](http://rdf.js.org/stream-spec/)
and [high-level datasets](https://rdf.js.org/dataset-spec/).
An overview of all JavaScript libraries that support any of the RDFJS specifications can be found on [https://rdf.js.org/](https://rdf.js.org/).

## Creating RDF graphs

TODO

## Dereferencing RDF graphs

TODO

## Querying RDF graphs

TODO
