const fs = require('fs');
const path = require('path');
const https = require('https');

const username = process.argv[2];
if (!username) {
  console.error('Usage: node generate-github-stats.js <github-username>');
  process.exit(1);
}

const token = process.env.GITHUB_TOKEN || '';
const headers = {
  'User-Agent': 'github-stats-card-generator',
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
};
if (token) {
  headers.Authorization = `Bearer ${token}`;
}

const outDir = path.join(__dirname, '..', 'profile');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

function fetchGraphQL(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      'https://api.github.com/graphql',
      { method: 'POST', headers },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const json = JSON.parse(body);
              if (json.errors) {
                reject(new Error(JSON.stringify(json.errors)));
              } else {
                resolve(json.data);
              }
            } catch (err) {
              reject(err);
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        });
      }
    );

    request.on('error', reject);
    request.write(JSON.stringify({ query, variables }));
    request.end();
  });
}

function renderStatsCard(data) {
  const lines = [];
  lines.push(`<svg width="520" height="240" viewBox="0 0 520 240" fill="none" xmlns="http://www.w3.org/2000/svg">`);
  lines.push(`<rect width="520" height="240" rx="20" fill="#0d1117"/>`);
  lines.push(`<rect x="1" y="1" width="518" height="238" rx="19" stroke="#30363d" stroke-opacity="0.45"/>`);
  lines.push(`<text x="28" y="50" fill="#ffffff" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="22" font-weight="700">GitHub Statistics</text>`);
  lines.push(`<text x="28" y="82" fill="#8b949e" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="14">User: ${data.login}</text>`);
  const cards = [
    { label: 'Public repos', value: data.repositoryCount },
    { label: 'Stars', value: data.totalStars },
    { label: 'Commits', value: data.totalCommitContributions },
    { label: 'PR contributions', value: data.totalPullRequestContributions },
    { label: 'Issue contributions', value: data.totalIssueContributions },
    { label: 'Total contributions', value: data.totalContributions },
  ];
  cards.forEach((card, index) => {
    const x = 28 + (index % 3) * 164;
    const y = 110 + Math.floor(index / 3) * 82;
    lines.push(`<rect x="${x}" y="${y}" width="156" height="68" rx="14" fill="#161b22" stroke="#30363d"/>`);
    lines.push(`<text x="${x + 18}" y="${y + 28}" fill="#c9d1d9" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="12">${card.label}</text>`);
    lines.push(`<text x="${x + 18}" y="${y + 52}" fill="#ffffff" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="20" font-weight="700">${card.value}</text>`);
  });
  lines.push(`</svg>`);
  return lines.join('\n');
}

function renderTopLangsCard(langs) {
  const items = Object.entries(langs).slice(0, 6);
  const total = items.reduce((sum, [, value]) => sum + value, 0);
  const width = 520;
  const height = 240;
  const lineHeight = 30;
  const startY = 80;
  const colors = ['#ff7b72', '#ffa657', '#79c0ff', '#7ee787', '#d2a8ff', '#58a6ff'];

  const lines = [];
  lines.push(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">`);
  lines.push(`<rect width="${width}" height="${height}" rx="20" fill="#0d1117"/>`);
  lines.push(`<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="19" stroke="#30363d" stroke-opacity="0.45"/>`);
  lines.push(`<text x="28" y="50" fill="#ffffff" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="22" font-weight="700">Top Languages</text>`);
  lines.push(`<text x="28" y="82" fill="#8b949e" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="14">Most-used languages by byte count</text>`);

  items.forEach(([lang, value], index) => {
    const y = startY + index * lineHeight;
    const color = colors[index % colors.length];
    const percentage = total ? Math.round((value / total) * 100) : 0;
    lines.push(`<rect x="28" y="${y + 8}" width="460" height="18" rx="9" fill="#161b22"/>`);
    lines.push(`<rect x="28" y="${y + 8}" width="${Math.max(1, Math.round((percentage / 100) * 460))}" height="18" rx="9" fill="${color}"/>`);
    lines.push(`<text x="28" y="${y + 26}" fill="#ffffff" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="14" font-weight="600">${lang}</text>`);
    lines.push(`<text x="${498 - String(percentage).length * 8}" y="${y + 26}" fill="#8b949e" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="12">${percentage}%</text>`);
  });
  lines.push(`</svg>`);
  return lines.join('\n');
}

async function main() {
  const query = `query($login:String!) {\n  user(login:$login) {\n    login\n    followers { totalCount }\n    following { totalCount }\n    repositories(privacy: PUBLIC, first: 100, ownerAffiliations: OWNER, isFork: false) {\n      totalCount\n      nodes {\n        stargazerCount\n        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {\n          edges {\n            size\n            node { name }\n          }\n        }\n      }\n    }\n    contributionsCollection {\n      totalCommitContributions\n      totalIssueContributions\n      totalPullRequestContributions\n      totalContributions\n    }\n  }\n}`;

  const result = await fetchGraphQL(query, { login: username });
  const user = result.user;
  if (!user) {
    throw new Error(`GitHub user not found: ${username}`);
  }

  const totalStars = user.repositories.nodes.reduce((sum, repo) => sum + (repo.stargazerCount || 0), 0);
  const languageTotals = {};
  user.repositories.nodes.forEach((repo) => {
    repo.languages.edges.forEach((edge) => {
      if (edge.node && edge.node.name) {
        languageTotals[edge.node.name] = (languageTotals[edge.node.name] || 0) + edge.size;
      }
    });
  });

  const cardsData = {
    login: user.login,
    repositoryCount: user.repositories.totalCount,
    totalStars,
    totalCommitContributions: user.contributionsCollection.totalCommitContributions,
    totalPullRequestContributions: user.contributionsCollection.totalPullRequestContributions,
    totalIssueContributions: user.contributionsCollection.totalIssueContributions,
    totalContributions: user.contributionsCollection.totalContributions,
  };

  const sortedLangTotals = Object.fromEntries(
    Object.entries(languageTotals).sort((a, b) => b[1] - a[1])
  );

  const statsSvg = renderStatsCard(cardsData);
  const langsSvg = renderTopLangsCard(sortedLangTotals);

  fs.writeFileSync(path.join(outDir, 'stats.svg'), statsSvg, 'utf-8');
  fs.writeFileSync(path.join(outDir, 'top-langs.svg'), langsSvg, 'utf-8');
  console.log('Generated profile/stats.svg and profile/top-langs.svg');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});