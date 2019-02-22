---
layout:      post
categories:  blog
tags:        [ rdf, javascript, node, architecture, linked data ]
comments:    true
title:       "A story of streaming RDF parsers"
subtitle:    "How I implemented streaming JSON-LD and RDF/XML parsers in JavaScript."
date:        2019-02-14 13:15:29 +0200
---
<p class="post-abstract" markdown="1">
Multiple serialization formats are currently being recommended by the W3C to represent RDF.
JSON-LD and RDF/XML are examples of RDF serializations that are respectively based on the JSON and XML formats.
The ability to parse RDF serializations in a *streaming* way offers many advantages,
such as handling huge documents with only a limited amount of memory,
and processing elements as soon as they are parsed.
In this post, I discuss the motivation behind my streaming parser implementations for JSON-LD and RDF/XML,
their architecture, and the difficulties I experienced.
</p>
<!--more-->

## Why streaming?

The [Semantic Web](https://en.wikipedia.org/wiki/Semantic_Web) community has given us
various serializations to represent [RDF](https://en.wikipedia.org/wiki/Resource_Description_Framework) triples and quads,
such as [Turtle](https://en.wikipedia.org/wiki/Turtle_(syntax)), [RDFa](https://rdfa.info/),
[RDF/XML](https://en.wikipedia.org/wiki/RDF/XML), [JSON-LD](https://json-ld.org/), and more.
Such serializations can be used to publish RDF knowledge graphs on the Web as Linked Data documents,
and exist in various sizes.

If you want to build applications that uses data from such documents,
you first need a **parser** that is able to convert the used serialization back into RDF triples.
Since documents can be downloaded over [HTTP in chunks](https://en.wikipedia.org/wiki/Chunked_transfer_encoding),
and documents can become very large,
there is a need to parse documents in a streaming way.
This makes it possible to start **processing RDF triples as soon as they are read**,
and it also allows **very large documents** to be parsed, event when they don't fit into your memory.

RDF parsers for most popular RDF serializations already exist for JavaScript.
However, not all of them parse in a *streaming* way.
At the time of writing, [N3.js](https://ruben.verborgh.org/blog/2013/04/30/lightning-fast-rdf-in-javascript/)
is the only spec-compliant streaming parser in JavaScript. It can handle N3-like RDF serializations such as [Turtle](https://en.wikipedia.org/wiki/Turtle_(syntax)) and [Turtle](https://en.wikipedia.org/wiki/TriG_(syntax)).
As such, there is still a need for streaming parsing of documents in other widely used serializations such as RDF/XML and JSON-LD.
This need for example exists in [Comunica](http://comunica.linkeddatafragments.org/),
a framework for querying Linked Data on the Web, which processes queries as streams.

For these reasons, I set out to implement streaming parsers for both
[RDF/XML](https://github.com/rdfjs/rdfxml-streaming-parser.js)
and [JSON-LD](https://github.com/rubensworks/jsonld-streaming-parser.js),
which are respectively based on the popular XML and JSON formats.
In the remainder of this post, I discuss the main architecture and design decisions behind these parsers,
and I end with some live-action examples.

## Building on top of existing libraries

Reusability is an important element of good software development.
For this reason, I tried to use existing software whenever possible,
and decompose my own software into separate components where it makes sense.
Concretely, I made use of existing and well-established low-level JSON and XML parsers.
Furthermore, I split off the logic of handling relative IRIs and the JSON-LD context components into separate libraries.
The following sections discuss these further.

### Low-level parsers

Due to the popularity of JSON and XML, a wide range of parsers already exist for JavaScript, including streaming parsers.
This allowed me to get a good head start for my implementations,
as I could simply **depend on existing libraries to parse the raw JSON and XML** streams,
and handle incoming JSON and XML nodes as respectively JSON-LD and RDF/XML nodes.

Several streaming JSON and XML parsers are available,
so I had to decide which ones I would depend on.
In the end, I chose for [*jsonparse*](https://www.npmjs.com/package/jsonparse)
and [*sax*](https://www.npmjs.com/package/sax) for the following reasons:

* Handles Node.JS streams.
* Pure JavaScript implementation that works both in Node.JS and browsers.
* Stability proven through number of dependents, age, and unit tests.

Both of these libraries have a similar event-based API,
through which you can listen to new incoming JSON nodes or XML tags.

### Resolving relative IRIs

Following the [DRY principle](https://en.wikipedia.org/wiki/Don%27t_repeat_yourself) *(Don't Repeat Yourself)*,
I decided to *abstract away* one common component between JSON-LD and RDF/XML parsing,
namely, handling relative IRIs.

Both JSON-LD and RDF/XML allow IRIs to be relative to a given base IRI,
with this base IRI typically being the current document's IRI.
The rules for resolving relative IRIs to absolute IRIs between these two specifications are identical,
and are actually part of [RFC3986](https://www.ietf.org/rfc/rfc3986.txt).
As I could not find a good, spec-compliant, standalone implementation of this functionality,
I created a new library for this, namely *[relative-to-absolute-iri.js](https://github.com/rubensworks/relative-to-absolute-iri.js)*.

This library exposes just a single function: `resolve(relativeIri: string, baseIri: string): string`.
It has been tested extensively, with unit tests including all known IRI resolutions
that are defined in the JSON-LD and RDF/XML test suites.

### Handling JSON-LD contexts

JSON-LD introduces the so-called [*context*](https://www.w3.org/TR/json-ld/#the-context),
which is an object that defines a mapping between JSON terms and IRIs.

Since JSON-LD contexts even have uses outside of JSON-LD documents (Such as [GraphQL-LD](https://comunica.github.io/Article-ISWC2018-Demo-GraphQlLD/) and [CSVW](https://www.w3.org/TR/tabular-data-primer/)),
it makes sense to separate the handling of them in a separate library.
For this, I created a library called *[jsonld-context-parser.js](https://github.com/rubensworks/jsonld-context-parser.js)*
that *parses* JSON-LD contexts into a normalized datastructure,
and offers utility functions to perform common tasks, such as [expanding terms](https://github.com/rubensworks/jsonld-context-parser.js#expand-a-term).

## Stack-based architecture



## Emitting triples as soon as possible

Using our continuously updating stack,
we maintain all required information
to convert the hierarchical node structures into RDF triples.
For this, we use the [**RDFJS data model**](https://rdf.js.org/),
which is a way of representing RDF terms and triples as JavaScript objects.

Every time our stack is updated,
we check its state to see if any new triples can be derived.
If this is the case, then all relevant triples are created,
and pushed into the output stream.
After that, the checked information is removed from the stack,
so that it won't be re-emitted again later.

For example...

## Parsers in action

TODO: spec-compliance, live demo, usages

```
require("relative-to-absolute-iri");
const { JsonLdParser } = require("jsonld-streaming-parser");
const { RdfXmlParser } = require("rdfxml-streaming-parser");
```
{:#demo-nodejs-preamble .hide}

```
// Construct a JSON-LD parser
const myParser = new JsonLdParser();

// Attach event listeners
myParser
  .on('data', console.log)
  .on('error', console.error)
  .on('end', () => console.log('All triples were parsed!'));

// Write JSON-LD in chunks
myParser.write('{');
myParser.write(`"@context": "https://schema.org/",`);
myParser.write(`"@type": "Recipe",`);
myParser.write(`"name": "Grandma's Holiday Apple Pie",`);
myParser.write(`"aggregateRating": {`);
myParser.write(`"@type": "AggregateRating",`);
myParser.write(`"ratingValue": "4"`);
myParser.write(`}}`);
myParser.end();

'Parsing...'; // Line only needed for demo-purposes
```
{:.demo-nodejs}

```
// Construct a RDF/XML parser
const myParser = new RdfXmlParser();

// Attach event listeners
myParser
  .on('data', console.log)
  .on('error', console.error)
  .on('end', () => console.log('All triples were parsed!'));

// Write RDF/XML in chunks
myParser.write('<?xml version="1.0"?>');
myParser.write(`<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:ex="http://example.org/stuff/1.0/"
         xml:base="http://example.org/triples/">`);
myParser.write(`<rdf:Description rdf:about="http://www.w3.org/TR/rdf-syntax-grammar">`);
myParser.write(`<ex:prop />`);
myParser.write(`</rdf:Description>`);
myParser.write(`</rdf:RDF>`);
myParser.end();

'Parsing...'; // Line only needed for demo-purposes
```
{:.demo-nodejs}
