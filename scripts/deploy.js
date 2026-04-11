const { exec } = require('child_process');

exec('git add . && git commit -m "Deploying changes to Render" && git push', (error, stdout, stderr) => {
  if (error) {
    console.error(`Error during deployment: ${error.message}`);
    return;
  }
  if (stderr) {
    console.error(`stderr: ${stderr}`);
    return;
  }
  console.log(`stdout: ${stdout}`);
});
