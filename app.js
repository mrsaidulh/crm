// cPanel Phusion Passenger Startup Hook
// This enables you to select "app.js" as the startup file in the cPanel "Setup Node.js App" interface.
// It automatically boots the compiled, self-contained Express & MySQL production bundle from the dist folder.

require('./dist/server.cjs');
