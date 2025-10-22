---
layout: page
title: Curriculum Vitae
permalink: /cv/
show_in_nav: false
---

## Short Biography

{:.cv-biography}
Ruben Taelman is a Postdoctoral Researcher at [IDLab](http://www.ugent.be/ea/idlab/en), Ghent University – imec, Belgium.
His research concerns the decentralized publication and querying of Linked Data on the Web,
and investigating the trade-offs that exist between server and client.
He has contributed to this domain through publications in journals such as
the [Semantic Web Journal](http://semantic-web-journal.net/)
and the [Journal of Web Semantics](https://www.journals.elsevier.com/journal-of-web-semantics).
Next to that, he is actively applying his research by developing [reusable software](/projects/)
that can be used by developers and other researchers.
Furthermore, he has presented his work at various conferences and workshops such as
the [Web Conference](https://www.iw3c2.org/),
the [International Semantic Web Conference (ISWC)](http://swsa.semanticweb.org/content/international-semantic-web-conference-iswc),
and the [Extended Semantic Web Conference (ESWC)](https://eswc-conferences.org/).
Additionally, he has served as a reviewer and program committee member for these journals and conferences.

## Academic Work Experience

<ul class="cv-listing">
{% include cv-listing.html
    subject="Postdoctoral Researcher"
    startdate="2020"
    enddate="now"
    location="[IDLab, Ghent University — imec](http://www.ugent.be/ea/idlab/en)"
    description="Together with a team of PhD students and postdocs, I am researching decentralized publication and querying of Linked Data on the Web."
%}
{% include cv-listing.html
    subject="Visiting Researcher"
    startdate="2022"
    enddate="2022"
    location="[Aalborg University](https://www.cs.aau.dk/research/data-knowledge-and-web-engineering)"
    description="I visited [Katja Hose](https://homes.cs.aau.dk/~khose/About_me.html) in Denmark
    to collaborate on query optimization within decentralized environments."
%}
{% include cv-listing.html
    subject="Visiting Researcher"
    startdate="2019"
    enddate="2020"
    location="[Vienna University of Economics and Business](https://www.wu.ac.at/en/infobiz/)"
    description="I visited [Sabrina Kirrane](http://sabrinakirrane.com/) in Austria
    to collaborate on privacy-preserving querying within decentralized environments."
%}
{% include cv-listing.html
    subject="Visiting Researcher"
    startdate="2017"
    enddate="2018"
    location="[National Institute of Informatics](https://www.nii.ac.jp/en/)"
    description="I visited [Hideaki Takeda](http://www-kasm.nii.ac.jp/~takeda/) in Japan
    to study [the fundamentals of semantic versioned querying](http://localhost:4000/publications/taelman_iswc_workshop_semanticversionedquerying_2018/)."
%}
{% include cv-listing.html
    subject="Doctoral Researcher"
    startdate="2015"
    enddate="2020"
    location="[IDLab, Ghent University — imec](http://www.ugent.be/ea/idlab/en)"
    description="Under the supervision of [Ruben Verborgh](https://ruben.verborgh.org/),
    I am researching decentralized publication and querying of Linked Data on the Web."
%}
</ul>

## Education

<ul class="cv-listing">
{% include cv-listing.html
    subject="Doctor of Computer Science Engineering"
    startdate="2015"
    enddate="2020"
    location="Ghent University, Belgium"
    description="Thesis: [Storing and Querying Evolving Knowledge Graphs on the Web](https://phd.rubensworks.net/)"
%}
{% include cv-listing.html
    subject="Master in Computer Science Engineering"
    startdate="2013"
    enddate="2015"
    location="Ghent University, Belgium"
    description="With great honor
    <br />Thesis: [Continuously Updating Queries over Real-Time Linked Data](https://www.rubensworks.net/publications/taelman_mastersthesis/)"
%}
{% include cv-listing.html
    subject="Bachelor in Informatics"
    startdate="2010"
    enddate="2013"
    location="Ghent University, Belgium"
    description="With honor"
%}
</ul>

## Teaching

### Courses

<ul class="cv-listing">
{% include cv-listing.html
    subject="Web Development"
    startdate="2017"
    enddate="now"
    location="Ghent University, Belgium"
    description="Giving lectures as co-lecturer and coaching of Computer Science students on designing and implementing Web applications."
%}
{% include cv-listing.html
    subject="Linked Data & Solid"
    startdate="2023"
    enddate="2024"
    location="VAIA"
    description="Teaching about Web Querying to professionals wanting to learn about Linked Data and Solid."
%}
{% include cv-listing.html
    subject="Research Project"
    startdate="2021"
    enddate="now"
    location="Ghent University, Belgium"
    description="Coaching a group of students to write an academic survey paper."
%}
{% include cv-listing.html
    subject="Design of Cloud and Mobile Applications"
    startdate="2015"
    enddate="2017"
    location="Ghent University, Belgium"
    description="Coaching of Informatics students on designing and implementing cloud applications."
%}
</ul>

### Supervision of PhD Students

<ul class="cv-listing">
{% for student in site.data.studentsphd %}
  {% capture subject %}{{ student[0] }}{% endcapture %}
  {% capture startdate %}{{ student[1].startdate }}{% endcapture %}
  {% capture enddate %}{{ student[1].enddate }}{% endcapture %}
  {% capture location %}{{ student[1].location }}{% endcapture %}
  {% capture description %}{{ student[1].title }}{% endcapture %}
  {% include cv-listing.html
      subject=subject
      startdate=startdate
      enddate=enddate
      location=location
      description=description
  %}
{% endfor %}
</ul>

### Supervision of Master Students

<ul class="cv-listing">
{% for student in site.data.studentsmaster %}
  {% capture subject %}{{ student[0] }}{% endcapture %}
  {% capture startdate %}{{ student[1].startdate }}{% endcapture %}
  {% capture enddate %}{{ student[1].enddate }}{% endcapture %}
  {% capture location %}{{ student[1].location }}{% endcapture %}
  {% capture description %}[{{ student[1].title }}]({{ student[1].url }}){% endcapture %}
  {% include cv-listing.html
      subject=subject
      startdate=startdate
      enddate=enddate
      location=location
      description=description
  %}
{% endfor %}
</ul>

## Fellowships

<ul class="cv-listing">
{% include cv-listing.html
    subject="Postdoctoral Fellowship"
    date="2023 - 2026"
    subtitle="[Research Foundation Flanders](https://www.fwo.be/en/)"
    description="Full research grant for a 3-year sensior postdoctoral fellowship"
%}
{% include cv-listing.html
    subject="Postdoctoral Fellowship"
    date="2020 - 2023"
    subtitle="[Research Foundation Flanders](https://www.fwo.be/en/)"
    description="Full research grant for a 3-year junior postdoctoral fellowship"
%}
</ul>

## Awards

<ul class="cv-listing">
{% include cv-listing.html
    subject="Best Demo Paper Award"
    date="2023"
    subtitle="[GLENDA: Querying over RDF Archives with SPARQL](/publications/pelgrin_eswc_glenda_2023/)"
    description="ESWC 2023 - Extended Semantic Web Conference"
%}
{% include cv-listing.html
    subject="Best Demo Paper Award"
    date="2022"
    subtitle="[Solid Web Monetization](/publications/sebrechts_icwe_2022/)"
    description="ICWE2022 - International Conference on Web Engineering"
%}
{% include cv-listing.html
    subject="Best Paper Award"
    date="2020"
    subtitle="[Pattern-based Access Control in a Decentralised Collaboration Environment](/publications/werbrouck_ldac_2020/)"
    description="LDAC2020 - 8th Linked Data in Architecture and Construction Workshop"
%}
{% include cv-listing.html
    subject="Best Paper Award"
    date="2016"
    subtitle="[Continuously Updating Query Results over Real-Time Linked Data](/publications/taelman_mepdaw_2016/)"
    description="2nd Workshop on Managing the Evolution and Preservation of the Data Web)"
%}
</ul>

## Invited presentations

{% include presentations.html
   presentations=site.data.presentations
   types="Keynote, Invited Talk, Guest Lecture"
%}

## Publications

### Journal articles

{% bibliography --query @*[_type=Journal] %}

### Conference and workshop contributions

{% bibliography --query @*[_type=Conference] %}
{% bibliography --query @*[_type=Tutorial] %}
{% bibliography --query @*[_type=Challenge] %}
{% bibliography --query @*[_type=Workshop] %}
{% bibliography --query @*[_type=Demo] %}
{% bibliography --query @*[_type=Poster] %}
{% bibliography --query @*[_type=PhD Symposium] %}

### Other publications

{% bibliography --query @*[_type=Position Statement] %}
{% bibliography --query @*[_type=Master's Thesis] %}

## Academic Involvement

### Tutorials

<ul class="cv-listing">
{% include cv-listing.html
    subject="[An Introduction to RDF and SPARQL 1.2]([https://www.ida.liu.se/research/semanticweb/events/GraphQLTutorialAtISWC2019.shtml](https://www.w3.org/Talks/2025/iswc-tutorial-rdfsparql-12/))"
    date="2025"
    authors="Ruben Taelman, Enrico Franconi, Pierre-Antoine Champin, Ora Lassila"
    description="Half-day tutorial at the [24th International Semantic Web Conference (ISWC 2025)](https://iswc2025.semanticweb.org/), Nara, Japan, 2025."
%}
{% include cv-listing.html
    subject="[An Introduction to GraphQL](https://www.ida.liu.se/research/semanticweb/events/GraphQLTutorialAtISWC2019.shtml)"
    date="2019"
    authors="Olaf Hartig, Ruben Taelman"
    description="Half-day tutorial at the [18th International Semantic Web Conference (ISWC 2019)](https://iswc2019.semanticweb.org/), Auckland, New Zealand, 2019."
%}
{% include cv-listing.html
    subject="[Building Decentralized Applications with Solid and Comunica](https://comunica.github.io/Tutorial-ISWC2019-Solid-Comunica/)"
    date="2019"
    authors="Ruben Taelman, Joachim Van Herwegen, Ruben Verborgh"
    description="Full-day tutorial at the [18th International Semantic Web Conference (ISWC 2019)](https://iswc2019.semanticweb.org/), Auckland, New Zealand, 2019."
%}
{% include cv-listing.html
    subject="[Querying Linked Data with Comunica](https://comunica.github.io/Tutorial-ESWC2019-Comunica/)"
    date="2019"
    authors="Ruben Taelman, Joachim Van Herwegen"
    description="Half-day tutorial at the [16th Extended Semantic Web Conference (ESWC2019)](https://2019.eswc-conferences.org/), Portoroz, Slovenia, 2019."
%}
{% include cv-listing.html
    subject="[Modeling, Generating and Publishing knowledge as Linked Data](http://rml.io/EKAW2016tutorial.html)"
    date="2016"
    authors="Anastasia Dimou, Ruben Taelman, Pieter Heyvaert, Ruben Verborgh"
    description="Full-day tutorial at the [20th International Conference on Knowledge Engineering and Knowledge Management (EKAW2016)](http://ekaw2016.cs.unibo.it/), Bologna, Italy, 2016."
%}
</ul>

### Organizing Committee Member

* [Developers Workshop (Semantics)](https://semantics2025.semdev.org/)
    * 2025 (Organizer)
* [Extended Semantic Web Conference (ESWC)](https://eswc-conferences.org/)
    * 2020 (Metadata Chair)
* [Trusting Decentralised Knowledge Graphs and Web Data Workshop (TrusDeKW)](https://events.kmi.open.ac.uk/trusting-decentralised-knowledge-graphs-and-web-data/)
    * 2023 (ESWC)

### Journal Reviewer

* [Transactions on Graph Data and Knowledge](https://drops.dagstuhl.de/entities/journal/TGDK)
    * 2025 (editorial board member)
* [IEEE Access](https://ieeeaccess.ieee.org/)
    * 2020
* [Semantic Web Journal](http://semantic-web-journal.net/)
    * 2017
    * 2018
    * 2020 (including member of editorial board for [Special Issue on Semantic Technologies for Data and Algorithmic Governance](http://www.semantic-web-journal.net/blog/call-papers-special-issue-semantic-technologies-data-and-algorithmic-governance)
    * 2021
    * 2022
    * 2023 
* [ACM Transactions on the Web](https://dl.acm.org/journal/tweb/)
    * 2025
* [Journal of Web Semantics](https://www.journals.elsevier.com/journal-of-web-semantics)
    * 2017
    * 2018
    * 2023
* [Data Science](https://www.iospress.nl/journal/data-science/)
    * 2019
{:.cv-listing}

### Program Committee Member

* [International Semantic Web Conference (ISWC)](http://swsa.semanticweb.org/content/international-semantic-web-conference-iswc)
    * 2019 (Resources Track)
    * 2020 (Resources Track)
    * 2021 (Resources Track)
    * 2022 (Research Track, Resources Track)
    * 2023 (Research Track, Resources Track - Senior)
    * 2024 (Research Track, Resources Track - Senior)
    * 2025 (Research Track, Resources Track - Senior)
* [Extended Semantic Web Conference (ESWC)](https://eswc-conferences.org/)
    * 2018 (Research Track)
    * 2019 (Research Track)
    * 2020 (Research Track, Poster & Demo Track)
    * 2021 (Research Track, Resources Track, In-Use Track)
    * 2022 (Research Track, Resources Track, In-Use Track)
    * 2023 (Research Track, Resources Track)
    * 2024 (Research Track)
    * 2025 (Research Track)
    * 2026 (Research Track)
* [The Web Conference](https://www.iw3c2.org/)
    * 2025 (Semantics and Knowledge Track - Area Chair)
    * 2024 (Semantics and Knowledge Track - Area Chair)
    * 2023 (Semantics and Knowledge Track)
    * 2022 (Semantics and Knowledge Track)
    * 2018 ([Developers' Track](https://www2018.thewebconf.org/program/developers-track/))
* [International Conference on Cooperative Information Systems](https://coopis.scitevents.org/Home.aspx)
    * 2025
* [International Conference on Ontologies, DataBases, and Applications of Semantics (ODBASE)](http://www.otmconferences.org/index.php/conferences/odbase-2020)
    * 2020
* [SEMANTiCS Conference](https://semantics.cc/)
    * 2017 (Poster & Demo Track)
    * 2018 (Research Track, Poster & Demo Track)
    * 2019 (Research Track)
    * 2020 (Research Track)
    * 2021 (Research Track)
    * 2022 (Research Track)
* [Wikidata Workshop](https://wikidataworkshop.github.io/)
    * 2025
* [ACM International Conference on Information and Knowledge Management](https://cikm2020.org/)
    * 2020
* [HyperAgents](https://ecai2025.hyperagents.org/)
    * 2025
* [Workshop on Decentralizing the Semantic Web](https://iswc2019.desemweb.org/)
    * 2018
    * 2019
* [Workshop on Managing the Evolution and Preservation of the Data Web (MEPDaW)](https://mepdaw-ws.github.io/2022/)
    * 2017
    * 2018
    * 2019
    * 2020
    * 2021
    * 2022
    * 2023
* [Workshop on Data Management for Knowledge Graphs (DMKG)](https://dmkg-workshop.github.io/)
    * 2023
    * 2024
* [Linked Data in Architecture and Construction Workshop](http://www.linkedbuildingdata.net/ldac2019/index.html)
    * 2019
* [Open Mighty Storage Challenge (MOCHA)](https://project-hobbit.eu/open-challenges/mocha-open-challenge/)
    * 2017
* [International Workshop on Semantics for Transport (Sem4Tra)](https://sem4tra.linkeddata.es/)
    * 2019
    * 2020
    * 2021
{:.cv-listing}
