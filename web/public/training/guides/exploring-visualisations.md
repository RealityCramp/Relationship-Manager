# Exploring the visualisations

**Network** offers seven views of the same data. The filter bar at the top — lens chips, source selector and search — applies to all of them.

## Filters

- **Lens** — restrict everything to one circle (Personal, Business, Corporate, Social).
- **Source** — only people who came from LinkedIn, Facebook, X, Contacts or Email.
- **Search** — name, company, email or notes.

The URL keeps your choices, so you can bookmark or share a view.

## Graph (force-directed)

You are the node in the centre. Each person is a dot coloured by primary circle and sized by strength. Rings around a dot indicate additional circles. Lines are relationships:

- solid lines from your sources and email threads, thicker when stronger,
- dashed lines between people who work at the same company.

Controls: scroll to zoom, drag the background to pan, drag a node to move it, **Min strength** to hide weak ties, **Cluster** by circle or company, **Labels** on/off, and a toolbar to zoom, fit and re-run the layout. Hover for a summary; click to open the side sheet with details and connected people.

The graph renders on a canvas, so it stays smooth with thousands of people.

## Venn

Shows the overlap between circles. With all four circles selected you get a four-set diagram (ellipses, not to scale). Deselect one or two circles and the layout becomes **area-proportional**: circle area matches group size and overlaps are exact. Numbers are people in exactly that region. Click a region to list those people.

## Chord

Each arc is a circle; a ribbon between two arcs is the number of people they share; a ribbon that loops back is people in only that circle. Hover a ribbon for the count, click to list the people.

## Flow (Sankey)

Sources → circles → companies (top 12). It shows where each circle comes from and which companies dominate. Hover a node to highlight its flows; click a source, circle or company to open the matching People list.

## Treemap

Circle → company → person, sized by strength. Click a circle or company to zoom in; use the breadcrumb to go back; click a person to open their sheet.

## Radial tree

A dendrogram of the same hierarchy around you. In large networks person names appear on hover.

## Activity

- **Interactions per month** for the last 24 months,
- **Strength distribution** — how many people at each strength level,
- **Where each circle comes from** — a source × circle heat map.

## Tips

- Combine a lens with the strength slider to find "the ten colleagues I actually talk to".
- Cluster by company, then search a company name, to see who connects you to it.
- Every view is themed, so dark mode and your accent colour carry through.
