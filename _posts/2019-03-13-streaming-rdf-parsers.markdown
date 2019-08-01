---
layout:      post
categories:  blog
tags:        [ rdf, javascript, node, architecture, linked data ]
comments:    true
title:       "A story of streaming RDF parsers"
subtitle:    "How I implemented streaming JSON-LD and RDF/XML parsers in JavaScript."
date:        2019-03-13 14:00:00 +0200
---
<p class="post-abstract" markdown="1">
Multiple serialization formats are currently being recommended by the W3C to represent RDF.
*JSON-LD* and *RDF/XML* are examples of RDF serializations that are respectively based on the JSON and XML formats.
The ability to parse RDF serializations in a *streaming* way offers many advantages,
such as handling huge documents with only a limited amount of memory,
and processing elements as soon as they are parsed.
In this post, I discuss the motivation behind my streaming *parser implementations* for JSON-LD and RDF/XML,
their architecture, and I show some live examples.
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
is the only spec-compliant streaming parser in JavaScript I am aware of. It can handle N3-like RDF serializations such as [Turtle](https://en.wikipedia.org/wiki/Turtle_(syntax)) and [TriG](https://en.wikipedia.org/wiki/TriG_(syntax)).
As such, there is still a need for streaming parsing of documents in other widely used serializations such as RDF/XML and JSON-LD.
This need for example exists in [Comunica](http://comunica.linkeddatafragments.org/),
a framework for querying Linked Data on the Web, which processes queries in a streaming way.

For these reasons, I set out to implement streaming parsers for both
[RDF/XML](https://github.com/rdfjs/rdfxml-streaming-parser.js)
and [JSON-LD](https://github.com/rubensworks/jsonld-streaming-parser.js),
which are respectively based on the popular XML and JSON formats.
In the remainder of this post, I go over the existing libraries that I built on top of,
I discuss the main architecture and design decisions behind these parsers,
and I end with some live-action examples.

*Update: as of recently, I've implemented an [RDFa parser](https://github.com/rubensworks/rdfa-streaming-parser.js) based on these same concepts.*

## Building on top of existing libraries

**Reusability** is a key element of good software development.
For this reason, I tried to use **existing software whenever possible**,
and **decompose my own software** into separate components where it makes sense.
Concretely, I made use of existing and well-established low-level JSON and XML parsers.
Furthermore, I split off the logic of handling relative IRIs and the JSON-LD context components into separate libraries.
The following sections discuss these further.

### Low-level parsers

Due to the popularity of JSON and XML, a wide range of parsers already exist for JavaScript, including streaming parsers.
This allowed me to get a good head start for my implementations,
as I could simply **depend on existing libraries to parse the raw JSON and XML streams**,
and handle incoming JSON and XML nodes as JSON-LD and RDF/XML nodes, respectively.

Several streaming JSON and XML parsers are available,
so I had to decide which ones I would depend on.
In the end, I chose for [**jsonparse**](https://www.npmjs.com/package/jsonparse)
and [**sax**](https://www.npmjs.com/package/sax) for the following reasons:

* They handles Node.JS streams,
* they have a pure JavaScript implementation that works both in Node.JS and browsers,
* their stability is proven through a high number of dependents, age, and unit tests.

Both of these libraries have a similar event-based API,
through which you can listen to new incoming JSON nodes or XML tags.

### Resolving relative IRIs

Following the [DRY principle](https://en.wikipedia.org/wiki/Don%27t_repeat_yourself) *(Don't Repeat Yourself)*,
I decided to **abstract** one common component between JSON-LD and RDF/XML parsing,
namely, handling relative IRIs.

Both JSON-LD and RDF/XML allow IRIs to be relative to a given base IRI,
with this base IRI typically being the current document's IRI.
The rules for resolving relative IRIs to absolute IRIs between these two specifications are identical,
and are part of [RFC3986](https://www.ietf.org/rfc/rfc3986.txt).
As I could not find a good, spec-compliant, standalone implementation of this functionality,
I created a new library for this, namely **[relative-to-absolute-iri.js](https://github.com/rubensworks/relative-to-absolute-iri.js)**.

This library exposes just a single function: `resolve(relativeIri, baseIri)`.
It has been tested extensively, with unit tests including all known IRI resolutions
that are defined in the JSON-LD and RDF/XML test suites.

### Handling JSON-LD contexts

JSON-LD introduces the so-called [**context**](https://www.w3.org/TR/json-ld/#the-context),
which is an object that defines a mapping between JSON terms and IRIs.

Since JSON-LD contexts even have uses outside of JSON-LD documents (Such as [GraphQL-LD](https://comunica.github.io/Article-ISWC2018-Demo-GraphQlLD/) and [CSVW](https://www.w3.org/TR/tabular-data-primer/)),
it makes sense to separate the handling of them in a separate library.
For this, I created a library called **[jsonld-context-parser.js](https://github.com/rubensworks/jsonld-context-parser.js)**
that **parses** JSON-LD contexts into a normalized datastructure,
and offers utility functions to perform common tasks, such as [expanding terms](https://github.com/rubensworks/jsonld-context-parser.js#expand-a-term).

## Stack-based architecture

The designs of the streaming RDF/XML and JSON-LD parsers are based on a [**stack-based architecture**](https://en.wikipedia.org/wiki/Stack_(abstract_data_type)).
During parsing, internal stacks are continuously updated
such that triples can be emitted from the stack as soon as sufficient information is present.
After explaining the motivation behind this architectural choice,
I illustrate how this works with a short JSON-LD example.

### A continuously updating stack

One main property that is shared between the JSON(-LD) and (RDF/)XML formats
is that they are both **hierarchical**.
This means that nodes can be nested in order to reuse common information.
The hierarchical nature of these formats requires streaming parsers
to maintain **state** with respect to the nesting of these nodes.

To cope with this hierarchical property of JSON-LD and RDF/XML,
I chose for a **stack-based architecture** for maintaining state inside these parsers.
Each stack entry contains information about the node at the current depth that is relevant for converting it into RDF.
This includes information such as the current subject, predicate, object, graph, base IRI, ...

Concretely, for each node that is being parsed for depth `i`,
the node's information is being **pushed** onto the stack at depth `i`.
This allows the parser to retrieve information from parent nodes when needed.
When the scope of the node is closed *(i.e., the JSON object is closed, or the XML tag is ended)*,
then the node's information is **popped** from the stack.

### Emitting triples from on the stack

Using the continuously updating stack,
all required information is maintained
to convert the hierarchical node structures into RDF triples.
For this, I use the [**RDFJS data model**](https://rdf.js.org/),
which is a way of representing RDF terms and triples as JavaScript objects.

Every time the stack is updated,
its state is checked to see if any new triples can be derived.
If this is the case, then all relevant triples are created,
and pushed into the output stream.
After that, the checked information is removed from the stack,
so that it won't be re-emitted again later.

### Example of JSON-LD parsing using a stack

[Listing 1](#jsonld-recipe-mojito) shows an example of hierarchical nodes in a JSON-LD document,
where several steps are listed to create a mojito.
JSON-LD links each of these steps to the main mojito recipe
(identified by `http://example.org/mojito`) using the `http://rdf.data-vocabulary.org/#instructions` predicate.
Hereafter, I illustrate how triples can be generated from this document using a continuously updating stack.
For simplicity, the following examples only include subject, predicate and object in the stack,
the actual implementations also include other information such as the current graph, context, base IRI, ...

Parsing the `@context` node of this document is delegated to [jsonld-context-parser.js](https://github.com/rubensworks/jsonld-context-parser.js),
which is used to translate terms to IRIs.

<figure id="jsonld-recipe-mojito" class="listing" markdown="block">
```json
{
  "@context": {
    "name": "http://rdf.data-vocabulary.org/#name",
    "instructions": "http://rdf.data-vocabulary.org/#instructions",
    "step": {
      "@id": "http://rdf.data-vocabulary.org/#step",
      "@type": "xsd:integer"
    },
    "description": "http://rdf.data-vocabulary.org/#description",
    "xsd": "http://www.w3.org/2001/XMLSchema#"
  },
  "@id": "http://example.org/mojito",
  "name": "Mojito",
  "instructions": [
    {
      "step": 1,
      "description": "Crush lime juice, mint and sugar together in glass."
    },
    {
      "step": 2,
      "description": "Fill glass to top with ice cubes."
    },
    {
      "step": 3,
      "description": "Pour white rum over ice."
    },
    {
      "step": 4,
      "description": "Fill the rest of glass with club soda, stir."
    },
    {
      "step": 5,
      "description": "Garnish with a lime wedge."
    }
  ]
}
```
<figcaption markdown="block">
<span class="label">Listing 1</span>
JSON-LD document that describes the recipe of a Mojito.
Adapted from [JSON-LD playground](https://json-ld.org/playground/).
</figcaption>
</figure>

<figure id="jsonld-recipe-mojito-stack-0" class="listing figure-side" markdown="block">
```javascript
[
  {
    depth: 0,
    subject: "http://example.org/mojito"
  }
]
```
<figcaption markdown="block">
<span class="label">Listing 2</span>
The stack after parsing the `@id`.
</figcaption>
</figure>

[Listing 2](#jsonld-recipe-mojito-stack-0) shows an example of the state of the stack right after
parsing the first `@id` from [Listing 1](#jsonld-recipe-mojito).
At this point, there is only enough information available to describe the **subject of a triple**,
so no fully materialized triples can be emitted at this point.

<br class="clear" />

<figure id="jsonld-recipe-mojito-stack-1" class="listing figure-side" markdown="block">
```javascript
[
  {
    depth: 0,
    subject: "http://example.org/mojito"
  },
  {
    depth: 1,
    predicate: "http://rdf.data-vocabulary.org/#name",
    object: "Mojito"
  }
]
```
<figcaption markdown="block">
<span class="label">Listing 3</span>
The parser stack during the parsing of the `"name": "Mojito"`.
</figcaption>
</figure>

When parsing the next line (`"name": "Mojito"`), we get into a deeper stack level,
with a defined **predicate** and **object**.
[Listing 3](#jsonld-recipe-mojito-stack-1) shows the stack state at this point.
This shows that sufficient information is present to emit a triple,
since a predicate and object value are defined on the current depth,
and a subject value is present in the parent.
Concretely, the following triple is emitted:
```
<http://example.org/mojito> <http://rdf.data-vocabulary.org/#name> "Mojito".
```
Once this triple has been emitted, the node closes, and the stack entry at depth 1 is popped.

<br class="clear" />

<figure id="jsonld-recipe-mojito-stack-2" class="listing figure-side" markdown="block">
```javascript
[
  {
    depth: 0,
    subject: "http://example.org/mojito"
  },
  {
    depth: 1,
    predicate: "http://rdf.data-vocabulary.org/#instructions"
  }
]
```
<figcaption markdown="block">
<span class="label">Listing 4</span>
The parser stack after parsing `"instructions": [`.
</figcaption>
</figure>

Next, the parser will handle the line `"instructions": [`.
For this, a new stack entry is pushed with a defined **predicate** value, as can be seen in [Listing 4](#jsonld-recipe-mojito-stack-2).
At this point, not enough information is available to create a new triple,
so nothing is emitted here.

<br class="clear" />

<figure id="jsonld-recipe-mojito-stack-3" class="listing figure-side" markdown="block">
```javascript
[
  {
    depth: 0,
    subject: "http://example.org/mojito"
  },
  {
    depth: 1,
    predicate: "http://rdf.data-vocabulary.org/#instructions",
    buffer: [
      {
        predicate: "http://rdf.data-vocabulary.org/#step",
        object: "\"1\"^^xsd:integer"
      }
    ]
  }
]
```
<figcaption markdown="block">
<span class="label">Listing 5</span>
The parser stack after parsing and buffering `"step": 1` of the first recipe instruction.
</figcaption>
</figure>

When entering the instructions array, the first instruction is parsed starting with the line `"step": 1`.
After this, a new stack entry is pushed with a defined **predicate** and **object**.
However, **no defined subject** is available at this level or the parent level.
As it is possible that a subject may be defined for this level later on,
this stack entry is temporarily moved into a **temporary buffer** until the parent node closes,
or a subject is defined.
After buffering this stack entry, the stack contents are those from [Listing 5](#jsonld-recipe-mojito-stack-3).

<br class="clear" />

<figure id="jsonld-recipe-mojito-stack-4" class="listing figure-side" markdown="block">
```javascript
[
  {
    depth: 0,
    subject: "http://example.org/mojito"
  },
  {
    depth: 1,
    predicate: "http://rdf.data-vocabulary.org/#instructions",
    buffer: [
      {
        predicate: "http://rdf.data-vocabulary.org/#step",
        object: "\"1\"^^xsd:integer"
      },
      {
        predicate: "http://rdf.data-vocabulary.org/#description",
        object: "Crush lime juice, mint and sugar together in glass."
      }
    ]
  }
]
```
<figcaption markdown="block">
<span class="label">Listing 6</span>
The parser stack after parsing and buffering the description of the first recipe instruction.
</figcaption>
</figure>

Next, the description of the first instruction is parsed at the same depth,
which again gives us a new stack entry.
However, there still is no defined subject, so this stack entry has to be added to the buffer as well,
as can be seen in [Listing 6](#jsonld-recipe-mojito-stack-4).

<br class="clear" />

After that, the node of the first instruction closes.
Since there is a non-empty buffer in our stack entry on depth 1,
this means that **triples with unknown subjects** have to be emitted.
For this, we will create a new **[blank node](https://en.wikipedia.org/wiki/Blank_node) subject**,
assign it to the buffer entries, and emit triples for each of them.
Concretely, we emit the following triples:
```
_:b1 <http://rdf.data-vocabulary.org/#step> "1"^^xsd:integer.
_:b1 <http://rdf.data-vocabulary.org/#description> "Crush lime juice, mint and sugar together in glass.".
<http://example.org/mojito> <http://rdf.data-vocabulary.org/#instructions> _:b1.
```

The remainder of this document is parsed similarly.

## Try parsing yourself

Both [jsonld-streaming-parser.js](https://github.com/rubensworks/jsonld-streaming-parser.js) and [rdfxml-streaming-parser.js](https://github.com/rdfjs/rdfxml-streaming-parser.js)
are **open-source** and available on npm to include in any JavaScript (or TypeScript) application.
They also work great in the **browser**,
you can try it out yourself below in [Listing 7](#jsonld-parser-example) and [Listing 8](#rdfxml-parser-example).

Both libraries are **fully compliant** with the [JSON-LD](https://json-ld.org/spec/latest/json-ld/)
and [RDF/XML](https://www.w3.org/TR/rdf-syntax-grammar/) **specifications**, respectively.
Using [**rdf-test-suite.js**](https://github.com/rubensworks/rdf-test-suite.js),
the latest specification test suite manifests are executed each time a new commit is pushed to the parser's git repositories.
This guarantees full compliance upon each new change, as any breakages are detected immediately.

Finally, I invested a lot of time in **optimizing** both parsers as much as possible.
Even though streaming parsers are typically slower than bulk parsers due to their streaming overhead,
my implementations manage to outperform other bulk parsers in many cases.
Try it out yourself by running the performance tests for the
[JSON-LD](https://github.com/rubensworks/jsonld-streaming-parser.js/tree/master/perf) and
[RDF/XML](https://github.com/rdfjs/rdfxml-streaming-parser.js/tree/master/perf) parsers.

```
require("relative-to-absolute-iri");
const { JsonLdParser } = require("jsonld-streaming-parser");
const { RdfXmlParser } = require("rdfxml-streaming-parser");
```
{:#demo-nodejs-preamble .hide}

<figure id="jsonld-parser-example" class="listing" markdown="block">
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
<figcaption markdown="block">
<span class="label">Listing 7</span>
Example of parsing a JSON-LD document in chunks with **jsonld-streaming-parser.js**.
</figcaption>
</figure>

<figure id="rdfxml-parser-example" class="listing" markdown="block">
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
<figcaption markdown="block">
<span class="label">Listing 8</span>
Example of parsing an RDF/XML document in chunks with **rdfxml-streaming-parser.js**.
</figcaption>
</figure>
