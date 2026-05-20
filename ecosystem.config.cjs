module.exports = {
  apps: [
    {
      name: "five-rails",
      script: "scripts/start.sh",
      interpreter: "bash",
      cwd: "/home/z-ro/five-rails",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: "development",
      },
    },
    {
      name: "five-rails-watchdog",
      script: "scripts/watchdog-daemon.ts",
      interpreter: "npx",
      interpreter_args: "tsx",
      cwd: "/home/z-ro/five-rails",
      watch: false,
      // Re-enabled after token-burn fixes verified (97% reduction in LLM
      // calls per scan cycle). All 4 dedup layers in place; daemon safe to run.
      autorestart: true,
      max_restarts: 20,
      restart_delay: 10000,
      // Wait for the main app to start first
      wait_ready: false,
      // Log to separate files
      out_file: "logs/watchdog-daemon.log",
      error_file: "logs/watchdog-daemon-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      env: {
        NODE_ENV: "development",
      },
    },
  ],
};
