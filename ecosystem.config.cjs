module.exports = {
  apps: [
    {
      name: 'sales-srs-backend',
      script: './server/server.cjs',
      watch: true,
      ignore_watch: ["server/data", "node_modules", "server/data/*.json"],
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '500M'
    },
    {
      name: 'sales-srs-tunnel',
      script: '/opt/homebrew/bin/cloudflared',
      args: 'tunnel --url http://localhost:8080 --no-autoupdate',
      interpreter: 'none',
      cwd: '/Users/romitaggarwal/Desktop/AI/sales_app',
      autorestart: false,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
