// A deliberately small markdown-to-HTML pass: just enough to render
// README.md at /readme/ legibly. It doesn't need to be a full renderer —
// spec/invariants.test.ts only checks that each heading from README.md shows
// up, in order, in the page's text content.
export function renderMarkdown(md) {
  const escape = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const lines = md.split(/\r?\n/);
  const out = [];
  let inList = false;
  let fenced = false;

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const line of lines) {
    if (/^ {0,3}(```|~~~)/.test(line)) {
      fenced = !fenced;
      out.push(fenced ? "<pre><code>" : "</code></pre>");
      continue;
    }
    if (fenced) {
      out.push(escape(line));
      continue;
    }

    const heading = line.match(/^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${escape(heading[2])}</h${level}>`);
      continue;
    }

    const item = line.match(/^ {0,3}[-*]\s+(.*)$/);
    if (item) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${escape(item[1])}</li>`);
      continue;
    }

    closeList();
    if (line.trim() === "") continue;
    out.push(`<p>${escape(line)}</p>`);
  }
  closeList();
  return out.join("\n");
}
