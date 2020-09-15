---
layout:      post
categories:  blog
tags:        [ rdf, javascript, node, linked data ]
comments:    true
title:       "Who says using RDF is hard?"
subtitle:    "A brief overview on RDF and Linked Data development in JavaScript."
date:        2019-10-06 15:00:00 +0200
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
and how to execute queries over them.
I offer some concrete examples for each aspect using existing tools.
It is not my aim to discuss all the available tooling,
but instead to present the general idea,
and to give pointers to tools that could be used for this.

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
and the continuously improving JavaScript language powered by the help of [Babel](https://babeljs.io/).
For these reasons and more, JavaScript is an ideal platform for RDF application development that offers a lot of flexibility.

### RDFJS

<img src="/img/blog/rdfjs.png" alt="RDFJS" style="width: 23%; float: left; margin-right: 15px" />

Since 2018, the community has converged to a couple of specifications for enabling interoperability between different JavaScript applications,
under the name of [RDFJS](http://rdf.js.org/).
Today, most of the popular JavaScript libraries adhere to these specifications,
which makes it possible to use them interchangeably, and in any combination.
This allows you to for example use an RDF parser from one developer,
and pipe its output into an RDF store from another developer.

The foundational part of RDFJS is its [low-level **data model** specification](http://rdf.js.org/data-model-spec/),
in which JavaScript interfaces are described for representing **RDF terms** and **RDF quads**.
Five types of terms exist:

* [Named Node](http://rdf.js.org/data-model-spec/#namednode-interface): Represents a thing by IRI, such as `https://www.rubensworks.net/#me`.
* [Blank Node](http://rdf.js.org/data-model-spec/#blanknode-interface): Represents a thing without an explicit name.
* [Literal](http://rdf.js.org/data-model-spec/#literal-interface): Represents a raw value of a certain datatype, such as `"Ruben"` or `1992`.
* [Variable](http://rdf.js.org/data-model-spec/#variable-interface): Represents a variable, which can be used for matching values within queries.
* [Default Graph](http://rdf.js.org/data-model-spec/#defaultgraph-interface): Represents the default graph in RDF. Other graphs can be represented with named or blank nodes.

[RDF quads](http://rdf.js.org/data-model-spec/#quad-interface) are defined as an object with RDF terms for **subject**, **predicate**, **object** and **graph**.
An RDF triple is an alias of a quad,
where the graph is set to the default graph.
For the remainder of this document, I will just refer to RDF quads.

Finally, a [Data Factory](http://rdf.js.org/data-model-spec/#datafactory-interface) interface is defined,
which allows you to easily create terms and quads that conform to this interface.
Different Data Factory implementations exist, such as [`rdf-data-factory`](https://www.npmjs.com/package/rdf-data-factory)
and the factory from [`N3.js`](https://github.com/rdfjs/N3.js#interface-specifications).
For example, creating a quad for representing someone's name with a data factory can be done like this:

```javascript
import { DataFactory } from 'rdf-data-factory';

const factory = new DataFactory();

const quad = factory.quad(
  factory.namedNode('https://www.rubensworks.net/#me'), // subject
  factory.namedNode('http://schema.org/name'),          // predicate
  factory.literal('Ruben')                              // object
);
```

Reading raw values from the quad can be done as follows:

```javascript
quad.subject.value === 'https://www.rubensworks.net/#me';
quad.predicate.value === 'http://schema.org/name';
quad.object.value === 'Ruben';
```

For checking whether or not quads and terms are equal to each other, the `equals` method can be used:

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

While there are general-purpose RDF(JS) libraries available
such as [`rdflib`](https://github.com/linkeddata/rdflib.js) and [`rdf`](https://github.com/awwright/node-rdf),
I will focus on dedicated tools with scoped functionality for the remainder of this post.
Since they all conform to the RDFJS interfaces, they can however be used interchangably.

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
then the stream-based `import` method may be used instead:
```javascript
const rdfParser = require("rdf-parse").default;
const quadStream = rdfParser.parse(fs.createReadStream('cartoons.ttl'),
  { contentType: 'text/turtle' });

store.import(quadStream)
  .on('end', () => console.log('Stream has been imported'));
```

In cases you quickly need to create a new store for a quad stream,
then [`rdf-store-stream.js`](https://github.com/rubensworks/rdf-store-stream.js) can be used as a convenience tool:
```javascript
const storeStream = require("rdf-store-stream").storeStream;

const store = await storeStream(quadStream);
```

### Looking Up Quads

Looking up quads can be done through quad pattern-matching using the `match` method from the [RDFJS Source interface](https://rdf.js.org/stream-spec/#source-interface),
where any of the quad components can be left `undefined` (or `null`) to allow anything to match with it.
Since real-world RDF graphs are typically very large,
lookups typically happen **asynchronously** so that matched quads can be processed in a memory-efficient manner as soon as they are discovered.
For this, the `match` method returns a [stream of RDF quads](https://rdf.js.org/stream-spec/#stream-interface).
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

Resulting quads streams can be used for various things,
such as creating a new `N3.Store`,
or [serializing it to a Turtle file](https://github.com/rdfjs/N3.js#writing):

```javascript
quadStream
  .pipe(new N3.StreamWriter())
  .pipe(fs.createWriteStream('data.ttl'));
```

If your application does not require stream-based processing,
and you just want to retrieve an array of quads,
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
On average, storing ten million triples requires around 1GB of memory, which should still be achievable on average hardware.
However, one hundred million triples may already be too much for average harware (~10GB).
For these cases, dedicated on-disk tools may be preferable,
such as the LevelDB-based [`node-quadstore`](https://github.com/beautifulinteractions/node-quadstore),
or via highly compressed read-only [HDT files](http://www.rdfhdt.org/) ([Node.JS bindings](https://github.com/RubenVerborgh/HDT-Node)).

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
These URIs can be **dereferenced** to look up its contents.
Since RDF on the Web exists in various RDF serializations
such as [Turtle](https://en.wikipedia.org/wiki/Turtle_(syntax)), [RDFa](https://rdfa.info/), and [JSON-LD](https://json-ld.org/),
the dereferencing of RDF involves picking the correct parser for the returned RDF serialization.

Concretely client-side RDF dereferencing for a given URI typically involves the following steps:

1. Determine the **media types** from the available RDF parsers, such as `text/n3` or `text/html`.
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

While the previous two sections discussed the low-level handling of RDF on quad-level,
this section focuses more on the **linked** aspect of RDF data.
Concretely, I discuss some techniques for querying through RDF graphs
by looking up information across multiple quads.

The process of querying is typically handled by a **query engine**
that accepts a query in some kind of declarative language,
and returns the results in a certain format.
While there are several techniques out there to query RDF,
I will focus on three query languages that have different goals:

* [LDflex](https://github.com/RubenVerborgh/LDflex): A JavaScript-based domain-specific language for simple writing path-based expressions.
* [GraphQL-LD](https://github.com/rubensworks/GraphQL-LD.js): An extension of the [GraphQL](https://graphql.org/) query language for querying Linked Data.
* [SPARQL](https://www.w3.org/TR/sparql11-query/): The standard for querying RDF as recommended by the World Wide Web Consortium.

These three languages differ in terms of their **query expressivity** (the variety of possible queries) and **developer complexity** (how easy queries can be written).
While LDflex is the easiest to use, it offers the least expressive power.
SPARQL on the other hand offers the most expressivity, but is typically harder to use.
GraphQL-LD can be seen a trade-off between both.
Depending on the application, any of these can be used, even in combination.
Hereafter, I give some examples for each of them.

<img src="/img/blog/queryexpressivitycomplexity.svg" alt="Query expressivity and developer complexity" style="width: 100%" />

### LDflex

When you need to look up data that can be represented by a single **chain of properties**,
then [LDflex](https://github.com/RubenVerborgh/LDflex) is probably the easiest way to do this.
LDflex has been designed to look like the traversal of a JavaScript object,
while instead this traversal is internally translated to a SPARQL query using a [JSON-LD context](https://json-ld.org/).
This SPARQL query is then delegated to a third-party query engine such as [Comunica](https://comunica.linkeddatafragments.org/) for execution.

For example, finding the names of all the friends of `https://www.rubensworks.net/#me`
that are listed in `https://www.rubensworks.net/` can be done as follows:

```javascript
const { PathFactory } = require('ldflex');
const { default: ComunicaEngine } = require('ldflex-comunica');

// Setup path expression
const context = {
  "@context": {
    "@vocab": "http://xmlns.com/foaf/0.1/",
    "friends": "knows",
  }
};
const paths = new PathFactory({
	context,
	queryEngine: new ComunicaEngine('https://www.rubensworks.net/'),
});
const person = paths.create({ subject: 'https://www.rubensworks.net/#me' });

// Execute expressions
(async function() {
  console.log(await person.name + ' is friends with:');
  for await (const name of person.friends.givenName)
    console.log('- ' + name);
})();
```

Similar tools like this exists for traversing local RDF graphs instead of remote graphs,
such as [`rdf-object.js`](https://github.com/rubensworks/rdf-object.js),
[`simplerdf`](https://github.com/simplerdf/simplerdf) and [`clownface`](https://github.com/rdf-ext/clownface).

### GraphQL-LD

If single chained properties are not sufficient and you need to retrieve multiple values of things,
then a **tree-based** query language as provided by [GraphQL](https://graphql.org/) may be more appropriate.
It allows multiple values to be retrieved via a single query,
instead of having to write several separate ones.

[GraphQL-LD](https://github.com/rubensworks/GraphQL-LD.js) is a technique that allows Linked Data to be queried using GraphQL queries,
by enhancing it with a [JSON-LD context](https://json-ld.org/), similar to LDflex.
Internally, queries are also translated to SPARQL and delegated to a third-party query engine.

Below, you can see an example on how you can retrieve my name, image and friends using a single query:
```javascript
import {Client} from "graphql-ld";
import {QueryEngineComunica} from "graphql-ld-comunica";

// Setup the client
const context = {
  "@context": {
    "Ruben": "https://www.rubensworks.net/#me",
    "foaf": "http://xmlns.com/foaf/0.1/",
    "name": "foaf:name" ,
    "image": "foaf:img",
    "friends": "foaf:knows" 
  }
};
const client = new Client({
  context,
  queryEngine: new QueryEngineComunica({
    sources: ['https://www.rubensworks.net/'],
  }),
});

// Define and execute a query
const query = `{
  id(_:Ruben)
  name @single
  image @single
  friends {
    name @single
  }
}`;
const { data } = await client.query({ query });
```

The returned data will resemble the query structure as follows:

```json
{
  "name": "Ruben Taelman",
  "image": "https://www.rubensworks.net/img/ruben.jpg",
  "friends": [
    { "name": "Anastasia Dimou" },
    { "name": "Ben De Meester" },
    { "name": "Brecht Van de Vyvere" },
  ]
}
```

### SPARQL

When neither single path expressions or tree-based queries are sufficient for you use case,
then the **highly-expressive** SPARQL query language probably will meet your needs.
At the cost of a more complex language, it offers many features
such as [graph-based pattern matching](https://www.w3.org/TR/sparql11-query/#GraphPattern),
[filtering](https://www.w3.org/TR/sparql11-query/#expressions),
[aggregation](https://www.w3.org/TR/sparql11-query/#aggregates),
[negation](https://www.w3.org/TR/sparql11-query/#negation),
[optionals](https://www.w3.org/TR/sparql11-query/#optionals),
[subqueries](https://www.w3.org/TR/sparql11-query/#subqueries),
[constructing RDF triples](https://www.w3.org/TR/sparql11-query/#construct),
and [more](https://www.w3.org/TR/sparql11-query/).

[**Comunica**](https://comunica.linkeddatafragments.org/) is a query engine platform for Web querying in JavaScript.
It is not a query engine by itself, but a **framework to build query engines**.
Due to its flexibility and configurability, it can be used for a variety of use cases.
This is also why it is used internally for the underlying query engines in LDflex and GraphQL-LD.

[`@comunica/actor-init-sparql`](https://github.com/comunica/comunica/tree/master/packages/actor-init-sparql)
is one example of a Comunica engine that has been built to support SPARQL queries.
It can be used as follows to lookup my name and ten of my friends:

```javascript
const newEngine = require('@comunica/actor-init-sparql').newEngine;
const myEngine = newEngine();

const config = { sources: ['https://www.rubensworks.net/'] };
const query = `
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT * WHERE {
  <https://www.rubensworks.net/#me> foaf:name ?name.
  {
    SELECT ?friendName WHERE {
      <https://www.rubensworks.net/#me> foaf:knows [
          foaf:name ?friendName
      ].
    } LIMIT 10
  }
}`;

const { bindingsStream } = await myEngine.query(query, config);
bindingsStream.on('data', (data) => console.log(data.toObject()));
bindingsStream.on('end', () => console.log('Done!'));
```

Note that the configuration object supports multiple sources,
which enables queries across multiple datasets.
This allows you to for example find the common interests of [Ruben Verborgh](https://ruben.verborgh.org/) and myself,
and fetch the interest labels from [DBpedia](https://wiki.dbpedia.org/):

```javascript
const config = { sources: [
  'http://fragments.dbpedia.org/2016-04/en',
  'https://ruben.verborgh.org/profile/',
  'https://www.rubensworks.net/',
] };
const query = `
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?interestName
WHERE {
  ruben:me foaf:topic_interest ?interest.
  rubent:me foaf:topic_interest ?interest.
  ?interest rdfs:label ?interestName.
  FILTER LANGMATCHES(LANG(?interestName),  "EN")
}`;
```

_Next to querying over URI-based sources, it is also possible to query over [local sources](https://github.com/comunica/comunica/tree/master/packages/actor-init-sparql-file) or in-memory [RDFJS sources](https://github.com/comunica/comunica/tree/master/packages/actor-init-sparql-rdfjs)._

## Future RDF Tooling

While we have come a long way for handling RDF in JavaScript,
technology always keeps evolving.
In the future, we will most likely see a shift
towards more [**query-driven applications**](https://ruben.verborgh.org/blog/2017/12/20/paradigm-shifts-for-the-decentralized-web/#interfaces-become-queries),
where query engines gain more responsibility for handling complex tasks.
This will allow applications to define their queries and sources,
and **query engines will take care of all the complexities** for resolving the query,
such as query optimization, source selection, resulting joining, authentication against sources, traversal of links, reasoning, and more.
Current query engines can already perform some of these tasks,
but **more research and development effort is needed** for things such as source selection and link traversal,
which are part of my [personal research and development goals](/research_goals/#querying-linked-data) for the upcoming years.
