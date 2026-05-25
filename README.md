# IELTS Revolution CRM - cPanel MySQL Deployment Guide

This repository contains the **IELTS Revolution CRM**, fully refactored to run as a **100% server-side MySQL database application** with zero third-party cloud dependencies (no Firebase required). It is perfectly optimized for immediate deployment on cPanel-managed hosting (such as `ieltsmockhub.com`).

---

## 🚀 Step 1: Create the MySQL Database in cPanel
1. Log in to your cPanel dashboard.
2. Search for **MySQL® Database Wizard** or **MySQL® Databases**.
3. Create a new database named:
   * **Database Name**: `mockhub_crm`
4. Create a new database user:
   * **Username**: `mockhub_crmuser`
   * **Password**: `crmuser1$%`
5. Associate the user `mockhub_crmuser` with the database `mockhub_crm`.
6. Select **ALL PRIVILEGES** and click **Make Changes**.

---

## 📝 Step 2: Import the Database Schema
1. In cPanel, navigate to **phpMyAdmin**.
2. Select your newly created database `mockhub_crm` on the left sidebar.
3. Click the **Import** tab in the top menu bar.
4. Click **Choose File** and select the schema file `/schema.sql` located in this project directory.
5. Drag, drop or select and click **Go** to run import. This creates all structure tables (`leads`, `campaigns`, `tasks`, `templates`, `workflows`, `settings`, `team_members`, `audit_logs`).

---

## 🛠️ Step 3: Set Up the Node.js Application in cPanel
1. In cPanel, find and click on **Setup Node.js App** (sometimes labeled *Node.js Selector*).
2. Click **Create Application**.
3. Fill out the form fields carefully:
   * **Node.js version**: Choose **v18.x** or **v20.x** (or newer).
   * **Application Mode**: Set to **Production**.
   * **Application root**: Enter the absolute folder path where you upload these files (e.g., `repositories/crm`).
   * **Application URL**: Specify the custom subdomain or URL where you want the app to live (e.g., `ieltsmockhub.com` or a subdomain).
   * **Application startup file**: Enter **`app.js`** *(We created this file as a root redirect hook, which runs the compiled Express production server automatically)*.
4. Click **Create**.
5. Once created, keep this page open; you will see a command to enter your virtual environment (e.g., `source /home/username/nodevenv/...`). Keep this for Step 5.

---

## ⚙️ Step 4: Add Environment Variables
Inside your cPanel **Setup Node.js App** details screen, scroll down to the **Environment variables** section and click **Add Variable** for each of the following:

| Key | Value | Description |
|---|---|---|
| `DB_HOST` | `127.0.0.1` or `localhost` | Database server address |
| `DB_PORT` | `3306` | MySQL port |
| `DB_NAME` | `mockhub_crm` | Your database name |
| `DB_USER` | `mockhub_crmuser` | Your database username |
| `DB_PASSWORD` | `crmuser1$%` | Your database user password |
| `NODE_ENV` | `production` | Production environment flag |

*(Alternatively, you can write these into a `.env` file in your application root folder, but adding them via the cPanel environment interface is safer and more reliable!)*

---

## 📦 Step 5: Install Dependencies and Start
1. Log in to your server via SSH, or use the **Terminal** tool in cPanel.
2. Copy and run the virtual environment activation command generated in Step 3 (e.g., `source /home/username/nodevenv/repositories/crm/20/bin/activate && cd /home/username/repositories/crm`).
3. Run the installation and compilation steps:
   ```bash
   npm install
   npm run build
   ```
4. Back in cPanel **Setup Node.js App** interface, click the **Restart** button at the top to reload. Your CRM is now fully active, connected to MySQL, and live on the internet!

---

## 💡 Troubleshooting & Support
* **Database Connection Issues**: Double check that database privileges are correctly granted in cPanel, and that `DB_HOST` is set to `127.0.0.1` (or your reseller's spec support host).
* **Logs & Node errors**: Check Passenger logs (usually generated at root as `stderr.log` or inside output folders).
