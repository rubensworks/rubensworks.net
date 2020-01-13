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

<ul class="presentations">
{% for presentation in site.data.presentations %}
  {% capture presentation_year %}{{ presentation[1].date | date: "%Y" }}{% endcapture %}
  {% assign presentation_year_string = presentation_year | plus: 0 %}
  {% if presentation_year_string == year %}
    <li class="presentation listed" itemscope itemtype="http://schema.org/PresentationDigitalDocument" typeof="schema:PresentationDigitalDocument schema:CreativeWork" about="/presentations#{{ presentation[0] }}">
        <span itemprop="name" property="schema:name" class="title"><a href="{{ presentation[1].url }}">{{ presentation[1].title }}</a></span>
        <span itemprop="location" property="schema:location" class="venue">{{ presentation[1].venue }}</span>
        <span itemprop="datePublished" property="schema:datePublished" class="date">{{ presentation[1].date }}</span>
    </li>
  {% endif %}
{% endfor %}
</ul>

{% endfor %}
