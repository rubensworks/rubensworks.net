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

## Why Streaming?

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
is the only spec-compliant streaming parser that can handle N3-like RDF serializations such as [Turtle](https://en.wikipedia.org/wiki/Turtle_(syntax)) and [Turtle](https://en.wikipedia.org/wiki/TriG_(syntax)).
As such, there is still a need for streaming parsing of documents in other widely used serializations such as RDF/XML and JSON-LD.
This need for example exists for [Comunica](http://comunica.linkeddatafragments.org/),
a framework for querying Linked Data on the Web, which processes queries as streams.

For these reasons, I set out to implement streaming parsers for both RDF/XML and JSON-LD,
which are respectively based on the popular XML and JSON formats.
In the remainder of this post, I discuss the main architecture and design decisions behind these parsers,
and I end with some live-action examples.

## Stack-based Architecture

TODO: explain common architecture, dependencies and special stuff

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

'Parsing...';
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

'Parsing...';
```
{:.demo-nodejs}
