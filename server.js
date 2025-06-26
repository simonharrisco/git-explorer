const express = require("express");
const simpleGit = require("simple-git");
const path = require("path");

// --- NEW: Dynamic Repository Path Configuration ---
// Get the path from the command-line arguments.
// process.argv[2] is the first argument after 'node server.js'
const relativeRepoPath = process.argv[2];

// If no path is provided, show instructions and exit.
if (!relativeRepoPath) {
  console.error("Error: Repository path not provided.");
  console.log("\nUsage: node server.js <path-to-your-git-repo>");
  console.log("\nExample: node server.js ../my-awesome-project");
  process.exit(1); // Exit the script with an error code
}

// Resolve the relative path from the current working directory to an absolute path.
const repoPath = path.resolve(process.cwd(), relativeRepoPath);
// --- End of new code ---

const app = express();
const port = 3000;

console.log(`Analyzing repository at: ${repoPath}`);
const git = simpleGit(repoPath);

// Helper function to parse the output of 'git ls-tree'
function parseLsTree(lsTreeOutput) {
  const root = { name: "root", children: [] };

  if (!lsTreeOutput) {
    return root;
  }

  lsTreeOutput.split("\n").forEach((line) => {
    if (!line) return;
    const parts = line.split(/\s+/);
    const size = parseInt(parts[3], 10);
    const filePath = parts[4];

    if (isNaN(size)) return;

    let currentNode = root;
    const pathParts = filePath.split("/");

    pathParts.forEach((part, index) => {
      let childNode = currentNode.children.find((child) => child.name === part);

      if (!childNode) {
        childNode = { name: part };
        if (index === pathParts.length - 1) {
          childNode.value = size;
        } else {
          childNode.children = [];
        }
        currentNode.children.push(childNode);
      }
      currentNode = childNode;
    });
  });

  return root;
}

// Main function to get all data
async function getGitHistoryData() {
  try {
    // Check if the provided path is a git repository
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      throw new Error(`The path "${repoPath}" is not a valid Git repository.`);
    }

    const log = await git.log({
      "--all": null,
      "--pretty": "format:%H|%an|%s",
    });

    const commits = log.all.reverse();
    const historyData = [];

    console.log(`Found ${commits.length} commits. Processing...`);

    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];
      const [hash, author, message] = commit.hash.split("|");

      const lsTreeOutput = await git.raw(["ls-tree", "-r", "--long", hash]);
      const tree = parseLsTree(lsTreeOutput);

      historyData.push({
        hash,
        author,
        message,
        tree,
        commitNumber: i + 1,
      });
      process.stdout.write(`\rProcessed commit ${i + 1}/${commits.length}`);
    }
    console.log("\nProcessing complete!");
    return historyData;
  } catch (err) {
    // We'll send the error to the frontend to be displayed
    console.error("\n--- GIT PROCESSING ERROR ---");
    console.error(err.message);
    console.error("--------------------------");
    // Return an object with an error property
    return { error: err.message };
  }
}

// API Endpoint
app.get("/api/history", async (req, res) => {
  const data = await getGitHistoryData();
  // If there was an error, send a 500 status code
  if (data.error) {
    res.status(500).json(data);
  } else {
    res.json(data);
  }
});

// Serve static files for the frontend
app.use(express.static(path.join(__dirname, "public")));

app.listen(port, () => {
  console.log(
    `\nServer running! Open http://localhost:${port} to see the visualization.`
  );
});
