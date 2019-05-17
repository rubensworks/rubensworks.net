---
layout: page
title: Blog
permalink: /blog/
order: 1
---

<ul class="posts">
  {% for post in site.posts %}
    <li>
      {% include post-listing.html
         post=post
      %}
    </li>
  {% endfor %}
</ul>
