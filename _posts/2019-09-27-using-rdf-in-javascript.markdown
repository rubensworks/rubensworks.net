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
</p>
<!--more-->

To paraphrase [Dan Brickley and Libby Miller](https://book.validatingrdf.com/bookHtml005.html),
people think using RDF is hard because of its complexity.
However, RDF is actually pretty **simple**, it merely allows you to handle very **complex problems**.
To handle these problems, flexible and expressive tools are needed.
These tools should be easy to use, so that we don't get lost in the complexity of these problems during development.
While there have been calls to [make RDF easier](https://github.com/w3c/EasierRDF),
this post aims to show that RDF is not the problem,
and that good tooling gets us where we want.

Concretely, this post covers the fundamentals of RDF in JavaScript,
how to create RDF graphs yourself,
how to retrieve them from the Web,
and how to execute complex queries over them.
I offer some concrete examples for each aspect using existing tools.
It is not my aim to discuss all the available tooling,
but instead to present the general idea,
and give pointers to tools that could be used for this.

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
For the remainder of this document, I will just refer to RDF quads.

Finally, a [Data Factory](http://rdf.js.org/data-model-spec/#datafactory-interface) interface is defined,
which allows you to easily create terms and quads that conform to this interface.
Different Data Factory implementations exist, such as [`@rdfjs/data-model`](https://github.com/rdfjs-base/data-model)
and the factory from [`N3.js`](https://github.com/rdfjs/N3.js#interface-specifications).
For example, creating a quad representing someone's name with a data factory can be done like this:

```javascript
const factory = require('@rdfjs/data-model');

const quad = factory.quad(
  factory.namedNode('https://www.rubensworks.net/#me'), // subject
  factory.namedNode('http://schema.org/name'),          // predicate
  factory.literal('Ruben')                              // object
);
```

Reading raw values out of the quad can be done as follows:

```javascript
quad.subject.value === 'https://www.rubensworks.net/#me';
quad.predicate.value === 'http://schema.org/name';
quad.object.value === 'Ruben';
```

Checking whether or not quads and terms are equal to each other, the `equals` method can be used:

```javascript
factory.literal('Ruben').equals(factory.literal('Ruben'));  // true
factory.literal('Ruben').equals(factory.literal('Ruben2')); // false
quad.equals(quad); // true
```

Next to the RDFJS data model,
separate specifications exist for handling [RDF streams](http://rdf.js.org/stream-spec/)
and [high-level datasets](https://rdf.js.org/dataset-spec/).
An overview of all JavaScript libraries that support any of the RDFJS specifications can be found on [https://rdf.js.org/](https://rdf.js.org/).
For most of these specifications, corresponding [TypeScript typings exist](https://www.npmjs.com/package/@types/rdf-js),
and many libraries ship with their own typings as well,
which makes RDFJS especially useful if you want to develop more strongly-typed JavaScript applications.

## Creating RDF graphs

Now that we can create RDF quads,
we can start combining them into **RDF graphs**
to represent information and knowledge.
The easiest way to create an RDF graph is using an in-memory datastructure.
[`N3.Store`](https://github.com/rdfjs/N3.js#storing) is an efficient in-memory index for storing RDF,
and doing quad pattern-based lookups.

### Adding Quads

RDFJS quads can be added to the store by calling the `addQuad` method:
```javascript
const N3 = require('n3');
const store = new N3.Store();

store.addQuad(factory.quad(
  factory.namedNode('https://www.rubensworks.net/#me'),
  factory.namedNode('http://schema.org/name'),
  factory.literal('Ruben')
));
store.addQuad(factory.quad(
  factory.namedNode('https://www.rubensworks.net/#me'),
  factory.namedNode('http://schema.org/knows'),
  factory.namedNode('https://ruben.verborgh.org/profile/#me')
));
```

If you have multiple quads to insert, then the array-based `addQuads` may be used instead:
```javascript
// Array-based
store.addQuads([
  quad1,
  quad2,
  quad3,
]);
```

If your quads originate are produced as a stream (like from a [parser](https://www.rubensworks.net/blog/2019/03/13/streaming-rdf-parsers/)),
then the stream-based `import` methods may be used instead:
```javascript
const rdfParser = require("rdf-parse").default;
const quadStream = rdfParser.parse(fs.createReadStream('cartoons.ttl'),
  { contentType: 'text/turtle' });

store.import(quadStream)
  .on('end', () => console.log('Stream has been imported'));
```

In cases you quickly need to create a new store for a quad stream,
then [`rdf-store-stream.js`] can be used as a convenience tool:
```javascript
const storeStream = require("rdf-store-stream").storeStream;

const store = await storeStream(quadStream);
```

### Looking Up Quads

Looking up quads can be done through quad pattern-matching using the `match` method from the [RDFJS Source interface](https://rdf.js.org/stream-spec/#source-interface),
where any of the quad components can be left `undefined` (or `null`) to allow anything to match with it.
Since real-world RDF graphs are typically very large,
lookups typically happen **asynchronously** so that found quads can be processed in a memory-efficient manner as soon as they are discovered.
For this, the `match` method returns a stream of quads,
which is just a [stream that emits RDFJS quads](https://rdf.js.org/stream-spec/#stream-interface).
This stream is compatible with the [Readable stream interface](https://nodejs.org/api/stream.html#stream_readable_streams) of Node.js.

For example, looking up everything with `https://www.rubensworks.net/#me` as subject can be done like this:
```javascript
const quadStream = store.match(
  factory.namedNode('https://www.rubensworks.net/#me')
  // predicate, object, graph arguments are left undefined
);
quadStream
  .on('error', console.error)
  .on('data', (quad) => {
	// Handle our quad...
    console.log(quad);
  })
  .on('end', () => console.log('Done!'));
```

Looking up all the names of `https://www.rubensworks.net/#me` can similarly be done like this:
```javascript
const quadStream2 = store.match(
  factory.namedNode('https://www.rubensworks.net/#me'),
  factory.namedNode('http://schema.org/name')
);
```

If your application does not require stream-based processing,
and you just want to lookup an array of quads,
then the `getQuads` method may be used instead:
```javascript
const quadsArray = store.getQuads(
  factory.namedNode('https://www.rubensworks.net/#me')
);
for (const quad of quadsArray) {
    // Handle our quad...
    console.log(quad);
}
```

_Alternatively, quad streams can be converted to arrays using tools such as [`arrayify-stream`](https://www.npmjs.com/package/arrayify-stream)._

Even though `N3.Store` uses a highly-efficient four-level index to store and lookup RDF quads,
its main restriction is that it stores everything in-memory.
On average, one million triples requires around 100MB,
which means that storing ten million triples should still be achievable on average hardware (~1GB),
but one hundred million triples may already be too much (~10GB).
For these cases, dedicated on-disk tools may be preferable,
such as the LevelDB-based [`node-quadstore`](https://github.com/beautifulinteractions/node-quadstore),
or via highly compressed read-only [HDT files](https://github.com/RubenVerborgh/HDT-Node).

Next to these low-level quad stores,
more high-level datastructures exist, such as the [`Dataset` interface](https://rdf.js.org/dataset-spec/).
This interface offers more convenience features
such as array-like operations, calculating set algebra operations and canonicalization,
at the cost of loosing asynchronicity.
Implementations of this `Dataset` interface exist in [`graphy.js`](https://github.com/blake-regalia/graphy.js)
and [`rdf-dataset-indexed`](https://github.com/rdfjs-base/dataset-indexed).

## Dereferencing RDF graphs

Thanks to the [Linked Data](https://www.w3.org/DesignIssues/LinkedData.html) rules,
RDF is available on the Web behind HTTP URIs, such as `http://dbpedia.org/page/12_Monkeys` or `https://www.rubensworks.net/`.
These URIs can then be **dereferenced** to look up its contents.
Since RDF on the Web exists in various RDF serializations
such as [Turtle](https://en.wikipedia.org/wiki/Turtle_(syntax)), [RDFa](https://rdfa.info/), and [JSON-LD](https://json-ld.org/),
the dereferencing of RDF involves picking the correct parser for the returned RDF serialization.

Concretely RDF dereferencing at a client for a URI typically involves the following steps:

1. Determine the **media types** from the available RDF parsers, such as `text/n3` and `text/html`.
2. Order the media types by **priority**, as different parsers may have different performance requirements.
3. Perform [**content-negotation**](https://developer.mozilla.org/en-US/docs/Web/HTTP/Content_negotiation) for the given URI to [retrieve an appropriate RDF serialization from the server](https://pieterheyvaert.com/blog/2019/02/25/nginx-conneg/).
4. Pick the appropriate RDF **parser** based on the server's returned content type.

If you want to retrieve RDF from the Web,
then these same steps have to be followed every time again.
As such, different tools are available to hide this process so that RDF dereferencing becomes significantly easier.
[`rdf-dereference.js`](https://github.com/rubensworks/rdf-dereference.js/) is a tool that does exactly that.
It accepts a URI, and it outputs an stream of RDF quads:

```javascript
const rdfDereferencer = require("rdf-dereference").default;

const { quads: quadSream } = await rdfDereferencer
  .dereference('http://dbpedia.org/page/12_Monkeys');
quadSream.on('data', (quad) => console.log(quad))
     .on('error', (error) => console.error(error))
     .on('end', () => console.log('Done!'));
```

`rdf-dereference.js` has support for all major RDF serializations using fully spec-compliant streaming parsers, and prioritizes them by parsing efficiency.
Alternatively, if you need more configuration flexibility regarding for instance the serializations you want to support,
then [`@rdfjs/fetch-lite`](https://github.com/rdfjs-base/fetch-lite) can be used.
If you want to take care of HTTP fetching yourself,
and use something more low-level for just parsing in any serialization,
then the [`rdf-parse.js`](https://github.com/rubensworks/rdf-parse.js) can be used.

## Querying RDF graphs

TODO: these were low-level, high-level requires ...
