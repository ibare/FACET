# Font swap

`font-display: swap` lets a paragraph paint immediately in a fallback font
while a custom web font is still downloading. Nothing waits on the network —
the words show up right away, just not in their final letterforms.

{facet:fontSwap}

Below, the paragraph paints the moment the stylesheet arrives, using a system
font. The browser only asks for the web font once it knows the paragraph
needs it — that request rides on the same style calculation that produced
the first paint. When the font lands, the browser lays the same words out
again in its wider letters. Nothing moved for any other reason: the box got
no new content, no script ran — the letters themselves just got wider, so
three words no longer fit on the line they used to share and drop to the
next one.
