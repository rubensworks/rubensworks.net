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

TODO: intro, advantages/disadvantages and motivation(comunica)

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
