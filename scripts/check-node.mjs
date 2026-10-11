const required = [22, 22, 2];
const actual = process.versions.node.split('.').map((part) => Number(part));
const behind =
  actual[0] < required[0] ||
  (actual[0] === required[0] && actual[1] < required[1]) ||
  (actual[0] === required[0] && actual[1] === required[1] && actual[2] < required[2]);

if (behind) {
  console.error(
    `Builders Space needs Node.js >= ${required.join('.')}. This process is Node.js ${process.versions.node}. Install the current 22 LTS (see .nvmrc) and run npm ci again.`,
  );
  process.exit(1);
}
