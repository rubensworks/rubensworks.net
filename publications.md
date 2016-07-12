---
layout: page
title: Publications
permalink: /publications/
---

{% assign currentyear = site.time | date: '%Y' | plus: 0 %}
{% assign years = (2015..currentyear) | reverse %}
{% for year in years %}
## {{ year }}
  
{% bibliography --query @*[year={{ year }}] %}
{% endfor %}