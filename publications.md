---
layout: page
title: Publications
permalink: /publications/
order: 3
---

As a [researcher](/about/), I write publications about my work, which are listed on this page.
If you are interested in any of these, feel free to contact me so we can discuss this further.

{% assign currentyear = site.time | date: '%Y' | plus: 0 %}
{% assign years = (2015..currentyear) | reverse %}
{% for year in years %}
## {{ year }}
  
{% bibliography --query @*[year={{ year }}] %}
{% endfor %}