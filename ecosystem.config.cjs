module.exports = {
  apps: [
    {
      name: "ai-presale",
      script: "server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production"
      },
      max_memory_restart: "512M",
      error_file: "server-err.log",
      out_file: "server-out.log"
    }
  ]
};
