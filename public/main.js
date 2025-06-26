// --- Chart Dimensions --- (THESE LINES WERE MISSING)
const width = 960;
const height = 960;
const margin = 10;

// --- D3 Setup --- (THIS SVG SETUP WAS ALSO MISSING)
const svg = d3
  .select("#chart-container")
  .append("svg")
  .attr("width", width)
  .attr("height", height)
  .attr("viewBox", `-${margin} -${margin} ${width} ${height}`)
  .attr("style", "max-width: 100%; height: auto;");

// --- DOM Element Selections ---
const commitInfo = d3.select("#commit-info");
const slider = d3.select("#commit-slider");
const playPauseBtn = d3.select("#play-pause-btn");
const speedSlider = d3.select("#speed-slider");
const filterJsonCheckbox = d3.select("#filter-json");
const filterImagesCheckbox = d3.select("#filter-images");

// --- State Variables & Helpers ---
let historyData = [];
let isPlaying = false;
let animationTimer = null;
let animationDelay = 500;
const imageExtensions = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".bmp",
  ".ico",
];

const getKey = (d) =>
  d
    .ancestors()
    .map((d) => d.data.name)
    .reverse()
    .join("/");

function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

// --- Recursive function to filter the data tree ---
function filterTree(node, filters) {
  if (!node.children) {
    const name = node.name.toLowerCase();
    if (filters.hideJson && name.endsWith(".json")) {
      return null;
    }
    if (
      filters.hideImages &&
      imageExtensions.some((ext) => name.endsWith(ext))
    ) {
      return null;
    }
    return node;
  }

  const newChildren = node.children
    .map((child) => filterTree(child, filters))
    .filter((child) => child !== null);

  if (newChildren.length === 0) {
    return null;
  }

  return { ...node, children: newChildren };
}

// --- The Main Drawing Function ---
function drawChart(commitData) {
  const { hash, message, author, commitNumber, tree } = commitData;

  commitInfo.html(
    `<strong>Commit ${commitNumber}/${
      historyData.length
    }:</strong> ${hash.substring(0, 7)}<br/>
     <em>${message}</em> - ${author}`
  );

  const filters = {
    hideJson: filterJsonCheckbox.property("checked"),
    hideImages: filterImagesCheckbox.property("checked"),
  };

  const originalTree = JSON.parse(JSON.stringify(tree));
  const filteredTree = filterTree(originalTree, filters) || {
    name: "root",
    children: [],
  };

  const root = d3
    .hierarchy(filteredTree)
    .sum((d) => d.value)
    .sort((a, b) => b.value - a.value);

  const pack = d3.pack().size([width - margin * 2, height - margin * 2]);
  const packedRoot = pack(root);
  const t = svg.transition().duration(750);

  const nodes = svg.selectAll("circle").data(packedRoot.descendants(), getKey);

  nodes
    .transition(t)
    .attr("cx", (d) => d.x)
    .attr("cy", (d) => d.y)
    .attr("r", (d) => d.r);

  nodes
    .exit()
    .transition(t)
    .attr("cx", (d) => (d.parent ? d.parent.x : packedRoot.x))
    .attr("cy", (d) => (d.parent ? d.parent.y : packedRoot.y))
    .attr("r", 1e-6)
    .remove();

  const enterNodes = nodes
    .enter()
    .append("circle")
    .attr("cx", (d) => (d.parent ? d.parent.x : packedRoot.x))
    .attr("cy", (d) => (d.parent ? d.parent.y : packedRoot.y))
    .attr("r", 1e-6)
    .attr("fill", (d) => (d.children ? "#555" : "#1f77b4"))
    .attr("fill-opacity", (d) => (d.children ? 0.25 : 0.7))
    .attr("stroke", (d) => (d.children ? "#fff" : "#333"))
    .attr("stroke-width", 0.5);

  enterNodes
    .append("title")
    .text(
      (d) => `${getKey(d).substring(5)}\n${d.value.toLocaleString()} bytes`
    );

  enterNodes
    .transition(t)
    .attr("cx", (d) => d.x)
    .attr("cy", (d) => d.y)
    .attr("r", (d) => d.r);

  const labels = svg.selectAll("text").data(
    packedRoot.descendants().filter((d) => !d.children && d.r > 20),
    getKey
  );

  labels
    .exit()
    .transition(t)
    .attr("x", (d) => (d.parent ? d.parent.x : packedRoot.x))
    .attr("y", (d) => (d.parent ? d.parent.y : packedRoot.y))
    .style("fill-opacity", 1e-6)
    .remove();

  labels
    .transition(t)
    .attr("x", (d) => d.x)
    .attr("y", (d) => d.y);

  const enterLabels = labels
    .enter()
    .append("text")
    .attr("x", (d) => (d.parent ? d.parent.x : packedRoot.x))
    .attr("y", (d) => (d.parent ? d.parent.y : packedRoot.y))
    .style("fill-opacity", 1e-6)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .style("font-size", "10px")
    .style("font-family", "sans-serif")
    .attr("fill", "white")
    .style("pointer-events", "none")
    .text((d) => truncateText(d.data.name, d.r / 4));

  enterLabels
    .transition(t)
    .attr("x", (d) => d.x)
    .attr("y", (d) => d.y)
    .style("fill-opacity", 1);
}

// --- Playback Logic ---
function stopAnimation() {
  isPlaying = false;
  playPauseBtn.text("Play");
  clearTimeout(animationTimer);
}

function playStep() {
  if (!isPlaying) return;
  let currentIndex = +slider.property("value");
  let nextIndex = currentIndex + 1;
  if (nextIndex >= historyData.length) {
    stopAnimation();
    return;
  }
  slider.property("value", nextIndex);
  drawChart(historyData[nextIndex]);
  animationTimer = setTimeout(playStep, animationDelay);
}

function startAnimation() {
  isPlaying = true;
  playPauseBtn.text("Pause");
  let currentIndex = +slider.property("value");
  if (currentIndex >= historyData.length - 1) {
    slider.property("value", 0);
    drawChart(historyData[0]);
  }
  playStep();
}

// --- Initialization ---
async function main() {
  try {
    const response = await fetch("/api/history");
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    historyData = data;
    if (historyData && historyData.length > 0) {
      slider.property("disabled", false);
      playPauseBtn.property("disabled", false);
      filterJsonCheckbox.property("disabled", false);
      filterImagesCheckbox.property("disabled", false);

      slider
        .attr("min", 0)
        .attr("max", historyData.length - 1)
        .attr("value", historyData.length - 1);

      animationDelay = +speedSlider.property("value");
      drawChart(historyData[historyData.length - 1]);

      slider.on("input", (event) => {
        stopAnimation();
        drawChart(historyData[+event.target.value]);
      });

      playPauseBtn.on("click", () => {
        if (isPlaying) stopAnimation();
        else startAnimation();
      });

      speedSlider.on("input", (event) => {
        animationDelay = +event.target.value;
      });

      const redrawCurrentCommit = () => {
        stopAnimation();
        drawChart(historyData[+slider.property("value")]);
      };
      filterJsonCheckbox.on("change", redrawCurrentCommit);
      filterImagesCheckbox.on("change", redrawCurrentCommit);
    } else {
      commitInfo.text("No history data found. Is the repository empty?");
    }
  } catch (error) {
    console.error("Failed to load data:", error);
    commitInfo.html(
      `<strong>Error:</strong> ${error.message}<br/>Check the server console for more details.`
    );
  }
}

main();
