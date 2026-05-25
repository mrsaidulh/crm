# cPanel & MySQL Deployment Handbook

This guide provides step-by-step instructions to upload, configure, and run this IELTS CRM application on a **cPanel** hosting platform with a **MySQL** database.

---

## Part 1: Setting up the MySQL Database in cPanel

1. **Log in to cPanel** and scroll to the **Databases** section.
2. Click on **MySQL® Database Wizard**.
3. **Step 1: Create a Database**: Enter a name (e.g., `ielts_crm`) and click *Next Step*.
4. **Step 2: Create Database User**: Enter a username (e.g., `crm_user`) and generate a secure password. Save this password. Click *Create User*.
5. **Step 3: Add User to Database**: Check **ALL PRIVILEGES** to authorize the user for the database. Click *Make Changes*.
6. Back on the cPanel main board, open **phpMyAdmin** from the Databases section.
7. Click on your newly created database in the left sidebar.
8. Go to the **Import** tab at the top.
9. Click *Choose File*, select the **`schema.sql`** file provided in this project's root, and click **Import** (or *Go*) at the bottom. Your tables (`leads`, `tasks`, `settings`, `templates`, etc.) will render successfully.

---

## Part 2: Configuring Node.js Application inside cPanel

1. Scroll to the **Software** section in cPanel and click **Setup Node.js App**.
2. Click **Create Application**.
3. Configure the following field parameters:
   - **Node.js version**: Select `18.x`, `20.x`, or `22.x` (Recommended).
   - **Application mode**: Select `Production`.
   - **Application root**: Enter the folder name where your files will lie (e.g., `ielts-crm`).
   - **Application URL**: Select your domain or subdomain (e.g., `crm.yourdomain.com`).
   - **Application startup file**: Enter `server.cjs` (This is the compiled production code from the `dist` directory).
4. Click **Create** and stop the application for now.

---

## Part 3: Sourcing the Project Files

1. Make sure you build the production folder in your AI Studio build tool or workspace:
   ```bash
   npm run build
   ```
   *Note: Our builder is pre-configured to automatically compile all frontend and backend code, eliminate development overhead, and place a custom, lightweight production-only `package.json` directly inside the `/dist` folder.*
2. Export your project files. You only need to copy/upload the **contents of the `/dist` folder** into your cPanel application root folder (`/ielts-crm`).
3. Your `/ielts-crm` folder on cPanel will now contain:
   - `assets/` (Static frontend compiled assets)
   - `index.html` (Compiled index file)
   - `server.cjs` (Fully compiled backend)
   - `package.json` (Lightweight production dependencies list)
4. Inside the cPanel **Setup Node.js App** page, click **Run JS Install** to install dependencies instantly. Since we've bundled and optimized the imports, it will install only the 4 required lightweight target packages (express, mysql2, dotenv, uuid) with no build tools needed!

---

## Part 4: Configuring Environment Variables

In cPanel **Setup Node.js App**, scroll to **Environment variables** at the bottom. Add the following keys:

| Key | Description / Value |
| :--- | :--- |
| `NODE_ENV` | `production` |
| `BULKSMSBD_API_KEY` | *Your bulk SMS BD portal key* |
| `BULKSMSBD_SENDER_ID` | *Your approved Sender ID* |
| `DB_TYPE` | `mysql` |
| `MYSQL_HOST` | `localhost` (or database server IP) |
| `MYSQL_PORT` | `3306` |
| `MYSQL_USER` | *The MySQL database username created in Part 1* |
| `MYSQL_PASSWORD` | *The database password created in Part 1* |
| `MYSQL_DATABASE` | *The fully prefixed database name created in Part 1* |

---

## Part 5: Node.js Express MySQL Connection Adapter Code

To use MySQL instead of in-memory lists, swap out the database handlers in `server.ts` or compile with a MySQL adapter. Here is the Node.js connector code template utilizing `mysql2` connection pools:

```javascript
// database.js - Save this inside your deployment root
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = {
  // Query helper
  query: async (sql, params) => {
    const [results] = await pool.execute(sql, params);
    return results;
  },

  // Sample lead fetcher
  getLeads: async (userId) => {
    const [rows] = await pool.execute(
      'SELECT * FROM leads WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows.map(row => ({
      ...row,
      tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
      mockScores: typeof row.mock_scores === 'string' ? JSON.parse(row.mock_scores) : row.mock_scores,
      communications: typeof row.communications === 'string' ? JSON.parse(row.communications) : row.communications,
      preferences: typeof row.preferences === 'string' ? JSON.parse(row.preferences) : row.preferences
    }));
  },

  // Sample lead insertion
  insertLead: async (lead) => {
    const sql = `
      INSERT INTO leads (id, user_id, name, email, phone, source, status, expected_value, notes, target_course, target_band, destination, tags, mock_scores, communications, preferences, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await pool.execute(sql, [
      lead.id,
      lead.userId,
      lead.name,
      lead.email,
      lead.phone,
      lead.source,
      lead.status,
      lead.expectedValue || 0,
      lead.notes,
      lead.targetCourse,
      lead.targetBand,
      lead.destination,
      JSON.stringify(lead.tags || []),
      JSON.stringify(lead.mockScores || []),
      JSON.stringify(lead.communications || []),
      JSON.stringify(lead.preferences || {}),
      lead.createdAt || Date.now()
    ]);
  }
};
```
