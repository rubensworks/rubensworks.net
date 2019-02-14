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

TODO