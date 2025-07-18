---
layout: page
title: Presentations
permalink: /presentations/
order: 4
---

This page lists all my (public) presentations chronologically.<br />
Unless otherwise noted, all publications are licensed under <a href="https://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0</a>.

{% assign currentyear = site.time | date: '%Y' | plus: 0 %}
{% assign years = (2016..currentyear) | reverse %}
{% for year in years %}

## {{ year }}

{% include presentations.html
   presentations=site.data.presentations
   year=year
%}

{% endfor %}
