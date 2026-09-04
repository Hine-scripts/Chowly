const fs = require("fs");
const path = require("path");
require("dotenv").config();

const pool = require("./config/database");

async function setupDatabase() {
  try {
    const schemaPath = path.join(__dirname, "..", "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf8");

    await pool.query(schema);

    console.log("Chowly database tables created successfully.");
  } catch (error) {
    console.error("Database setup failed:", error.message);
  } finally {
    await pool.end();
  }
}

setupDatabase();