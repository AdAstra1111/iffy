// TRACE: The markdown parser at dev-engine-v2/index.ts:11634 checks trimmed.startsWith("## ")
// This MATCHES BOTH ## AND ### headers!
// Let's verify this is the root cause.

// Test: does "### 1. Opening Image" pass the startsWith("## ") check?
const tests = [
  "## Act 1: Setup — Beats",
  "### 1. Opening Image",
  "### 2. Theme Stated",
  "## Act 2A: Rising Action — Beats",
  "### 3. B Story",
  "#### Sub-header within a beat",
  "# Not a match",
  "### Extra beat"
];

console.log("=== startsWith('## ') test ===");
tests.forEach(t => {
  console.log(`  "${t}".startsWith("## ") = ${t.trim().startsWith("## ")}`);
});

// Now simulate: what sections would the parser produce?
// If the LLM outputs ### for beats, each ### becomes a separate section!

const fullText = `## Act 1: Setup — Beats

### 1. Opening Image
The protagonist wakes up in their ordinary world.
*Dramatic Function:* Establish normalcy.

### 2. Inciting Incident
A mysterious message arrives.
*Dramatic Function:* Introduce central conflict.

## Act 2A: Rising Action — Beats

### 3. B Story
A new relationship develops.
*Dramatic Function:* Add emotional depth.`;

const allSections = [];
const lines = fullText.split("\n");
let currentHeader = "";
let currentContent = [];
let foundFirstSection = false;

for (const line of lines) {
  const trimmed = line.trim();
  const isHeader = trimmed.startsWith("## ");
  if (isHeader) {
    if (currentHeader || currentContent.length > 0) {
      const label = currentHeader.replace(/^##\s+/, "").replace(/\s*\(.*\)$/, "").trim();
      allSections.push({
        header: currentHeader,
        content: currentContent.join("\n").trim(),
        label
      });
    }
    currentHeader = trimmed;
    currentContent = [];
    foundFirstSection = true;
  } else {
    if (!foundFirstSection) {
      // preamble
    } else {
      currentContent.push(line);
    }
  }
}
// Last section
if (currentHeader || currentContent.length > 0) {
  const label = currentHeader.replace(/^##\s+/, "").replace(/\s*\(.*\)$/, "").trim();
  allSections.push({
    header: currentHeader,
    content: currentContent.join("\n").trim(),
    label
  });
}

console.log(`\n=== Parser produced ${allSections.length} sections ===`);
allSections.forEach((s, i) => {
  console.log(`Section ${i+1}: header="${s.header}" chars=${s.content.length}`);
});